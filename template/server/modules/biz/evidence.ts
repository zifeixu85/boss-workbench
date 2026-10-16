// 异常的证据和可能的原因：全部从数据里对出来，每条写清依据来自哪张表。归属：经营模块。
// 时间段和规则一样（period.ts：近 3 天 vs 之前两周），推广的数和推广计划表、早报共用 ads.ts，所以同一件事每处的数字一致。
// 原因只写一句结论 + 几个数字标签；运营记录的原话只在抽屉的时间线里出现一次，原因和证据图用 op_id 引用它（网页上编成 ①②③）。
import { all, get } from '../../db.ts'
import { addDays, today } from '../../services/common.ts'
import { inventory, refundCause } from './service.ts'
import type { BizConfig } from './config.ts'
import type { AnomalyItem } from './anomaly.ts'
import { ruleWindows, span, md, type Win } from './period.ts'
import { campaignShifts, channelAds, type CampaignShift } from './ads.ts'
import { agg, rowsBetween, ratio, eachDate } from './metrics.ts'

type Basis = { label: string; value: string }
/** title：一句结论；tags：数字依据；ops：引用了哪几条运营记录；text：给早报和命令行用的完整说法（网页不显示） */
export type Reason = { title: string; tags: Basis[]; source: string; ops: string[]; text: string }
type Point = { date: string; value: number | null; base?: number | null; proj?: number | null }
export type Evidence = {
  title: string; desc: string; unit: string; label: string; base_label: string | null; shape: 'line' | 'stock'
  series: Point[]; threshold: number | null; threshold_label: string | null; since: string | null
  /** 图上的竖线：op_id 指向运营记录时间线里的那一条（网页按时间线的编号标 ①②③） */
  marks: { date: string; op_id: string | null; label: string }[]
  /** 涂阴影的一段（库存：断货那几天） */
  bands: { from: string; to: string; label: string }[]
  table: { title: string; columns: string[]; rows: (string | number | null)[][] } | null
  note: string
}
export type Op = { id: string; at: string; channel_id: string | null; channel_name: string | null; who: string; kind: string; action: string }

const n0 = (n: number | null) => n === null ? '暂无' : Math.round(n).toLocaleString('zh-CN')
const r1 = (n: number) => Math.round(n * 10) / 10
/** 百分比：一位小数，不留末尾的 0 */
const pc = (n: number | null) => n === null ? '暂无' : `${r1(n)}%`
const f1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(1))
const f2 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(2))

function opsFor(ch: string | null, from: string, to: string, kinds?: string[]): Op[] {
  return all<Op>(`SELECT o.id, o.at, o.channel_id, c.name AS channel_name, o.who, o.kind, o.action FROM biz_ops_log o LEFT JOIN channels c ON c.id = o.channel_id
    WHERE (o.channel_id = :c OR o.channel_id IS NULL) AND substr(o.at,1,10) BETWEEN :f AND :t ORDER BY o.at`, { c: ch, f: from, t: to })
    .filter((o) => !kinds || kinds.includes(o.kind))
}
const opText = (o: Op) => `${md(o.at)} ${o.at.slice(11, 16)} ${o.who}：${o.action}`
const markOf = (o: Op) => ({ date: o.at.slice(0, 10), op_id: o.id, label: `${o.at.slice(11, 16)} ${o.who}：${o.action}` })

function windowSum(ch: string, w: Win) {
  const x = agg(rowsBetween(w.f,w.t,ch), {from:w.f, to:w.t, channels:[ch]})
  return {gmv:x.gmv, refund:x.refund_amount, spend:x.ad_spend, ad_gmv:x.ad_gmv, orders:x.orders, visitors:x.visitors}

}

/** 每个日历日保留一个点；整日缺记录也要让图表断线，不能只处理现存行里的 NULL。 */
function dailyRatioSeries(ch: string, from: string, to: string, metric: 'refund_rate' | 'roi'): Point[] {
  const byDate = new Map(rowsBetween(from, to, ch).map((r) => [r.date, r]))
  return eachDate(from, to).map((date) => ({ date, value: byDate.get(date)?.[metric] ?? null }))
}

// ---------- 退款 ----------
function refundEvidence(a: AnomalyItem, date: string, cfg: BizConfig) {
  const ch = a.channel_id!
  const w = ruleWindows(date)
  const series = dailyRatioSeries(ch, w.base.f, date, 'refund_rate')
  const base = windowSum(ch, w.base)
  const rBase = ratio(base.refund, base.gmv, 100)
  const line = rBase === null ? null : Math.max(cfg.refund_min, rBase * cfg.refund_mult)
  const rows = all<{ reason: string; sku: string | null; batch: string | null; orders: number; amount: number }>(`SELECT r.reason, s.name AS sku, r.batch, SUM(r.orders) AS orders, SUM(r.amount) AS amount
    FROM channel_refunds r LEFT JOIN skus s ON s.id = r.sku_id WHERE r.channel_id = :c AND r.date BETWEEN :f AND :t GROUP BY r.reason, r.sku_id, r.batch ORDER BY orders DESC, amount DESC`, { c: ch, f: w.now.f, t: w.now.t })
  const cause = refundCause(ch, w.now)
  const ops = opsFor(ch, addDays(a.since ?? date, -7), date, ['发货', '活动', '其他', '库存'])
  const out: Reason[] = []
  if (cause) {
    const service = ops.filter((o) => o.kind === '其他')
    out.push({
      title: cause.text,
      tags: [{ label: `“${cause.reason}”`, value: `${cause.n} 单 / 共 ${cause.total} 单` },
        ...(cause.sku ? [{ label: `${cause.batch ? `${cause.batch.replace(' 发货', '')} 那批` : ''}${cause.sku}`, value: `${cause.sku_n} 单 · ${n0(cause.sku_amount)} 元` }] : [])],
      source: '退款原因（平台售后表）', ops: service.map((o) => o.id),
      text: cause.sku ? `这 ${cause.sku_n} 单退了 ${n0(cause.sku_amount)} 元。` : '',
    })
  }
  const ship = ops.filter((o) => o.kind === '发货' && (!a.since || o.at.slice(0, 10) < a.since))
  if (ship.length) {
    out.push({
      title: `退款变多之前，发货包装改过（${ship.map((o) => md(o.at)).join('、')}）`,
      tags: [], source: '运营记录', ops: ship.map((o) => o.id), text: ship.map(opText).join('；'),
    })
  }
  const skuId = cause?.sku ? get<{ id: string }>('SELECT id FROM skus WHERE name = :n', { n: cause.sku })?.id : undefined
  if (skuId) {
    const units = (f: string, t: string) => get<{ n: number }>('SELECT COALESCE(SUM(units),0) AS n FROM channel_products WHERE channel_id = :c AND sku_id = :s AND date BETWEEN :f AND :t', { c: ch, s: skuId, f, t })!.n
    const recentW = { f: addDays(date, -6), t: date }
    const recent = units(recentW.f, recentW.t) / 7
    const before = units(w.base.f, addDays(recentW.f, -1)) / (Math.round((new Date(`${recentW.f}T00:00:00`).getTime() - new Date(`${w.base.f}T00:00:00`).getTime()) / 864e5) || 1)
    const push = ops.filter((o) => o.kind === '活动')
    if (recent > before * 1.5) {
      out.push({
        title: `${cause!.sku}这一周卖得是平常的 ${r1(recent / (before || 1))} 倍：发得多，包装一出问题坏得就多`,
        tags: [{ label: '近 7 天日均', value: `${recent.toFixed(1)} 件` }, { label: '之前日均', value: `${before.toFixed(1)} 件` }],
        source: '商品销售（平台商品表）', ops: push.map((o) => o.id),
        text: `近 7 天一天卖约 ${recent.toFixed(1)} 件，之前一天约 ${before.toFixed(1)} 件${push.length ? `（${push.map(opText).join('；')}）` : ''}。`,
      })
    }
  }
  const ev: Evidence = {
    title: '每天的退款率', desc: `${BASE_TXT(w)}平均 ${pc(rBase)}；超过 ${pc(line)} 算异常（日报设置：平常的 ${cfg.refund_mult} 倍且超过 ${cfg.refund_min}%）`,
    unit: '%', label: '退款率', base_label: null, shape: 'line', series, threshold: line === null ? null : r1(line), threshold_label: `异常线 ${pc(line)}`, since: a.since,
    marks: ops.filter((o) => o.kind === '发货').map(markOf), bands: [],
    table: rows.length ? { title: `${NOW_TXT(w)}的退款`, columns: ['原因', '商品', '批次', '单数', '金额（元）'], rows: rows.map((r) => [r.reason, r.sku ?? '—', r.batch ?? '—', r.orders, Math.round(r.amount)]) } : null,
    note: '退款率 = 当天退款金额 ÷ 当天成交额。来源：平台后台导出的售后表',
  }
  return { evidence: ev, reasons: out, ops }
}

const NOW_TXT = (w: { now: Win }) => `近 3 天（${span(w.now)}）`
const BASE_TXT = (w: { base: Win }) => `之前两周（${span(w.base)}）`

// ---------- 推广 ----------
/** 推广计划前后对比的一行字（异常原因、早报共用） */
export function shiftText(s: CampaignShift, w: { now: Win; base: Win }) {
  const bid = s.bid_change ? `${md(s.bid_change.at)} ${s.bid_change.at.slice(11, 16)} ${s.bid_change.who}把出价从 ${f2(s.bid_change.from)} 调到 ${f2(s.bid_change.to)}；` : ''
  return `「${s.campaign}」${bid}${BASE_TXT(w)}每天花 ${n0(s.base.per_day)} 元、ROI ${f1(s.base.roi)}，${NOW_TXT(w)}每天花 ${n0(s.now.per_day)} 元、ROI ${f1(s.now.roi)}`
}

function trafficShare(ch: string, w: Win) {
  const r = get<{ ad: number; total: number }>("SELECT SUM(CASE WHEN source = '推广' THEN visitors ELSE 0 END) AS ad, SUM(visitors) AS total FROM channel_traffic WHERE channel_id = :c AND date BETWEEN :f AND :t", { c: ch, f: w.f, t: w.t })
  return r && r.total ? (r.ad / r.total) * 100 : null
}

/** 推广异常的原因（抽屉和早报共用） */
export function roiReasons(ch: string, chName: string, date: string) {
  const w = ruleWindows(date)
  const shifts = campaignShifts(ch, date)
  const top = shifts[0]
  const out: Reason[] = []
  if (top && top.now.per_day !== null && top.base.per_day !== null && top.now.per_day > top.base.per_day * 1.3) {
    const more = top.now.per_day - top.base.per_day
    out.push({
      title: `「${top.campaign}」${top.bid_change ? `出价从 ${f2(top.bid_change.from)} 调到 ${f2(top.bid_change.to)} 以后，` : ''}每天多花约 ${n0(Math.round(more / 10) * 10)} 元，带来的成交没跟上`,
      tags: [
        ...(top.bid_change ? [{ label: '出价', value: `${f2(top.bid_change.from)} → ${f2(top.bid_change.to)} 元` }] : []),
        { label: '每天花费', value: `${n0(top.base.per_day)} → ${n0(top.now.per_day)} 元` },
        { label: '这个计划的 ROI', value: `${f1(top.base.roi)} → ${f1(top.now.roi)}` },
        { label: '每次点击实际花费', value: `${f2(top.base.cpc)} → ${f2(top.now.cpc)} 元` },
      ],
      source: '推广计划（平台推广后台导出）', ops: [],
      text: `${shiftText(top, w)}。`,
    })
  }
  const sB = trafficShare(ch, w.base)
  const sN = trafficShare(ch, w.now)
  const wB = windowSum(ch, w.base)
  const wN = windowSum(ch, w.now)
  const cB = ratio(wB.orders, wB.visitors, 100)
  const cN = ratio(wN.orders, wN.visitors, 100)
  if (sB !== null && sN !== null && sN > sB + 3 && cB !== null && cN !== null) {
    out.push({
      title: `买来的访客多了，${chName}的转化率反而低了`,
      tags: [{ label: '推广带来的访客', value: `${pc(sB)} → ${pc(sN)}` }, { label: `${chName}的转化率`, value: `${pc(cB)} → ${pc(cN)}` }],
      source: '流量来源（平台流量表）', ops: [],
      text: `推广带来的访客占比从 ${pc(sB)} 升到 ${pc(sN)}，${chName}的转化率从 ${pc(cB)} 降到 ${pc(cN)}。`,
    })
  }
  return { reasons: out, shifts, windows: w, conv: { before: cB, now: cN }, share: { before: sB, now: sN } }
}

function roiEvidence(a: AnomalyItem, date: string, cfg: BizConfig) {
  const ch = a.channel_id!
  const w = ruleWindows(date)
  const series = dailyRatioSeries(ch, w.base.f, date, 'roi')
  const since = a.since ?? w.now.f
  const ops = opsFor(ch, addDays(since, -7), date, ['出价', '价格', '活动'])
  const bidOps = ops.filter((o) => o.kind === '出价')
  const { reasons, shifts } = roiReasons(ch, a.channel_name ?? '这个渠道', date)
  // 出价那条原因引用对应的运营记录
  if (reasons[0] && shifts[0]?.bid_change) reasons[0].ops = bidOps.filter((o) => o.action.includes(`「${shifts[0].campaign}」`)).map((o) => o.id)
  const all3 = channelAds(ch, date)
  const ev: Evidence = {
    title: `每天的推广 ROI（${a.channel_name ?? ''}所有计划合起来）`,
    desc: `${BASE_TXT(w)}是 ${f1(all3.base.roi)}，${NOW_TXT(w)}是 ${f1(all3.now.roi)}；虚线是 ${cfg.roi_min} 的参考线，低于它算异常（日报设置）`,
    unit: '', label: 'ROI', base_label: null, shape: 'line', series, threshold: cfg.roi_min, threshold_label: `参考线 ${cfg.roi_min}`, since: a.since,
    marks: bidOps.map(markOf), bands: [],
    table: {
      title: `每个推广计划：${BASE_TXT(w)} → ${NOW_TXT(w)}`, columns: ['计划', '出价（元）', '每天花费（元）', '每次点击实际花费（元）', 'ROI'],
      rows: shifts.map((s) => [s.campaign, s.bid_change ? `${f2(s.bid_change.from)} → ${f2(s.bid_change.to)}` : f2(s.now.bid), `${n0(s.base.per_day)} → ${n0(s.now.per_day)}`, `${f2(s.base.cpc)} → ${f2(s.now.cpc)}`, `${f1(s.base.roi)} → ${f1(s.now.roi)}`]),
    },
    note: 'ROI = 推广成交额 ÷ 推广花费，平台自己算，只和自己的平常比。出价是平台里设置的值，每次点击实际花费 = 花费 ÷ 点击。来源：平台推广后台导出',
  }
  return { evidence: ev, reasons, ops: opsFor(ch, addDays(since, -7), date, ['出价', '价格', '活动', '上新']) }
}

// ---------- 库存 ----------
/** 云仓某个商品过去 14 天每天收工时的库存：从现在的库存往回倒推（加回当天卖的，减去当天入仓的） */
function stockHistory(wh: string, sku: string, stockNow: number, last: string, days = 14) {
  const sold = new Map(all<{ date: string; n: number }>(`SELECT p.date, SUM(p.units) AS n FROM channel_products p JOIN channels c ON c.id = p.channel_id
    WHERE c.warehouse_id = :w AND p.sku_id = :s AND p.date BETWEEN :f AND :t GROUP BY p.date`, { w: wh, s: sku, f: addDays(last, -days), t: last }).map((r) => [r.date, r.n]))
  const inbound = new Map(all<{ d: string; n: number }>("SELECT arrive_date AS d, SUM(qty) AS n FROM biz_inbound WHERE warehouse_id = :w AND sku_id = :s AND status = '已入仓' GROUP BY arrive_date", { w: wh, s: sku }).map((r) => [r.d, r.n]))
  const out: { date: string; stock: number }[] = [{ date: last, stock: stockNow }]
  let s = stockNow
  for (let i = 0; i < days - 1; i++) {
    const d = addDays(last, -i)
    s = s + (sold.get(d) ?? 0) - (inbound.get(d) ?? 0)
    out.unshift({ date: addDays(d, -1), stock: Math.max(0, s) })
  }
  return out
}

/** 照现在的卖法往后推，今天约入仓、最早哪天到、中间断几天（异常抽屉、早报、建议共用） */
export function stockOutlook(wh: string, sku: string, date: string, leadDays = 5) {
  const inv = inventory(date).find((x) => x.warehouse_id === wh && x.sku_id === sku)
  if (!inv || !inv.avg_daily) return null
  const t = today()
  const earliest = addDays(t, leadDays)
  const need = Math.ceil((inv.avg_daily * 14) / 50) * 50
  // 10/26 收工的库存 → 10/27 起每天卖掉日均那么多
  const proj: { date: string; stock: number }[] = [{ date: date, stock: inv.stock }]
  let s = inv.stock
  let runOut: string | null = null
  for (let d = addDays(date, 1); d <= addDays(earliest, 4); d = addDays(d, 1)) {
    if (d === earliest) s += need
    s = Math.max(0, s - inv.avg_daily)
    if (s === 0 && !runOut) runOut = d
    proj.push({ date: d, stock: Math.round(s) })
  }
  const outFrom = runOut && runOut < earliest ? runOut : null
  const gap = outFrom ? Math.round((new Date(`${earliest}T00:00:00`).getTime() - new Date(`${outFrom}T00:00:00`).getTime()) / 864e5) : 0
  return { inv: { ...inv, avg_daily: inv.avg_daily }, earliest, need, proj, out_from: outFrom, out_to: outFrom ? addDays(earliest, -1) : null, gap }
}

function stockEvidence(a: AnomalyItem, date: string, cfg: BizConfig) {
  const [, wh1, wh2, ...rest] = a.id.split('@')[0].split('_')
  const wh = `${wh1}_${wh2}`
  const sku = rest.join('_')
  const o = stockOutlook(wh, sku, date)
  const out: Reason[] = []
  const series: Point[] = []
  const bands: Evidence['bands'] = []
  const ops = all<Op>(`SELECT o.id, o.at, o.channel_id, c.name AS channel_name, o.who, o.kind, o.action FROM biz_ops_log o JOIN channels c ON c.id = o.channel_id
    WHERE c.warehouse_id = :w AND o.kind IN ('库存','活动') AND substr(o.at,1,10) >= :f ORDER BY o.at`, { w: wh, f: addDays(date, -13) })
  const stockOps = ops.filter((x) => x.kind === '库存')
  if (o) {
    const { inv } = o
    for (const h of stockHistory(wh, sku, inv.stock, date)) series.push({ date: h.date, value: h.stock, proj: h.date === date ? h.stock : null })
    for (const p of o.proj.slice(1)) series.push({ date: p.date, value: null, proj: p.stock })
    if (o.out_from && o.out_to) bands.push({ from: o.out_from, to: o.out_to, label: `断货约 ${o.gap} 天` })
    const runOut = o.out_from ?? addDays(date, Math.max(1, Math.ceil(inv.stock / inv.avg_daily)))
    out.push({
      title: `只剩 ${inv.stock} 件，一天卖 ${inv.avg_daily.toFixed(1)} 件，${md(runOut)} 前后卖完`,
      tags: [{ label: `${inv.warehouse_name}库存`, value: `${inv.stock} 件` }, { label: '近 7 天日均', value: `${inv.avg_daily.toFixed(1)} 件` }, { label: '在途', value: inv.in_transit ? `${inv.in_transit} 件` : '没有' }],
      source: '库存表 + 商品销售', ops: [],
      text: `${inv.warehouse_name}还有 ${inv.stock} 件、${inv.in_transit ? `在途 ${inv.in_transit} 件` : '没有在途的货'}；近 7 天日均 ${inv.avg_daily.toFixed(1)} 件，大约 ${md(runOut)} 卖完。`,
    })
    const ib = all<{ arrive_date: string | null; qty: number; status: string }>('SELECT arrive_date, qty, status FROM biz_inbound WHERE warehouse_id = :w AND sku_id = :s ORDER BY arrive_date DESC', { w: wh, s: sku })
    const pending = ib.filter((x) => x.status !== '已入仓')
    const lastIn = ib.find((x) => x.status === '已入仓')
    out.push({
      title: pending.length ? '下一批已经约了' : `下一批还没约入仓：今天约最早 ${md(o.earliest)} 到${o.gap ? `，中间断货约 ${o.gap} 天` : ''}`,
      tags: [{ label: '最近一次入仓', value: lastIn?.arrive_date ? `${md(lastIn.arrive_date)} · ${lastIn.qty} 件` : '—' }, { label: '已约未到', value: pending.length ? `${pending.length} 批` : '没有' }, { label: '云仓要提前', value: '5 天约' }],
      source: '入仓预约记录', ops: stockOps.map((x) => x.id),
      text: pending.length ? pending.map((x) => `${x.arrive_date ? md(x.arrive_date) : '日期未定'} 入仓 ${x.qty} 件（${x.status}）`).join('；')
        : `最近一次入仓是 ${lastIn?.arrive_date ? md(lastIn.arrive_date) : '—'}（${lastIn?.qty ?? '—'} 件），之后没有这款的预约。云仓要提前 5 天约：今天约最早 ${md(o.earliest)} 到${o.out_from ? `，${md(o.out_from)}—${md(o.out_to!)} 会断货约 ${o.gap} 天` : ''}。`,
    })
  }
  const ev: Evidence = {
    title: '云仓里还有多少：过去两周 + 往后推', desc: o ? `实线是过去 14 天每天收工时的库存，虚线按近 7 天日均 ${o.inv.avg_daily.toFixed(1)} 件往后推，假设今天约、${md(o.earliest)} 到 ${o.need} 件；可售天数少于 ${cfg.stock_days} 天算告急（日报设置）` : '库存数据没取到',
    unit: '件', label: '库存', base_label: null, shape: 'stock', series, threshold: null, threshold_label: null, since: null,
    marks: [...ops.filter((x) => x.at.slice(0, 10) <= date).map(markOf), ...(o ? [{ date: o.earliest, op_id: null, label: `今天约，最早这天到 ${o.need} 件` }] : [])],
    bands, table: null,
    note: '过去的库存 = 今天的库存加回每天卖掉的、减去入仓的；往后推只是按近 7 天日均算的估计。来源：库存表、平台商品表、入仓预约',
  }
  return { evidence: ev, reasons: out, ops }
}

// ---------- 成交 ----------
function gmvEvidence(a: AnomalyItem, date: string) {
  const ch = a.channel_id!
  const end = a.active ? date : a.first_seen ?? date
  const from = addDays(end, -13)
  const byDate = new Map(rowsBetween(addDays(from, -7), end, ch).map((r) => [r.date, r]))
  // 当天缺记录不应抹掉上周同日真实存在的基准值，两条线各自保留缺口。
  const series = eachDate(from, end).map((date) => ({ date,
    value: byDate.get(date)?.gmv ?? null, base: byDate.get(addDays(date, -7))?.gmv ?? null,
  }))
  const ops = opsFor(ch, addDays(end, -10), end)
  const reasons: Reason[] = ops.length ? [{ title: `同一段时间记了 ${ops.length} 条运营动作，对着时间线看`, tags: [], source: '运营记录', ops: ops.map((o) => o.id), text: ops.map(opText).join('；') }] : []
  const ev: Evidence = {
    title: '每天成交 vs 上周同一天', desc: '实线是当天成交，虚线是上周同一天；节假日后的回落也会被规则报出来', unit: '元', label: '成交额', base_label: '上周同一天',
    shape: 'line', series, threshold: null, threshold_label: null, since: a.since, marks: [], bands: [], table: null, note: '来源：平台后台导出、门店日报',
  }
  return { evidence: ev, reasons, ops }
}

export function evidenceFor(a: AnomalyItem, date: string, cfg: BizConfig): { evidence: Evidence; reasons: Reason[]; ops: Op[] } {
  const d = a.active ? date : a.first_seen ?? date
  if (a.kind === '退款') return refundEvidence(a, d, cfg)
  if (a.kind === '推广') return roiEvidence(a, d, cfg)
  if (a.kind === '库存') return stockEvidence(a, date, cfg)
  return gmvEvidence(a, date)
}
