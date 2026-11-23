// 报告文件（约定第 6 节）：90-日志与报告/日报|周报|月报/<期间>.md。只解析，不读写文件。
import { bullets, front, sections, str } from './text.ts'

export type ReportKind = '日报' | '周报' | '月报'
export const REPORT_KINDS: ReportKind[] = ['日报', '周报', '月报']
export type Report = {
  path: string; kind: ReportKind; period: string; by: string; updated: string; confirm: string; privacy: string
  sections: { title: string; text: string }[]
  problems: string[]
}

export function parseReport(md: string, path: string): Report {
  const { meta, body } = front(md)
  const parts = path.split('/')
  const folder = parts[parts.length - 2] as ReportKind
  const problems: string[] = []
  const t = str(meta['类型'])
  const kind = REPORT_KINDS.includes(t as ReportKind) ? (t as ReportKind) : folder
  if (!t) problems.push('开头没写“类型”')
  else if (t !== folder && REPORT_KINDS.includes(folder)) problems.push(`开头写的是“${t}”，却放在“${folder}”文件夹里`)
  const period = str(meta['期间']) || parts[parts.length - 1].replace(/\.md$/i, '')
  if (!periodOf(kind, period)) problems.push(`期间“${period}”认不出来（日报写 2026-11-25，周报写 2026-W48，月报写 2026-11）`)
  return { path, kind, period, by: str(meta['写的人']), updated: str(meta['更新']), confirm: str(meta['确认']), privacy: str(meta['隐私']), sections: sections(body), problems }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** 期间 → 起止日期（都含）。周按 ISO 周：周一到周日，第 1 周是含 1 月 4 日的那一周 */
export function periodOf(kind: string, period: string): { from: string; to: string } | null {
  if (kind === '日报') return /^\d{4}-\d{2}-\d{2}$/.test(period) && !Number.isNaN(Date.parse(period)) ? { from: period, to: period } : null
  if (kind === '月报') {
    const m = period.match(/^(\d{4})-(\d{2})$/)
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null
    return { from: `${period}-01`, to: iso(new Date(Date.UTC(Number(m[1]), Number(m[2]), 0))) }
  }
  const w = period.match(/^(\d{4})-W(\d{1,2})$/)
  if (!w || Number(w[2]) < 1 || Number(w[2]) > 53) return null
  const jan4 = new Date(Date.UTC(Number(w[1]), 0, 4))
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5 + (Number(w[2]) - 1) * 7 * 864e5)
  return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * 864e5)) }
}

/** 某一天在哪一周（2026-W48） */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const thu = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 864e5)
  const jan4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((thu.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** 摘要：有“摘要”小节用它，没有用“做了什么”，再没有用第一个小节；取前几条 */
export function reportSummary(r: Report, max = 3): string[] {
  const s = r.sections.find((x) => x.title === '摘要') ?? r.sections.find((x) => x.title === '做了什么') ?? r.sections[0]
  return s ? bullets(s.text).slice(0, max) : []
}

/** 报告里某个小节的一句话（“分身的一句”“这周的你”） */
export const reportLine = (r: Report, title: string) => bullets(r.sections.find((s) => s.title === title)?.text ?? '')[0] ?? ''
