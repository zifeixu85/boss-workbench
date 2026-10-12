// 日期、金额的显示方式统一在这里。
// 换行规则①：数字和单位之间用不换行空格（NBSP），“12 万”“已过 2 天”永远不会被拆成两行。
import { now } from './clock'

export const NBSP = '\u00a0'
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 今天（演示模式下是演示日，见 lib/clock.ts） */
export const todayStr = () => toDateStr(now())
export function toDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** 取“哪一天”：带时区的时间戳（created_at、updated_at 这类，存的是 UTC）按本地日期取，
 *  直接 slice(0, 10) 在凌晨 0—8 点会差一天；'2026-10-27'、'2026-10-27T09:00' 原样取前 10 位。底座审查 #6 */
export function dayOf(v?: string | null) {
  if (!v) return ''
  if (/(Z|[+-]\d\d:?\d\d)$/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return toDateStr(d)
  }
  return v.slice(0, 10)
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}
export function daysFromToday(date: string) {
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${todayStr()}T00:00:00`).getTime()) / 864e5)
}

/** 今天 / 明天 / 3 天后 / 已过 2 天 / 10月12日 */
export function relDay(date?: string | null) {
  if (!date) return '未定'
  const n = daysFromToday(dayOf(date))
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n === -1) return '昨天'
  if (n > 1 && n <= 7) return `${n}${NBSP}天后`
  if (n < -1 && n >= -30) return `已过${NBSP}${-n}${NBSP}天`
  return shortDate(date)
}
/** 待办的截止：“今天 15:30”“明天”；填了到期时间的带上时间 */
export function dueText(due?: string | null, time?: string | null) {
  return due && time ? `${relDay(due)}${NBSP}${time}` : relDay(due)
}
export function shortDate(date?: string | null) {
  if (!date) return '—'
  const [y, m, d] = dayOf(date).split('-')
  return `${y === todayStr().slice(0, 4) ? '' : `${y}年`}${Number(m)}月${Number(d)}日`
}
export function weekday(date: string) {
  return WEEK[new Date(`${dayOf(date)}T00:00:00`).getDay()]
}
export function timeOf(dt?: string | null) {
  return dt && dt.includes('T') ? dt.slice(11, 16) : '全天'
}
export function fullDate(date: string) {
  const [y, m, d] = dayOf(date).split('-')
  return `${y}年${Number(m)}月${Number(d)}日 ${weekday(date)}`
}
/** 金额：万元。10 万以下最多两位小数、去掉末尾的 0（0.54 万、3.09 万），10 万以上一位（E5 修 #2：原来一律一位，0.54 显示成 0.5） */
export function wan(n?: number | null) {
  if (n === null || n === undefined) return '—'
  return `${wanNum(n)}${NBSP}万`
}
/** 只要数字部分（图表刻度、拼接时用） */
export function wanNum(n: number) {
  const r = Math.abs(n) < 10 ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10
  return String(r)
}
export function signed(n?: number | null, unit = '') {
  if (n === null || n === undefined) return '—'
  return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`
}
export function ago(iso: string) {
  const s = (now().getTime() - new Date(iso).getTime()) / 1000
  if (s < 0) return toDateStr(new Date(iso)) === todayStr() ? `今天 ${new Date(iso).toTimeString().slice(0, 5)}` : shortDate(toDateStr(new Date(iso)))
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return shortDate(toDateStr(new Date(iso))) // 按本地日期，不按 UTC
}

/** “10月28日 · 明天”；超过一周的只写日期，不重复 */
export function dateWithRel(date?: string | null) {
  if (!date) return '—'
  const r = relDay(date)
  return r === shortDate(date) ? r : `${shortDate(date)} · ${r}`
}
/** 元：整数加千分位；一万以上写成“1.6 万”。经营、订单这类按元记的钱用它 */
export function yuan(n?: number | null) {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 10000) { const w = n / 10000; return `${Number.isInteger(Math.round(w * 10) / 10) ? Math.round(w) : w.toFixed(1)}${NBSP}万` }
  return `${Math.round(n).toLocaleString('zh-CN')}${NBSP}元`
}
/** 千分位数字（人数、件数） */
export const thousands = (n?: number | null) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('zh-CN'))
/** 10/24 这种短日期（图表、小字里用） */
export const md = (date?: string | null) => { const d = dayOf(date); return d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—' }
