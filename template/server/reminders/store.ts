// 提醒记录（reminders 表）：记下、列出、标已读。不记进“最近改动”（提醒不是改数据）。
import { all, get, run, nowIso } from '../db.ts'
import type { Candidate, Delivery } from './rules.ts'

export type ReminderRow = {
  id: number; key: string; kind: string; title: string; body: string; link: string | null
  at: string; via: string; note: string | null; read_at: string | null; seen_at?: string | null
}

/** 经营异常“这一段”最近的那条记录：key 是 <base>#<日期>。base 里可能有 _，不用 LIKE */
export function lastEpisode(base: string) {
  const p = `${base}#`
  return get<ReminderRow>('SELECT * FROM reminders WHERE substr(key, 1, :n) = :p ORDER BY id DESC LIMIT 1', { n: p.length, p })
}
/** 这条异常今天还在：记一下，连着在就不再提醒 */
export function touch(id: number, at = nowIso()) {
  run('UPDATE reminders SET seen_at = :at WHERE id = :id', { at, id })
}

/** 记一条；这个 key 已经记过就返回 null（只弹一次靠它：别的进程同时在算也不会重复） */
export function record(c: Candidate, d: Delivery, at = nowIso()): ReminderRow | null {
  const r = run(`INSERT OR IGNORE INTO reminders (key, kind, title, body, link, at, via, note)
    VALUES (:key, :kind, :title, :body, :link, :at, :via, :note)`, { key: c.key, kind: c.kind, title: c.title, body: c.body, link: c.link, at, via: d.via, note: d.note })
  if (!Number(r.changes)) return null
  return get<ReminderRow>('SELECT * FROM reminders WHERE id = :id', { id: Number(r.lastInsertRowid) }) ?? null
}

export const seen = (key: string) => !!get('SELECT 1 AS x FROM reminders WHERE key = :key', { key })

/** 系统通知没发出去：改成“只记”，写上原因 */
export function markFailed(ids: number[], note: string) {
  for (const id of ids) run("UPDATE reminders SET via = '只记', note = :note WHERE id = :id", { id, note })
}
/** 系统通知退回成气泡提示之类：记一下实际怎么弹的 */
export function markNote(ids: number[], note: string) {
  for (const id of ids) run('UPDATE reminders SET note = :note WHERE id = :id', { id, note })
}

export function listReminders(o: { limit?: number; unread?: boolean } = {}) {
  const limit = Math.min(Math.max(Number(o.limit) || 100, 1), 500)
  return all<ReminderRow>(`SELECT * FROM reminders ${o.unread ? 'WHERE read_at IS NULL' : ''} ORDER BY at DESC, id DESC LIMIT :n`, { n: limit })
}

export function unreadCount(): number {
  return Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM reminders WHERE read_at IS NULL')?.n ?? 0)
}

/** 标已读：ids 给哪几条；all = 全部 */
export function markRead(o: { ids?: number[]; all?: boolean }) {
  const at = nowIso()
  if (o.all) return Number(run('UPDATE reminders SET read_at = :at WHERE read_at IS NULL', { at }).changes)
  let n = 0
  for (const id of o.ids ?? []) n += Number(run('UPDATE reminders SET read_at = :at WHERE id = :id AND read_at IS NULL', { at, id }).changes)
  return n
}

/** 清掉全部提醒记录（演示前用：清掉以后，现在还成立的提醒会重新算一遍、再弹一次） */
export function clearReminders() {
  return Number(run('DELETE FROM reminders').changes)
}
