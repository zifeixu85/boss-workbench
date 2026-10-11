// 经营日报设置：看哪些指标、跟谁比、多少算异常、写多长。归属：经营模块。
// 异常规则（service.ts 的 anomalies()）和 Codex 写日报都读这里；网页的“日报设置”抽屉和命令行都能改。
import { z } from 'zod'
import { get, run, nowIso, logChange } from '../../db.ts'
import type { Actor } from '../../services/common.ts'

export const METRICS = ['gmv', 'orders', 'visitors', 'conv_rate', 'aov', 'refund_rate', 'ad_spend', 'roi'] as const
export type Metric = (typeof METRICS)[number]
export const METRIC_LABEL: Record<Metric, string> = {
  gmv: '成交额', orders: '订单', visitors: '访客', conv_rate: '转化率', aov: '客单价', refund_rate: '退款率', ad_spend: '推广花费', roi: '推广 ROI',
}
export const COMPARES = ['prev', 'last_week'] as const
export const LENGTHS = ['简短', '标准', '详细'] as const

export type BizConfig = {
  metrics: Metric[]; compare: (typeof COMPARES)[number][]
  refund_mult: number; refund_min: number; roi_min: number; roi_drop: number; stock_days: number; gmv_drop: number
  length: (typeof LENGTHS)[number]; write_at: string; updated_at: string | null; updated_by: string | null
}

/** 默认值和配方一致：退款率高一倍且超过 6%、ROI 低于 2 或掉一半、库存不到 3 天、成交比上周同日少 30% */
export const DEFAULT_CONFIG: BizConfig = {
  metrics: [...METRICS], compare: ['prev', 'last_week'],
  refund_mult: 2, refund_min: 6, roi_min: 2, roi_drop: 50, stock_days: 3, gmv_drop: 30,
  length: '标准', write_at: '07:55', updated_at: null, updated_by: null,
}

type Row = Omit<BizConfig, 'metrics' | 'compare'> & { metrics: string; compare: string }

export function getConfig(): BizConfig {
  const r = get<Row>('SELECT * FROM biz_report_config WHERE id = 1')
  if (!r) return DEFAULT_CONFIG
  return { ...r, metrics: JSON.parse(r.metrics), compare: JSON.parse(r.compare) }
}

/** 数字输入：不是数字、超出范围都给中文提示（不出现 zod 的英文默认提示） */
const num = (label: string, min: number, max: number, unit = '') => z.number({ message: `${label}要填数字` })
  .min(min, `${label}最少 ${min}${unit}`).max(max, `${label}最多 ${max}${unit}`)

export const configInput = z.object({
  metrics: z.array(z.enum(METRICS, { message: `指标只能是 ${METRICS.join('、')}` }), { message: '指标要写成列表' }).min(1, '至少看一个指标'),
  compare: z.array(z.enum(COMPARES, { message: '跟谁比只能是 prev（前一天）、last_week（上周同一天）' }), { message: '跟谁比要写成列表' }).min(1, '至少跟一个比'),
  refund_mult: num('退款率倍数', 1.2, 10, ' 倍'),
  refund_min: num('退款率下限', 1, 50, '%'),
  roi_min: num('ROI 下限', 0.5, 10),
  roi_drop: num('ROI 降幅', 10, 90, '%'),
  stock_days: num('库存天数', 1, 30, ' 天'),
  gmv_drop: num('成交降幅', 10, 90, '%'),
  length: z.enum(LENGTHS, { message: '写多长只能是 简短、标准、详细' }),
  write_at: z.string({ message: '时间写成 07:55 这样' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间写成 07:55 这样'),
}, { message: '设置要写成 JSON 对象' }).partial()

/** 降幅写成人话：50% 写“一半” */
const dropText = (p: number) => (p === 50 ? '一半' : `${p}%`)
/** 现在的规则，一句话（汇总页、异常列表、命令行都用这一句，跟着设置变） */
export const rulesText = (c: BizConfig) =>
  `退款率是平常的 ${c.refund_mult} 倍且超过 ${c.refund_min}%、推广 ROI 低于 ${c.roi_min} 或比之前掉${dropText(c.roi_drop)}、库存不到 ${c.stock_days} 天、成交比上周同一天少 ${c.gmv_drop}%`
const pctText = rulesText

export function saveConfig(input: unknown, actor: Actor | string) {
  const patch = configInput.parse(input)
  const next = { ...getConfig(), ...patch, updated_at: nowIso(), updated_by: actor }
  run(`INSERT INTO biz_report_config (id, metrics, compare, refund_mult, refund_min, roi_min, roi_drop, stock_days, gmv_drop, length, write_at, updated_at, updated_by)
    VALUES (1, :metrics, :compare, :refund_mult, :refund_min, :roi_min, :roi_drop, :stock_days, :gmv_drop, :length, :write_at, :updated_at, :updated_by)
    ON CONFLICT(id) DO UPDATE SET metrics = excluded.metrics, compare = excluded.compare, refund_mult = excluded.refund_mult, refund_min = excluded.refund_min,
      roi_min = excluded.roi_min, roi_drop = excluded.roi_drop, stock_days = excluded.stock_days, gmv_drop = excluded.gmv_drop, length = excluded.length,
      write_at = excluded.write_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by`, {
    ...next, metrics: JSON.stringify(next.metrics), compare: JSON.stringify(next.compare),
  })
  logChange(String(actor), '经营日报设置', '1', '修改', `日报设置：${pctText(next)}，${next.length}`)
  return getConfig()
}
