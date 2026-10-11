// 记录和数据从哪来：预置的（种子写好的示例记录）、你用样例表导的、你自己的表。三种说法网页、命令行一致。归属：数据源与导入模块。
// 规矩：现场做的操作一律不叫“预置”；样例表导进来的只是“数字和示例一样”，记录仍是刚才发生的。
import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ROOT } from '../../db.ts'

export const SAMPLE_DIR = join(ROOT, '工作台', '示例数据')

let cache: { at: number; names: Set<string> } | null = null
/** 样例表（工作台/示例数据/ 里的 CSV）的文件名 */
export function sampleFileNames(): Set<string> {
  if (cache && Date.now() - cache.at < 30_000) return cache.names
  const names = new Set(existsSync(SAMPLE_DIR) ? readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.csv')) : [])
  cache = { at: Date.now(), names }
  return names
}

/** 这份文件是不是样例表（按文件名认） */
export const isSampleFile = (name?: string | null) => !!name && sampleFileNames().has(basename(name))

/** 预置的示例批次：种子写的，ID 固定以 batch_sample_ 开头 */
export const isPresetBatch = (id?: string | null) => !!id && id.startsWith('batch_sample_')

export type Provenance = '预置' | '样例表' | '自己的表'
/** 一条导入记录 / 一批数据的来源说法 */
export function provenance(origin: string | null | undefined, fileName?: string | null): Provenance {
  if (origin === '示例') return '预置'
  return isSampleFile(fileName) ? '样例表' : '自己的表'
}

/** 样例表给人看的名字和一句说明（导入页“试试”用；按文件名开头对） */
export const SAMPLE_META: { prefix: string; channel: string | null; title: string; note: string; range: string; order: number }[] = [
  { prefix: '天猫_生意参谋取数_店铺日报', range: '9/27—10/26', channel: 'tmall', title: '天猫 · 生意参谋店铺日报', note: '10/20 改版后的新表头：名字没变的按旧规则对上，改了名的 4 列要你点头', order: 1 },
  { prefix: '天猫_生意参谋取数_近7天_缺推广花费', range: '10/20—10/26', channel: 'tmall', title: '天猫 · 少了推广花费那一列', note: '看工作台停下来，不把缺的当 0', order: 2 },
  { prefix: '门店_收银系统日汇总', range: '9/27—10/26', channel: 'store', title: '门店 · 收银系统日汇总', note: '营业额、实收金额都像成交额，二选一（假设门店装了收银机）', order: 3 },
  { prefix: '抖店_罗盘经营数据', range: '9/27—10/26', channel: 'douyin', title: '抖店 · 罗盘经营数据', note: '有规则，拖进来直接对上', order: 4 },
  { prefix: '小红书店_千帆店铺数据', range: '9/27—10/26', channel: 'xhs', title: '小红书店 · 千帆店铺数据', note: '日期写成 2026年09月27日', order: 5 },
  { prefix: '视频号小店_经营数据', range: '9/27—10/26', channel: 'wechat', title: '视频号小店 · 微信小店经营数据', note: '推广叫“加热”，单位写在全角括号里', order: 6 },
  { prefix: '飞书多维表格_经营数据表_模板', range: '10/26 五个渠道', channel: null, title: '飞书多维表格 · 经营数据表模板', note: '一张表几个渠道，按“渠道”列分', order: 7 },
]
export const sampleMeta = (name: string) => SAMPLE_META.find((m) => name.startsWith(m.prefix)) ?? null
