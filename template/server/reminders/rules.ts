// 提醒规则（纯函数，不读数据库、不看钟，方便测试）：给定“现在”和数据，算出这一刻该提醒哪些事。
// 每条提醒有一个 key：同一件事同一个时刻只有一条，记进 reminders 表后就不再提醒（只弹一次）。
//
//   待办   填了到期时间的：到期前 1 小时内（过了 30 分钟还没做也提醒一次）      todo:<ID>:<日期>T<时间>
//   日程   不是全天的：开始前 15 分钟内（开始后 10 分钟内也算）                    event:<ID>:<开始时间>
//   跟进   “下次跟进”是今天的客户：早上（免打扰结束时，默认 8:00）以后            follow:<客户ID>:<日期>
//   异常   经营异常新出现（连着几天都在只提醒一次，消失两天以上又出现再提醒）    alert:<异常ID>#<第一次出现那天>
//   数据源 没按时更新、导入失败（每个来源每天最多一次）                            alert:<来源ID>:<日期>
//   汇总   每天“看汇总”的时间（没设：工作台开了 5 分钟后）一次；免打扰时不补        summary:<日期>
// 只有日期、没有时间的待办不单独弹，算进汇总里。
import type { RemindSettings } from './settings.ts'

export type Kind = '待办' | '日程' | '跟进' | '异常' | '数据源' | '汇总' | '测试'
export type Candidate = {
  key: string; kind: Kind; title: string; body: string; link: string | null
  /** 过了这个时间就不再提醒（待办：到期后 30 分钟；日程：开始后 10 分钟）。免打扰时窗口还没过的先不记，等免打扰结束再弹 */
  until?: Date
  /** 经营异常：按“一段持续的时间”算，key 是这段时间的开头（见 service.ts） */
  episode?: boolean
}

export type TodoRow = { id: string; title: string; due: string | null; due_time: string | null; status: string; client_name: string | null }
export type EventRow = { id: string; title: string; start: string; all_day: number; location: string | null }
export type FollowRow = { id: string; name: string; label: string | null; next_follow: string | null; next_step: string | null }
export type AlertRow = { id: string; module: 'biz' | 'data'; title: string; detail: string; since: string | null; link: string }
export type SummaryCounts = { events: number; todos_today: number; todos_overdue: number; follows: number; alerts: number }

export const TODO_BEFORE_MIN = 60
export const TODO_AFTER_MIN = 30
export const EVENT_BEFORE_MIN = 15
export const EVENT_AFTER_MIN = 10
export const SUMMARY_AFTER_START_MIN = 5
const OPEN = new Set(['待办', '进行中', '等别人'])

const pad = (n: number) => String(n).padStart(2, '0')
/** 本地日期 YYYY-MM-DD */
export const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** 本地钟点 HH:mm */
export const hmOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))
/** “2026-10-27T15:30” → 本地时间 */
const at = (s: string) => new Date(`${s.length === 16 ? s : `${s}T00:00`}:00`)
const mins = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60000)
/** 离 a 还有几分钟：往上取整（还剩 4 分 20 秒算“还有 5 分钟”），过了是负数 */
const left = (a: Date, now: Date) => Math.ceil((a.getTime() - now.getTime()) / 60000)
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
/** 不是今天的写上月/日：“10/28 00:30” */
const when = (day: string, hm: string, now: Date) => (day === dateOf(now) ? hm : `${md(day)} ${hm}`)

/** now 是否在免打扰时段里。start、end 都空着 = 不设；start > end 表示跨午夜（22:00—08:00） */
export function inQuiet(now: Date, s: Pick<RemindSettings, 'quiet_start' | 'quiet_end'>): boolean {
  if (!s.quiet_start || !s.quiet_end || s.quiet_start === s.quiet_end) return false
  const m = now.getHours() * 60 + now.getMinutes()
  const a = minutesOf(s.quiet_start)
  const b = minutesOf(s.quiet_end)
  return a < b ? m >= a && m < b : m >= a || m < b
}

/** 免打扰这一段什么时候结束（now 不在免打扰里返回 null） */
export function quietEndsAt(now: Date, s: Pick<RemindSettings, 'quiet_start' | 'quiet_end'>): Date | null {
  if (!inQuiet(now, s)) return null
  const end = new Date(now)
  end.setHours(Number(s.quiet_end.slice(0, 2)), Number(s.quiet_end.slice(3, 5)), 0, 0)
  if (end <= now) end.setDate(end.getDate() + 1)
  return end
}

/** “早上”：免打扰结束的时间（没设免打扰按 8:00）。跟进提醒从这个时间起才弹 */
export const morningOf = (s: Pick<RemindSettings, 'quiet_start' | 'quiet_end'>) => (s.quiet_start && s.quiet_end ? s.quiet_end : '08:00')

export function todoCandidates(todos: TodoRow[], now: Date): Candidate[] {
  const out: Candidate[] = []
  for (const t of todos) {
    if (!t.due || !t.due_time || !OPEN.has(t.status)) continue
    const n = left(at(`${t.due}T${t.due_time}`), now)
    if (n > TODO_BEFORE_MIN || n < -TODO_AFTER_MIN) continue
    const tail = t.client_name ? ` · ${t.client_name}` : ''
    out.push({
      key: `todo:${t.id}:${t.due}T${t.due_time}`, kind: '待办',
      title: `待办「${t.title}」${when(t.due, t.due_time, now)} 到期`,
      body: (n >= 1 ? `还有 ${n} 分钟` : n === 0 ? '现在到期' : `已经过了 ${-n} 分钟，还没做完`) + tail,
      link: `/todos?todo=${t.id}`,
      until: new Date(at(`${t.due}T${t.due_time}`).getTime() + TODO_AFTER_MIN * 60000),
    })
  }
  return out
}

export function eventCandidates(events: EventRow[], now: Date): Candidate[] {
  const out: Candidate[] = []
  for (const e of events) {
    if (e.all_day || e.start.length < 16) continue
    const n = left(at(e.start.slice(0, 16)), now)
    if (n > EVENT_BEFORE_MIN || n < -EVENT_AFTER_MIN) continue
    const tail = e.location ? ` · ${e.location}` : ''
    out.push({
      key: `event:${e.id}:${e.start.slice(0, 16)}`, kind: '日程',
      title: `日程「${e.title}」${when(e.start.slice(0, 10), e.start.slice(11, 16), now)} 开始`,
      body: (n >= 1 ? `还有 ${n} 分钟` : n === 0 ? '现在开始' : `已经开始 ${-n} 分钟`) + tail,
      link: `/calendar?event=${e.id}`,
      until: new Date(at(e.start.slice(0, 16)).getTime() + EVENT_AFTER_MIN * 60000),
    })
  }
  return out
}

export function followCandidates(clients: FollowRow[], now: Date, s: Pick<RemindSettings, 'quiet_start' | 'quiet_end'>): Candidate[] {
  const day = dateOf(now)
  if (minutesOf(hmOf(now)) < minutesOf(morningOf(s))) return []
  return clients.filter((c) => c.next_follow === day).map((c): Candidate => ({
    key: `follow:${c.id}:${day}`, kind: '跟进',
    title: `今天该跟进${c.name}`,
    body: c.next_step?.trim() || c.label?.trim() || '下次跟进定在今天',
    link: `/clients?client=${c.id}`,
  }))
}

export function alertCandidates(alerts: AlertRow[], now: Date): Candidate[] {
  const day = dateOf(now)
  return alerts.map((a): Candidate => a.module === 'biz'
    // 经营异常：key 先写成 alert:<ID>，service.ts 按“这段持续的时间”补上 #<第一次出现那天>（异常的 since 会随数据滑动，不能当 key）
    ? { key: `alert:${a.id}`, kind: '异常', title: a.title, body: a.detail, link: a.link || null, episode: true }
    // 数据源没按时更新：每个来源每天最多一次
    : { key: `alert:${a.id}:${day}`, kind: '数据源', title: a.title, body: a.detail, link: a.link || null })
}

/** 今天该不该提醒看汇总（不管发没发过；发过没有由 reminders 表判断） */
export function summaryDue(now: Date, s: RemindSettings, startedAt: Date): boolean {
  if (inQuiet(now, s)) return false // 免打扰时不补：半夜开机不叫你看汇总，第二天照常
  if (s.notify_at) return minutesOf(hmOf(now)) >= minutesOf(s.notify_at)
  return mins(now, startedAt) >= SUMMARY_AFTER_START_MIN
}

export function summaryCandidate(now: Date, n: SummaryCounts): Candidate {
  const parts = [
    n.events ? `${n.events} 个日程` : '',
    n.todos_today ? `${n.todos_today} 件待办到期` : '',
    n.todos_overdue ? `${n.todos_overdue} 件待办已过期` : '',
    n.follows ? `${n.follows} 位客户该跟进` : '',
    n.alerts ? `${n.alerts} 处数据要留意` : '',
  ].filter(Boolean)
  return {
    key: `summary:${dateOf(now)}`, kind: '汇总', title: '今天的汇总好了',
    body: parts.length ? `今天有 ${parts.join('、')}。打开今日页看。` : '今天没有特别要留意的事。',
    link: '/',
  }
}

// ───── 怎么弹 ─────

export type Delivery = { via: '浏览器通知' | '系统通知' | '只记'; note: string | null }

/** 这一刻的提醒怎么送：关了 / 免打扰 → 只记；有开着、允许通知的工作台页面 → 浏览器通知；
 *  演示模式且没打开“演示时也弹系统通知” → 只记；系统不支持 → 只记；否则电脑系统通知 */
export function decide(o: { s: RemindSettings; now: Date; demo: boolean; browsers: number; platform: string }): Delivery {
  if (!o.s.on) return { via: '只记', note: '提醒已关' }
  if (inQuiet(o.now, o.s)) return { via: '只记', note: `免打扰 ${o.s.quiet_start}—${o.s.quiet_end}` }
  if (o.browsers > 0) return { via: '浏览器通知', note: null }
  if (o.demo && !o.s.demo_system) return { via: '只记', note: '演示模式' } // 演示时默认不弹系统通知，设置里可以打开
  if (!systemSupported(o.platform)) return { via: '只记', note: '这台电脑不支持系统通知' }
  return { via: '系统通知', note: null }
}

export const systemSupported = (platform: string) => platform === 'darwin' || platform === 'win32'

// ───── 一次弹几条 ─────

export type Popup = { kind: Kind | '更多'; title: string; body: string; link: string | null; ids: number[] }
const GROUP: Record<Kind, { title: (n: number) => string; link: string }> = {
  待办: { title: (n) => `${n} 件待办快到期`, link: '/todos' },
  日程: { title: (n) => `${n} 个日程快开始`, link: '/calendar' },
  跟进: { title: (n) => `今天该跟进 ${n} 位客户`, link: '/clients/follow' },
  异常: { title: (n) => `新出现 ${n} 处经营异常`, link: '/biz' },
  数据源: { title: (n) => `${n} 个数据源没按时更新`, link: '/sources' },
  汇总: { title: (n) => `${n} 条汇总`, link: '/' },
  测试: { title: (n) => `${n} 条测试提醒`, link: '/reminders' },
}
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 同一刻新出来的提醒合成几条弹出来：同一类不止一条的合成一条；最多 max 条，多的合成“还有 N 条提醒”。
 *  表里照样一条一条记，网页“提醒”页能看全。 */
export function groupPopups(items: (Candidate & { id: number })[], max = 3): Popup[] {
  const order: Kind[] = []
  const byKind = new Map<Kind, (Candidate & { id: number })[]>()
  for (const x of items) {
    if (!byKind.has(x.kind)) { byKind.set(x.kind, []); order.push(x.kind) }
    byKind.get(x.kind)!.push(x)
  }
  const popups: Popup[] = order.map((k) => {
    const xs = byKind.get(k)!
    if (xs.length === 1) return { kind: k, title: xs[0].title, body: xs[0].body, link: xs[0].link, ids: [xs[0].id] }
    const names = xs.map((x) => (k === '跟进' ? x.title.replace(/^今天该跟进/, '') : x.title))
    return { kind: k, title: GROUP[k].title(xs.length), body: cut(names.join('；'), 120), link: GROUP[k].link, ids: xs.map((x) => x.id) }
  })
  if (popups.length <= max) return popups
  const keep = popups.slice(0, max - 1)
  const rest = popups.slice(max - 1)
  const n = rest.reduce((a, p) => a + p.ids.length, 0)
  return [...keep, { kind: '更多', title: `还有 ${n} 条提醒`, body: cut(rest.map((p) => p.title).join('；'), 120), link: '/reminders', ids: rest.flatMap((p) => p.ids) }]
}
