-- AI 助手（2026-10-15）：工作台每页右边的对话栏。一问一答各一行；assistant 那行跑的时候 status = running，跑完写回答和用到的工具
CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('running', 'done', 'failed', 'cancelled')),
  error TEXT,
  steps_json TEXT,
  page_title TEXT,
  page_path TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS assistant_messages_created ON assistant_messages (created_at);
