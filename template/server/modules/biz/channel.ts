// 单个渠道一页的数据：指标卡、每天走势、流量来源、商品前 5、退款原因、推广、库存、运营记录、异常，以及这个渠道特有的内容。归属：经营模块。
import { all, get } from '../../db.ts'
import { NotFound, addDays } from '../../services/common.ts'
import { channels, inventory, latestDate } from './service.ts'
import { agg, eachDate, kpis, metricsOf, rowsBetween, delta } from './metrics.ts'
import { freshness, runsFor } from './freshness.ts'
import { listAnomalies } from './anomaly.ts'
import { aftersales, campaigns, cloudStock, storeNotice, storeWeek } from './extras.ts'
import { channelAds } from './ads.ts'
import { getConfig } from './config.ts'
import { holidayDays, ruleWindows, span } from './period.ts'

const pctShare = (a: number, total: number) => (total ? Math.round((a / total) * 1000) / 10 : null)

function traffic(ch: string, from: string, to: string, pFrom: string, pTo: string) {
  const q = (f: string, t: string) => all<{ source: string; visitors: number }>('SELECT source, SUM(visitors) AS visitors FROM channel_traffic WHERE channel_id = :c AND date BETWEEN :f AND :t GROUP BY source', { c: ch, f, t })
  const cur = q(from, to)
  const prev = new Map(q(pFrom, pTo).map((x) => [x.source, x.visitors]))
  const total = cur.reduce((a, x) => a + x.visitors, 0)
  const pTotal = [...prev.values()].reduce((a, x) => a + x, 0)
  return cur.map((x) => ({ source: x.source, visitors: x.visitors, share: pctShare(x.visitors, total), prev_share: pTotal ? pctShare(prev.get(x.source) ?? 0, pTotal) : null }))
    .sort((a, b) => b.visitors - a.visitors)
}

function products(ch: string, from: string, to: string, pFrom: string, pTo: string, channelGmv: number) {
  const top = all<{ sku_id: string; name: string; category: string; price: number; units: number; gmv: number }>(`SELECT p.sku_id, s.name, s.category, s.price, SUM(p.units) AS units, SUM(p.gmv) AS gmv
    FROM channel_products p JOIN skus s ON s.id = p.sku_id WHERE p.channel_id = :c AND p.date BETWEEN :f AND :t GROUP BY p.sku_id ORDER BY gmv DESC LIMIT 5`, { c: ch, f: from, t: to })
  const days = eachDate(from, to)
  return top.map((x) => {
    const prev = get<{ g: number | null }>('SELECT SUM(gmv) AS g FROM channel_products WHERE channel_id = :c AND sku_id = :s AND date BETWEEN :f AND :t', { c: ch, s: x.sku_id, f: pFrom, t: pTo })?.g ?? null
    const units = new Map(all<{ date: string; units: number }>('SELECT date, units FROM channel_products WHERE channel_id = :c AND sku_id = :s AND date BETWEEN :f AND :t', { c: ch, s: x.sku_id, f: from, t: to }).map((r) => [r.date, r.units]))
    return { ...x, gmv: Math.round(x.gmv), share: pctShare(x.gmv, channelGmv), vs_prev: delta('pct', x.gmv, prev), spark: days.map((d) => units.get(d) ?? null) }
  })
}

/** 退款原因：按原因加总；带批次的（如“10/23 发货”）单独列出，商品写清 */
function refunds(ch: string, from: string, to: string, pFrom: string, pTo: string) {
  const q = (f: string, t: string) => all<{ reason: string; orders: number; amount: number }>('SELECT reason, SUM(orders) AS orders, SUM(amount) AS amount FROM channel_refunds WHERE channel_id = :c AND date BETWEEN :f AND :t GROUP BY reason', { c: ch, f, t })
  const prev = new Map(q(pFrom, pTo).map((x) => [x.reason, x.orders]))
  const batches = all<{ reason: string; sku: string | null; batch: string; orders: number; amount: number }>(`SELECT r.reason, s.name AS sku, r.batch, SUM(r.orders) AS orders, SUM(r.amount) AS amount FROM channel_refunds r LEFT JOIN skus s ON s.id = r.sku_id
    WHERE r.channel_id = :c AND r.date BETWEEN :f AND :t AND r.batch IS NOT NULL GROUP BY r.reason, r.sku_id, r.batch`, { c: ch, f: from, t: to })
  return { reasons: q(from, to).map((x) => ({ ...x, amount: Math.round(x.amount), prev_orders: prev.get(x.reason) ?? 0 })).sort((a, b) => b.orders - a.orders || b.amount - a.amount), batches: batches.map((b) => ({ ...b, amount: Math.round(b.amount) })) }
}

/** 这个仓库里、这个渠道这段时间卖过的商品（杭州总仓三个渠道共用，只列自己卖的） */
function stockFor(ch: string, wh: string, from: string, to: string) {
  const sold = new Set(all<{ sku_id: string }>('SELECT DISTINCT sku_id FROM channel_products WHERE channel_id = :c AND date BETWEEN :f AND :t', { c: ch, f: from, t: to }).map((r) => r.sku_id))
  const shared = channels().filter((c) => c.warehouse_id === wh && c.id !== ch).map((c) => c.name)
  const rows = inventory().filter((x) => x.warehouse_id === wh && (sold.has(x.sku_id) || x.sku_status === '待上线'))
    .sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999))
  return { rows, shared_with: shared }
}

export function channelPage(id: string, days: number) {
  const ch = channels().find((c) => c.id === id)
  if (!ch) throw new NotFound('没有这个渠道')
  const date = latestDate()
  if (!date) return null
  const from = addDays(date, -(days - 1))
  const pFrom = addDays(from, -days)
  const pTo = addDays(from, -1)
  const rows = rowsBetween([pFrom, addDays(date, -21)].sort()[0], date, id)
  const inRange = rows.filter((r) => r.date >= from)
  const isStore = id === 'store'
  const cur = metricsOf(agg(inRange, {from, to: date, channels: [id]}), false)
  const prevRows = rows.filter((r) => r.date >= pFrom && r.date <= pTo)
  const prev = metricsOf(agg(prevRows, {from: pFrom, to: pTo, channels: [id]}), false)
  const wh = get<{ id: string; name: string; note: string | null }>('SELECT * FROM warehouses WHERE id = :w', { w: ch.warehouse_id })
  const fresh = freshness()
  const anomalies = listAnomalies(date)
  const cfg = getConfig()
  const hints = isStore ? { visitors: '进店人数', conv_rate: '进店的人里几成买了' } : {}
  const w = ruleWindows(date)
  const ads = isStore ? null : channelAds(id, date)
  return {
    channel: { ...ch, warehouse_name: wh?.name ?? null, warehouse_note: wh?.note ?? null },
    date, days, from, to: date, prev_from: pFrom, prev_to: pTo,
    prev_holiday_days: holidayDays({ f: pFrom, t: pTo }), range_holiday_days: holidayDays({ f: from, t: date }), has_prev: prevRows.length > 0,
    roi_line: cfg.roi_min,
    kpis: kpis(rows, date, from, { onlineConv: false, channels: [id], metrics: isStore ? ['gmv', 'orders', 'visitors', 'conv_rate', 'aov', 'refund_rate'] : undefined, hints }),
    range: { ...cur, vs_prev_period: prevRows.length ? delta('pct', cur.gmv, prev.gmv) : null, prev_gmv: prevRows.length ? prev.gmv : null },
    /** 推广：之前两周 → 近 3 天（和异常、对比表同一个算法） */
    ads_shift: ads ? { base: ads.base, now: ads.now, base_label: `之前两周（${span(w.base)}）`, now_label: `近 3 天（${span(w.now)}）` } : null,
    daily: eachDate(from, date).map((d) => {
      const r = inRange.find((x) => x.date === d)
      return r ? { date: d, gmv: r.gmv, orders: r.orders, visitors: r.visitors, conv_rate: r.conv_rate, aov: r.aov, refund_rate: r.refund_rate, refund_amount: r.refund_amount, ad_spend: r.ad_spend, ad_gmv: r.ad_gmv, roi: r.roi, new_share: r.new_share }
        : { date: d, gmv: null, orders: null, visitors: null, conv_rate: null, aov: null, refund_rate: null, refund_amount: null, ad_spend: null, ad_gmv: null, roi: null, new_share: null }
    }),
    traffic: traffic(id, from, date, pFrom, pTo),
    products: products(id, from, date, pFrom, pTo, cur.gmv ?? 0),
    refunds: refunds(id, from, date, pFrom, pTo),
    campaigns: isStore ? [] : campaigns(id, from, date),
    inventory: stockFor(id, ch.warehouse_id, from, date),
    ops: all<{ id: string; at: string; who: string; kind: string; action: string; channel_id: string | null }>(
      // 没写渠道的全店动作：改价算所有平台；发货、到货这类是杭州总仓的事，只放到从总仓发货的渠道
      `SELECT id, at, who, kind, action, channel_id FROM biz_ops_log WHERE (channel_id = :c OR (channel_id IS NULL AND (kind = '价格' OR :wh = 'wh_main')))
        AND substr(at,1,10) BETWEEN :f AND :t ORDER BY at DESC`, { c: id, wh: ch.warehouse_id, f: from, t: addDays(date, 1) }),
    anomalies: { active: anomalies.active.filter((a) => a.channel_id === id), history: anomalies.history.filter((a) => a.channel_id === id) },
    freshness: fresh.channels.find((x) => x.channel_id === id) ?? null,
    runs: runsFor([id], addDays(date, -6), date),
    extras: {
      aftersales: id === 'xhs' ? aftersales(id, from, addDays(date, 1)) : null,
      cloud: ch.warehouse_id === 'wh_dy' ? cloudStock('wh_dy') : null,
      store: isStore ? storeWeek(from, date) : null,
      notice: isStore ? storeNotice() : null,
    },
  }
}
