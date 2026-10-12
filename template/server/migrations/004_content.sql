-- 004 小红书内容（content）模块：账号、笔记和数据、每天的选题、排期、草稿、素材、创作对话。
-- 归属：内容模块。以后要改表，新建 004_content_02_xxx.sql，不要改本文件。
-- 时间：YYYY-MM-DDTHH:mm；金额：元；标签 tags 存 JSON 数组。

CREATE TABLE xhs_account (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,             -- 账号名
  red_id TEXT,                    -- 小红书号（虚构）
  bio TEXT,                       -- 简介
  positioning TEXT,               -- 定位一句话
  followers INTEGER NOT NULL,     -- 粉丝数（截至 updated_at）
  likes_saves INTEGER,            -- 获赞与收藏
  owner TEXT,                     -- 谁在运营
  positioning_kb TEXT,            -- 账号定位在知识库里的位置
  voice_kb TEXT,                  -- 品牌口吻在知识库里的位置
  updated_at TEXT NOT NULL
);

-- 粉丝每天的变化（近 60 天）
CREATE TABLE xhs_followers_daily (
  date TEXT PRIMARY KEY,
  followers INTEGER NOT NULL,
  gained INTEGER NOT NULL,
  lost INTEGER NOT NULL
);

-- 内容支柱：办公室 3 分钟泡茶、一周喝茶搭配、茶具小知识、新品试喝
CREATE TABLE content_pillars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE xhs_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('图文','视频')),
  published_at TEXT NOT NULL,
  pillar_id TEXT REFERENCES content_pillars(id),
  cover_desc TEXT,                -- 封面画面
  cover_text TEXT,                -- 封面上的字
  summary TEXT,                   -- 正文摘要
  tags TEXT NOT NULL DEFAULT '[]',
  boosted INTEGER NOT NULL DEFAULT 0  -- 1 = 投过流
);

-- 笔记数据：自然流量、投流分开各一行；stats_date 是数据截至哪天（导入失败时会停在前一天）
CREATE TABLE xhs_note_stats (
  note_id TEXT NOT NULL REFERENCES xhs_notes(id) ON DELETE CASCADE,
  traffic TEXT NOT NULL CHECK (traffic IN ('自然','投流')),
  impressions INTEGER NOT NULL,   -- 曝光
  reads INTEGER NOT NULL,         -- 阅读（观看）
  likes INTEGER NOT NULL,
  saves INTEGER NOT NULL,         -- 收藏
  comments INTEGER NOT NULL,
  shares INTEGER NOT NULL DEFAULT 0,
  new_followers INTEGER NOT NULL, -- 涨粉
  spend REAL NOT NULL DEFAULT 0,  -- 投流花费（元），自然流量为 0
  stats_date TEXT NOT NULL,
  PRIMARY KEY (note_id, traffic)
);

-- 每天早上生成的选题
CREATE TABLE xhs_topics (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,             -- 哪天生成的
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('评论区问题','热点和节气','同行爆款','知识库客户常问')),
  reason TEXT,                    -- 为什么推荐
  ref TEXT,                       -- 依据：评论原话、同行笔记结构、知识库位置
  pillar_id TEXT REFERENCES content_pillars(id),
  status TEXT NOT NULL DEFAULT '新' CHECK (status IN ('新','已采纳','先放一放','已放弃')),
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE xhs_drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,             -- 正文全文
  tags TEXT NOT NULL DEFAULT '[]',
  cover_text TEXT,
  cover_asset_id TEXT,            -- 用哪个封面模板（xhs_assets.id）
  pillar_id TEXT REFERENCES content_pillars(id),
  topic_id TEXT REFERENCES xhs_topics(id),
  status TEXT NOT NULL DEFAULT '写作中' CHECK (status IN ('写作中','待林总看','已定稿')),
  check_note TEXT,                -- 合规自查：功效词、极限词、客户名、新品名
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 排期：一天一格（也可以一天多篇）
CREATE TABLE xhs_schedule (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT,                      -- 计划发布时间 HH:mm
  title TEXT NOT NULL,
  pillar_id TEXT REFERENCES content_pillars(id),
  status TEXT NOT NULL CHECK (status IN ('已发布','待发布','草稿','选题','待定')),
  note_id TEXT REFERENCES xhs_notes(id),
  draft_id TEXT REFERENCES xhs_drafts(id),
  topic_id TEXT REFERENCES xhs_topics(id),
  owner TEXT,
  memo TEXT
);

-- 素材：封面模板、垫图、品牌素材（这里只存描述，文件以后放 资料/小红书素材/）
CREATE TABLE xhs_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('封面模板','垫图','品牌素材')),
  name TEXT NOT NULL,
  description TEXT,
  usage TEXT,                     -- 什么时候用
  file TEXT,                      -- 文件位置（可空）
  created_at TEXT NOT NULL
);

-- 创作页的对话（旧表，新页面不读；角色值是示例数据用的）：围绕一篇草稿，老板 / 运营 和 AI 来回改
CREATE TABLE content_chat (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES xhs_drafts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('林总','小艾','AI')),
  text TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX idx_notes_published ON xhs_notes(published_at);
CREATE INDEX idx_topics_date ON xhs_topics(date, sort);
CREATE INDEX idx_schedule_date ON xhs_schedule(date);
CREATE INDEX idx_chat_draft ON content_chat(draft_id, at);
