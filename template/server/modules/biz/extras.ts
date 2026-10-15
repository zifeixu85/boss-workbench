// 各渠道特有的内容：推广计划（天猫等）、售后明细（小红书店）、云仓库存和入仓预约（抖店）、一周里哪几天人多和会员（门店）、门店改造停业提醒。归属：经营模块。
import { all, get } from '../../db.ts'
import { addDays, today } from '../../services/common.ts'
import { inventory } from './service.ts'
import { eachDate } from './metrics.ts'
import { campaignShifts } from './ads.ts'
import { isHoliday, md } from './period.ts'

const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10

/** 推广计划：这段时间每个计划花了多少、带来多少成交、ROI；再加“之前两周 → 近 3 天”的对比（和异常、早报同一个算法、同一段日子） */
export function campaigns(ch: string, from: string, to: string) {
  const rows = all<{ date: string; campaign: string; spend: number; clicks: number; gmv: number; bid: number | null }>(
    'SELECT date, campaign, spend, clicks, gmv, bid FROM channel_ads WHERE channel_id = :c AND date BETWEEN :f AND :t ORDER BY date', { c: ch, f: from, t: to })
  const shifts = new Map(campaignShifts(ch, to).map((s) => [s.campaign, s]))
  const names = [...new Set(rows.map((r) => r.campaign))]
  const days = eachDate(from, to)
  return names.map((name) => {
    const mine = rows.filter((r) => r.campaign === name)
    const spend = mine.reduce((a, r) => a + r.spend, 0)
    const gmv = mine.reduce((a, r) => a + r.gmv, 0)
    const clicks = mine.reduce((a, r) => a + r.clicks, 0)
    const s = shifts.get(name) ?? null
    const known_days = new Set(mine.map(x=>x.date)).size
    const complete = known_days === days.length
    return {
      campaign: name, spend: complete ? Math.round(spend) : null, gmv: complete ? Math.round(gmv) : null, clicks: complete ? clicks : null, roi: complete && spend ? r2(gmv / spend) : null, cpc: complete && clicks ? r2(spend / clicks) : null, known_days, expected_days: days.length,
      daily_spend: complete && days.length ? Math.round(spend / days.length) : null,
      bid: mine.at(-1)?.bid ?? null,
      bid_changed: s?.bid_change ? { at: s.bid_change.at, who: s.bid_change.who, action: s.bid_change.action, from: s.bid_change.from, to: s.bid_change.to } : null,
      /** 之前两周 → 近 3 天（每天花费、ROI、每次点击实际花费） */
      shift: s ? { base: s.base, now: s.now } : null,
      spark: days.map((d) => { const x = mine.find((r) => r.date === d); return x && x.spend ? r2(x.gmv / x.spend) : null }),
    }
  }).sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1))
}

/** 售后明细（逐单）+ 按发货批次汇总；批次发了多少件，从运营记录的“发出 … 件”里读。
 *  金额分开算：已经退的（已退款、退款中）和还没处理的，不混在一起 */
export function aftersales(ch: string, from: string, to: string) {
  const list = all<{ id: string; order_no: string; applied_at: string; sku_id: string | null; sku_name: string | null; qty: number; amount: number; reason: string; batch: string | null; status: string; handler: string | null; buyer_note: string | null }>(
    `SELECT a.*, s.name AS sku_name FROM biz_aftersales a LEFT JOIN skus s ON s.id = a.sku_id WHERE a.channel_id = :c AND substr(a.applied_at,1,10) BETWEEN :f AND :t ORDER BY a.applied_at DESC`,
    { c: ch, f: from, t: to })
  const ships = all<{ at: string; who: string; action: string }>("SELECT at, who, action FROM biz_ops_log WHERE channel_id = :c AND kind = '发货' ORDER BY at", { c: ch })
  const sum = (xs: typeof list) => r2(xs.reduce((a, x) => a + x.amount, 0))
  const batches = [...new Set(list.map((x) => x.batch).filter((b): b is string => !!b))].map((batch) => {
    const xs = list.filter((x) => x.batch === batch)
    const day = batch.match(/(\d+)\/(\d+)/)
    const ship = day ? ships.find((s) => Number(s.at.slice(5, 7)) === Number(day[1]) && Number(s.at.slice(8, 10)) === Number(day[2])) : undefined
    const shipped = ship?.action.match(/(\d+)\s*件/)
    const refunded = xs.filter((x) => ['已退款', '退款中'].includes(x.status))
    const pending = xs.filter((x) => x.status === '待处理')
    return {
      batch, sku_name: xs[0]?.sku_name ?? null, tickets: xs.length,
      refunded: refunded.length, refunded_amount: sum(refunded), refunding: xs.filter((x) => x.status === '退款中').length,
      pending: pending.length, pending_amount: sum(pending), resent: xs.filter((x) => x.status === '已补发').length,
      shipped: shipped ? Number(shipped[1]) : null, ship_note: ship ? `${md(ship.at)} ${ship.at.slice(11, 16)} ${ship.who}：${ship.action}` : null,
    }
  })
  return {
    list, batches,
    open: { pending: list.filter((x) => x.status === '待处理').length, refunding: list.filter((x) => x.status === '退款中').length },
    handlers: [...new Set(list.map((x) => x.handler).filter((h): h is string => !!h))],
  }
}

/** 云仓：每个商品还能卖几天、最晚哪天要约入仓（要提前 5 天约）；入仓预约记录 */
export function cloudStock(wh: string, leadDays = 5) {
  const t = today()
  const stock = inventory().filter((x) => x.warehouse_id === wh).map((x) => {
    const bookBy = x.days_left === null ? null : addDays(t, Math.floor(x.days_left) - leadDays)
    return { ...x, book_by: bookBy, too_late: bookBy !== null && bookBy < t && !x.in_transit }
  }).sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999))
  const inbound = all<{ id: string; sku_id: string; sku_name: string; qty: number; booked_at: string | null; arrive_date: string | null; status: string; who: string | null; note: string | null }>(
    'SELECT i.*, s.name AS sku_name FROM biz_inbound i JOIN skus s ON s.id = i.sku_id WHERE i.warehouse_id = :w ORDER BY i.arrive_date DESC', { w: wh })
  return { lead_days: leadDays, earliest: addDays(t, leadDays), stock, inbound }
}

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
/** 门店：一周里哪几天人多（按星期几平均进店人数和成交，节假日单独算），每天会员单占比。
 *  只用门店日报里有的数（当天成交、单数、进店人数、会员单数）；日报不分时段，所以不做“几点人多”。
 *  会员单占比 = 老客 ÷（新客 + 老客）：门店的口径是会员单算老客，所以和新客占比正好加起来 100% */
export function storeWeek(from: string, to: string) {
  // 按星期几平均要样本够：固定看近 30 天；会员占比跟着页面选的时间段
  const weekFrom = addDays(to, -29)
  const all30 = all<{ date: string; gmv: number; orders: number; visitors: number; new_buyers: number | null; old_buyers: number | null }>(
    "SELECT date, gmv, orders, visitors, new_buyers, old_buyers FROM channel_daily WHERE channel_id = 'store' AND date BETWEEN :f AND :t ORDER BY date", { f: [weekFrom, from].sort()[0], t: to })
  const rows = all30.filter((r) => r.date >= from)
  const weekRows = all30.filter((r) => r.date >= weekFrom)
  const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, x) => a + x, 0) / xs.length) : null)
  const dow = (d: string) => (new Date(`${d}T00:00:00`).getDay() + 6) % 7 // 0 = 周一
  const normal = weekRows.filter((r) => !isHoliday(r.date))
  const holiday = weekRows.filter((r) => isHoliday(r.date))
  const byDay = WEEK.map((label, i) => {
    const xs = normal.filter((r) => dow(r.date) === i)
    return { label, days: xs.length, visitors: avg(xs.map((x) => x.visitors)), gmv: avg(xs.map((x) => x.gmv)) }
  })
  const daily = eachDate(from, to).map((d) => {
    const x = rows.find((r) => r.date === d)
    const b = x && x.new_buyers !== null && x.old_buyers !== null ? x.new_buyers + x.old_buyers : null
    return { date: d, holiday: isHoliday(d), orders: x?.orders ?? null, members: x ? x.old_buyers : null, share: b ? r1((x!.old_buyers! / b) * 100) : null }
  })
  const complete = rows.length === eachDate(from,to).length && rows.every(x => x.old_buyers !== null && x.new_buyers !== null)
  const tot = complete ? rows.reduce((a,x) => ({m:a.m+x.old_buyers!, b:a.b+x.new_buyers!+x.old_buyers!}),{m:0,b:0}) : {m:null,b:null}
  const weekend = normal.filter((r) => dow(r.date) >= 5)
  const weekdays = normal.filter((r) => dow(r.date) < 5)
  return {
    week_from: weekFrom, by_day: byDay,
    holiday: holiday.length ? { days: holiday.length, visitors: avg(holiday.map((x) => x.visitors)), gmv: avg(holiday.map((x) => x.gmv)) } : null,
    weekday_avg: { days: weekdays.length, visitors: avg(weekdays.map((x) => x.visitors)), gmv: avg(weekdays.map((x) => x.gmv)) },
    weekend_avg: { days: weekend.length, visitors: avg(weekend.map((x) => x.visitors)), gmv: avg(weekend.map((x) => x.gmv)) },
    daily, member_share: tot.b ? r1((tot.m! / tot.b) * 100) : null, new_share: tot.b ? r1(((tot.b - tot.m!) / tot.b) * 100) : null,
    members: tot.m, buyers: tot.b,
  }
}

/** 门店接下来最大的事：改造停业（项目里的“停业”日程）和撞上的品鉴、会员通知的节点。没有就返回 null */
export function storeNotice() {
  const t = today()
  try {
    const p = get<{ id: string; name: string; kb_path: string | null }>("SELECT id, name, kb_path FROM projects WHERE name LIKE '%门店%' AND stage NOT IN ('已完成','暂停') ORDER BY due LIMIT 1")
    if (!p) return null
    const close = get<{ id: string; title: string; start: string }>("SELECT id, title, start FROM events WHERE project_id = :p AND title LIKE '%停业约%' AND substr(start,1,10) >= :t ORDER BY start LIMIT 1", { p: p.id, t })
    if (!close) return null
    const from = close.start.slice(0, 10)
    const days = Number(close.title.match(/约\s*(\d+)\s*天/)?.[1] ?? 10)
    const to = addDays(from, days - 1)
    const clash = all<{ id: string; title: string; start: string; client_id: string | null }>("SELECT id, title, start, client_id FROM events WHERE kind = '品鉴' AND substr(start,1,10) BETWEEN :f AND :t ORDER BY start", { f: from, t: to })
    const notice = get<{ title: string; date: string; status: string; note: string | null }>("SELECT title, date, status, note FROM project_milestones WHERE project_id = :p AND title LIKE '%通知%' ORDER BY date LIMIT 1", { p: p.id }) ?? null
    // 停业少卖多少：按近 30 天不算节假日的平常日子估（和知识库 06-项目/门店改造.md 的估法一样）
    const normal = all<{ date: string; gmv: number }>("SELECT date, gmv FROM channel_daily WHERE channel_id = 'store' AND date BETWEEN :f AND :t", { f: addDays(t, -30), t: addDays(t, -1) }).filter((r) => !isHoliday(r.date))
    const lost = normal.length ? normal.reduce((a, r) => a + r.gmv, 0) / normal.length : null
    return {
      project: { id: p.id, name: p.name, kb_path: p.kb_path }, event_id: close.id, from, to, days, reopen: addDays(to, 1),
      clash: clash.map((e) => ({ id: e.id, title: e.title, at: e.start })),
      notice: notice ? { title: notice.title, date: notice.date, status: notice.status, note: notice.note } : null,
      lost_per_day: lost === null ? null : Math.round(lost / 100) * 100,
    }
  } catch {
    return null // 没有项目、日程表（单独装经营模块时）
  }
}
