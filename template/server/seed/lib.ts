// 种子数据共用的小工具：固定的演示日期、可重复的伪随机数、插入一行。
// 全部数据都是虚构的（ABC茶社、林总、客户、团队、数字），只在演示时写入（--demo）。
import { run, params } from '../db.ts'

/** 演示的“今天”。经营数据覆盖 9/27—10/26，日程覆盖 10/20—11/10 */
export const DEMO_TODAY = '2026-10-27'
export const YESTERDAY = '2026-10-26'

/** 固定种子的伪随机数（mulberry32）：同一个种子每次生成的数都一样，截图和课堂演示可以复现 */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    /** 在 [a, b] 之间均匀取一个数 */
    between: (lo: number, hi: number) => lo + (hi - lo) * next(),
    /** 1 附近的波动，例如 jitter(0.08) 落在 0.92—1.08 */
    jitter: (pct: number) => 1 + (next() * 2 - 1) * pct,
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
  }
}

/** 按列名插入一行；undefined 的列不写（用表的默认值） */
export function insert(table: string, row: Record<string, unknown>) {
  const p = params(row)
  const cols = Object.keys(p)
  run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`, p)
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** from 到 to（含两头）的每一天 */
export function eachDay(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay() // 0 = 周日

/** 本地时间转成 ISO（数据库里 created_at / changes.at 用 ISO） */
export const iso = (local: string) => new Date(local.length === 10 ? `${local}T09:00:00` : local).toISOString()

export const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits

/** 一个模块的种子：tables 是 --only 重建时要先清空的表（按删除顺序） */
export type SeedModule = { name: string; tables: string[]; seed: () => void }
