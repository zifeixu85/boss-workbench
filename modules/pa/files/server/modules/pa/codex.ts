// Codex 的本机对话记录（~/.codex/sessions/**/*.jsonl）：一行一条 JSON。只取元信息：
// 第一行 session_meta（对话编号、所在文件夹、哪个程序开的）、每一轮的开始 / 结束 / 打断、第一句用户消息的摘要、补丁里写了哪些文件。
// token_count 行只取数字：累计用量按“比上一条多了多少”记到当天（累计没变的重复行不算），额度百分比取最后一条。
// 对话正文不留：用户消息只取第一句做摘要，AI 最后一段话只用来判断“是不是在问人”，判断完就丢。
// 这不是公开接口，Codex 升级可能改格式；认不出来的行一律跳过。
import { isAbsolute, join, normalize } from 'node:path'
import { brief, looksLikeAsking } from './text.ts'
import type { SessionMeta } from './types.ts'
import { addUsage, type CodexLimits, type UsageByDay } from './usage-calc.ts'

/** 只有带这些字样的行才解析（大多数行是推理、工具输出，又长又用不上） */
const WANTED = ['"token_count"', '"session_meta"', '"task_started"', '"task_complete"', '"turn_aborted"', '"apply_patch"', '"role":"user"']
const MAX_LINE = 4_000_000
const TS = /"timestamp":"(\d{4}-\d{2}-\d{2}T[^"]+)"/

/** 系统塞进来的“用户消息”：环境说明、AGENTS.md、插件推荐……不算人说的话 */
const injected = (t: string) => /^\s*(<|# AGENTS\.md instructions)/.test(t)

type Raw = { type?: string; payload?: Record<string, unknown> }

type Usage = { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number; total_tokens?: number }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const parts = (u: Usage) => ({ input: num(u.input_tokens), cached: num(u.cached_input_tokens), output: num(u.output_tokens) })

export function codexParser() {
  let meta: SessionMeta | null = null
  let lastTs = ''
  let usage: UsageByDay = {}
  let limits: CodexLimits | null = null
  let prev: { total: number; input: number; cached: number; output: number } | null = null
  /** 一条 token_count：累计变多了记差；变小了（换了一份计数）按这一条自己的数；没变是重复行 */
  const tokens = (p: Record<string, unknown>, ts: string) => {
    const info = p.info as { total_token_usage?: Usage; last_token_usage?: Usage } | null | undefined
    const rl = (p.rate_limits as { primary?: { used_percent?: number; window_minutes?: number; resets_at?: number } } | null | undefined)?.primary
    if (rl && typeof rl.used_percent === 'number' && (!limits || ts >= limits.at)) limits = { used_percent: rl.used_percent, window_minutes: rl.window_minutes ?? null, resets_at: rl.resets_at ?? null, at: ts }
    if (!info?.total_token_usage) return
    const t = parts(info.total_token_usage)
    const total = num(info.total_token_usage.total_tokens) || t.input + t.output
    if (prev && total === prev.total) return
    const d = prev && total > prev.total ? { input: t.input - prev.input, cached: t.cached - prev.cached, output: t.output - prev.output } : parts(info.last_token_usage ?? info.total_token_usage)
    prev = { total, ...t }
    const cached = Math.max(0, d.cached)
    usage = addUsage(usage, ts, { fresh: Math.max(0, d.input - cached), cached, output: Math.max(0, d.output) })
  }
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
        if (p.type === 'token_count') { tokens(p, ts ?? lastTs); return }
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
      return { ...meta, lastAt: lastTs || meta.startedAt, usage, limits }
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
