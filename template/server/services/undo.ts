// 撤回（2026-11-26）：AI 写进工作台的改动能一键退回（对话栏回答下面的结果卡、以后驾驶舱的“AI 替你办了”都用这一份）。
// 做法：每个数据库连接一打开，就给业务表挂上临时触发器（TEMP TRIGGER，只在这个连接里有效），写入、修改、删除时把“改之前的样子”记进临时表；
// logChange 写改动记录的那一刻，把记下的行挂到这条改动上（undo_rows）。撤回就照着倒着还原：新建的删掉、改了的改回去、删了的放回来。
// 之后又被别的改动动过的行不撤（说清楚是哪条），免得把后来的改动冲掉。撤回本身也是一条改动，也能再撤回。
import type { DatabaseSync } from 'node:sqlite'

/** 不记的表：工作台自己的流水、设置、扫描出来的元信息、对话记录（这些不算“改了你的东西”） */
const SKIP = /^(changes|undo_rows|undo_reverted|_migrations|settings|sqlite_.*|pa_.*|assistant_.*|reminder.*|job.*|calendar_sync.*)$/

type Col = { name: string; type: string }
const q = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 给这个连接挂上临时触发器（数据库打开、迁移跑完以后调一次） */
export function installUndoTriggers(d: DatabaseSync): void {
  d.exec('CREATE TEMP TABLE IF NOT EXISTS undo_pending (id INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, op TEXT NOT NULL, rid INTEGER NOT NULL, before TEXT)')
  const tables = (d.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name).filter((n) => !SKIP.test(n))
  for (const t of tables) {
    const cols = d.prepare(`PRAGMA main.table_info(${q(t)})`).all() as Col[]
    // 存二进制的表不记（JSON 装不下二进制）；没有 rowid 的表（WITHOUT ROWID）也不记
    if (!cols.length || cols.some((c) => /BLOB/i.test(c.type))) continue
    const withoutRowid = (d.prepare('SELECT sql FROM main.sqlite_master WHERE name = :n').get({ n: t }) as { sql: string } | undefined)?.sql?.match(/WITHOUT\s+ROWID/i)
    if (withoutRowid) continue
    const obj = (row: 'OLD' | 'NEW') => `json_object(${cols.map((c) => `'${c.name.replace(/'/g, "''")}', ${row}.${q(c.name)}`).join(', ')})`
    const name = (op: string) => q(`undo_${op}_${t}`)
    d.exec(`CREATE TEMP TRIGGER IF NOT EXISTS ${name('i')} AFTER INSERT ON main.${q(t)} BEGIN INSERT INTO temp.undo_pending (tbl, op, rid) VALUES ('${t.replace(/'/g, "''")}', 'insert', NEW.rowid); END;`)
    d.exec(`CREATE TEMP TRIGGER IF NOT EXISTS ${name('u')} AFTER UPDATE ON main.${q(t)} BEGIN INSERT INTO temp.undo_pending (tbl, op, rid, before) VALUES ('${t.replace(/'/g, "''")}', 'update', OLD.rowid, ${obj('OLD')}); END;`)
    d.exec(`CREATE TEMP TRIGGER IF NOT EXISTS ${name('d')} AFTER DELETE ON main.${q(t)} BEGIN INSERT INTO temp.undo_pending (tbl, op, rid, before) VALUES ('${t.replace(/'/g, "''")}', 'delete', OLD.rowid, ${obj('OLD')}); END;`)
  }
}

/** logChange 写完改动记录以后：把这个连接记下的行挂到这条改动上 */
export function attachPending(d: DatabaseSync, changeId: number): void {
  d.prepare('INSERT INTO main.undo_rows (change_id, tbl, op, rid, before) SELECT :c, tbl, op, rid, before FROM temp.undo_pending ORDER BY id').run({ c: changeId })
  d.exec('DELETE FROM temp.undo_pending')
}

/** 丢掉还没挂上的（一批写入开始前调，免得上一批没写改动记录的行混进来） */
export function dropPending(d: DatabaseSync): void {
  try { d.exec('DELETE FROM temp.undo_pending') } catch { /* 还没挂触发器 */ }
}

export type RevertState = 'ready' | 'blocked' | 'reverted' | 'unsupported'

/** 这条改动现在能不能撤：没记下行的不支持；撤过了；之后又被别的（没撤的）改动动过的行，不能撤（撤回它之后那些改动的“撤回”不算） */
export function revertState(d: DatabaseSync, changeId: number): { state: RevertState; why?: string } {
  if (d.prepare('SELECT 1 FROM main.undo_reverted WHERE change_id = :c').get({ c: changeId })) return { state: 'reverted' }
  const rows = d.prepare('SELECT id, tbl, rid FROM main.undo_rows WHERE change_id = :c').all({ c: changeId }) as { id: number; tbl: string; rid: number }[]
  if (!rows.length) return { state: 'unsupported', why: '这条改动没记下改之前的样子（比如是改知识库文件的，原文件在备份里）' }
  for (const r of rows) {
    const later = d.prepare(`SELECT c.id, c.summary FROM main.undo_rows u JOIN main.changes c ON c.id = u.change_id
      WHERE u.tbl = :t AND u.rid = :r AND u.change_id > :c AND u.change_id NOT IN (SELECT change_id FROM main.undo_reverted)
        AND u.change_id NOT IN (SELECT by_change_id FROM main.undo_reverted WHERE change_id > :c) ORDER BY u.change_id LIMIT 1`).get({ t: r.tbl, r: r.rid, c: changeId }) as { id: number; summary: string } | undefined
    if (later) return { state: 'blocked', why: `之后又改过：${later.summary}` }
  }
  return { state: 'ready' }
}

/** 撤回：倒着还原这条改动动过的行（在一个事务里，撤回本身记成一条新改动，调用方负责 logChange 和记 undo_reverted） */
export function applyRevert(d: DatabaseSync, changeId: number): number {
  const rows = d.prepare('SELECT tbl, op, rid, before FROM main.undo_rows WHERE change_id = :c ORDER BY id DESC').all({ c: changeId }) as { tbl: string; op: string; rid: number; before: string | null }[]
  for (const r of rows) {
    const t = q(r.tbl)
    if (r.op === 'insert') { d.prepare(`DELETE FROM main.${t} WHERE rowid = :r`).run({ r: r.rid }); continue }
    const before = JSON.parse(r.before ?? '{}') as Record<string, unknown>
    const cols = Object.keys(before)
    const params: Record<string, unknown> = { __r: r.rid }
    cols.forEach((c, i) => { params[`v${i}`] = before[c] as never })
    if (r.op === 'update') d.prepare(`UPDATE main.${t} SET ${cols.map((c, i) => `${q(c)} = :v${i}`).join(', ')} WHERE rowid = :__r`).run(params as never)
    else d.prepare(`INSERT INTO main.${t} (rowid, ${cols.map(q).join(', ')}) VALUES (:__r, ${cols.map((_, i) => `:v${i}`).join(', ')})`).run(params as never)
  }
  return rows.length
}
