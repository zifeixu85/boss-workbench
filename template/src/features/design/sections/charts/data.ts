// 图表示例数据（虚构的“ABC茶社”）。只给规范页用，不读数据库
import { addDays, todayStr } from '@/lib/format'
import { monthTick } from '@/components/chart-kit'

const M = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const SIGNED = [42.5, 38.0, 25.6, 18.2, 46.8, 52.1, 49.3, 61.0, 44.7, 57.2, 63.5, 52.6]
/** 2 月没记账：用 null 表示“暂无”，图上断开，不画成 0 */
const COLLECTED: (number | null)[] = [31.2, 40.5, 33.8, null, 28.4, 45.9, 50.2, 47.6, 52.3, 49.8, 58.1, 36.4]
const NEW_CLIENTS = [6, 4, 3, 2, 7, 8, 6, 9, 5, 8, 10, 7]

export const MONTHLY = M.map((month, i) => ({ month, label: monthTick(month, i), signed: SIGNED[i], collected: COLLECTED[i], newClients: NEW_CLIENTS[i] }))

/** 今年累计签约 */
export const CUMULATIVE = MONTHLY.filter((r) => r.month >= '2026-01').reduce<{ month: string; label: string; total: number }[]>((xs, r) => {
  const prev = xs.at(-1)?.total ?? 0
  return [...xs, { month: r.month, label: `${Number(r.month.slice(5))}月`, total: Math.round((prev + r.signed) * 10) / 10 }]
}, [])
export const YEAR_TARGET = 600

export const FLOW = MONTHLY.slice(-6).map((r, i) => ({ month: r.month, label: `${Number(r.month.slice(5))}月`, inflow: r.collected ?? 0, outflow: [38.5, 41.2, 36.9, 44.0, 47.3, 29.8][i] }))

const CAT = [[28.1, 12.4, 8.8], [35.0, 15.2, 10.8], [24.5, 12.0, 8.2], [33.2, 14.6, 9.4], [38.0, 15.3, 10.2], [30.4, 13.6, 8.6]]
export const BY_CATEGORY = MONTHLY.slice(-6).map((r, i) => ({ month: r.month, label: `${Number(r.month.slice(5))}月`, whole: CAT[i][0], cabinet: CAT[i][1], closet: CAT[i][2] }))

export const SOURCES = [
  { source: '老客户介绍', amount: 38.4 }, { source: '小红书私信', amount: 26.2 }, { source: '茶博会', amount: 14.5 },
  { source: '门店到访', amount: 11.0 }, { source: '朋友介绍', amount: 9.7 }, { source: '抖店直播间', amount: 4.9 },
]

export const SHARE = [
  { key: 'whole', name: '白茶', value: 312.6 }, { key: 'cabinet', name: '岩茶', value: 121.4 },
  { key: 'closet', name: '花草茶', value: 86.3 }, { key: 'study', name: '茶具', value: 34.8 }, { key: 'other', name: '其他', value: 22.9 },
]

export const FUNNEL = [
  { stage: '初次接触', count: 18, amount: 236 }, { stage: '需求确认', count: 11, amount: 168 }, { stage: '方案中', count: 8, amount: 131 },
  { stage: '报价中', count: 5, amount: 112 }, { stage: '待签约', count: 3, amount: 65 },
]

export const SPARKS = [
  { key: 'cash', label: '近 12 周回款', unit: '万', values: [8.2, 12.5, 6.1, 15.8, 9.4, 11.2, 14.6, 7.3, 16.9, 12.1, 10.4, 13.8] },
  { key: 'leads', label: '近 12 周新线索', unit: '个', values: [3, 2, 4, 1, 5, 3, 2, 6, 4, 3, 5, 7] },
  { key: 'logs', label: '近 12 周跟进', unit: '次', values: [14, 11, 9, 16, 12, 8, 10, 13, 7, 9, 6, 5] },
]

export const PROJECTS = [
  { name: '科技公司中秋礼', contract: 5.4, margin: 34.2 }, { name: '地产公司业主礼', contract: 5.2, margin: 31.0 }, { name: '设计院春节礼', contract: 2.4, margin: 38.5 },
  { name: '物流公司工会礼', contract: 6.0, margin: 22.8 }, { name: '律所客户礼', contract: 2.2, margin: 36.4 }, { name: '广告公司中秋礼', contract: 1.1, margin: 39.1 },
  { name: '培训学校教师节', contract: 0.6, margin: 41.2 }, { name: '财税公司中秋礼', contract: 0.5, margin: 40.5 }, { name: '瑜伽馆会员礼', contract: 3.2, margin: 33.4 },
  { name: '投资公司年会礼', contract: 2.4, margin: 37.9 }, { name: '酒店客房茶包', contract: 1.6, margin: 28.6 }, { name: '民宿客房茶包', contract: 0.3, margin: 30.1 },
]

/** 热力日历：最近 16 周每天的跟进次数。用固定的伪随机，刷新不变 */
export const HEAT_WEEKS = 16
export function heatDays() {
  const today = todayStr()
  const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7 // 周一 = 0
  const start = addDays(today, -dow - (HEAT_WEEKS - 1) * 7)
  let seed = 7
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  return Array.from({ length: HEAT_WEEKS * 7 }, (_, i) => {
    const date = addDays(start, i)
    const weekend = i % 7 >= 5
    const r = rand()
    const count = date > today ? null : Math.max(0, Math.round((weekend ? 1.2 : 3.4) * r * r * 2 - (r < 0.18 ? 2 : 0)))
    return { date, count }
  })
}
