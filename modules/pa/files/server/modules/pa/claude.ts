// Claude Code 的本机对话记录（~/.claude/projects/<项目>/<对话>.jsonl）：一行一条 JSON。只取元信息：
// 所在文件夹、标题（custom-title）、第一句用户消息的摘要、最后一条是谁说的、Write / Edit 写了哪些文件。
// 对话正文不留：AI 最后一段话只用来判断“是不是在问人”，判断完就丢。不是公开接口，认不出来的行跳过。
import { brief, looksLikeAsking } from './text.ts'
import type { SessionMeta } from './types.ts'
import { addUsage, type UsageByDay } from './usage-calc.ts'

const MAX_LINE = 4_000_000
const WRITE_TOOLS: Record<string, '新建' | '修改'> = { Write: '新建', Edit: '修改', MultiEdit: '修改', NotebookEdit: '修改' }
type Block = { type?: string; text?: string; name?: string; input?: { file_path?: string; notebook_path?: string } }
type Raw = { type?: string; timestamp?: string; sessionId?: string; cwd?: string; isSidechain?: boolean; isMeta?: boolean; customTitle?: string; entrypoint?: string; message?: { id?: string; content?: string | Block[]; stop_reason?: string | null; usage?: Record<string, unknown> } }

/** 用户这一行里人说的话：工具结果、系统插进来的不算 */
function said(d: Raw): string {
  if (d.isMeta) return ''
  const c = d.message?.content
  const text = typeof c === 'string' ? c : (c ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
  const clean = text.replace(/<([a-zA-Z_][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, '').trim()
  return /^\[Request interrupted/.test(clean) ? '' : clean
}

export function claudeParser() {
  let sid = ''
  let cwd = ''
  let origin = ''
  let title = ''
  let first = ''
  let startedAt = ''
  let lastAt = ''
  let lastRole: SessionMeta['lastRole'] = ''
  let lastAssistant = ''
  let interrupted = false
  let turns = 0
  const writes: SessionMeta['writes'] = []
  // 用量：同一条回复会写好几遍（每个内容块一行），按回复编号只算一次。新算的 = 输入 + 写缓存，缓存 = 读缓存
  let usage: UsageByDay = {}
  const counted = new Set<string>()
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  return {
    line(raw: string) {
      if (!raw || raw.length > MAX_LINE) return
      const kind = raw.slice(0, 400)
      const isUser = kind.includes('"type":"user"')
      const isAssistant = !isUser && raw.includes('"type":"assistant"')
      if (!isUser && !isAssistant && !kind.includes('"custom-title"')) return
      let d: Raw
      try { d = JSON.parse(raw) as Raw } catch { return }
      if (d.type === 'custom-title') { if (d.customTitle) title = d.customTitle; return }
      if (d.isSidechain || (d.type !== 'user' && d.type !== 'assistant')) return
      sid ||= d.sessionId ?? ''
      cwd ||= d.cwd ?? ''
      origin ||= d.entrypoint ?? ''
      if (d.timestamp) { startedAt ||= d.timestamp; if (d.timestamp > lastAt) lastAt = d.timestamp }
      if (d.type === 'user') {
        const text = said(d)
        if (!text) { if (typeof d.message?.content === 'string' && /^\[Request interrupted/.test(d.message.content.trim())) interrupted = true; return }
        turns++
        lastRole = 'user'
        interrupted = false
        if (!first) first = brief(text)
        return
      }
      lastRole = 'assistant'
      lastAssistant = raw
      const u = d.message?.usage
      const mid = d.message?.id ?? ''
      if (u && d.timestamp && (!mid || !counted.has(mid))) {
        if (mid) counted.add(mid)
        usage = addUsage(usage, d.timestamp, { fresh: n(u.input_tokens) + n(u.cache_creation_input_tokens), cached: n(u.cache_read_input_tokens), output: n(u.output_tokens) })
      }
      const content = Array.isArray(d.message?.content) ? d.message.content : []
      for (const b of content) {
        const action = b.type === 'tool_use' && b.name ? WRITE_TOOLS[b.name] : undefined
        const path = b.input?.file_path ?? b.input?.notebook_path
        if (action && path) writes.push({ path, action, at: d.timestamp ?? lastAt })
      }
    },
    done(): SessionMeta | null {
      if (!sid || !lastAt) return null
      let turnOpen = lastRole === 'user'
      let asks = false
      if (lastRole === 'assistant' && lastAssistant) {
        const d = JSON.parse(lastAssistant) as Raw
        const content = Array.isArray(d.message?.content) ? d.message.content : []
        // 最后一条 AI 消息还在调工具：这一轮没结束
        turnOpen = d.message?.stop_reason === 'tool_use' || content.some((b) => b.type === 'tool_use')
        asks = !turnOpen && looksLikeAsking(content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'))
      }
      return {
        tool: 'claude', sid, cwd, title, titleFrom: title ? '文件' : '', first, origin: origin || 'claude', kind: /^sdk/.test(origin) ? '脚本' : '对话',
        startedAt, lastAt, lastRole, turnOpen: turnOpen && !interrupted, asks, aborted: interrupted, turns, writes, usage,
      }
    },
  }
}
