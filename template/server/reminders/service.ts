// 提醒：工作台后台服务每 30 秒算一遍（不靠网页开着），新出来的记进 reminders 表，再按设置决定怎么弹。
//   页面开着、点过“开启提醒”     → 经实时通道（SSE）推给页面，页面用浏览器通知弹（server/index.ts 负责推）
//   页面关着（或没允许通知）       → 电脑系统通知（notify.ts）
//   关了 / 免打扰 / 演示模式        → 只记，不弹（网页“提醒”页都看得到）
// 规则在 rules.ts，设置在 settings.ts。命令行 remind-check 能看这一刻会提醒什么、为什么。
import { all, open } from '../db.ts'
import { now as rawNow, demoDate } from '../clock.ts'
import { addDays } from '../services/common.ts'
import { listEvents } from '../services/schedule.ts'
import { identity } from '../services/identity.ts'
import * as biz from '../modules/biz/service.ts'
import * as dataSources from '../modules/data/service.ts'
import { readRemindSettings, type RemindSettings } from './settings.ts'
import { record, seen, markFailed, markNote, lastEpisode, touch, type ReminderRow } from './store.ts'
import { sendSystem, type Note, type SendResult } from './notify.ts'
import {
  todoCandidates, eventCandidates, followCandidates, alertCandidates, summaryDue, summaryCandidate, decide, groupPopups,
  dateOf, hmOf, morningOf, quietEndsAt, systemSupported,
  type AlertRow, type Candidate, type Delivery, type EventRow, type FollowRow, type Popup, type SummaryCounts, type TodoRow,
} from './rules.ts'

export const TICK_MS = 30_000

/** 现在（先打开数据库：演示日期可能存在数据库里，命令行里不先打开会按真实日期算） */
export const clockNow = () => { open(); return rawNow() }

/** 推给网页的内容：新记下的提醒、要弹的几条（浏览器通知时才有） */
export type PushPayload = { ids: number[]; via: Delivery['via']; popups: Popup[] }
export type Hooks = {
  /** 现在有几个开着、允许通知的工作台页面 */
  browsers: () => number
  /** 推给页面 */
  push: (p: PushPayload) => void
  /** 发系统通知（测试时换成假的） */
  send: (n: Note) => Promise<SendResult>
  platform: string
  /** 页面网址前缀，Windows Toast 点了打开对应页面用 */
  base: string | null
  /** 测试用：换掉经营异常和数据源的检查 */
  alerts?: () => AlertRow[]
}

let hooks: Hooks = { browsers: () => 0, push: () => {}, send: (n) => sendSystem(n), platform: process.platform, base: null }
/** 后台服务什么时候开始算的（命令行里没有，汇总按“刚开”算） */
let startedAt: Date | null = null
let timer: NodeJS.Timeout | null = null
/** 经营异常消失多久以后再出现算“新出现” */
export const EPISODE_GAP_DAYS = 2
/** 经营异常、数据源的检查要扫知识库和导入记录，5 分钟取一次就够（每 30 秒取一次会反复扫整个知识库） */
const ALERTS_TTL_MS = 5 * 60_000
let alertsCache: { at: number; day: string; rows: AlertRow[] } | null = null

const log = (s: string) => console.log(`[提醒] ${s}`)
const safe = <T>(what: string, fn: () => T, fallback: T): T => {
  try { return fn() } catch (err) { console.error(`[提醒] ${what}出错：${(err as Error).message}`); return fallback }
}

// ───── 读数据 ─────

function todosNear(day: string): TodoRow[] {
  return all<TodoRow>(`SELECT t.id, t.title, t.due, t.due_time, t.status, c.name AS client_name FROM todos t
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.due_time IS NOT NULL AND t.due BETWEEN :a AND :b AND t.status IN ('待办','进行中','等别人')`, { a: addDays(day, -1), b: addDays(day, 1) })
}
const eventsNear = (day: string) => listEvents(day, `${addDays(day, 2)}T00:00`) as unknown as EventRow[]
function followsOn(day: string): FollowRow[] {
  return all<FollowRow>(`SELECT id, name, label, next_follow, next_step FROM clients
    WHERE kind = '客户' AND stage NOT IN ('暂停','流失') AND next_follow = :day`, { day })
}
function alertsNow(day: string): AlertRow[] {
  if (hooks.alerts) return hooks.alerts()
  if (alertsCache && alertsCache.day === day && Date.now() - alertsCache.at < ALERTS_TTL_MS) return alertsCache.rows
  const rows = [...safe('读经营异常', () => biz.anomalies() as AlertRow[], []), ...safe('读数据源', () => dataSources.issues() as AlertRow[], [])]
  alertsCache = { at: Date.now(), day, rows }
  return rows
}
function countsFor(day: string, alerts: number): SummaryCounts {
  const one = (sql: string) => Number(all<{ n: number }>(sql, { day })[0]?.n ?? 0)
  return {
    events: listEvents(day, `${addDays(day, 1)}T00:00`).length,
    todos_today: one("SELECT COUNT(*) AS n FROM todos WHERE due = :day AND status IN ('待办','进行中','等别人')"),
    todos_overdue: one("SELECT COUNT(*) AS n FROM todos WHERE due < :day AND status IN ('待办','进行中','等别人')"),
    follows: one("SELECT COUNT(*) AS n FROM clients WHERE kind = '客户' AND stage NOT IN ('暂停','流失') AND next_follow IS NOT NULL AND next_follow <= :day"),
    alerts,
  }
}

/** 这一刻该提醒的全部候选（包括已经记过的；记没记过由 reminders 表判断） */
export function candidates(now: Date, s: RemindSettings): Candidate[] {
  const day = dateOf(now)
  const alerts = alertsNow(day)
  const out = [
    ...safe('算待办', () => todoCandidates(todosNear(day), now), []),
    ...safe('算日程', () => eventCandidates(eventsNear(day), now), []),
    ...safe('算跟进', () => followCandidates(followsOn(day), now, s), []),
    ...alertCandidates(alerts, now),
  ]
  if (summaryDue(now, s, startedAt ?? now) && !seen(`summary:${day}`)) out.push(summaryCandidate(now, safe('算汇总', () => countsFor(day, alerts.length), { events: 0, todos_today: 0, todos_overdue: 0, follows: 0, alerts: 0 })))
  return out
}

export function deliveryNow(now: Date, s = readRemindSettings()): Delivery {
  return decide({ s, now, demo: demoDate() !== null, browsers: hooks.browsers(), platform: hooks.platform })
}

// ───── 弹 ─────

const fullUrl = (link: string | null) => (hooks.base && link ? `${hooks.base}${link}` : null)

/** 把这几条按 delivery 弹出去；系统通知没发出去的改成“只记”、写上原因 */
async function deliver(rows: ReminderRow[], d: Delivery) {
  if (!rows.length) return
  const popups = d.via === '只记' ? [] : groupPopups(rows.map((r) => ({ ...r, kind: r.kind as Candidate['kind'] })))
  hooks.push({ ids: rows.map((r) => r.id), via: d.via, popups: d.via === '浏览器通知' ? popups : [] })
  if (d.via !== '系统通知') return
  const shop = identity().shop
  for (const p of popups) {
    const res = await hooks.send({ title: `老板工作台 · ${shop}`, subtitle: p.title, body: p.body, url: fullUrl(p.link) })
    if (!res.ok) {
      markFailed(p.ids, `系统通知没发出去：${res.error ?? '原因不明'}`)
      log(`系统通知没发出去（${res.how}）：${res.error ?? ''}`)
    } else if (res.error) markNote(p.ids, res.how)
  }
  if (popups.length) hooks.push({ ids: [], via: d.via, popups: [] }) // 失败改了记录，让页面再取一次
}

/** 算一遍：新的记下来、按设置弹出去。返回这次新记的条数 */
export async function tick(now: Date = clockNow()): Promise<ReminderRow[]> {
  const s = readRemindSettings()
  const list = candidates(now, s)
  if (!list.length) return []
  const d = deliveryNow(now, s)
  const quietEnd = quietEndsAt(now, s)
  const fresh: ReminderRow[] = []
  for (const c0 of list) {
    const c = c0.episode ? episodeKey(c0, now) : c0
    if (!c || seen(c.key)) continue
    // 免打扰时：过了免打扰还在提醒窗口里的（比如 8:30 到期的待办、还在的异常），先不记，免打扰结束后照常弹；
    // 免打扰结束前窗口就过了的，只记不弹
    if (quietEnd && (!c.until || c.until > quietEnd)) continue
    const row = record(c, d, now.toISOString()) // 一遍里都按同一个“现在”记
    if (row) fresh.push(row)
  }
  for (const r of fresh) log(`${dateOf(now)} ${hmOf(now)} ${r.kind}：${r.title} → ${r.via}${r.note ? `（${r.note}）` : ''}`)
  await deliver(fresh, d)
  return fresh
}

/** 经营异常按“一段持续的时间”只提醒一次：上一段最近两天还在（seen_at）就是同一段，记一下还在、不再提醒；
 *  否则是新的一段，key 用今天。返回 null = 不用提醒 */
function episodeKey(c: Candidate, now: Date): Candidate | null {
  const last = lastEpisode(c.key)
  const cutoff = new Date(now.getTime() - EPISODE_GAP_DAYS * 864e5).toISOString()
  if (last && (last.seen_at ?? last.at) >= cutoff) { touch(last.id, now.toISOString()); return null }
  return { ...c, key: `${c.key}#${dateOf(now)}` }
}

/** 测试提醒：网页“发一条测试提醒”、命令 remind-test 用。是你点的，所以免打扰、演示模式、总开关都不拦 */
export async function sendTest(now: Date = clockNow()): Promise<{ row: ReminderRow; via: string; how: string; ok: boolean; error?: string }> {
  const browsers = hooks.browsers()
  const via: Delivery['via'] = browsers > 0 ? '浏览器通知' : systemSupported(hooks.platform) ? '系统通知' : '只记'
  const d: Delivery = { via, note: via === '只记' ? '这台电脑不支持系统通知' : null }
  const row = record({ key: `test:${now.getTime()}:${Math.random().toString(36).slice(2, 6)}`, kind: '测试', title: '测试提醒', body: '看到这条，说明提醒能弹出来。', link: '/reminders' }, d)!
  log(`测试提醒 → ${via}`)
  if (via === '浏览器通知') { hooks.push({ ids: [row.id], via, popups: groupPopups([{ ...row, kind: '测试' }]) }); return { row, via, how: '浏览器通知', ok: true } }
  if (via === '只记') { hooks.push({ ids: [row.id], via, popups: [] }); return { row, via, how: '只记日志', ok: false, error: d.note ?? undefined } }
  const res = await hooks.send({ title: '老板工作台 · 测试', subtitle: row.title, body: row.body, url: fullUrl(row.link) })
  if (!res.ok) markFailed([row.id], `系统通知没发出去：${res.error ?? '原因不明'}`)
  hooks.push({ ids: [row.id], via, popups: [] })
  return { row, via, how: res.how, ok: res.ok, error: res.error }
}

/** 网页“提醒”页顶上的“现在怎么提醒” */
export function deliveryStatus() {
  const n = clockNow()
  const s = readRemindSettings()
  const d = deliveryNow(n, s)
  return {
    settings: s,
    demo: demoDate() !== null,
    now: `${dateOf(n)} ${hmOf(n)}`,
    browsers: hooks.browsers(),
    platform: hooks.platform === 'darwin' ? 'mac' : hooks.platform === 'win32' ? 'windows' : 'other',
    system_supported: systemSupported(hooks.platform),
    morning: morningOf(s),
    now_via: d.via, now_note: d.note,
  }
}

/** 本地服务启动时调用：记下钩子，每 30 秒算一遍（启动 10 秒后第一次） */
export function startReminders(h: Partial<Hooks>) {
  hooks = { ...hooks, ...h }
  startedAt = clockNow()
  if (timer) clearInterval(timer)
  const run = () => { tick().catch((err) => console.error('[提醒] 出错：', err)) }
  setTimeout(run, 10_000).unref()
  timer = setInterval(run, TICK_MS)
  timer.unref()
  const s = readRemindSettings()
  log(`已开始：每 30 秒看一次${s.on ? '' : '（提醒已关，只记不弹）'}；免打扰 ${s.quiet_start && s.quiet_end ? `${s.quiet_start}—${s.quiet_end}` : '不设'}；每天${s.notify_at ? ` ${s.notify_at} ` : '开机 5 分钟后'}提醒看汇总${demoDate() ? `；演示模式${s.demo_system ? '（也弹系统通知）' : '（不弹系统通知）'}` : ''}`)
}

/** 测试用：换钩子、改“启动时间” */
export function _setHooksForTest(h: Partial<Hooks>, started?: Date) {
  hooks = { ...hooks, ...h }
  if (started) startedAt = started
  alertsCache = null
}
