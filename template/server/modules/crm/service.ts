// 大客户模块（读）：客户列表（带累计消费、等级、四个关键数、标签）、单个客户的完整档案、今天该跟进谁、快到的重要日子。归属：大客户模块。
// 今日页会调用 focus()（见 services/today.ts）：改它的返回形状，要在 README 的改动记录里写一笔。
// 金额：订单是“元”；商机、应收沿用公共表的“万元”。
// 消费口径（E5 修 #3，列表和档案同一套）：只算“已完成”、日期不晚于今天的订单；“上次下单”不算 0 元的补发单。
// 第三轮：门店包间费不是商品，不算消费、不算一单（和经营模块同一个口径），订单表里照样列出来、标“包间费，不算消费”。
// 第三轮：等级只看近 12 个月买了多少和“报价中 / 待签约”的单（方案中、需求确认的金额还没谈实，不算）；门店停业撞日子的标“撞上门店停业”。
import { all, get } from '../../db.ts'
import { today, addDays, daysBetween } from '../../services/common.ts'
import { clientDetail } from '../../services/clients.ts'
import { findClientNote } from '../../services/kb.ts'
import { inboxFor } from './materials.ts'
import { authorKind } from './authors.ts'
import { clashes, storeClosure } from './closure.ts'

/** 门店包间费：不是商品，不算消费（经营模块也不算） */
export const isRoomFee = (item: string) => item.includes('包间')
const DONE = "o.client_id = c.id AND o.status = '已完成' AND o.date <= :t AND o.item NOT LIKE '%包间%'"
const LIST_SQL = `SELECT c.*,
  (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE ${DONE}) AS total_spent,
  (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE ${DONE} AND o.date > :y) AS spent_12m,
  (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE ${DONE} AND substr(o.date,1,4) = :yr) AS spent_year,
  (SELECT COUNT(*) FROM orders o WHERE ${DONE} AND o.amount > 0) AS order_count,
  (SELECT amount FROM orders o WHERE ${DONE} AND o.amount > 0 ORDER BY date DESC LIMIT 1) AS last_order_amount,
  (SELECT MAX(date) FROM orders o WHERE ${DONE} AND o.amount > 0) AS last_order,
  (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE o.client_id = c.id AND o.status = '进行中') AS pending_orders,
  (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id AND o.status = '进行中' AND o.amount > 0) AS pending_count,
  (SELECT MIN(date) FROM orders o WHERE o.client_id = c.id AND o.status = '进行中' AND o.amount > 0) AS pending_date,
  (SELECT item || ' ' || qty || ' ' || unit FROM orders o WHERE o.client_id = c.id AND o.status = '进行中' AND o.amount > 0 ORDER BY date LIMIT 1) AS pending_item,
  (SELECT COALESCE(SUM(amount),0) FROM deals d WHERE d.client_id = c.id AND d.stage IN ('报价中','待签约') AND d.estimated = 0) AS firm_amount,
  (SELECT title FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 0 ORDER BY COALESCE(amount, 0) DESC LIMIT 1) AS deal_title,
  (SELECT stage FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 0 ORDER BY COALESCE(amount, 0) DESC LIMIT 1) AS deal_stage,
  (SELECT expected_close FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 0 ORDER BY COALESCE(amount, 0) DESC LIMIT 1) AS deal_close,
  COALESCE((SELECT text || '｜' || COALESCE(source, '') FROM client_traits t WHERE t.client_id = c.id AND t.kind = '顾虑' ORDER BY created_at DESC LIMIT 1),
    (SELECT concerns || '｜' || CAST(substr(date, 6, 2) AS INTEGER) || '/' || CAST(substr(date, 9, 2) AS INTEGER) || ' ' || channel FROM interactions i WHERE i.client_id = c.id AND i.concerns IS NOT NULL ORDER BY date DESC LIMIT 1)) AS concern,
  (SELECT COALESCE(SUM(amount),0) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 0) AS open_amount,
  (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 0) AS open_deals,
  (SELECT COALESCE(SUM(amount),0) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 1) AS est_amount,
  (SELECT basis FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成') AND d.estimated = 1 ORDER BY amount DESC LIMIT 1) AS est_basis,
  (SELECT summary FROM interactions i WHERE i.client_id = c.id ORDER BY date DESC, created_at DESC LIMIT 1) AS last_summary,
  (SELECT COUNT(*) FROM client_promises p WHERE p.client_id = c.id AND p.status = '待兑现') AS open_promises,
  (SELECT COUNT(*) FROM client_promises p WHERE p.client_id = c.id AND p.status = '待兑现' AND p.conflict IS NOT NULL AND p.decision IS NULL) AS conflict_promises,
  (SELECT MIN(due) FROM client_promises p WHERE p.client_id = c.id AND p.status = '待兑现' AND p.due IS NOT NULL) AS next_promise_due,
  (SELECT COALESCE(ROUND(SUM(amount - received), 2),0) FROM receivables r WHERE r.client_id = c.id AND r.received < r.amount) AS receivable_left,
  (SELECT MIN(due) FROM receivables r WHERE r.client_id = c.id AND r.received < r.amount) AS receivable_due
  FROM clients c`

export type ClientRow = {
  id: string; name: string; label: string | null; kind: string; stage: string; source: string | null; city: string | null
  phone: string | null; wechat: string | null; budget: number | null; last_contact: string | null; next_follow: string | null
  pending_count: number; pending_date: string | null; pending_item: string | null; firm_amount: number; last_order_amount: number | null
  deal_title: string | null; deal_stage: string | null; deal_close: string | null; concern: string | null
  kb_path: string | null; tags: string; note: string | null; created_at: string; updated_at: string
  segment: string | null; key_account: number; contact_name: string | null; contact_title: string | null; decision_maker: string | null
  headcount: number | null; source_detail: string | null; since: string | null; next_step: string | null; salutation: string | null
  total_spent: number; spent_12m: number; spent_year: number; order_count: number; last_order: string | null; pending_orders: number
  open_amount: number; open_deals: number; est_amount: number; est_basis: string | null; last_summary: string | null; open_promises: number; conflict_promises: number; next_promise_due: string | null
  receivable_left: number; receivable_due: string | null
}

/** 等级：看近 12 个月买了多少、报了价的单有多少（按去年估的复购、还在方案里的金额都不算；第三轮）。
 *  A：买过 3 万以上或报价中 / 待签约 2 万以上；B：5000 元以上或报价中 / 待签约 0.5 万以上；其余 C。工作台按金额算的，林总没定过 */
export function levelOf(spent12: number, firmWan: number): 'A' | 'B' | 'C' {
  if (spent12 >= 30000 || firmWan >= 2) return 'A'
  if (spent12 >= 5000 || firmWan >= 0.5) return 'B'
  return 'C'
}
export const LEVEL_RULE = '工作台按金额算的，林总没定过：A 级＝近 12 个月买了 3 万以上，或报价中、待签约的单 2 万以上；B 级＝5000 元以上，或报价中、待签约 0.5 万以上；其余 C 级。方案里的金额、按去年估的复购不算'

/** 等级为什么这么低：大客户、在谈却是 C / B 时，给一句人话（第三轮修产品评审 #22） */
function levelNote(r: Pick<ClientRow, 'open_amount' | 'firm_amount' | 'deal_stage' | 'spent_12m' | 'key_account'>, level: 'A' | 'B' | 'C') {
  if (!r.key_account) return null
  // 还没买过、只因为报了价就是 A 的（衡言）：说清楚是报价撑起来的，还没成交（第四轮修数据评审 #16）
  if (level === 'A') return r.spent_12m < 30000 && r.firm_amount >= 2 ? `报价 ${Math.round(r.firm_amount * 100) / 100} 万还没成交，先算 A` : null
  if (r.deal_stage && !r.open_amount) return `在谈金额没定，先算 ${level}`
  if (r.open_amount > r.firm_amount) return `${r.deal_stage ?? '在谈'} ${Math.round(r.open_amount * 100) / 100} 万还没报价，先算 ${level}`
  if (level === 'B' && r.spent_12m > 0) return `近 12 个月买了 ${Math.round(r.spent_12m / 100) / 100} 万，算 B`
  return null
}

/** 多久没联系算“久”：大客户 30 天，其他客户 60 天 */
export const quietDays = (key: boolean) => (key ? 30 : 60)

/** 每年重复的日子（--11-12）换成今天之后最近的一次 */
export function nextOccurrence(date: string, t = today()) {
  if (!date.startsWith('--')) return date
  const md = date.slice(2)
  const thisYear = `${t.slice(0, 4)}-${md}`
  return thisYear >= t ? thisYear : `${Number(t.slice(0, 4)) + 1}-${md}`
}

/** 全部客户（客户列表、跟进看板用）：大客户在前，再按下次跟进 */
export function clientList() {
  const t = today()
  const rows = all<ClientRow>(`${LIST_SQL} ORDER BY c.kind, c.key_account DESC, COALESCE(c.next_follow, '9999')`, { t, y: addDays(t, -365), yr: t.slice(0, 4) })
  const birthdays = all<{ client_id: string; date: string; label: string }>("SELECT client_id, date, label FROM client_dates WHERE kind = '生日'")
  const inbox = inboxFor()
  const clash = clashes()
  return rows.map((r) => {
    const silent = r.last_contact ? daysBetween(r.last_contact, t) : null
    const active = r.kind === '客户' && !['暂停', '流失'].includes(r.stage)
    const bday = birthdays.filter((b) => b.client_id === r.id).map((b) => ({ ...b, next: nextOccurrence(b.date, t) })).find((b) => daysBetween(t, b.next) <= 30)
    const materials = inbox.filter((m) => m.client_id === r.id)
    const flags: string[] = []
    if (active && silent !== null && silent > quietDays(r.key_account === 1)) flags.push('久未联系')
    if (materials.length) flags.push('有新材料')
    if (bday) flags.push('生日临近')
    if (r.conflict_promises > 0) flags.push('有冲突待定')
    if (clash.get(r.id)?.length) flags.push('撞上门店停业')
    const level = levelOf(r.spent_12m, r.firm_amount)
    const [concernText, concernSrc] = (r.concern ?? '').split('｜')
    return {
      ...r,
      tags: JSON.parse(String(r.tags || '[]')) as string[],
      follow_overdue: r.next_follow ? daysBetween(r.next_follow, t) : null,
      days_silent: silent,
      level, level_note: levelNote(r, level),
      concern: r.concern ? { text: concernText, source: concernSrc || null } : null,
      flags,
      birthday: bday ? { label: bday.label, date: bday.next, days_left: daysBetween(t, bday.next) } : null,
      materials: materials.map((m) => ({ path: m.path, title: m.title, date: m.date })),
    }
  })
}

export function keyAccounts() {
  return clientList().filter((c) => c.key_account === 1)
}

type OrderRow = { id: string; amount: number; date: string; status: string; occasion: string | null; channel: string; item: string; qty: number; unit: string; unit_price: number | null }

/** 一位客户的完整档案：公共部分（沟通、商机、待办、日程、应收）+ 订单、答应的事、偏好、重要日子、关怀、八项信息、改动留痕、知识库笔记 */
export function profile(idOrName: string) {
  const t = today()
  const base = clientDetail(idOrName)
  const cid = base.client.id
  const row = clientList().find((c) => c.id === cid)!
  const orders = all<OrderRow>('SELECT * FROM orders WHERE client_id = :cid ORDER BY date DESC, id DESC', { cid })
  // said_on：这件事是哪天说的（所属往来记录的日期；第二轮修 #8，原来显示的是写进工作台的时间）
  const promises = all<{ id: string; interaction_id: string | null; status: string; due: string | null }>(
    `SELECT p.*, COALESCE(i.date, substr(p.created_at, 1, 10)) AS said_on, i.channel AS said_channel FROM client_promises p LEFT JOIN interactions i ON i.id = p.interaction_id
     WHERE p.client_id = :cid ORDER BY CASE p.status WHEN '待兑现' THEN 0 ELSE 1 END, COALESCE(p.due, '9999'), p.created_at`, { cid })
  const interactions = (base.interactions as { id: string }[]).map((i) => ({ ...i, promises: promises.filter((p) => p.interaction_id === i.id) }))
  const dates = all<{ date: string }>('SELECT * FROM client_dates WHERE client_id = :cid', { cid })
    .map((d) => { const next = nextOccurrence(d.date, t); return { ...d, next, days_left: daysBetween(t, next), recurring: d.date.startsWith('--') } })
    .sort((a, b) => a.next.localeCompare(b.next))
  const done = orders.filter((o) => o.status === '已完成' && o.date <= t && o.amount > 0 && !isRoomFee(o.item))
  const years = [...new Set(done.map((o) => o.date.slice(0, 4)))].sort()
  const firstDay = done.at(-1)?.date ?? null
  const byYear = years.map((y) => {
    const xs = done.filter((o) => o.date.startsWith(y))
    // 不满一年的：今年（到今天）、第一年（几月起）。网页上浅色画、柱下注明
    const partial = y === t.slice(0, 4) ? 'now' as const : firstDay && y === firstDay.slice(0, 4) && firstDay.slice(5, 7) !== '01' ? 'first' as const : null
    return { year: y, amount: xs.reduce((a, o) => a + o.amount, 0), orders: xs.length, partial, from_month: partial === 'first' ? Number(firstDay!.slice(5, 7)) : null }
  })
  // 近 12 个月每月花多少（看复购节奏；企业茶礼、只有一两年的用这个）
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${t.slice(0, 7)}-01T00:00:00`); d.setMonth(d.getMonth() - 11 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  const byMonth = months.map((m) => { const xs = done.filter((o) => o.date.startsWith(m)); return { month: m, amount: xs.reduce((a, o) => a + o.amount, 0), orders: xs.length } })
  const byOccasion = [...new Set(done.map((o) => o.occasion ?? '日常'))].map((k) => ({ occasion: k, amount: done.filter((o) => (o.occasion ?? '日常') === k).reduce((a, o) => a + o.amount, 0) }))
    .sort((a, b) => b.amount - a.amount)
  // 买得最多的东西（按商品，不按场合；第二轮修 #21）：几次、一共多少
  const byItem = [...new Set(done.map((o) => o.item))].map((item) => {
    const xs = done.filter((o) => o.item === item)
    return { item, times: xs.length, qty: xs.reduce((a, o) => a + o.qty, 0), unit: xs[0].unit, amount: xs.reduce((a, o) => a + o.amount, 0) }
  }).sort((a, b) => b.amount - a.amount)
  // 每一次买了什么（企业茶礼只有一两年的数据时，按年画只有一根柱子，改看每次节点买了多少）
  const each = done.map((o) => ({ date: o.date, occasion: o.occasion, item: o.item, qty: o.qty, unit: o.unit, unit_price: o.unit_price, amount: o.amount }))
  return {
    ...base,
    client: { ...base.client, ...pickClientExtras(row) },
    summary: {
      level: row.level, flags: row.flags, days_silent: row.days_silent, spent_year: row.spent_year, receivable_left: row.receivable_left,
      receivable_due: row.receivable_due, birthday: row.birthday, materials: row.materials, open_amount: row.open_amount, pending_orders: row.pending_orders,
      est_amount: row.est_amount, est_basis: row.est_basis, level_note: row.level_note, firm_amount: row.firm_amount,
    },
    deals: all("SELECT d.*, c.name AS client_name, c.label AS client_label FROM deals d JOIN clients c ON c.id = d.client_id WHERE d.client_id = :cid ORDER BY d.updated_at DESC", { cid }),
    interactions,
    orders: orders.map((o) => ({ ...o, room_fee: isRoomFee(o.item) })),
    promises,
    traits: all("SELECT * FROM client_traits WHERE client_id = :cid ORDER BY CASE kind WHEN '顾虑' THEN 0 WHEN '禁忌' THEN 1 ELSE 2 END, created_at", { cid }),
    dates,
    care: all<{ author: string | null }>("SELECT * FROM client_care WHERE client_id = :cid ORDER BY CASE status WHEN '建议' THEN 0 WHEN '已安排' THEN 0 ELSE 1 END, COALESCE(date, '9999')", { cid })
      .map((x) => ({ ...x, author_kind: authorKind(x.author) })),
    facts: all("SELECT * FROM client_facts WHERE client_id = :cid ORDER BY date DESC, created_at DESC", { cid }),
    edits: all('SELECT * FROM crm_edits WHERE client_id = :cid ORDER BY at DESC LIMIT 30', { cid }),
    follow_todo: get<{ todo_id: string }>('SELECT todo_id FROM crm_follow_todos WHERE client_id = :cid', { cid })?.todo_id ?? null,
    stats: {
      total_spent: row.total_spent, spent_12m: row.spent_12m, spent_year: row.spent_year, order_count: done.length,
      first_order: done.at(-1)?.date ?? null, last_order: done[0]?.date ?? null,
      avg_order: done.length ? Math.round(row.total_spent / done.length) : null,
      by_year: byYear, by_month: byMonth, by_occasion: byOccasion, by_item: byItem, each: each.slice(0, 12),
      room_fees: orders.filter((o) => isRoomFee(o.item) && o.status === '已完成').reduce((a, o) => a + o.amount, 0),
      units: done.reduce((a, o) => a + (o.unit === '份' ? o.qty : 0), 0),
    },
    kb_note: findClientNote(base.client),
    clashes: clashes(cid).get(cid) ?? [],
    closure: storeClosure(),
  }
}

function pickClientExtras(r: Pick<ClientRow, "segment" | "key_account" | "contact_name" | "contact_title" | "decision_maker" | "headcount" | "source_detail" | "since" | "next_step" | "salutation">) {
  return {
    segment: r.segment, key_account: r.key_account, contact_name: r.contact_name, contact_title: r.contact_title, decision_maker: r.decision_maker,
    headcount: r.headcount, source_detail: r.source_detail, since: r.since, next_step: r.next_step, salutation: r.salutation,
  }
}

export type FocusReason = { score: number; text: string }
const rel = (n: number) => (n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '后天' : `${n} 天后`)
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 今天该跟进的大客户：约好的跟进到期、答应的事快到期、昨天刚联系过、钱快到期、重要日子快到了。分数越高越靠前 */
export function focus(t = today(), limit = 6) {
  const promises = all<{ client_id: string; text: string; due: string }>("SELECT client_id, text, due FROM client_promises WHERE status = '待兑现' AND due IS NOT NULL")
  const recs = all<{ client_id: string; milestone: string; amount: number; received: number; due: string }>('SELECT client_id, milestone, amount, received, due FROM receivables WHERE received < amount')
  const dates = all<{ client_id: string; date: string; label: string }>('SELECT client_id, date, label FROM client_dates')
  const recent = all<{ id: string; client_id: string; date: string; channel: string; with_whom: string | null; summary: string }>(
    'SELECT id, client_id, date, channel, with_whom, summary FROM interactions WHERE date BETWEEN :d AND :t ORDER BY date DESC, created_at DESC', { d: addDays(t, -1), t })
  const promiseOf = all<{ interaction_id: string; text: string }>("SELECT interaction_id, text FROM client_promises WHERE status = '待兑现' AND interaction_id IS NOT NULL")
  return keyAccounts().map((c) => {
    const reasons: FocusReason[] = []
    if (c.next_follow) {
      const d = daysBetween(t, c.next_follow)
      if (d < 0) reasons.push({ score: 100 + Math.min(-d, 30), text: `约好 ${md(c.next_follow)} 跟进，已经过了 ${-d} 天` })
      else if (d <= 2) reasons.push({ score: 78 - d * 4, text: `${rel(d)}该跟进` })
    }
    for (const p of promises.filter((x) => x.client_id === c.id)) {
      const d = daysBetween(t, p.due)
      if (d < 0) reasons.push({ score: 110, text: `答应的“${p.text}”已经过了 ${-d} 天` })
      else if (d <= 2) reasons.push({ score: 82 - d * 4, text: `答应的“${p.text}”${rel(d)}到期` })
    }
    const talk = recent.find((x) => x.client_id === c.id)
    if (talk) {
      const when = `${talk.date === t ? '今天' : '昨天'}${talk.with_whom ?? ''}${talk.channel === '电话' ? '来过电话' : talk.channel === '到店' ? '来过店里' : `${talk.channel}聊过`}`
      const promised = promiseOf.find((p) => p.interaction_id === talk.id)
      reasons.push({ score: 72, text: promised ? `${when}，答应了“${promised.text}”` : `${when}：${talk.summary.slice(0, 24)}${talk.summary.length > 24 ? '…' : ''}` })
    }
    for (const r of recs.filter((x) => x.client_id === c.id)) {
      const d = daysBetween(t, r.due)
      const left = Math.round((r.amount - r.received) * 100) / 100
      if (d < 0) reasons.push({ score: 70, text: `${r.milestone} ${left} 万已经逾期 ${-d} 天` })
      else if (d <= 4) reasons.push({ score: 50, text: `${r.milestone} ${left} 万，${rel(d)}到期` })
    }
    for (const x of dates.filter((y) => y.client_id === c.id)) {
      const d = daysBetween(t, nextOccurrence(x.date, t))
      if (d >= 0 && d <= 21) reasons.push({ score: 30 - d / 10, text: `${x.label}（${rel(d)}，${md(nextOccurrence(x.date, t))}）` })
    }
    reasons.sort((a, b) => b.score - a.score)
    return {
      id: c.id, name: c.name, label: c.label, stage: c.stage, contact: c.contact_name, contact_title: c.contact_title,
      next_follow: c.next_follow, next_step: c.next_step, total_spent: c.total_spent, open_amount: c.open_amount,
      score: reasons[0]?.score ?? 0, reasons: reasons.map((r) => r.text),
    }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 未来 N 天的生日和重要日子 + 对应的关怀建议 */
export function upcomingDates(days = 45, t = today()) {
  const care = all<{ client_id: string; occasion: string; date: string | null; gift: string | null; message: string | null; status: string }>('SELECT * FROM client_care')
  return all<{ id: string; client_id: string; client_name: string; date: string; label: string; kind: string; who: string | null }>(
    'SELECT d.*, c.name AS client_name FROM client_dates d JOIN clients c ON c.id = d.client_id')
    .map((d) => ({ ...d, next: nextOccurrence(d.date, t) }))
    .map((d) => ({ ...d, days_left: daysBetween(t, d.next), care: care.filter((c) => c.client_id === d.client_id && c.date === d.next) }))
    .filter((d) => d.days_left >= 0 && d.days_left <= days)
    .sort((a, b) => a.days_left - b.days_left)
}

/** 最近改阶段的记录（跟进看板下面列出来） */
export function recentStageEdits(limit = 12) {
  return all(`SELECT e.*, c.name AS client_name FROM crm_edits e JOIN clients c ON c.id = e.client_id WHERE e.entity = '阶段' ORDER BY e.at DESC LIMIT :n`, { n: limit })
}
