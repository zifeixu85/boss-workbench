-- 013 小红书内容中心（E3，2026-10-10）：一篇内容从选题到发布是同一条（xhs_pieces），稿件版本、创作对话、
-- 已发笔记每天的累计数据、每周复盘、对标收藏、后台任务（出选题、复盘）。归属：内容模块。
-- 004 的 xhs_topics / xhs_schedule / xhs_drafts / content_chat 保留不删（旧页面和旧进程还在读），新页面只读这里的表。
-- 时间：YYYY-MM-DDTHH:mm（本地时间）；JSON 字段存字符串。

-- 一篇内容：选题 → 已选 → 写稿中 → 待发布 → 已发布（同一条），已放弃的留着
CREATE TABLE xhs_pieces (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  angle TEXT,                      -- 切入角度
  format TEXT NOT NULL DEFAULT '图文' CHECK (format IN ('图文','视频')),
  pillar_id TEXT REFERENCES content_pillars(id),
  source TEXT NOT NULL DEFAULT '自己想的' CHECK (source IN ('评论区问题','热点和节气','同行爆款','知识库客户常问','自己想的','复盘建议','旧笔记翻新','从一款茶开始','对标笔记')),
  reason TEXT,                     -- 为什么做
  ref TEXT,                        -- 依据：评论原话、同行结构、知识库位置
  warn TEXT,                       -- 提醒（例：公道杯正在退款，先放一放）
  status TEXT NOT NULL DEFAULT '灵感池' CHECK (status IN ('灵感池','已选','写稿中','待发布','已发布','已放弃')),
  topic_date TEXT,                 -- 哪天早上出的选题（每天的 10 个）
  created_by TEXT NOT NULL,        -- Codex 定时任务 / 本机 Codex / 团队成员或老板的称呼 / 复盘 / 导入
  scheduled_date TEXT,             -- 排期日
  scheduled_time TEXT,             -- HH:mm
  published_at TEXT,
  publish_url TEXT,
  note_id TEXT,                    -- 对上的笔记（xhs_notes.id）；不设外键，导入会重写笔记表
  memo TEXT,
  start TEXT,                      -- 起点 JSON {kind: 选题|旧笔记|一款茶|对标笔记|一句话, ref, label, text}；创作页起点卡用
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 稿件版本：只增不改；恢复也是另存一版。data 是稿件 JSON（format titles title cover_text cover pages body tags checks）
CREATE TABLE xhs_versions (
  id TEXT PRIMARY KEY,
  piece_id TEXT NOT NULL REFERENCES xhs_pieces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('AI 写稿','手动修改','采用候选','恢复','导入')),
  author TEXT,                     -- 本机 Codex / 团队成员或老板的称呼
  note TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (piece_id, version)
);

-- 创作页的对话（只有创作页有对话窗口）
CREATE TABLE xhs_messages (
  id TEXT PRIMARY KEY,
  piece_id TEXT NOT NULL REFERENCES xhs_pieces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','ai')),
  author TEXT NOT NULL,            -- 团队成员或老板的称呼 / Codex
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('running','done','failed','stopped')),
  kind TEXT NOT NULL DEFAULT 'chat',-- chat / options
  options TEXT,                    -- JSON {field, items:[{text,note}], chosen}
  refs TEXT,                       -- JSON 回复里写的“参考了”哪些文件
  files_read TEXT,                 -- JSON 这一轮实际打开的文件
  version INTEGER,                 -- 这条回复写出的稿件版本
  progress TEXT,
  error TEXT,
  duration_ms INTEGER,
  origin TEXT NOT NULL DEFAULT '现场' CHECK (origin IN ('现场','示例')),
  created_at TEXT NOT NULL
);

-- 已发笔记每天的累计数（发布后第 N 天），自然、投流分开；数据截至哪天跟 xhs_note_stats 一致
CREATE TABLE xhs_note_daily (
  note_id TEXT NOT NULL,
  traffic TEXT NOT NULL CHECK (traffic IN ('自然','投流')),
  day INTEGER NOT NULL,            -- 1 = 发布当天
  date TEXT NOT NULL,
  impressions INTEGER NOT NULL,
  reads INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  saves INTEGER NOT NULL,
  comments INTEGER NOT NULL,
  new_followers INTEGER NOT NULL,
  spend REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, traffic, day)
);

-- 每周复盘（周一到周日）
CREATE TABLE xhs_reviews (
  id TEXT PRIMARY KEY,
  week TEXT NOT NULL UNIQUE,       -- 2026-W43
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  summary TEXT,
  worked TEXT NOT NULL DEFAULT '[]',     -- JSON ["…"]
  change TEXT NOT NULL DEFAULT '[]',
  ideas TEXT NOT NULL DEFAULT '[]',      -- JSON [{title, reason, pillar, piece_id}]
  learnings TEXT NOT NULL DEFAULT '[]',  -- JSON [{rule, evidence, scope, status: 待定|已存进知识库|不要, saved_at}]
  inputs TEXT NOT NULL DEFAULT '{}',     -- 生成时给 AI 的数据快照（指标、看了哪些笔记），页面卡片和当时给 AI 的一致
  written_by TEXT NOT NULL,        -- 每周复盘定时任务 / 本机 Codex
  origin TEXT NOT NULL DEFAULT '现场' CHECK (origin IN ('现场','示例')),
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 对标收藏（手动收的同行笔记，可以“借它开写”）
CREATE TABLE xhs_benchmarks (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_text TEXT,
  pad TEXT,                        -- 预览里画封面用哪张垫图
  likes INTEGER, saves INTEGER, comments INTEGER,
  structure TEXT,                  -- 结构拆解
  borrow TEXT,                     -- 我们可以怎么借
  saved_at TEXT NOT NULL
);

-- 后台任务：出选题、写复盘（创作对话的进度记在 xhs_messages）
CREATE TABLE xhs_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('出选题','复盘')),
  ref TEXT,                        -- 复盘的周 / 出选题的方向
  who TEXT,                        -- 谁跑的：Codex 定时任务 / 本机 Codex（网页上点的）
  status TEXT NOT NULL CHECK (status IN ('running','done','failed','stopped')),
  progress TEXT,
  error TEXT,
  result_count INTEGER,
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX idx_pieces_status ON xhs_pieces(status, sort);
CREATE INDEX idx_pieces_sched ON xhs_pieces(scheduled_date);
CREATE INDEX idx_pieces_topic ON xhs_pieces(topic_date);
CREATE INDEX idx_versions_piece ON xhs_versions(piece_id, version);
CREATE INDEX idx_messages_piece ON xhs_messages(piece_id, created_at);
