// 飞书日历：用飞书官方命令行工具 lark-cli 只读老板的主日历（calendar +agenda，已展开重复日程、过滤了取消的）。
// 登录和授权由老板自己在浏览器里点（lark-cli auth login），这里只读，不写飞书、不打印凭据。
import { execFile } from 'node:child_process'
import { dirname, delimiter } from 'node:path'
import { addDay, minuteStr, type CalItem } from './rows.ts'

export type LarkResult = { ok: true; items: CalItem[] } | { ok: false; code: string; reason: string }
export type LarkExec = (bin: string, args: string[]) => Promise<{ error: (NodeJS.ErrnoException & { killed?: boolean }) | null; stdout: string; stderr: string }>

const TIMEOUT = 30_000
/** 长串（令牌、id）打码，只留第一行有用的话 */
const sanitize = (t: string) => t.replace(/[A-Za-z0-9_-]{24,}/g, '…').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 160) ?? ''

const defaultExec: LarkExec = (bin, args) => new Promise((resolve) => {
  // 开机自启的后台服务 PATH 很短：把 node 所在的文件夹加上（npm 全局装的 lark-cli 一般就在那里，它自己也要 node）
  const PATH = [dirname(process.execPath), process.env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(delimiter)
  execFile(bin, args, { timeout: TIMEOUT, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PATH } }, (error, stdout, stderr) =>
    resolve({ error: error as never, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }))
})

/** 本地时间带时区的 ISO：2026-10-27T00:00:00+08:00 */
export function isoLocal(day: string) {
  const d = new Date(`${day}T00:00:00`)
  const off = -d.getTimezoneOffset()
  const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return `${day}T00:00:00${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`
}

type Raw = Record<string, unknown>
const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** 飞书的时间：{ datetime: '2026-10-22T20:00:00+08:00' } / { date: '2026-10-22' } / { timestamp: '1793030400' } */
function when(v: unknown): { day?: string; at?: Date } {
  if (!v || typeof v !== 'object') return {}
  const r = v as Raw
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) return { day: r.date }
  if (typeof r.datetime === 'string') { const d = new Date(r.datetime); if (!Number.isNaN(d.getTime())) return { at: d } }
  if (typeof r.timestamp === 'string' || typeof r.timestamp === 'number') { const d = new Date(Number(r.timestamp) * 1000); if (!Number.isNaN(d.getTime())) return { at: d } }
  return {}
}

const RSVP: Record<string, CalItem['response']> = { accept: 'accepted', decline: 'declined', tentative: 'tentative', needs_action: 'pending', removed: 'declined' }

/** +agenda 的 data 数组 → CalItem。全天日程飞书的结束日期是“包含”的，这里换成“结束后的那一天” */
export function larkItems(data: unknown): CalItem[] {
  const list = Array.isArray(data) ? (data as Raw[]) : []
  const out: CalItem[] = []
  for (const e of list) {
    const s = when(e.start_time ?? e.start)
    const en = when(e.end_time ?? e.end)
    const id = text(e.event_id)
    if (!id || (!s.day && !s.at)) continue
    const allDay = !!s.day
    const start = allDay ? s.day! : minuteStr(s.at!)
    const end = allDay ? addDay(en.day ?? s.day!, 1) : en.at ? minuteStr(en.at) : null
    const loc = e.location as Raw | string | undefined
    out.push({
      uid: id, occurrence: allDay ? start : s.at!.toISOString(), title: text(e.summary) || text(e.title), start, end, allDay,
      location: typeof loc === 'string' ? loc : text(loc?.name) || null,
      calendar: '主日历', response: RSVP[text(e.self_rsvp_status)] ?? null, cancelled: text(e.status) === 'cancelled',
    })
  }
  return out
}

/** lark-cli 的输出 → 结果。看不懂的、没装、没登录都说清楚 */
export function parseAgenda(r: Awaited<ReturnType<LarkExec>>): LarkResult {
  const i = r.stdout.indexOf('{')
  let j: Raw | null = null
  if (i >= 0) { try { j = JSON.parse(r.stdout.slice(i)) as Raw } catch { j = null } }
  if (j?.ok === true) return { ok: true, items: larkItems(j.data) }
  const code = r.error?.code
  if (code === 'ENOENT') return { ok: false, code: 'missing-cli', reason: '这台电脑没装飞书命令行工具 lark-cli：在 Codex 里说“装飞书命令行”，装好、登录后再连' }
  if (r.error?.killed) return { ok: false, code: 'timeout', reason: `飞书 ${TIMEOUT / 1000} 秒没有回应：稍后会自动再试` }
  const err = (j?.error ?? {}) as { type?: string; message?: string; code?: unknown }
  const msg = `${text(err.message)} ${r.stderr}`
  if (err.type === 'authorization' || err.type === 'auth' || /not logged in|log ?in|unauthori|expired|未登录|授权/i.test(msg)) {
    return { ok: false, code: 'not-logged-in', reason: '飞书还没登录或授权过期了：在终端运行 lark-cli auth login --domain calendar，在浏览器里点“同意”，再刷新' }
  }
  if (/config init|not configured|no app/i.test(msg)) return { ok: false, code: 'not-configured', reason: '飞书命令行工具还没配置：先运行 lark-cli config init，再 lark-cli auth login --domain calendar' }
  return { ok: false, code: 'lark-error', reason: `飞书没读出来：${sanitize(text(err.message) || r.stderr) || '没有返回能看懂的结果'}` }
}

/** 读 [from, to) 的日程（本地日期） */
export async function readLark(window: { from: string; to: string }, exec: LarkExec = defaultExec): Promise<LarkResult> {
  const bin = process.env.LARK_CLI || 'lark-cli'
  const r = await exec(bin, ['calendar', '+agenda', '--as', 'user', '--start', isoLocal(window.from), '--end', isoLocal(window.to), '--format', 'json'])
  return parseAgenda(r)
}

