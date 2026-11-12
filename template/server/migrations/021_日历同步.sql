-- 归属：公共（日历同步，2026-10-27）。从老板自己的日历（Mac 日历 / 飞书日历 / 订阅链接）只读同步来的日程，
-- 写进 events（source = '日历同步'，kind = '日历'），手动和 Codex 建的日程不动。规则见 server/calendar/。
-- 原来的 kind 约束只认 5 种类型：SQLite 改不了约束，只能照原样建一张新表、搬数据、换名字。旧数据一条不改。
-- 以后要改表，新建 021_日历同步_02_xxx.sql，不要改本文件。
CREATE TABLE events_v21 (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start TEXT NOT NULL, end TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT '会面' CHECK (kind IN ('会面','品鉴','送货','内部','个人','日历')),
  location TEXT,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  note TEXT, source TEXT NOT NULL DEFAULT '手动',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO events_v21 (id, title, start, end, all_day, kind, location, client_id, project_id, note, source, created_at, updated_at)
  SELECT id, title, start, end, all_day, kind, location, client_id, project_id, note, source, created_at, updated_at FROM events;
DROP TABLE events;
ALTER TABLE events_v21 RENAME TO events;
CREATE INDEX idx_events_start ON events(start);
CREATE INDEX idx_events_source ON events(source, start);
