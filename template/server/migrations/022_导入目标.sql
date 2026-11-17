-- 022 导入规则的 target 不再写死两种（2026-11-12）：别的模块可以登记自己的导入目标（server/modules/data/targets.ts），
-- 所以去掉 import_rules.target 的 CHECK。SQLite 改不了约束，照原样重建这张表；没有别的表引用它，数据原样搬过去。
CREATE TABLE import_rules_new (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  report TEXT NOT NULL,
  channel_id TEXT,
  target TEXT NOT NULL DEFAULT 'channel_daily',  -- channel_daily，或某个模块登记的导入目标
  signature TEXT NOT NULL,
  mapping TEXT NOT NULL,
  required TEXT NOT NULL DEFAULT '[]',
  date_format TEXT,
  amount_unit TEXT NOT NULL DEFAULT '元' CHECK (amount_unit IN ('元','万元')),
  status TEXT NOT NULL DEFAULT '在用' CHECK (status IN ('在用','停用')),
  origin TEXT NOT NULL DEFAULT '自己的' CHECK (origin IN ('示例','自己的')),
  file_path TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
INSERT INTO import_rules_new (id, source_id, platform, report, channel_id, target, signature, mapping, required, date_format, amount_unit, status, origin, file_path, created_at, created_by, updated_at, last_used_at, use_count, note)
  SELECT id, source_id, platform, report, channel_id, target, signature, mapping, required, date_format, amount_unit, status, origin, file_path, created_at, created_by, updated_at, last_used_at, use_count, note FROM import_rules;
DROP TABLE import_rules;
ALTER TABLE import_rules_new RENAME TO import_rules;
