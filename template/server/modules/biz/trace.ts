// 数字的来源：任何一个经营数字点进去，都能看到它是哪几天、哪几个渠道的哪些原始数加出来的，以及是哪几次导入带进来的。归属：经营模块。
// 算法和指标卡一致（metrics.ts：先加总再相除）；口径说明摘自知识库 10-渠道与经营/数据口径.md。
import { BadRequest, addDays, today } from '../../services/common.ts'
import { channels, latestDate, type DailyRow } from './service.ts'
import { METRICS, METRIC_LABEL, type Metric } from './config.ts'
import { agg, metricsOf, rowsBetween, eachDate, UNIT } from './metrics.ts'
import { freshness, runsFor } from './freshness.ts'
import { realDate } from './period.ts'

type Part = 'gmv' | 'orders' | 'visitors' | 'refund_amount' | 'ad_spend' | 'ad_gmv'
export const PART_LABEL: Record<Part, string> = { gmv: '成交额', orders: '订单', visitors: '访客', refund_amount: '退款金额', ad_spend: '推广花费', ad_gmv: '推广成交额' }

/** 每个指标用到哪几个原始数、怎么算、要注意什么 */
const RECIPE: Record<Metric, { parts: Part[]; formula: string; note: string }> = {
  gmv: { parts: ['gmv'], formula: '每天每个渠道的成交额加起来', note: '当天付款的订单金额，不扣退款。企业茶礼和渠道供货不在里面；门店的包间费（288 元一次）不是卖货，也不算' },
  orders: { parts: ['orders'], formula: '每天每个渠道的订单数加起来', note: '天猫导的是“支付子订单数”，一单买两样算两单' },
  visitors: { parts: ['visitors'], formula: '每天每个渠道的访客数加起来', note: '一天里一个人只算一次；门店是宋姐记的进店人数' },
  conv_rate: { parts: ['orders', 'visitors'], formula: '订单数 ÷ 访客数（先各自加总再相除）', note: '全店只算 4 个线上平台；门店的转化率是进店的人里几成买了，单独看' },
  aov: { parts: ['gmv', 'orders'], formula: '成交额 ÷ 订单数', note: '天猫按子订单算，客单价会偏低一点' },
  refund_rate: { parts: ['refund_amount', 'gmv'], formula: '退款金额 ÷ 成交额', note: '当天退的钱可能是前几天的单，单日会跳；连着看 3 天再下结论' },
  ad_spend: { parts: ['ad_spend'], formula: '每天每个渠道的推广花费加起来', note: '抖店千川、天猫万相台、小红书店聚光、视频号加热；门店没有推广' },
  roi: { parts: ['ad_gmv', 'ad_spend'], formula: '推广成交额 ÷ 推广花费', note: '推广成交额是平台自己算的，各家算法不一样，只和自己的平常比' },
}

const valid = realDate

export function trace(q: { metric?: string; channel?: string; from?: string; to?: string }) {
  const metric = q.metric as Metric
  if (!METRICS.includes(metric)) throw new BadRequest(`不认识这个指标：${q.metric ?? '（没写）'}`)
  const chs = channels()
  if (q.channel && !chs.some((c) => c.id === q.channel)) throw new BadRequest('没有这个渠道')
  const last = latestDate()
  const to = valid(q.to) ?? last ?? addDays(today(), -1)
  const from = valid(q.from) ?? to
  if (from > to) throw new BadRequest('开始日期晚于结束日期')
  const r = RECIPE[metric]
  // 全店的转化率只算线上；单看门店时按门店自己的口径
  const onlineOnly = metric === 'conv_rate' && !q.channel
  const picked = chs.filter((c) => (q.channel ? c.id === q.channel : onlineOnly ? c.id !== 'store' : true))
  const ids = new Set(picked.map((c) => c.id))
  const rows = rowsBetween(from, to).filter((x) => ids.has(x.channel_id))
  const m = (xs: DailyRow[]) => metricsOf(agg(xs), false)[metric]
  const parts = (xs: DailyRow[]) => Object.fromEntries(r.parts.map((p) => [p, Math.round(xs.reduce((a, x) => a + Number(x[p] ?? 0), 0) * 100) / 100])) as Record<Part, number>
  const fresh = freshness()
  return {
    metric, label: METRIC_LABEL[metric], unit: UNIT[metric], formula: r.formula, note: r.note, from, to, days: eachDate(from, to).length,
    /** 比率（转化率、客单价、退款率、ROI）：先把原始数加起来再相除，网页上才写这句说明 */
    ratio: r.parts.length > 1,
    parts: r.parts.map((p) => ({ key: p, label: PART_LABEL[p] })),
    channels: picked.map((c) => {
      const f = fresh.channels.find((x) => x.channel_id === c.id)
      const mine = rows.filter((x) => x.channel_id === c.id)
      return { id: c.id, name: c.name, value: mine.length ? m(mine) : null, parts: parts(mine), source_name: f?.source_name ?? null, schedule: f?.schedule ?? null, last_ok_at: f?.last_ok_at ?? null, late: f?.late ?? false }
    }),
    excluded: onlineOnly ? '门店（转化率口径不同，单独看）' : null,
    daily: eachDate(from, to).map((d) => {
      const xs = rows.filter((x) => x.date === d)
      return { date: d, value: xs.length ? m(xs) : null, parts: parts(xs), cells: picked.map((c) => { const x = xs.find((y) => y.channel_id === c.id); return x ? Number(x[metric] ?? 0) : null }) }
    }).reverse(),
    total: { value: rows.length ? m(rows) : null, parts: parts(rows) },
    runs: runsFor([...ids], from, to),
  }
}
