// 报告：读知识库 90-日志与报告/ 下的日报、周报、月报（总助、分身写的）；顶上几个数来自进展和产出。
// AI 写完报告用 pa-report-add 登记：检查格式、记一笔登记时间。工作台不替 AI 写报告，也不改报告原文。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, all, get, run, logChange, nowIso } from '../../db.ts'
import { canReadKbPath } from '../../services/kb.ts'
import { BadRequest, NotFound, type Actor } from '../../services/common.ts'
import { readRel } from './kb.ts'
import { parseReport, periodOf, reportLine, reportSummary, weekOf, REPORT_KINDS, type Report, type ReportKind } from './report-parse.ts'
import { listSessions, now } from './store.ts'
import { outputStats } from './outputs.ts'

export const REPORT_DIR = '90-日志与报告'

/** 某一种报告有哪些（按期间从新到旧） */
export function listReports(kind: ReportKind): Report[] {
  const dir = join(ROOT, REPORT_DIR, kind)
  if (!existsSync(dir) || !canReadKbPath(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.') && !/^readme\.md$/i.test(f))
    .flatMap((f) => { try { return [parseReport(readRel(`${REPORT_DIR}/${kind}/${f}`), `${REPORT_DIR}/${kind}/${f}`)] } catch { return [] } })
    .sort((a, b) => b.period.localeCompare(a.period))
}

const localDay = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
/** 本地日期的 0 点 → UTC 时间串（对话记录里的时间是 UTC） */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString()
const nextDay = (day: string) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + 1); return d.toISOString() }

/** 这段时间里：几个对话、做完几件（AI 把一轮做完了的对话）、其中几件还没看、产出几个、用得最多的是哪个 */
export function periodStats(from: string, to: string) {
  const a = dayStart(from)
  const b = nextDay(to)
  const sessions = listSessions({ days: 3650 }).filter((s) => s.last_at >= a && s.last_at < b)
  const done = sessions.filter((s) => s.status === '做完未读' || s.status === '已看' || s.status === '在等我')
  const by = new Map<string, { name: string; n: number; object: boolean }>()
  for (const s of sessions) {
    const key = s.object?.path ?? `dir:${s.cwd}`
    const cur = by.get(key) ?? { name: s.object?.name ?? s.folder, n: 0, object: !!s.object }
    by.set(key, { ...cur, n: cur.n + 1 })
  }
  const top = [...by.values()].sort((x, y) => y.n - x.n || Number(y.object) - Number(x.object))[0] ?? null
  return { from, to, sessions: sessions.length, done: done.length, unread: sessions.filter((s) => s.status === '做完未读').length, waiting: sessions.filter((s) => s.status === '在等我').length, outputs: outputStats(a, b), top }
}

const shift = (kind: ReportKind, period: string, n: number): string => {
  const p = periodOf(kind, period)!
  if (kind === '日报') return localDay(Date.parse(`${p.from}T12:00:00`) + n * 864e5)
  if (kind === '周报') return weekOf(new Date(Date.parse(`${p.from}T12:00:00Z`) + n * 7 * 864e5).toISOString().slice(0, 10))
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const currentPeriod = (kind: ReportKind) => { const day = localDay(now()); return kind === '日报' ? day : kind === '周报' ? weekOf(day) : day.slice(0, 7) }

/** 报告页要的全部：这一种报告的清单、选中的这一期（没有这一期的文件也给数）、上一期的数、前后翻页 */
export function reportView(kind: ReportKind, period?: string) {
  if (!REPORT_KINDS.includes(kind)) throw new BadRequest(`报告只有：${REPORT_KINDS.join('、')}`)
  const list = listReports(kind)
  const cur = period && periodOf(kind, period) ? period : list[0]?.period && periodOf(kind, list[0].period) ? list[0].period : currentPeriod(kind)
  const range = periodOf(kind, cur)!
  const report = list.find((r) => r.period === cur) ?? null
  const prevP = shift(kind, cur, -1)
  const prevRange = periodOf(kind, prevP)!
  const registered = report ? get<{ registered_at: string }>('SELECT registered_at FROM pa_reports WHERE path = :p', { p: report.path })?.registered_at ?? null : null
  return {
    kind, period: cur, range, prev: prevP, next: cur >= currentPeriod(kind) ? null : shift(kind, cur, 1),
    counts: Object.fromEntries(REPORT_KINDS.map((k) => [k, k === kind ? list.length : listReports(k).length])),
    periods: list.map((r) => r.period),
    report: report ? { ...report, registered_at: registered } : null,
    stats: periodStats(range.from, range.to), prev_stats: periodStats(prevRange.from, prevRange.to),
  }
}

/** 最新一份日报：今日页“总助的话”用。没有日报就没有这一段 */
export function latestDaily(): { report: Report; lines: string[]; twin: string } | null {
  const r = listReports('日报')[0]
  if (!r) return null
  return { report: r, lines: reportSummary(r, 4), twin: reportLine(r, '分身的一句') }
}

/** AI 写好报告后登记：文件要在知识库的 90-日志与报告/<日报|周报|月报>/ 里，开头字段要齐。登记只记一笔，不改文件 */
export function registerReport(path: string, actor: Actor) {
  const rel = path.replace(/\\/g, '/').replace(/^\.?\//, '')
  const m = rel.match(/^90-日志与报告\/(日报|周报|月报)\/[^/]+\.md$/)
  if (!m) throw new BadRequest(`报告要放在知识库的 ${REPORT_DIR}/日报|周报|月报/ 下，写从知识库根目录起的路径，比如 ${REPORT_DIR}/周报/2026-W48.md`)
  const abs = join(ROOT, rel)
  if (!existsSync(abs) || !canReadKbPath(abs)) throw new NotFound(`知识库里没有这个文件：${rel}（先把报告写进知识库，再登记）`)
  const r = parseReport(readRel(rel), rel)
  if (r.problems.length) throw new BadRequest(`这份报告的格式还不对：${r.problems.join('；')}`)
  if (!r.sections.length) throw new BadRequest('这份报告没有正文小节（用“## 做了什么”这样的二级标题）')
  run('INSERT INTO pa_reports (path, kind, period, by, registered_at) VALUES (:path, :kind, :period, :by, :at) ON CONFLICT(path) DO UPDATE SET kind = :kind, period = :period, by = :by, registered_at = :at',
    { path: rel, kind: r.kind, period: r.period, by: r.by, at: nowIso() })
  logChange(actor, 'pa_report', rel, '登记', `报告：登记了${r.kind} ${r.period}（${r.by || '没写是谁写的'}）`)
  return { path: rel, kind: r.kind, period: r.period, by: r.by, sections: r.sections.map((s) => s.title), to: `/reports?kind=${encodeURIComponent(r.kind)}&period=${encodeURIComponent(r.period)}` }
}

export const registeredReports = () => all<{ path: string; kind: string; period: string; by: string; registered_at: string }>('SELECT * FROM pa_reports ORDER BY registered_at DESC LIMIT 50')
