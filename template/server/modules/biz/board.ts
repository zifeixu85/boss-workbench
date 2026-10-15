// 经营汇总页一次取回的数据：昨天的大数字、近 15 天走势、指标卡、各渠道成交、占比、对比表、异常、日报、数据新鲜度。归属：经营模块。
import { addDays } from '../../services/common.ts'
import { channels, latestDate } from './service.ts'
import { agg, delta, eachDate, kpis, metricsOf, rowsBetween } from './metrics.ts'
import { freshness } from './freshness.ts'
import { listAnomalies } from './anomaly.ts'
import { latestReport } from './reports.ts'
import { getConfig, rulesText } from './config.ts'
import { channelAds } from './ads.ts'
import { HOLIDAYS, holidayDays, ruleWindows, span } from './period.ts'

/** 指标卡上挂哪几条异常：退款率卡挂退款异常、ROI 卡挂推广异常（只挂还没处理完的） */
const KPI_KIND: Record<string, string> = { refund_rate: '退款', roi: '推广' }

export function board(days: number) {
  const date = latestDate()
  if (!date) return null
  const from = addDays(date, -(days - 1))
  const pFrom = addDays(from, -days)
  const pTo = addDays(from, -1)
  const rows = rowsBetween([pFrom, addDays(date, -21)].sort()[0], date)
  const inRange = rows.filter((r) => r.date >= from)
  const prevRows = rows.filter((r) => r.date >= pFrom && r.date <= pTo)
  const chs = channels()
  const ids = chs.map(c => c.id)
  const scoped = (xs: typeof rows, f: string, t: string, channels = ids) => agg(xs, { from: f, to: t, channels })
  const byDay = (d: string) => rows.filter((r) => r.date === d)
  const cfg = getConfig()
  const w = ruleWindows(date)

  const trendDays = eachDate(addDays(date, -14), date)
  const trend = trendDays.map((d) => { const m = metricsOf(scoped(byDay(d), d, d)); return { date: d, gmv: m.gmv, orders: m.orders } })
  const trendKnown = trend.filter(x => x.gmv !== null)
  const trendAvg = trendKnown.length ? Math.round(trendKnown.reduce((a, x) => a + x.gmv!, 0) / trendKnown.length) : null
  const completeDays = eachDate(from, date).map(d => metricsOf(scoped(byDay(d), d, d)).gmv).filter((n): n is number => n !== null)
  const dailyGmv = completeDays.length ? Math.round(completeDays.reduce((a,n) => a+n, 0) / completeDays.length) : null

  const stacked = eachDate(from, date).map((d) => ({
    date: d, ...Object.fromEntries(chs.map((c) => [c.id, inRange.find((r) => r.date === d && r.channel_id === c.id)?.gmv ?? null])),
  }))

  const total = metricsOf(scoped(inRange, from, date))
  const totalPrev = metricsOf(scoped(prevRows, pFrom, pTo))
  const hasPrev = prevRows.length > 0
  const table = chs.map((c) => {
    const online = c.id !== 'store'
    const cur = metricsOf(scoped(inRange.filter((r) => r.channel_id === c.id), from, date, [c.id]), online)
    const prev = metricsOf(scoped(prevRows.filter((r) => r.channel_id === c.id), pFrom, pTo, [c.id]), online)
    const y = inRange.find((r) => r.date === date && r.channel_id === c.id)
    return {
      id: c.id, name: c.name, kind: c.kind, owner: c.owner, ...cur,
      share: total.gmv && cur.gmv !== null ? Math.round((cur.gmv / total.gmv) * 1000) / 10 : null,
      daily_gmv: inRange.some(r => r.channel_id === c.id) ? Math.round(inRange.filter(r => r.channel_id === c.id).reduce((s,r) => s+r.gmv,0) / inRange.filter(r => r.channel_id === c.id).length) : null,
      daily_gmv_days: inRange.filter(r => r.channel_id === c.id).length,
      vs_prev_period: hasPrev ? delta('pct', cur.gmv, prev.gmv) : null, yesterday_gmv: y?.gmv ?? null,
      /** 近 3 天的推广 ROI（和异常规则同一段日子）；没有推广是 null */
      roi_last3: online ? channelAds(c.id, date).now.roi : null,
    }
  })

  const list = listAnomalies(date)
  const open = list.active.filter((a) => a.status !== '已处理')
  const kpiFlags = Object.fromEntries(Object.entries(KPI_KIND).map(([k, kind]) => [k, open.filter((a) => a.kind === kind).map((a) => ({ id: a.id, channel_name: a.channel_name ?? '全店' }))]))

  return {
    date, days, from, to: date, prev_from: pFrom, prev_to: pTo, has_prev: hasPrev,
    /** 时间段里有几天节假日（国庆）：说明里提醒“上一段含国庆，偏高” */
    range_holiday_days: holidayDays({ f: from, t: date }), prev_holiday_days: hasPrev ? holidayDays({ f: pFrom, t: pTo }) : 0, holidays: HOLIDAYS,
    yesterday: { ...metricsOf(scoped(byDay(date), date, date)), prev: metricsOf(scoped(byDay(addDays(date, -1)), addDays(date, -1), addDays(date, -1))).gmv, last_week: metricsOf(scoped(byDay(addDays(date, -7)), addDays(date, -7), addDays(date, -7))).gmv },
    kpis: kpis(rows, date, from, { onlineConv: true, channels: ids, hints: { conv_rate: `已登记的 ${chs.filter(c => c.id !== 'store').length} 个线上渠道`, visitors: ids.includes('store') ? '含门店进店人数' : '已登记渠道访客' } }),
    kpi_flags: kpiFlags,
    trend, trend_avg: trendAvg, trend_avg_days: trendKnown.length,
    channels: chs.map((c) => ({ id: c.id, name: c.name })), stacked,
    total: { ...total, daily_gmv: dailyGmv, daily_gmv_days: completeDays.length, vs_prev_period: hasPrev ? delta('pct', total.gmv, totalPrev.gmv) : null, prev_gmv: hasPrev ? totalPrev.gmv : null }, table,
    last3_label: `近 3 天（${span(w.now)}）`,
    anomalies: list, report: latestReport(), freshness: freshness(), config: cfg, rules_text: rulesText(cfg),
  }
}
