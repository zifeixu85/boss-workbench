// 日历同步的存储：来源设置、订阅链接、最近一次同步的状态（都在 settings 表），以及把一次同步结果换进 events 表。
//   calendar_source   off | mac | lark | ics（没写 = off）
//   calendar_ics_url  订阅链接。等于密码：不打印、不写日志、网页只显示网站名；getSettings 不返回它
//   calendar_status   最近一次同步的结果（JSON）：成功几条、什么时候、失败原因
import { all, get, run, tx } from '../db.ts'
import { CALENDAR_SOURCES, SYNCED_EVENT_SOURCE, type CalendarSource } from '../../shared/schema.ts'
import type { EventRow } from './rows.ts'

const put = (key: string, value: string) =>
  run('INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value', { key, value })
const read = (key: string) => get<{ value: string }>('SELECT value FROM settings WHERE key = :key', { key })?.value

export function readSource(): CalendarSource {
  const v = read('calendar_source')
  return (CALENDAR_SOURCES as readonly string[]).includes(v ?? '') ? (v as CalendarSource) : 'off'
}
export const writeSource = (s: CalendarSource) => put('calendar_source', s)

export const readIcsUrl = () => read('calendar_ics_url') ?? ''
export const writeIcsUrl = (url: string) => (url ? put('calendar_ics_url', url) : run("DELETE FROM settings WHERE key = 'calendar_ics_url'"))

/** 最近一次同步。lastSyncAt 是最近一次成功的时间；失败时它不变，旧数据也留着 */
export type SyncRecord = {
  source: CalendarSource
  ok: boolean
  /** 最近一次尝试的时间（ISO） */
  at: string
  lastSyncAt: string | null
  count: number
  /** 失败的一句话原因（中文）；成功时为空 */
  error: string | null
  /** 机器读的原因：denied、restricted、notDetermined、writeOnly、timeout、missing-helper、unsupported、missing-cli、not-logged-in、http、network、bad-file … */
  code: string | null
  from: string | null
  to: string | null
  skipped: number
}

export function readRecord(): SyncRecord | null {
  const v = read('calendar_status')
  if (!v) return null
  try { return JSON.parse(v) as SyncRecord } catch { return null }
}
export const writeRecord = (r: SyncRecord) => put('calendar_status', JSON.stringify(r))
export const clearRecord = () => run("DELETE FROM settings WHERE key = 'calendar_status'")

const WINDOW_START = `substr(CASE WHEN length(start) = 10 THEN start || 'T00:00' ELSE start END, 1, 10)`

/** 一个事务：时间窗 [from, to) 里旧的同步日程全删，再写这次读到的。手动、Codex 建的日程不动 */
export function replaceWindow(rows: EventRow[], window: { from: string; to: string }, at: string) {
  return tx(() => {
    const removed = Number(run(`DELETE FROM events WHERE source = :src AND ${WINDOW_START} >= :f AND ${WINDOW_START} < :t`,
      { src: SYNCED_EVENT_SOURCE, f: window.from, t: window.to }).changes)
    for (const r of rows) {
      // 时间窗前开始、还没结束的（昨天开始的三天展会）不在上面删的范围里，同一个 id 换成新的
      run(`INSERT OR REPLACE INTO events (id, title, start, end, all_day, kind, location, client_id, project_id, note, source, created_at, updated_at)
        VALUES (:id, :title, :start, :end, :all_day, :kind, :location, NULL, NULL, :note, :source, :at, :at)`, { ...r, at })
    }
    return { removed, written: rows.length }
  })
}

/** 不接日历了：今天起的同步日程拿掉（过去的留着当记录），手动的不动 */
export function removeFuture(fromDay: string) {
  return Number(run(`DELETE FROM events WHERE source = :src AND ${WINDOW_START} >= :f`, { src: SYNCED_EVENT_SOURCE, f: fromDay }).changes)
}

export const countSynced = (window: { from: string; to: string }) =>
  all<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE source = :src AND ${WINDOW_START} >= :f AND ${WINDOW_START} < :t`,
    { src: SYNCED_EVENT_SOURCE, f: window.from, t: window.to })[0]?.n ?? 0
