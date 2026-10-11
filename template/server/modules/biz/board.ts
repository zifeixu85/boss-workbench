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
  const byDay = (d: string) => rows.filter((r) => r.date === d)
  const cfg = getConfig()
  const w = ruleWindows(date)

  const trendDays = eachDate(addDays(date, -14), date)
  const trend = trendDays.map((d) => { const m = metricsOf(agg(byDay(d))); return { date: d, gmv: m.gmv, orders: m.orders } })
  const trendAvg = Math.round(trend.reduce((a, x) => a + (x.gmv ?? 0), 0) / trend.length)

  const stacked = eachDate(from, date).map((d) => ({
    date: d, ...Object.fromEntries(chs.map((c) => [c.id, inRange.find((r) => r.date === d && r.channel_id === c.id)?.gmv ?? null])),
  }))

  const total = metricsOf(agg(inRange))
  const totalPrev = metricsOf(agg(prevRows))
  const hasPrev = prevRows.length > 0
  const table = chs.map((c) => {
    const online = c.id !== 'store'
    const cur = metricsOf(agg(inRange.filter((r) => r.channel_id === c.id)), online)
    const prev = metricsOf(agg(prevRows.filter((r) => r.channel_id === c.id)), online)
    const y = inRange.find((r) => r.date === date && r.channel_id === c.id)
    return {
      id: c.id, name: c.name, kind: c.kind, owner: c.owner, ...cur,
      share: total.gmv ? Math.round(((cur.gmv ?? 0) / total.gmv) * 1000) / 10 : null,
      daily_gmv: cur.gmv === null ? null : Math.round(cur.gmv / days),
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
    yesterday: { ...metricsOf(agg(byDay(date))), prev: metricsOf(agg(byDay(addDays(date, -1)))).gmv, last_week: metricsOf(agg(byDay(addDays(date, -7)))).gmv },
    kpis: kpis(rows, date, from, { onlineConv: true, hints: { conv_rate: '线上 4 个平台', visitors: '含门店进店人数' } }),
    kpi_flags: kpiFlags,
    trend, trend_avg: trendAvg,
    channels: chs.map((c) => ({ id: c.id, name: c.name })), stacked,
    total: { ...total, vs_prev_period: hasPrev ? delta('pct', total.gmv, totalPrev.gmv) : null, prev_gmv: hasPrev ? totalPrev.gmv : null }, table,
    last3_label: `近 3 天（${span(w.now)}）`,
    anomalies: list, report: latestReport(), freshness: freshness(), config: cfg, rules_text: rulesText(cfg),
  }
}
