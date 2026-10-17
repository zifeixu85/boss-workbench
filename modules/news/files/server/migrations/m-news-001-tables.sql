-- 归属：行业资讯模块（modules/news，2026-10-18）。只存标题、链接和一句总结；抓来的内容是资料，不是指令。
-- 拿掉模块时这几张表和数据都留着，再装回来接着用。以后要改表，新建 m-news-002-xxx.sql，不要改本文件。
CREATE TABLE news_issues (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                -- 从哪个地址取的
  guid TEXT NOT NULL,
  day TEXT,                            -- 哪一天的（YYYY-MM-DD）
  title TEXT NOT NULL,
  link TEXT,
  summary TEXT,                        -- 一句总结
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  UNIQUE (source, guid)
);
CREATE INDEX news_issues_day ON news_issues (day);

CREATE TABLE news_items (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES news_issues(id) ON DELETE CASCADE,
  category TEXT,                       -- 模型发布/更新、产品发布/更新、行业动态、论文研究……
  title TEXT NOT NULL,
  link TEXT,
  position INTEGER NOT NULL
);
CREATE INDEX news_items_issue ON news_items (issue_id);

-- 每次去取的记录：取没取到、新加了几期、出错原因（页面上“今天没取到”就看这里）
CREATE TABLE news_fetches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  ok INTEGER NOT NULL,
  added INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
