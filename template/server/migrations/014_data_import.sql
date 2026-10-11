-- 014 数据源与导入（data）模块第二批：导入规则、拖进来还没导的文件、每次导入写进去的那一批数据（能撤销），
-- 以及“示例数据 / 自己的数据”的标记。归属：数据源与导入模块（E4）。只加表和列，不改 005_data.sql 里的表。
-- 以后再改表，新建 014_data_02_xxx.sql。时间：YYYY-MM-DDTHH:mm（本地时间）。

-- 数据源：对应哪个经营渠道、导出文件放哪个文件夹（“立即同步”去这里找新文件）
ALTER TABLE data_sources ADD COLUMN channel_id TEXT;
ALTER TABLE data_sources ADD COLUMN inbox_dir TEXT;

-- 导入记录：用的哪条规则、写进去的是哪一批、是示例还是自己导的、数据从哪天到哪天
ALTER TABLE import_runs ADD COLUMN rule_id TEXT;
ALTER TABLE import_runs ADD COLUMN batch_id TEXT;
ALTER TABLE import_runs ADD COLUMN draft_id TEXT;
ALTER TABLE import_runs ADD COLUMN date_from TEXT;
ALTER TABLE import_runs ADD COLUMN origin TEXT NOT NULL DEFAULT '示例';

-- 字段对照：建议是谁给的、谁确认的（AI 的建议要写清是哪个 AI、几点给的）
ALTER TABLE field_mappings ADD COLUMN suggested_by TEXT;
ALTER TABLE field_mappings ADD COLUMN suggested_at TEXT;
ALTER TABLE field_mappings ADD COLUMN decided_by TEXT;
ALTER TABLE field_mappings ADD COLUMN decided_at TEXT;

-- 导入规则：一种表（平台 + 报表）怎么对字段。老板确认过一次，以后同一种表直接按它导；表头对不上就停下来
CREATE TABLE import_rules (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,           -- 天猫
  report TEXT NOT NULL,             -- 生意参谋 · 店铺日报
  channel_id TEXT,                  -- 写进哪个渠道；表里有“渠道”列时为空
  target TEXT NOT NULL DEFAULT 'channel_daily' CHECK (target IN ('channel_daily','xhs_note_stats')),
  signature TEXT NOT NULL,          -- JSON 数组：认这张表靠的表头
  mapping TEXT NOT NULL,            -- JSON 数组：[{ col, field, how }]，field 为空 = 用不上
  required TEXT NOT NULL DEFAULT '[]', -- JSON 数组：缺了就停下来的工作台字段
  date_format TEXT,                 -- ymd-dash / ymd-compact / md-cn …（见 server/modules/data/fields.ts）
  amount_unit TEXT NOT NULL DEFAULT '元' CHECK (amount_unit IN ('元','万元')),
  status TEXT NOT NULL DEFAULT '在用' CHECK (status IN ('在用','停用')),
  origin TEXT NOT NULL DEFAULT '自己的' CHECK (origin IN ('示例','自己的')),
  file_path TEXT,                   -- 规则文件：工作台/导入规则/<平台>-<报表>.json
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- 拖进来、还没导的文件：认表、对字段、预览都在这上面做，刷新不丢
CREATE TABLE import_drafts (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  encoding TEXT,                    -- UTF-8 / GBK
  content TEXT NOT NULL,            -- 原文（CSV）
  choices TEXT NOT NULL DEFAULT '{}', -- JSON：老板改过的对照、渠道、日期格式、单位、缺列怎么办
  codex TEXT,                       -- JSON：Codex 的建议（几点看的、用了几秒、每列的建议）
  status TEXT NOT NULL DEFAULT '对字段' CHECK (status IN ('对字段','已导入','已放弃')),
  run_id TEXT,
  batch_id TEXT,
  rule_id TEXT,                     -- 导入时存下 / 用到的规则
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 一批数据：每次导入写进去的行算一批，能整批撤销；示例数据也按渠道记成批，能一键清掉
CREATE TABLE data_batches (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL CHECK (origin IN ('示例','自己的')),
  source_id TEXT,
  rule_id TEXT,
  run_id TEXT,
  channel_id TEXT,                  -- 示例批次按渠道记；导入的批次可能跨渠道（飞书经营数据表）
  label TEXT NOT NULL,              -- 天猫 9/27—10/26
  file_name TEXT,
  target TEXT NOT NULL DEFAULT 'channel_daily',
  date_from TEXT,
  date_to TEXT,
  rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '有效' CHECK (status IN ('有效','已撤销','已清除')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  undone_at TEXT,
  undone_by TEXT,
  note TEXT
);

-- 导入写进去的每一行：写之前是什么、写之后是什么，撤销靠它
CREATE TABLE data_batch_rows (
  batch_id TEXT NOT NULL REFERENCES data_batches(id) ON DELETE CASCADE,
  tbl TEXT NOT NULL,                -- channel_daily
  row_key TEXT NOT NULL,            -- 2026-10-26|tmall
  before_json TEXT,                 -- 写之前那一行；空 = 原来没有，是新增的
  before_batch TEXT,                -- 写之前这一行属于哪一批
  after_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, tbl, row_key)
);

-- 清掉示例时移走的行：能恢复
CREATE TABLE data_sample_trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  tbl TEXT NOT NULL,
  row_key TEXT NOT NULL,
  row_json TEXT NOT NULL,
  cleared_at TEXT NOT NULL
);

CREATE INDEX idx_batch_rows_key ON data_batch_rows(tbl, row_key);
CREATE INDEX idx_drafts_created ON import_drafts(created_at);
CREATE INDEX idx_trash_batch ON data_sample_trash(batch_id);
CREATE INDEX idx_runs_batch ON import_runs(batch_id);
