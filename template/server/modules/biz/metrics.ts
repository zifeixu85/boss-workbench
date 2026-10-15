// 完整覆盖才给总额和比率；部分已知的数只用于带覆盖说明的日均，不能冒充整段合计。
import { all } from '../../db.ts'
import { addDays } from '../../services/common.ts'
import type { DailyRow } from './service.ts'
import { METRIC_LABEL, type Metric } from './config.ts'
import { FIELD, CHANNELS } from '../data/fields.ts'

export const RAW_FIELDS = ['gmv', 'orders', 'visitors', 'refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers'] as const
export type RawField = typeof RAW_FIELDS[number]
export type Scope = { from: string; to: string; channels: string[] }
export type Coverage = { expected_rows: number; present_rows: number; missing_rows: number; known: Record<RawField, number>; complete_fields: RawField[]; channel_ids: string[]; missing_channel_ids: string[]; note: string }
export type Agg = Record<RawField, number | null> & { online_visitors: number | null; online_orders: number | null; days: number; coverage: Coverage }

/** 缺日期/渠道行与现存行的缺字段都计入覆盖；零是已知值。 */
export function agg(input: DailyRow[], scope?: Scope): Agg {
  const ids = scope ? [...new Set(scope.channels)] : [...new Set(input.map(r => r.channel_id))]
  const rows = scope ? input.filter(r => ids.includes(r.channel_id) && r.date >= scope.from && r.date <= scope.to) : input
  const dates = scope ? eachDate(scope.from, scope.to) : [...new Set(rows.map(r => r.date))]
  const expected = dates.length * ids.length
  const known = Object.fromEntries(RAW_FIELDS.map(k => [k, rows.filter(r => r[k] !== null).length])) as Record<RawField, number>
  const sum = (k: RawField, xs = rows, n = expected): number | null => n > 0 && xs.length === n && xs.every(r => r[k] !== null) ? xs.reduce((s,r) => s + r[k]!, 0) : null
  const online = rows.filter(r => r.channel_id !== 'store')
  const onlineExpected = dates.length * ids.filter(id => id !== 'store').length
  const complete_fields = RAW_FIELDS.filter(k => expected > 0 && known[k] === expected)
  const unknown = RAW_FIELDS.filter(k => !complete_fields.includes(k)).map(k => FIELD[k].label)
  const missingChannels = ids.filter(id => rows.filter(r => r.channel_id === id).length < dates.length)
  const name = (id:string) => CHANNELS[id]?.name ?? id
  // 数据齐时 note 为空，页面不显示；不齐时一句话：哪里没数、合计先不算、缺的不当 0
  const gaps = [missingChannels.length ? `${missingChannels.map(name).join('、')}有几天没数` : '', unknown.length ? `${unknown.join('、')}没取全` : ''].filter(Boolean)
  const note = gaps.length ? `数据不全：${gaps.join('；')}。相关合计先不算，缺的不当 0` : ''
  return {
    ...Object.fromEntries(RAW_FIELDS.map(k => [k, sum(k)])) as Record<RawField, number | null>,
    online_visitors: sum('visitors', online, onlineExpected), online_orders: sum('orders', online, onlineExpected),
    days: new Set(rows.map(r => r.date)).size,
    coverage: { expected_rows: expected, present_rows: rows.length, missing_rows: Math.max(0, expected - rows.length), known, complete_fields, channel_ids: ids, missing_channel_ids: missingChannels, note },
  }
}
export const r1 = (n: number) => Math.round(n * 10) / 10
export const r2 = (n: number) => Math.round(n * 100) / 100
export const ratio = (num: number | null, den: number | null, scale = 1, precision = 1) => num !== null && den !== null && den > 0 ? Math.round(num / den * scale * 10 ** precision) / 10 ** precision : null
const rounded = (n: number | null) => n === null ? null : Math.round(n)

/** 所选范围完整才汇总；分母 0 或未知的比率都是 null。 */
export function metricsOf(a: Agg, onlineConv = true): Record<Metric, number | null> & { new_share: number | null; ad_gmv: number | null; refund_amount: number | null; coverage: Coverage } {
  const buyers = a.new_buyers !== null && a.old_buyers !== null ? a.new_buyers + a.old_buyers : null
  return {
    gmv: rounded(a.gmv), orders: a.orders, visitors: a.visitors,
    conv_rate: ratio(onlineConv ? a.online_orders : a.orders, onlineConv ? a.online_visitors : a.visitors, 100, 2),
    aov: ratio(a.gmv, a.orders), refund_rate: ratio(a.refund_amount, a.gmv, 100),
    ad_spend: rounded(a.ad_spend), roi: ratio(a.ad_gmv, a.ad_spend, 1, 2),
    new_share: ratio(a.new_buyers, buyers, 100), ad_gmv: rounded(a.ad_gmv), refund_amount: rounded(a.refund_amount), coverage: a.coverage,
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
export function kpis(rows: DailyRow[], date: string, from: string, opts: { onlineConv: boolean; metrics?: Metric[]; hints?: Partial<Record<Metric, string>>; channels: string[] }): Kpi[] {
  const byDate = new Map<string, DailyRow[]>()
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const m = (d: string) => metricsOf(agg(byDate.get(d) ?? [], { from: d, to: d, channels: opts.channels }), opts.onlineConv)
  const cur = m(date)
  const prev = m(addDays(date, -1))
  const wk = m(addDays(date, -7))
  const days = eachDate(from, date)
  const series = days.map(m)
  return (opts.metrics ?? (Object.keys(METRIC_LABEL) as Metric[])).map((key) => ({
    key, label: METRIC_LABEL[key], unit: UNIT[key], value: cur[key], prev: prev[key], last_week: wk[key],
    vs_prev: delta(DELTA_KIND[key], cur[key], prev[key]), vs_last_week: delta(DELTA_KIND[key], cur[key], wk[key]), delta_kind: DELTA_KIND[key],
    spark: series.map((s) => s[key]), hint: [opts.hints?.[key], cur.coverage.note].filter(Boolean).join(" · "),
  }))
}
