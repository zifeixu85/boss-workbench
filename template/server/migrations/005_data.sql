-- 005 数据源与导入（data）模块：数据从哪来、多久更新一次、最近一次成没成功；每次导入的记录；导出文件的字段怎么对到工作台。
-- 归属：数据源与导入模块。以后要改表，新建 005_data_02_xxx.sql，不要改本文件。
-- 时间：YYYY-MM-DDTHH:mm（本地时间）。

CREATE TABLE data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,             -- 如“抖店 · 经营数据导出”
  kind TEXT NOT NULL CHECK (kind IN ('平台导出','飞书多维表格','飞书日历与妙记','知识库文件夹','RSS','Codex 定时任务')),
  feeds TEXT NOT NULL,            -- 喂给哪个模块 / 哪张表，如“经营 · channel_daily 等”
  method TEXT NOT NULL,           -- 怎么拿：谁导出、放哪个文件夹、用什么命令
  schedule TEXT NOT NULL,         -- 多久一次，如“每天 07:30 前”
  owner TEXT,                     -- 谁负责
  status TEXT NOT NULL CHECK (status IN ('正常','超时','失败','停用')),
  last_run_at TEXT,               -- 最近一次运行
  last_ok_at TEXT,                -- 最近一次成功
  next_run_at TEXT,               -- 下一次
  data_through TEXT,              -- 数据截至哪天
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('成功','部分成功','失败','超时','进行中')),
  file_name TEXT,                 -- 导入的文件（相对知识库根目录的 工作台/导入/…）
  data_date TEXT,                 -- 这批数据是哪天的
  rows_total INTEGER,
  rows_ok INTEGER,
  rows_failed INTEGER,
  actor TEXT NOT NULL,            -- 定时任务 / 阿杰 / 晓雯 / 网页
  message TEXT,                   -- 一句话结果
  detail TEXT                     -- JSON：出错的字段、样例行等
);

-- 字段对照：导出文件里的列 → 工作台的字段。AI 对字段时给出建议和把握，确认后才生效
CREATE TABLE field_mappings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  source_field TEXT NOT NULL,     -- 文件里的列名
  target TEXT,                    -- 工作台字段，如 xhs_note_stats.impressions；空 = 不导
  transform TEXT,                 -- 换算，如“去掉千分位逗号”“百分数转小数”
  sample TEXT,                    -- 样例值
  status TEXT NOT NULL CHECK (status IN ('已确认','AI 建议','未匹配','忽略')),
  confidence REAL,                -- AI 建议的把握（0—1）
  reason TEXT,                    -- AI 为什么这么对
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_runs_source ON import_runs(source_id, started_at);
CREATE INDEX idx_mappings_source ON field_mappings(source_id);
