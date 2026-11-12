// 订阅链接（ICS）：谷歌、苹果 iCloud、Outlook、飞书都能给一个“私密地址”，工作台定时去取，只读。
//   - 链接等于密码：这里不打印、不写进错误信息，网页只显示网站名（maskUrl）
//   - 只认 https（webcal:// 换成 https://），20 秒超时，文件最大 5 MB
//   - 重复日程用 ical.js 展开（RRULE、EXDATE、单独改过的某一次），时区按文件里的 VTIMEZONE；
//     文件里没写 VTIMEZONE 的标准时区名（Asia/Shanghai）用系统自带的时区表换算；都换成这台电脑的本地时间
import type IcalLib from 'ical.js'
import { dayStr, minuteStr, type CalItem } from './rows.ts'

// ical.js 用到时才加载：只有接了订阅链接才需要它，命令行和服务启动不背这个包
let ICAL: typeof IcalLib
const loadIcal = async () => (ICAL ??= (await import('ical.js')).default)

export type IcsResult = { ok: true; text: string } | { ok: false; code: string; reason: string }
type Fetch = typeof fetch

export const ICS_TIMEOUT_MS = 20_000
export const ICS_MAX_BYTES = 5 * 1024 * 1024

/** 老板贴进来的链接 → 规范的 https 地址；不对就抛出一句人话 */
export function normalizeIcsUrl(raw: string): string {
  const s = raw.trim().replace(/^webcals?:\/\//i, 'https://')
  let u: URL
  try { u = new URL(s) } catch { throw new Error('这不像一个链接：从日历的设置里复制“私密地址”或“订阅链接”，整段贴过来') }
  if (u.protocol !== 'https:') throw new Error('订阅链接要以 https:// 或 webcal:// 开头')
  return u.toString()
}

/** 网页、命令行只显示网站名，不显示整条链接 */
export function maskUrl(url: string): string {
  try { return `${new URL(url).host} 的订阅链接` } catch { return '订阅链接' }
}

export async function fetchIcs(url: string, opts: { fetchImpl?: Fetch; timeoutMs?: number; maxBytes?: number } = {}): Promise<IcsResult> {
  const timeoutMs = opts.timeoutMs ?? ICS_TIMEOUT_MS
  const maxBytes = opts.maxBytes ?? ICS_MAX_BYTES
  let res: Response
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow', headers: { accept: 'text/calendar, */*' } })
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } }
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return { ok: false, code: 'timeout', reason: `订阅地址 ${timeoutMs / 1000} 秒没有回应：稍后会自动再试` }
    return { ok: false, code: 'network', reason: '连不上订阅地址：看看网络通不通，或者链接是不是复制完整了（谷歌日历在国内可能连不上）' }
  }
  if (res.url && !res.url.startsWith('https:')) return { ok: false, code: 'insecure', reason: '订阅地址跳到了不加密的网址，没有读' }
  if (!res.ok) {
    const gone = [401, 403, 404, 410].includes(res.status)
    return { ok: false, code: 'http', reason: gone ? `订阅链接打不开了（对方说 ${res.status}）：链接可能重置过或复制错了，重新复制一次私密地址` : `订阅地址出错了（对方说 ${res.status}）：稍后会自动再试` }
  }
  // 边读边数，超过上限就停，不把一个巨大的文件整个读进内存
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel().catch(() => {}); return { ok: false, code: 'too-big', reason: `订阅文件超过 ${Math.round(maxBytes / 1024 / 1024)} MB，太大了：换一个只放近期日程的日历` }
      }
      chunks.push(value)
    }
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, code: 'bad-file', reason: '这个链接打开的不是日历文件：要复制“iCal 格式的私密地址”，不是网页地址' }
  return { ok: true, text }
}

type Time = InstanceType<typeof IcalLib.Time>
type Comp = InstanceType<typeof IcalLib.Component>
type Ev = InstanceType<typeof IcalLib.Event>

const IANA = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false } }

/** 某个时区里的“墙上时间”对应的时刻（系统时区表，自动处理夏令时） */
export function wallToDate(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const offsetAt = (ms: number) => {
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms
  }
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let ms = guess - offsetAt(guess)
  ms = guess - offsetAt(ms) // 再算一次，跨夏令时的那几个小时也对
  return new Date(ms)
}

/** ICAL.Time → 时刻。文件里有时区定义或是 UTC：ical.js 自己算；只写了标准时区名：系统时区表；什么都没写（浮动时间）：按本地时间 */
function toDate(t: Time, tzid: string | null): Date {
  const zone = (t.zone as { tzid?: string } | undefined)?.tzid
  if (zone && zone !== 'floating') return t.toJSDate()
  if (tzid && IANA(tzid)) return wallToDate(t.year, t.month, t.day, t.hour, t.minute, tzid)
  return new Date(t.year, t.month - 1, t.day, t.hour, t.minute)
}

const ymd = (t: Time) => `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
const tzOf = (c: Comp, prop: string) => (c.getFirstProperty(prop)?.getParameter('tzid') as string | undefined) ?? null
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** 我拒绝了没有：谷歌私密地址的日历名就是自己的邮箱，参加人里同一个邮箱写着 DECLINED 就算拒绝 */
function declinedBy(c: Comp, me: string | null) {
  if (!me) return false
  return c.getAllProperties('attendee').some((a) => str(a.getFirstValue()).toLowerCase().replace(/^mailto:/, '') === me && str(a.getParameter('partstat')).toUpperCase() === 'DECLINED')
}

function item(ev: Ev, start: Time, end: Time | null, occurrence: string, ctx: { calendar: string | null; me: string | null; birthday: boolean }): CalItem {
  const c = ev.component
  const allDay = start.isDate
  const s = allDay ? ymd(start) : minuteStr(toDate(start, tzOf(c, 'dtstart')))
  const e = !end ? null : allDay ? (end.isDate ? ymd(end) : dayStr(toDate(end, tzOf(c, 'dtend')))) : minuteStr(toDate(end, tzOf(c, 'dtend') ?? tzOf(c, 'dtstart')))
  const cats = c.getAllProperties('categories').flatMap((p) => p.getValues().map(str))
  return {
    uid: ev.uid || '', occurrence, title: str(ev.summary), start: s, end: e, allDay, location: str(ev.location) || null,
    calendar: ctx.calendar, cancelled: str(c.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED',
    response: declinedBy(c, ctx.me) ? 'declined' : null,
    birthday: ctx.birthday || cats.some((x) => /birthday|生日/i.test(x)),
  }
}

/** 把 ICS 文本展开成 [from, to) 里的每一次日程（本地日期）。maxPerEvent 防止写坏的规则无限展开 */
export async function icsItems(text: string, window: { from: string; to: string }, maxPerEvent = 20_000): Promise<CalItem[]> {
  await loadIcal()
  const root = new ICAL.Component(ICAL.parse(text))
  const calName = str(root.getFirstPropertyValue('x-wr-calname')).trim() || null
  const me = calName && /^[^@\s]+@[^@\s]+$/.test(calName) ? calName.toLowerCase() : null
  const ctx = { calendar: calName, me, birthday: !!calName && /birthday|生日/i.test(calName) }
  const lo = new Date(`${window.from}T00:00:00`).getTime()
  const hi = new Date(`${window.to}T00:00:00`).getTime()

  // 同一个 UID：一条“母本”（可能带重复规则）+ 若干条单独改过的某一次（带 RECURRENCE-ID）
  const masters = new Map<string, Comp>()
  const exceptions = new Map<string, Comp[]>()
  for (const c of root.getAllSubcomponents('vevent')) {
    const uid = str(c.getFirstPropertyValue('uid'))
    if (!uid) continue
    if (c.hasProperty('recurrence-id')) exceptions.set(uid, [...(exceptions.get(uid) ?? []), c])
    else masters.set(uid, c)
  }

  const out: CalItem[] = []
  const keep = (it: CalItem, startMs: number, endMs: number) => { if (startMs < hi && (endMs > lo || startMs >= lo)) out.push(it) }
  const span = (ev: Ev, s: Time, e: Time | null) => {
    const a = s.isDate ? new Date(`${ymd(s)}T00:00:00`).getTime() : toDate(s, tzOf(ev.component, 'dtstart')).getTime()
    const b = e ? (e.isDate ? new Date(`${ymd(e)}T00:00:00`).getTime() : toDate(e, tzOf(ev.component, 'dtend') ?? tzOf(ev.component, 'dtstart')).getTime()) : a
    return [a, b] as const
  }

  for (const [uid, master] of masters) {
    const ev = new ICAL.Event(master)
    for (const x of exceptions.get(uid) ?? []) ev.relateException(x)
    exceptions.delete(uid)
    if (!ev.isRecurring()) {
      const [a, b] = span(ev, ev.startDate, ev.endDate)
      keep(item(ev, ev.startDate, ev.endDate, ev.startDate.toString(), ctx), a, b)
      continue
    }
    const it = ev.iterator()
    for (let i = 0, next = it.next(); next && i < maxPerEvent; i++, next = it.next()) {
      const d = ev.getOccurrenceDetails(next)
      const occ = d.item as Ev
      const [a, b] = span(occ, d.startDate, d.endDate)
      // 原定时间已经过了时间窗、改过的那一次也不在窗里：后面的只会更晚
      if (toDate(next, tzOf(master, 'dtstart')).getTime() >= hi && a >= hi) break
      keep(item(occ, d.startDate, d.endDate, next.toString(), ctx), a, b)
    }
  }
  // 只有“改过的某一次”、没有母本的（文件只给了一部分）：当单次日程
  for (const list of exceptions.values()) {
    for (const c of list) {
      const ev = new ICAL.Event(c)
      const [a, b] = span(ev, ev.startDate, ev.endDate)
      keep(item(ev, ev.startDate, ev.endDate, str(c.getFirstPropertyValue('recurrence-id')), ctx), a, b)
    }
  }
  return out
}
