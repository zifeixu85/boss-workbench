-- 撤回（2026-11-26，照 A梦 自用工作台的“AI 替你办了 · 撤回”做的通用版）：每条改动记录（changes）挂上它改了哪些行、改之前是什么样，
-- 撤回时照着还原。行是 services/undo.ts 的临时触发器记下的（每个数据库连接自己记，写 changes 那一刻挂上）。
CREATE TABLE IF NOT EXISTS undo_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id INTEGER NOT NULL,
  tbl TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  rid INTEGER NOT NULL,
  before TEXT
);
CREATE INDEX IF NOT EXISTS undo_rows_change ON undo_rows (change_id);
CREATE INDEX IF NOT EXISTS undo_rows_row ON undo_rows (tbl, rid);
-- 撤回过的：哪条改动、被哪条改动（“撤回：……”那条）撤回的
CREATE TABLE IF NOT EXISTS undo_reverted (
  change_id INTEGER PRIMARY KEY,
  by_change_id INTEGER NOT NULL,
  at TEXT NOT NULL
);
