// 本模块写记录用的“现在”：本地时间 YYYY-MM-DDTHH:mm，和种子里的导入记录一个写法（演示日期开着时，日期是演示日）。归属：数据源与导入模块。
import { now } from '../../clock.ts'

const p2 = (n: number) => String(n).padStart(2, '0')
export function stamp(d = now()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}
/** 10/26 */
export const md = (date: string | null | undefined) => (date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : '—')
/** 9/27—10/26（同一天只写一个） */
export const span = (from: string | null, to: string | null) => (from && to && from !== to ? `${md(from)}—${md(to)}` : md(to ?? from))
/** 今天 07:20 / 10/22 08:35 */
export const whenText = (st: string, today = stamp().slice(0, 10)) => `${st.slice(0, 10) === today ? '今天' : md(st.slice(0, 10))} ${st.slice(11, 16)}`
