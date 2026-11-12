// 日历同步的纯规则（不碰数据库、不碰网络，测试直接调）：三种来源读到的日程先变成同一种 CalItem，再变成 events 表的行。
//   - 时间一律是这台电脑的本地时间：定时日程 'YYYY-MM-DDTHH:MM'，全天日程只写日期，end 是结束后的那一天（和 events 表、FullCalendar 一致）
//   - 行 id 稳定：'cal_' + sha1(来源|日程 uid|这一次的发生时间)，同一次日程每次同步 id 都一样
//   - 拒绝了的、取消了的、生日日历的不要
import { createHash } from 'node:crypto'
import { SYNCED_EVENT_KIND, SYNCED_EVENT_SOURCE, type CalendarSource } from '../../shared/schema.ts'

export type Provider = Exclude<CalendarSource, 'off'>

export const PROVIDER_NAMES: Record<CalendarSource, string> = { off: '不接日历', mac: 'Mac 日历', lark: '飞书日历', ics: '订阅链接' }

/** 一条读到的日程（某一次发生） */
export type CalItem = {
  uid: string
  /** 这一次的原定发生时间（重复日程靠它区分每一次），任意稳定的字符串 */
  occurrence: string
  title: string
  start: string
  end: string | null
  allDay: boolean
  location?: string | null
  /** 来自哪个日历（显示在备注里），比如“工作” */
  calendar?: string | null
  /** 我自己的答复：declined 不要 */
  response?: 'accepted' | 'declined' | 'tentative' | 'pending' | 'unknown' | null
  cancelled?: boolean
  /** 生日日历的不要 */
  birthday?: boolean
}

export type EventRow = {
  id: string; title: string; start: string; end: string | null; all_day: 0 | 1; kind: string
  location: string | null; note: string; source: string
}

const p2 = (n: number) => String(n).padStart(2, '0')
/** 本地日期 YYYY-MM-DD */
export const dayStr = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
/** 本地时间 YYYY-MM-DDTHH:MM */
export const minuteStr = (d: Date) => `${dayStr(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`
export function addDay(day: string, n: number) {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + n)
  return dayStr(d)
}

/** 同步的时间窗：今天 0 点起 days 天，[from, to) */
export function syncWindow(now: Date, days = 14) {
  const from = dayStr(now)
  return { from, to: addDay(from, days) }
}

export const rowId = (provider: Provider, uid: string, occurrence: string) =>
  'cal_' + createHash('sha1').update(`${provider}|${uid}|${occurrence}`).digest('hex').slice(0, 20)

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MIN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 和时间窗 [from, to) 有重叠 */
function overlaps(it: CalItem, from: string, to: string) {
  const s = it.start.length === 10 ? `${it.start}T00:00` : it.start
  const e = it.end ? (it.end.length === 10 ? `${it.end}T00:00` : it.end) : s
  return s < `${to}T00:00` && (e > `${from}T00:00` || s >= `${from}T00:00`)
}

/** 读到的日程 → events 行。格式不对的跳过（数一下，状态里说一声），同一个 id 只留一条 */
export function toRows(provider: Provider, items: CalItem[], window: { from: string; to: string }) {
  const out = new Map<string, EventRow>()
  let skipped = 0
  for (const it of items) {
    if (it.cancelled || it.birthday || it.response === 'declined') continue
    const okTime = it.allDay ? DAY.test(it.start) && (!it.end || DAY.test(it.end)) : MIN.test(it.start) && (!it.end || MIN.test(it.end))
    if (!it.uid || !okTime) { skipped++; continue }
    if (!overlaps(it, window.from, window.to)) continue
    let end = it.end
    if (it.allDay && (!end || end <= it.start)) end = addDay(it.start, 1) // 全天日程至少占一天
    if (!it.allDay && end && end < it.start) end = null
    const cal = it.calendar?.trim()
    const id = rowId(provider, it.uid, it.occurrence || it.start)
    out.set(id, {
      id, title: cut(it.title.trim() || '（无标题）', 80), start: it.start, end, all_day: it.allDay ? 1 : 0, kind: SYNCED_EVENT_KIND,
      location: it.location?.trim() ? cut(it.location.trim(), 200) : null,
      note: `来自${/^[A-Za-z]/.test(PROVIDER_NAMES[provider]) ? ' ' : ''}${PROVIDER_NAMES[provider]}${cal ? `「${cut(cal, 40)}」` : ''}`, source: SYNCED_EVENT_SOURCE,
    })
  }
  return { rows: [...out.values()].sort((a, b) => a.start.localeCompare(b.start)), skipped }
}
