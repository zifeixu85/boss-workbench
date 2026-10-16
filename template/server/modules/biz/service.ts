// 经营模块（只读骨架）：5 个渠道每天的数据、商品、流量、退款、推广、库存，以及异常规则。归属：经营模块。
// 今日页会调用 summary() 和 anomalies()（见 services/today.ts）：改这两个函数的返回形状，要在 README 的改动记录里写一笔。
import { all, get } from '../../db.ts'
import { today, addDays, daysBetween, round1 } from '../../services/common.ts'
import { getConfig, type BizConfig } from './config.ts'
import { ruleWindows, span, type Win } from './period.ts'
import { bidChanges, campaignShifts } from './ads.ts'
import { agg, metricsOf, ratio, delta, rowsBetween } from './metrics.ts'

export type DailyRow = {
  date: string; channel_id: string; gmv: number; orders: number; visitors: number; refund_amount: number | null; refund_orders: number | null
  ad_spend: number | null; ad_gmv: number | null; new_buyers: number | null; old_buyers: number | null
  conv_rate: number | null; aov: number | null; refund_rate: number | null; roi: number | null; new_share: number | null
}
type Range = { channel?: string; from?: string; to?: string }

export const channels = () => all<{ id: string; name: string; kind: string; owner: string; warehouse_id: string; sort: number }>('SELECT * FROM channels ORDER BY sort')
export const skus = () => all('SELECT * FROM skus ORDER BY sort')

/** 经营数据最近的一天（一般是昨天：今天的数据明早才导进来） */
export function latestDate(): string | null {
  const t = today()
  return get<{ d: string | null }>('SELECT MAX(date) AS d FROM channel_daily WHERE date < :t', { t })?.d ?? null
}

function range(r: Range) {
  const to = r.to ?? latestDate() ?? today()
  return { c: r.channel ?? null, f: r.from ?? addDays(to, -29), t: to }
}
const CH = '(:c IS NULL OR channel_id = :c)'

export function daily(r: Range = {}) {
  return all<DailyRow>(`SELECT * FROM channel_daily_v WHERE ${CH} AND date BETWEEN :f AND :t ORDER BY date, channel_id`, range(r))
}

const pct = (a: number, b: number) => (b > 0 ? round1(((a - b) / b) * 100) : null)

/** 某一天各渠道的成绩单：和前一天、上周同一天比 */
export function summary(date = latestDate()) {
  if (!date) return null
  const rows = (d: string) => new Map(all<DailyRow>('SELECT * FROM channel_daily_v WHERE date = :d', { d }).map((x) => [x.channel_id, x]))
  const cur = rows(date)
  const prev = rows(addDays(date, -1))
  const lastWeek = rows(addDays(date, -7))
  const list = channels().map((c) => {
    const x = cur.get(c.id)
    const p = prev.get(c.id)
    const w = lastWeek.get(c.id)
    return {
      id: c.id, name: c.name, kind: c.kind, owner: c.owner,
      gmv: x?.gmv ?? null, orders: x?.orders ?? null, visitors: x?.visitors ?? null, conv_rate: x?.conv_rate ?? null, aov: x?.aov ?? null,
      refund_rate: x?.refund_rate ?? null, roi: x?.roi ?? null, ad_spend: x?.ad_spend ?? null, new_share: x?.new_share ?? null,
      vs_prev: x && p ? pct(x.gmv, p.gmv) : null, vs_last_week: x && w ? pct(x.gmv, w.gmv) : null,
    }
  })
  const ids = channels().map(c => c.id)
  const metric = (m: Map<string, DailyRow>, d: string) => metricsOf(agg([...m.values()], {from:d, to:d, channels:ids}))
  const total = metric(cur, date)
  return { date, channels: list, total: { ...total,
    vs_prev: delta('pct', total.gmv, metric(prev, addDays(date,-1)).gmv),
    vs_last_week: delta('pct', total.gmv, metric(lastWeek, addDays(date,-7)).gmv),
  } }

}

export function traffic(r: Range = {}) {
  return all(`SELECT channel_id, source, SUM(visitors) AS visitors FROM channel_traffic WHERE ${CH} AND date BETWEEN :f AND :t GROUP BY channel_id, source ORDER BY channel_id, visitors DESC`, range(r))
}

/** 商品排行：按成交额 */
export function products(r: Range & { limit?: number } = {}) {
  return all(`SELECT p.sku_id, s.name, s.category, s.price, SUM(p.units) AS units, ROUND(SUM(p.gmv)) AS gmv FROM channel_products p JOIN skus s ON s.id = p.sku_id
    WHERE ${CH.replace('channel_id', 'p.channel_id')} AND p.date BETWEEN :f AND :t GROUP BY p.sku_id ORDER BY gmv DESC LIMIT :n`, { ...range(r), n: r.limit ?? 5 })
}

export function refunds(r: Range = {}) {
  return all(`SELECT r.reason, r.sku_id, s.name AS sku_name, r.batch, SUM(r.orders) AS orders, SUM(r.amount) AS amount FROM channel_refunds r LEFT JOIN skus s ON s.id = r.sku_id
    WHERE ${CH.replace('channel_id', 'r.channel_id')} AND r.date BETWEEN :f AND :t GROUP BY r.reason, r.sku_id, r.batch ORDER BY amount DESC`, range(r))
}

export function ads(r: Range = {}) {
  return all(`SELECT * FROM channel_ads WHERE ${CH} AND date BETWEEN :f AND :t ORDER BY date, channel_id, campaign`, range(r))
}

export function ops(r: Range = {}) {
  const { c, f, t } = range(r)
  return all(`SELECT o.*, c.name AS channel_name FROM biz_ops_log o LEFT JOIN channels c ON c.id = o.channel_id
    WHERE (:c IS NULL OR o.channel_id = :c OR o.channel_id IS NULL) AND substr(o.at,1,10) BETWEEN :f AND :t ORDER BY o.at DESC`, { c, f, t })
}

/** 库存：可售天数 = 库存 / 近 7 天日均销量（按这个仓库供货的渠道算） */
export function inventory(date = latestDate() ?? today(), stockDays = getConfig().stock_days) {
  const from = addDays(date, -6)
  return all<{ sku_id: string; sku_name: string; warehouse_id: string; warehouse_name: string; stock: number; in_transit: number; safety_days: number; sku_status: string; avg_daily: number | null; sales_rows: number; expected_rows: number }>(`
    SELECT i.sku_id, s.name AS sku_name, s.status AS sku_status, i.warehouse_id, w.name AS warehouse_name, i.stock, i.in_transit, i.safety_days,
      (SELECT COUNT(*) FROM channel_products p JOIN channels c ON c.id = p.channel_id
        WHERE c.warehouse_id = i.warehouse_id AND p.sku_id = i.sku_id AND p.date BETWEEN :f AND :t) AS sales_rows,
      (SELECT COUNT(*) * 7 FROM channels c WHERE c.warehouse_id = i.warehouse_id) AS expected_rows,
      (SELECT SUM(p.units) / 7.0 FROM channel_products p JOIN channels c ON c.id = p.channel_id
        WHERE c.warehouse_id = i.warehouse_id AND p.sku_id = i.sku_id AND p.date BETWEEN :f AND :t) AS avg_daily
    FROM inventory i JOIN skus s ON s.id = i.sku_id JOIN warehouses w ON w.id = i.warehouse_id ORDER BY w.id, s.sort`, { f: from, t: date })
    .map((x) => {
      // 没有 SKU 与渠道的完整经营范围表时，不假设缺的渠道或日期是零。
      const avg = x.expected_rows > 0 && x.sales_rows === x.expected_rows ? x.avg_daily : null
      const days = avg !== null && avg > 0 ? round1(x.stock / avg) : null
      // 告急：不到“日报设置”的天数、也没有在途的货（规则会报）；7 天内：一周内会卖完，要盯着（有在途的也算，到货前可能断）
      const level = x.sku_status === '待上线' ? '待上线' : avg === null ? '资料不足' : avg === 0 ? '近7天无销量' : days === null ? '资料不足' : days < stockDays && !x.in_transit ? '告急' : days < 7 ? '7 天内' : '正常'
      return { ...x, avg_daily: avg, days_left: days, level }
    })
}

export type Alert = {
  id: string; level: '高' | '中'; module: 'biz' | 'data'; kind: string; channel_id: string | null; title: string; detail: string; cause: string | null; since: string | null; link: string
  /** 一句话的短说法（对比表、指标卡上的标签用）。和今日页 SalesBrief 的说法一致：退款率偏高 / 推广 ROI 掉了一半 / 有货快卖断了。
   *  可选：数据源模块的提醒没有这一项 */
  short?: string
}

/** 短说法：今日页（features/today/SalesBrief.tsx）按 kind 写死了同样的词，两边保持一致 */
export const SHORT = { 退款: '退款率偏高', 推广: '推广 ROI 掉了一半', 推广低: '推广 ROI 偏低', 库存: '有货快卖断了', 成交: '成交比上周少' } as const

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const n0 = (n: number | null) => n === null ? '暂无' : Math.round(n).toLocaleString('zh-CN')
/** 百分比：一位小数，不留末尾的 0（11.3、6） */
export const p1 = (n: number) => String(Math.round(n * 10) / 10)

/** 某渠道近 3 天退款的原因：先按原因加总，再看最多的那个原因里是不是集中在某个商品、某个发货批次 */
export function refundCause(ch: string, w: Win) {
  const reasons = all<{ reason: string; n: number; amount: number }>('SELECT reason, SUM(orders) AS n, SUM(amount) AS amount FROM channel_refunds WHERE channel_id = :c AND date BETWEEN :f AND :t GROUP BY reason ORDER BY n DESC, amount DESC', { c: ch, f: w.f, t: w.t })
  const top = reasons[0]
  if (!top) return null
  const group = get<{ sku: string | null; batch: string | null; n: number; amount: number }>(`SELECT s.name AS sku, r.batch, SUM(r.orders) AS n, SUM(r.amount) AS amount FROM channel_refunds r LEFT JOIN skus s ON s.id = r.sku_id
    WHERE r.channel_id = :c AND r.reason = :r AND r.date BETWEEN :f AND :t GROUP BY r.sku_id, r.batch ORDER BY n DESC, amount DESC LIMIT 1`, { c: ch, r: top.reason, f: w.f, t: w.t })
  const total = reasons.reduce((a, r) => a + r.n, 0)
  // 只有一个商品占了这个原因的一半以上、至少 3 单，才说“集中在某个商品”
  const focused = group && group.sku && group.n >= 3 && group.n * 2 >= top.n ? group : null
  const what = focused ? `${focused.batch ? `${focused.batch.replace(' 发货', '')} 发货的` : ''}${focused.sku}` : null
  const sp = what && /^\d/.test(what) ? ' ' : ''
  const text = `退款里“${top.reason}”最多（${total} 单里 ${top.n} 单）${what ? (focused!.n === top.n ? `，都是${sp}${what}` : `，其中 ${focused!.n} 单是${sp}${what}`) : ''}`
  return { reason: top.reason, n: top.n, total, sku: focused?.sku ?? null, batch: focused?.batch ?? null, sku_n: focused?.n ?? 0, sku_amount: focused ? Math.round(focused.amount * 100) / 100 : 0, text }
}

/** 异常规则（今日页“数据异常提醒”就是这里算出来的）：退款率突然升高、推广 ROI 低于参考线或掉一大截、库存只够卖几天、成交比上周同日少很多。
 *  阈值读“日报设置”（config.ts，默认和配方一致）；时间段读 period.ts（近 3 天 vs 之前两周）。link 指向渠道页并直接打开异常抽屉。 */
export function anomalies(date = latestDate(), cfg: BizConfig = getConfig(), opts: { all?: boolean } = {}): Alert[] {
  if (!date) return []
  const out: Alert[] = []
  const { now: last3, base: base14 } = ruleWindows(date)
  const nowT = `近 3 天（${span(last3)}）`
  const baseT = `之前两周（${span(base14)}）`
  for (const ch of channels()) {
    const window = (w: Win) => {
      const x = agg(rowsBetween(w.f, w.t, ch.id), {from:w.f, to:w.t, channels:[ch.id]})
      return {gmv:x.gmv, refund:x.refund_amount, spend:x.ad_spend, ad_gmv:x.ad_gmv, n:x.refund_orders}
    }
    const a = window(last3)
    const b = window(base14)
    // 1. 退款率：是平常的几倍，而且超过下限（单量小的渠道退一单就会跳，两条要同时满足）
    const rNow = ratio(a.refund, a.gmv, 100)
    const rBase = ratio(b.refund, b.gmv, 100)
    if (rNow !== null && rBase !== null && a.refund !== null && rNow >= cfg.refund_min && rNow >= rBase * cfg.refund_mult && a.refund >= 300) {
      const since = get<{ d: string }>('SELECT MIN(date) AS d FROM channel_daily_v WHERE channel_id = :c AND date BETWEEN :f AND :t AND refund_rate >= :lim', { c: ch.id, ...last3, lim: cfg.refund_min })?.d ?? last3.f
      const top = refundCause(ch.id, last3)
      out.push({
        id: `refund_${ch.id}`, level: '高', module: 'biz', kind: '退款', channel_id: ch.id, since, link: `/channel/${ch.id}?anomaly=refund_${ch.id}`, short: SHORT.退款,
        title: `${ch.name}退款率 ${md(since)} 起升到 ${p1(rNow)}%`,
        detail: `${nowT}退款单数 ${a.n ?? '暂无'}、${n0(a.refund)} 元；${baseT}平均 ${p1(rBase)}%`,
        cause: top?.text ?? null,
      })
    }
    // 2. 推广 ROI：低于参考线，或者比之前两周掉了一大截（只要近 3 天花了 500 元以上）
    const roiNow = ratio(a.ad_gmv, a.spend, 1, 2)
    const roiBase = ratio(b.ad_gmv, b.spend, 1, 2)
    const low = roiNow !== null && roiNow < cfg.roi_min
    const dropped = roiNow !== null && roiBase !== null && roiNow <= roiBase * (1 - cfg.roi_drop / 100)
    if (roiNow !== null && a.spend !== null && a.ad_gmv !== null && (low || dropped) && a.spend >= 500) {
      const op = bidChanges(ch.id, date, addDays(date, -7)).at(-1) ?? null
      const since = op?.at.slice(0, 10) ?? get<{ d: string }>('SELECT MIN(date) AS d FROM channel_daily_v WHERE channel_id = :c AND date BETWEEN :f AND :t AND roi < :lim', { c: ch.id, f: addDays(date, -7), t: date, lim: Math.min(cfg.roi_min, (roiBase ?? cfg.roi_min) * 0.7) })?.d ?? last3.f
      const shift = campaignShifts(ch.id, date)[0]
      const fell = roiBase !== null && roiNow < roiBase * 0.9
      out.push({
        id: `roi_${ch.id}`, level: '高', module: 'biz', kind: '推广', channel_id: ch.id, since, link: `/channel/${ch.id}?anomaly=roi_${ch.id}`,
        short: roiBase !== null && roiNow <= roiBase * 0.55 ? SHORT.推广 : SHORT.推广低,
        title: fell ? `${ch.name}推广 ROI ${md(since)} 起从 ${roiBase!.toFixed(1)} 掉到 ${roiNow.toFixed(1)}` : `${ch.name}推广 ROI 只有 ${roiNow.toFixed(1)}，低于 ${cfg.roi_min}`,
        detail: `${nowT}推广花了 ${n0(a.spend)} 元，带来 ${n0(a.ad_gmv)} 元成交，ROI ${roiNow.toFixed(1)}；${baseT}是 ${roiBase === null ? '—' : roiBase.toFixed(1)}`,
        cause: shift && shift.now.per_day !== null && shift.base.per_day !== null && shift.now.per_day > shift.base.per_day * 1.3
          ? `「${shift.campaign}」${shift.bid_change ? `${md(shift.bid_change.at)} ${shift.bid_change.at.slice(11, 16)} ${shift.bid_change.who}把出价从 ${shift.bid_change.from.toFixed(2)} 调到 ${shift.bid_change.to.toFixed(2)}；` : ''}近 3 天这个计划每天花 ${n0(shift.now.per_day)} 元（之前两周每天 ${n0(shift.base.per_day)} 元），ROI ${shift.base.roi?.toFixed(1) ?? '—'} → ${shift.now.roi?.toFixed(1) ?? '—'}`
          : null,
      })
    }
  }
  // 3. 成交比上周同一天少很多（周末比周末、周一比周一）
  for (const ch of channels()) {
    const cur = get<{ gmv: number }>('SELECT gmv FROM channel_daily WHERE channel_id = :c AND date = :d', { c: ch.id, d: date })
    const wk = get<{ gmv: number }>('SELECT gmv FROM channel_daily WHERE channel_id = :c AND date = :d', { c: ch.id, d: addDays(date, -7) })
    if (!cur || !wk || wk.gmv <= 0) continue
    const drop = ((wk.gmv - cur.gmv) / wk.gmv) * 100
    if (drop < cfg.gmv_drop) continue
    out.push({
      id: `gmv_${ch.id}`, level: '中', module: 'biz', kind: '成交', channel_id: ch.id, since: date, link: `/channel/${ch.id}?anomaly=gmv_${ch.id}`, short: SHORT.成交,
      title: `${ch.name} ${md(date)} 成交比上周同一天少 ${drop.toFixed(0)}%`,
      detail: `${n0(cur.gmv)} 元，上周同一天 ${n0(wk.gmv)} 元`,
      cause: null,
    })
  }
  // 4. 库存（库存是“现在”的数，只在看最新一天时提醒）
  const stockNow = date === latestDate() ? inventory(date, cfg.stock_days) : []
  for (const x of stockNow.filter((i) => i.level === '告急')) {
    const ch = channels().find((c) => c.warehouse_id === x.warehouse_id)
    const op = get<{ at: string; who: string; action: string }>("SELECT o.at, o.who, o.action FROM biz_ops_log o JOIN channels c ON c.id = o.channel_id WHERE c.warehouse_id = :w AND o.kind = '库存' ORDER BY o.at DESC LIMIT 1", { w: x.warehouse_id })
    out.push({
      id: `stock_${x.warehouse_id}_${x.sku_id}`, level: '高', module: 'biz', kind: '库存', channel_id: ch?.id ?? null, since: date, short: SHORT.库存,
      link: ch ? `/channel/${ch.id}?anomaly=stock_${x.warehouse_id}_${x.sku_id}` : `/biz?anomaly=stock_${x.warehouse_id}_${x.sku_id}`,
      title: `${ch?.name ?? x.warehouse_name}「${x.sku_name}」只够卖 ${x.days_left} 天`,
      detail: `${x.warehouse_name}还剩 ${x.stock} 件，近 7 天每天卖约 ${x.avg_daily?.toFixed(1) ?? '未知'} 件，没有在途的货`,
      cause: op ? `${md(op.at)} ${op.who}：${op.action}` : null,
    })
  }
  const order = { 库存: 0, 退款: 1, 推广: 2, 成交: 3 } as Record<string, number>
  // 今日页、命令行只提醒还没处理完的；经营页（opts.all）要全部，再合上处理状态
  const handled = opts.all ? new Set<string>() : handledIds()
  return out.filter((a) => !handled.has(a.id)).sort((p, q) => (order[p.kind] ?? 9) - (order[q.kind] ?? 9))
}

/** 已经标成“已处理”的异常（biz_anomalies，见 anomaly.ts） */
function handledIds() {
  try {
    return new Set(all<{ id: string }>("SELECT id FROM biz_anomalies WHERE status = '已处理'").map((r) => r.id))
  } catch {
    return new Set<string>()
  }
}

/** 渠道在某段时间的汇总（经营汇总页的“这段时间”可以直接用） */
export function totals(r: Range = {}) {
  const { c, f, t } = range(r)
  const xs = rowsBetween(f, t, c ?? undefined)
  return channels().filter(ch => !c || ch.id === c).map(ch => ({channel_id: ch.id,
    ...metricsOf(agg(xs.filter(x => x.channel_id === ch.id), {from:f, to:t, channels:[ch.id]}), ch.id !== 'store'),
    days: daysBetween(f,t) + 1,
  }))
}
