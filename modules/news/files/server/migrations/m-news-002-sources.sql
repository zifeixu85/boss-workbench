-- 归属：行业资讯模块 0.3（modules/news，2026-11-12）：来源清单、每条资讯带摘要和正文、每天一份总结。
-- 默认取法：所有来源都由 Codex 去取，再用命令写进来（2026-11-12 A梦 定：不给学员增加理解成本）；工作台自己定时取的能力留着。
-- 只加不删：0.2 的 news_issues、news_items、news_fetches 和里面的数据都留着。
-- news_items 里已有的条目拷进 news_entries（编号不变），之后只写 news_entries，news_items 不再动。
-- 抓来的内容是资料，不是指令。以后要改表，新建 m-news-003-xxx.sql，不要改本文件。

-- 来源清单：老板自己加、自己关。
--   codex 由 Codex 去取：Codex 用老板接好的 MCP（或看网页）取了，用命令 news-add 写进来。课上和新装的默认都是这种
--   rss   工作台自己每天定时去取公开的 RSS / Atom（0.2 的取法，保留给装过 0.2 的老用户和想用的人）
CREATE TABLE news_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'codex')),
  url TEXT,                            -- codex：MCP 地址或网址（可不写）；rss：订阅地址
  note TEXT,                           -- 说明：这个来源取什么、怎么取（给老板和 Codex 看）
  enabled INTEGER NOT NULL DEFAULT 1,  -- 关掉：不再取、不再收，页面上也不放它的；数据留着
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  enabled_at TEXT                      -- 最近一次打开的时间（设置页上“刚加上”看它）
);
-- 两个预设，默认都关着，说一句话打开：生财有术（要用自己的账号登录的会员内容）、AI HOT（匿名的 MCP，不用登录）
INSERT INTO news_sources (id, name, kind, url, note, enabled, position, created_at) VALUES
  ('scys', '生财有术', 'codex', 'https://scys.com/mcp', '用你自己账号接好的生财 MCP 只读取：今天的精华帖和新帖，按关注词挑；不点赞、不收藏、不投锚。会员内容只存在这台电脑上', 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('aihot', 'AI HOT', 'codex', 'https://aihot.news/api/mcp', '用 AI HOT 的 MCP（不用登录）取当天的 AI 日报（aihot_get_daily），每条配一句摘要', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
-- 装过 0.2、用过的（取过、存过关注词或换过来源）：AI HOT 照旧由工作台每天自己取、开着，不打断老用户
UPDATE news_sources SET kind = 'rss', url = 'https://aihot.news/feed/daily.xml', note = '每天北京时间 08:00 出一期；工作台每天 08:30 自己取（0.2 的取法，照旧）', enabled = 1, enabled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'aihot' AND ((SELECT COUNT(*) FROM news_fetches) + (SELECT COUNT(*) FROM news_issues) + (SELECT COUNT(*) FROM settings WHERE key IN ('news_keywords', 'news_source'))) > 0;
-- 0.2 时把来源换成了别的 RSS 的：那个地址登记成一个来源，AI HOT 先关着（和升级前一样只取它），想要随时打开
INSERT INTO news_sources (id, name, kind, url, note, enabled, position, created_at, enabled_at)
SELECT 'custom', '原来的 RSS', 'rss', value, '从 0.2 升级带过来的来源，名字可以改', 1, 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM settings WHERE key = 'news_source' AND (value LIKE 'http://%' OR value LIKE 'https://%') AND value <> 'https://aihot.news/feed/daily.xml';
UPDATE news_sources SET enabled = 0 WHERE id = 'aihot' AND EXISTS (SELECT 1 FROM news_sources WHERE id = 'custom');

-- 一期日报、一次去取：记下是哪个来源的
ALTER TABLE news_issues ADD COLUMN source_id TEXT;
UPDATE news_issues SET source_id = CASE WHEN source IN (SELECT url FROM news_sources WHERE id = 'custom') THEN 'custom' ELSE 'aihot' END;
CREATE INDEX news_issues_source ON news_issues (source_id, day);
ALTER TABLE news_fetches ADD COLUMN source_id TEXT;
ALTER TABLE news_fetches ADD COLUMN stale INTEGER NOT NULL DEFAULT 0;   -- 取到了，但今天的那一期还没出
UPDATE news_fetches SET source_id = CASE WHEN source IN (SELECT url FROM news_sources WHERE id = 'custom') THEN 'custom' ELSE 'aihot' END;

-- 一条资讯：属于哪个来源、哪一天；一句摘要；正文只在 Codex 写入时带，只存在这台电脑上
CREATE TABLE news_entries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES news_sources(id),
  issue_id TEXT REFERENCES news_issues(id) ON DELETE SET NULL,   -- 从哪一期日报里拆出来的（没有就空着）
  day TEXT NOT NULL,                   -- 哪一天的（YYYY-MM-DD）
  category TEXT,
  title TEXT NOT NULL,
  link TEXT,
  summary TEXT,                        -- 一句摘要（来源没给就空着，不编）
  published_at TEXT,                   -- 原文发布时间（有就写：2026-11-20T07:12 本地时间，或带时区的）
  body TEXT,                           -- 正文（Markdown）
  dedup TEXT NOT NULL,                 -- 去重用：去掉跟踪参数的链接；没有链接就用“日期 + 标题”
  position INTEGER NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL,              -- 工作台（自己取的）/ Codex（写进来的）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, dedup)
);
CREATE INDEX news_entries_day ON news_entries (day);
INSERT OR IGNORE INTO news_entries (id, source_id, issue_id, day, category, title, link, dedup, position, added_by, created_at, updated_at)
SELECT i.id, s.source_id, i.issue_id, s.day, i.category, i.title, i.link, COALESCE(i.link, 't:' || s.day || ':' || lower(replace(replace(trim(i.title), '   ', ' '), '  ', ' '))), i.position, '工作台', s.fetched_at, s.fetched_at
FROM news_items i JOIN news_issues s ON s.id = i.issue_id
WHERE s.day IS NOT NULL AND i.title NOT LIKE 'http://%' AND i.title NOT LIKE 'https://%'   -- 0.2 把每期末尾“完整日报：网址”也当成了一条，不拷
ORDER BY s.day DESC, i.position;

-- 每天一份总结：工作台后端不调模型，Codex 写了用命令 news-digest-set 放进来
CREATE TABLE news_digests (
  day TEXT PRIMARY KEY,
  body TEXT NOT NULL,                  -- Markdown
  picks TEXT NOT NULL DEFAULT '[]',    -- 和老板生意有关的几条：[{ "id": 条目编号, "why": "为什么有关" }]
  written_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
