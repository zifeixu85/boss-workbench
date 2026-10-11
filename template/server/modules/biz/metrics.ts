// 经营指标怎么算（口径见知识库 10-渠道与经营/数据口径.md）：把每天每渠道的原始数加总，再算比率。归属：经营模块。
// 比率一律“先加总再相除”，不拿每天的比率求平均。全店转化率只算 4 个线上平台：门店的“转化率”是进店的人里几成买了，不能放一起比。
import { all } from '../../db.ts'
import { addDays } from '../../services/common.ts'
import type { DailyRow } from './service.ts'
import { METRIC_LABEL, type Metric } from './config.ts'

export type Agg = {
  gmv: number; orders: number; visitors: number; refund_amount: number; ad_spend: number; ad_gmv: number
  new_buyers: number; old_buyers: number; online_visitors: number; online_orders: number; days: number
}

const ZERO: Agg = { gmv: 0, orders: 0, visitors: 0, refund_amount: 0, ad_spend: 0, ad_gmv: 0, new_buyers: 0, old_buyers: 0, online_visitors: 0, online_orders: 0, days: 0 }

export function agg(rows: DailyRow[]): Agg {
  const dates = new Set<string>()
  const out = rows.reduce<Agg>((a, r) => {
    dates.add(r.date)
    const online = r.channel_id !== 'store'
    return {
      ...a, gmv: a.gmv + r.gmv, orders: a.orders + r.orders, visitors: a.visitors + r.visitors, refund_amount: a.refund_amount + r.refund_amount,
      ad_spend: a.ad_spend + r.ad_spend, ad_gmv: a.ad_gmv + r.ad_gmv, new_buyers: a.new_buyers + r.new_buyers, old_buyers: a.old_buyers + r.old_buyers,
      online_visitors: a.online_visitors + (online ? r.visitors : 0), online_orders: a.online_orders + (online ? r.orders : 0),
    }
  }, ZERO)
  return { ...out, days: dates.size }
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** 由加总后的数算出 8 个指标；没有数据时是 null（暂无 ≠ 0） */
export function metricsOf(a: Agg, onlineConv = true): Record<Metric, number | null> & { new_share: number | null; ad_gmv: number | null; refund_amount: number | null } {
  if (!a.days) return { gmv: null, orders: null, visitors: null, conv_rate: null, aov: null, refund_rate: null, ad_spend: null, roi: null, new_share: null, ad_gmv: null, refund_amount: null }
  const convBase = onlineConv ? a.online_visitors : a.visitors
  const convOrders = onlineConv ? a.online_orders : a.orders
  return {
    gmv: Math.round(a.gmv), orders: a.orders, visitors: a.visitors,
    conv_rate: convBase > 0 ? r2((convOrders / convBase) * 100) : null,
    aov: a.orders > 0 ? r1(a.gmv / a.orders) : null,
    refund_rate: a.gmv > 0 ? r1((a.refund_amount / a.gmv) * 100) : null,
    ad_spend: Math.round(a.ad_spend), roi: a.ad_spend > 0 ? r2(a.ad_gmv / a.ad_spend) : null,
    new_share: a.new_buyers + a.old_buyers > 0 ? r1((a.new_buyers / (a.new_buyers + a.old_buyers)) * 100) : null,
    ad_gmv: Math.round(a.ad_gmv), refund_amount: Math.round(a.refund_amount),
  }
}

/** 涨跌怎么写：金额、人数写百分比；比率写“几个点”；ROI 写差值 */
export const DELTA_KIND: Record<Metric, 'pct' | 'pt' | 'abs'> = {
  gmv: 'pct', orders: 'pct', visitors: 'pct', conv_rate: 'pt', aov: 'pct', refund_rate: 'pt', ad_spend: 'pct', roi: 'abs',
}
export const UNIT: Record<Metric, string> = { gmv: '元', orders: '单', visitors: '人', conv_rate: '%', aov: '元', refund_rate: '%', ad_spend: '元', roi: '' }

export function delta(kind: 'pct' | 'pt' | 'abs', cur: number | null, base: number | null): number | null {
  if (cur === null || base === null) return null
  if (kind === 'pct') return base > 0 ? r1(((cur - base) / base) * 100) : null
  return r2(cur - base)
}

export function rowsBetween(from: string, to: string, channel?: string) {
  return all<DailyRow>(`SELECT * FROM channel_daily_v WHERE date BETWEEN :f AND :t AND (:c IS NULL OR channel_id = :c) ORDER BY date, channel_id`, { f: from, t: to, c: channel ?? null })
}

export function eachDate(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export type Kpi = {
  key: Metric; label: string; unit: string; value: number | null; prev: number | null; last_week: number | null
  vs_prev: number | null; vs_last_week: number | null; delta_kind: 'pct' | 'pt' | 'abs'; spark: (number | null)[]; hint: string | null
}

/** 指标卡：昨天的数，比前一天、比上周同一天；迷你走势用所选时间范围里每天的数 */
export function kpis(rows: DailyRow[], date: string, from: string, opts: { onlineConv: boolean; metrics?: Metric[]; hints?: Partial<Record<Metric, string>> }): Kpi[] {
  const byDate = new Map<string, DailyRow[]>()
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const m = (d: string) => metricsOf(agg(byDate.get(d) ?? []), opts.onlineConv)
  const cur = m(date)
  const prev = m(addDays(date, -1))
  const wk = m(addDays(date, -7))
  const days = eachDate(from, date)
  const series = days.map(m)
  return (opts.metrics ?? (Object.keys(METRIC_LABEL) as Metric[])).map((key) => ({
    key, label: METRIC_LABEL[key], unit: UNIT[key], value: cur[key], prev: prev[key], last_week: wk[key],
    vs_prev: delta(DELTA_KIND[key], cur[key], prev[key]), vs_last_week: delta(DELTA_KIND[key], cur[key], wk[key]), delta_kind: DELTA_KIND[key],
    spark: series.map((s) => s[key]), hint: opts.hints?.[key] ?? null,
  }))
}
