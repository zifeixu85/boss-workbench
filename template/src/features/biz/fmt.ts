// 经营数字怎么写（整个模块统一）：
//   金额：大数字和单元格按元（千分位），一列里统一一个单位；“万”保留 1 位。
//   百分比：1 位小数，不留末尾的 0（0.6%、38.1%、4%）。ROI：1 位小数（3.3、1.6）。件数：1 位小数（16.0）。
//   图表刻度：整数台阶（1、2、5 的倍数），金额过万写“万”，不混“千”；横轴日期等间隔。
import { NBSP, shortDate, thousands, weekday } from '@/lib/format'
import type { Metric, Report } from './types'

/** 1 位小数、去掉末尾的 0 */
export const p1 = (v: number) => String(Math.round(v * 10) / 10)
/** 百分比 */
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${p1(v)}%`)
/** ROI：1 位小数 */
export const roi1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1))
/** 元：千分位整数，不带单位（表头写单位） */
export const yuanNum = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('zh-CN'))
/** 元：带单位 */
export const yuanText = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${yuanNum(v)}${NBSP}元`)
/** 万：1 位小数，不带单位 */
export const wan1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (Math.round(v / 1000) / 10).toFixed(1))

/** 一个指标值写成一段文字（表格、提示里用） */
export function fmtMetric(key: Metric | string, v: number | null | undefined): string {
  if (v === null || v === undefined) return '暂无'
  switch (key) {
    case 'gmv': case 'aov': case 'ad_spend': case 'ad_gmv': case 'refund_amount': return yuanText(v)
    case 'orders': return `${thousands(v)}${NBSP}单`
    case 'visitors': return `${thousands(v)}${NBSP}人`
    case 'conv_rate': case 'refund_rate': case 'share': case 'new_share': return pct(v)
    case 'roi': return roi1(v)
    default: return thousands(v)
  }
}

/** 指标卡的大数字：数和单位分开（单位用小字）；金额一律按元写全，和点开看来源时的标题一样 */
export function bigNumber(key: Metric, v: number | null): { value: string; unit: string } {
  if (v === null) return { value: '—', unit: '' }
  switch (key) {
    case 'gmv': case 'ad_spend': return { value: yuanNum(v), unit: '元' }
    case 'aov': return { value: String(Math.round(v)), unit: '元' }
    case 'orders': return { value: thousands(v), unit: '单' }
    case 'visitors': return { value: thousands(v), unit: '人' }
    case 'conv_rate': case 'refund_rate': return { value: p1(v), unit: '%' }
    case 'roi': return { value: roi1(v), unit: '' }
  }
}

/** 涨跌后面的单位：金额人数写 %，比率写“个点”，ROI 直接写差 */
export const deltaSuffix = (kind: 'pct' | 'pt' | 'abs') => (kind === 'pct' ? '%' : kind === 'pt' ? `${NBSP}个点` : '')

// ---------- 图表刻度 ----------
/** 整数台阶：最大值往上取到 1、2、5 × 10ⁿ 的倍数，大约 4 格 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}
/** 金额刻度：最大值到 5 千以上全写“万”（0.2万、0.4万、1万），小钱（推广花费这类）写元（500、1,000），一张图里不混用 */
export function moneyAxis(max: number, count = 4) {
  const ticks = niceTicks(max, count)
  const big = ticks.at(-1)! >= 5000
  return { ticks, domain: [0, ticks.at(-1)!] as [number, number], fmt: (v: number) => (big ? (v === 0 ? '0' : `${p1(v / 10000)}万`) : v.toLocaleString('zh-CN')), unit: big ? '万元' : '元' }
}
/** 普通数的刻度（单数、件数、人数、ROI、%） */
export function numAxis(max: number, count = 4, suffix = '') {
  const ticks = niceTicks(max, count)
  return { ticks, domain: [0, ticks.at(-1)!] as [number, number], fmt: (v: number) => `${p1(v)}${suffix}` }
}
/** 横轴日期：从最后一天往前等间隔取（7 天每天、15 天左右每 3 天、30 天每 7 天），不让图表自己挤 */
export function dateTicks(labels: string[]) {
  const n = labels.length
  const step = n <= 8 ? 1 : n <= 16 ? 3 : n <= 23 ? 5 : 7
  return labels.filter((_, i) => (n - 1 - i) % step === 0)
}

/** 07:20 这样的时间（数据源记的是本地时间 2026-10-27T07:20） */
export const hhmm = (t?: string | null) => (t ? t.slice(11, 16) : '—')
/** ISO（UTC）时间换成本地的 10/26 18:40 */
export function localStamp(iso?: string | null) {
  if (!iso) return '—'
  if (!iso.endsWith('Z')) return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))} ${iso.slice(11, 16)}`
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const CHANNEL_ORDER = ['douyin', 'tmall', 'xhs', 'wechat', 'store']
/** 渠道的系列色：所有图里同一个渠道同一个颜色（chart-1…5 固定顺序）。全店合计用正文色，不借任何渠道的颜色 */
export const channelColor = (id: string) => (CHANNEL_ORDER.includes(id) ? `var(--chart-${CHANNEL_ORDER.indexOf(id) + 1})` : 'var(--foreground)')
/** 第二个量（ROI 线、退款原因这类）用中性色，不和渠道色抢 */
export const NEUTRAL = 'var(--muted-foreground)'

export const PLATFORM_TOOL: Record<string, string> = { douyin: '千川', tmall: '万相台', xhs: '聚光', wechat: '加热' }

/** Markdown 一段里的前几条，去掉标记，给卡片做摘要 */
export function plainLines(body: string, n: number) {
  return body.split('\n').map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()).filter((l) => l && !l.startsWith('>')).slice(0, n)
}

/** 一段文字里的知识库链接 [名字](路径.md) 拆出来，网页上换成能点的小标签 */
export function splitKbLinks(text: string): ({ text: string } | { label: string; path: string })[] {
  const out: ({ text: string } | { label: string; path: string })[] = []
  let last = 0
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    out.push({ label: m[1], path: m[2] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** 图表提示框的标题：10月26日 周一 */
export const dayLabel = (_: unknown, p?: readonly { payload?: unknown }[]) => { const r = p?.[0]?.payload as { date?: string } | undefined; return r?.date ? `${shortDate(r.date)} ${weekday(r.date)}` : '' }

/** ① ② ③ …：运营记录的编号（异常抽屉的时间线、证据图、原因里一致） */
export const circled = (n: number) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`)

/** 给 ChartLegendContent 的类名：每项不拆行；一行放不下就换行，手机上排成三列 */
export const LEGEND_CLASS = 'flex-wrap gap-x-4 gap-y-1 [&>div]:whitespace-nowrap max-sm:grid max-sm:grid-cols-3 max-sm:justify-items-start max-sm:px-2'

/** 那天的要点：“哪里不对劲”里加粗的标题；没有异常就用“昨天怎么样”的第一句 */
export function reportPoints(r: Report) {
  const issues = r.sections.find((s) => s.heading.includes('不对劲'))
  const titles = issues ? [...issues.body.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]) : []
  const watch = issues ? issues.body.split('\n').filter((l) => l.trim().startsWith('- 先盯着')).length : 0
  const watchText = issues ? issues.body.split('\n').find((l) => l.trim().startsWith('- 先盯着'))?.replace(/^\s*-\s*先盯着：/, '').split('；')[0] : undefined
  // 没有异常的日子：写当天的数（不再从日期说起，左边已经有日期了）
  const first = (r.lead || plainLines(r.sections[0]?.body ?? r.body, 1)[0] || '').split('；')[0].replace(/。$/, '')
  return { n: titles.length, watch, text: titles.length ? titles.join('；') : watchText ? `先盯着：${watchText}` : first }
}
