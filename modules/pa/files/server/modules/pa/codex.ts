// Codex 的本机对话记录（~/.codex/sessions/**/*.jsonl）：一行一条 JSON。只取元信息：
// 第一行 session_meta（对话编号、所在文件夹、哪个程序开的）、每一轮的开始 / 结束 / 打断、第一句用户消息的摘要、补丁里写了哪些文件。
// 对话正文不留：用户消息只取第一句做摘要，AI 最后一段话只用来判断“是不是在问人”，判断完就丢。
// 这不是公开接口，Codex 升级可能改格式；认不出来的行一律跳过。
import { isAbsolute, join, normalize } from 'node:path'
import { brief, looksLikeAsking } from './text.ts'
import type { SessionMeta } from './types.ts'

/** 只有带这些字样的行才解析（大多数行是推理、工具输出，又长又用不上） */
const WANTED = ['"session_meta"', '"task_started"', '"task_complete"', '"turn_aborted"', '"apply_patch"', '"role":"user"']
const MAX_LINE = 4_000_000
const TS = /"timestamp":"(\d{4}-\d{2}-\d{2}T[^"]+)"/

/** 系统塞进来的“用户消息”：环境说明、AGENTS.md、插件推荐……不算人说的话 */
const injected = (t: string) => /^\s*(<|# AGENTS\.md instructions)/.test(t)

type Raw = { type?: string; payload?: Record<string, unknown> }

export function codexParser() {
  let meta: SessionMeta | null = null
  let lastTs = ''
  return {
    line(raw: string) {
      if (!raw) return
      const ts = raw.slice(0, 300).match(TS)?.[1]
      if (ts && ts > lastTs) lastTs = ts
      if (raw.length > MAX_LINE || !WANTED.some((w) => raw.includes(w))) return
      let d: Raw
      try { d = JSON.parse(raw) as Raw } catch { return }
      const p = d.payload ?? {}
      if (d.type === 'session_meta') {
        if (meta) return
        const source = p.source
        const sub = p.thread_source === 'subagent' || (typeof source === 'object' && source !== null && 'subagent' in source)
        meta = {
          tool: 'codex', sid: String(p.id ?? ''), cwd: String(p.cwd ?? ''), title: '', titleFrom: '', first: '',
          origin: String(p.originator ?? ''), kind: sub ? '子任务' : p.originator === 'codex_exec' || source === 'exec' ? '脚本' : '对话',
          startedAt: String(p.timestamp ?? ts ?? ''), lastAt: '', lastRole: '', turnOpen: false, asks: false, aborted: false, turns: 0, writes: [],
        }
        return
      }
      if (!meta) return
      if (d.type === 'event_msg') {
        if (p.type === 'task_started') { meta.turnOpen = true; meta.aborted = false; meta.asks = false; meta.turns++ }
        else if (p.type === 'task_complete') { meta.turnOpen = false; meta.aborted = false; meta.lastRole = 'assistant'; meta.asks = looksLikeAsking(p.last_agent_message as string | null) }
        else if (p.type === 'turn_aborted') { meta.turnOpen = false; meta.aborted = true }
        return
      }
      if (d.type !== 'response_item') return
      if (p.type === 'message' && p.role === 'user') {
        const text = ((p.content as { type?: string; text?: string }[] | undefined) ?? []).map((b) => b.text ?? '').find((t) => t && !injected(t))
        if (!text) return
        meta.lastRole = 'user'
        if (!meta.first) meta.first = brief(text)
      } else if (p.name === 'apply_patch' && typeof p.input === 'string') {
        for (const m of p.input.matchAll(/^\*\*\* (Add|Update) File: (.+)$/gm)) {
          const file = m[2].trim()
          meta.writes.push({ path: normalize(isAbsolute(file) ? file : join(meta.cwd || '/', file)), action: m[1] === 'Add' ? '新建' : '修改', at: ts ?? lastTs })
        }
      }
    },
    done(): SessionMeta | null {
      if (!meta || !meta.sid) return null
      return { ...meta, lastAt: lastTs || meta.startedAt }
    },
  }
}

/** ~/.codex/session_index.jsonl 的一行：{ id, thread_name, updated_at }。同一个对话可能有好几行，后面的盖前面的 */
export function codexIndexLine(raw: string): { id: string; title: string } | null {
  try {
    const d = JSON.parse(raw) as { id?: string; thread_name?: string }
    return d.id && d.thread_name ? { id: d.id, title: d.thread_name } : null
  } catch { return null }
}
