// 经营模块里“哪几天”的统一说法：异常规则、异常抽屉、推广计划表、早报都用这里的时间段，数字才对得上。归属：经营模块。
//   近 3 天     = 最近有数据的那天往前共 3 天（10/24—10/26）
//   之前两周   = 再往前空出 3 天后的 15 天（10/6—10/20）：空出的几天免得异常刚开始那两天把“平常”拉低
// 节假日也放在这里（国庆 10/1—10/7）：门店按星期几看、汇总页说“上一段含国庆”都读它。
import { addDays } from '../../services/common.ts'

export type Win = { f: string; t: string }

export function ruleWindows(date: string): { now: Win; base: Win } {
  return { now: { f: addDays(date, -2), t: date }, base: { f: addDays(date, -20), t: addDays(date, -6) } }
}

export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
/** “10/24—10/26” */
export const span = (w: Win) => `${md(w.f)}—${md(w.t)}`
export const NOW_LABEL = '近 3 天'
export const BASE_LABEL = '之前两周'
/** “近 3 天（10/24—10/26）” */
export const nowText = (date: string) => `${NOW_LABEL}（${span(ruleWindows(date).now)}）`
export const baseText = (date: string) => `${BASE_LABEL}（${span(ruleWindows(date).base)}）`

/** 节假日：国庆 7 天。门店营业到 21:00、游客多，和平常日子不能放一起比 */
export const HOLIDAYS: Win[] = [{ f: '2026-10-01', t: '2026-10-07' }]
export const isHoliday = (d: string) => HOLIDAYS.some((h) => d >= h.f && d <= h.t)
/** 某段日子里有几天是节假日 */
export const holidayDays = (w: Win) => {
  let n = 0
  for (let d = w.f; d <= w.t; d = addDays(d, 1)) if (isHoliday(d)) n++
  return n
}

/** 只认真实存在的日期：2026-10-26 返回原样，2026-13-45、乱写的返回 undefined（接口按“没写”处理） */
export function realDate(v?: string | null): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : undefined
}
