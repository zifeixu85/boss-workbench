-- 015 大客户（crm）模块：跟进加深。归属：大客户模块（E5，2026-10-10）。
-- 只加不改：已经跑过的迁移不会再跑；以后要改表，新建 015_crm_02_xxx.sql。
-- 1) 往来记录补：对方的状态、怎么定（谁拍板、哪天定）、来源文件（知识库里的原件，网页上能点开）
-- 2) 答应的事补：谁答应、答应谁、和判断规则对不上的地方（标黄）、来源文件
-- 3) 关怀建议补：谁写的（例如“Codex 定时任务 10/27 07:12 写”）、哪天发出去的
-- 4) 新表：概况页签客户信息里的文字部分、改阶段 / 改答应的事的留痕、新材料提取记录、下次跟进自动生成的待办

ALTER TABLE interactions ADD COLUMN their_status TEXT;   -- 对方的状态，例如“合伙人 11/2 开会定，陈静先考虑一下（没定）”
ALTER TABLE interactions ADD COLUMN signals TEXT;        -- 怎么定：谁拍板、哪天定、在跟谁比
ALTER TABLE interactions ADD COLUMN source_file TEXT;    -- 来源文件：知识库路径，例如 00-收件箱/2026-10-23-衡言律所-微信聊天.md

ALTER TABLE client_promises ADD COLUMN who TEXT NOT NULL DEFAULT '林总'; -- 谁答应的（代码写入时都带上设置里的称呼；默认值只给示例数据用）
ALTER TABLE client_promises ADD COLUMN to_whom TEXT;     -- 答应谁
ALTER TABLE client_promises ADD COLUMN conflict TEXT;    -- 和判断规则、价格规矩对不上的地方；有值就标黄，等老板定
ALTER TABLE client_promises ADD COLUMN source_file TEXT;

ALTER TABLE client_care ADD COLUMN author TEXT;          -- 谁写的草稿：老板的称呼 / Codex 定时任务 10/27 07:12 写 / Codex 提取时写
ALTER TABLE client_care ADD COLUMN sent_at TEXT;         -- 老板标记“已发”的时间

-- 概况页签客户信息里要写字的部分（买过什么和答应过什么、担心什么、下一步由订单、答应的事、偏好表现算）
CREATE TABLE client_facts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('身份与决策','真实诉求','决策信号','执行条件','沟通摘要')),
  text TEXT NOT NULL,
  date TEXT,                      -- 这条是哪天知道的
  source TEXT,                    -- 从哪来：知识库文件路径，或“10/26 电话”
  author TEXT,                    -- 谁整理的：老板的称呼 / AI 整理（待确认）/ Codex 提取（老板确认）
  created_at TEXT NOT NULL
);

-- 改阶段、改答应的事、改下次跟进：写原因，留下新旧值和时间
CREATE TABLE crm_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,           -- 阶段 / 答应的事 / 下次跟进
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);

-- 新材料提取：从知识库 00-收件箱 选一份（或粘贴），交给本机 Codex 提取；老板确认后写入
CREATE TABLE crm_extractions (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('知识库收件箱','粘贴')),
  source_path TEXT,               -- 知识库里的原件路径（粘贴的为空，原文只存在这里）
  raw_text TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('提取中','待确认','已写入','超时','出错','不可用','放弃')),
  engine TEXT,                    -- Codex
  model TEXT,                     -- Codex 实际用的模型，例如 gpt-6.1-sol
  result TEXT,                    -- Codex 返回的 JSON（原样存）
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  written_at TEXT,
  written TEXT,                   -- 写进工作台的东西（JSON：往来记录、答应的事、待办的 ID）
  kb_path TEXT, kb_line TEXT, kb_backup TEXT, kb_written_at TEXT  -- 写回知识库：哪个文件、追加了哪一行、备份在哪
);

-- 填了“下次跟进日期”自动生成的待办：一位客户只留一条，改日期就改这条
CREATE TABLE crm_follow_todos (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX idx_facts_client ON client_facts(client_id, kind);
CREATE INDEX idx_edits_client ON crm_edits(client_id, at);
CREATE INDEX idx_extractions_path ON crm_extractions(source_path, started_at);
