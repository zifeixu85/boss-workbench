// 各业务服务共用的小工具
import { localDate, open } from '../db.ts'

export type Actor = '网页' | 'Codex' | '导入' | '示例数据'

export class NotFound extends Error {
  status = 404
}
export class BadRequest extends Error {
  status = 400
}

/** 今天（演示模式下是演示日，见 clock.ts）。先打开数据库：数据库里可能存了 demo_today */
export const today = () => { open(); return localDate() }

/** 取“哪一天”：nowIso() 存的是 UTC（带 Z），要换成本地日期，直接 slice(0, 10) 在凌晨 0—8 点会差一天；
 *  不带时区的（'2026-10-27'、'2026-10-27T09:00'）原样取前 10 位。底座审查 #6 */
export function dayOf(v: unknown): string {
  const s = String(v ?? '')
  if (/(Z|[+-]\d\d:?\d\d)$/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return localDate(d)
  }
  return s.slice(0, 10)
}

export function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 864e5)
}

/** ISO 周：返回 2026-W41 以及周一、周日 */
export function isoWeek(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const jan1 = new Date(thursday.getFullYear(), 0, 1)
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 864e5 + 1) / 7)
  return { key: `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`, start: localDate(monday), end: localDate(sunday) }
}

export function weekFromKey(key: string) {
  const [y, w] = key.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7)
  return isoWeek(localDate(monday))
}

export const round1 = (n: number) => Math.round(n * 10) / 10

/** 从对象里只挑出允许更新的字段 */
export function pick<T extends object>(obj: T, keys: (keyof T)[]) {
  const out: Partial<T> = {}
  for (const k of keys) if (k in obj && obj[k] !== undefined) out[k] = obj[k]
  return out
}

export function setClause(fields: Record<string, unknown>) {
  return Object.keys(fields).map((k) => `${k} = :${k}`).join(', ')
}

/** 部分更新：只保留调用方真的传了的字段（zod 的 partial 仍会补默认值，必须过滤掉） */
export function onlyGiven<T extends object>(parsed: T, input: unknown): Partial<T> {
  const given = new Set(Object.entries((input ?? {}) as object).filter(([, v]) => v !== undefined).map(([k]) => k))
  return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => given.has(k) && v !== undefined)) as Partial<T>
}
