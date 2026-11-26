-- AI 助手的对话（2026-11-26，照 A梦 自用工作台的对话框改）：能开好几个对话、在历史里切换、改名；
-- 常驻对话的每个对话对应他 Codex 里的一个对话（codex_thread_id）。以前的记录并成一个“以前的对话”。
CREATE TABLE IF NOT EXISTS assistant_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  codex_thread_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_threads_updated ON assistant_threads (updated_at);
ALTER TABLE assistant_messages ADD COLUMN thread_id TEXT;
-- 发这句时选中的文字（对话里显示成一个小条）
ALTER TABLE assistant_messages ADD COLUMN page_selection TEXT;
INSERT INTO assistant_threads (id, title, codex_thread_id, created_at, updated_at)
  SELECT 'at_legacy', '以前的对话', (SELECT value FROM settings WHERE key = 'assistant_thread'), MIN(created_at), MAX(created_at) FROM assistant_messages HAVING COUNT(*) > 0;
UPDATE assistant_messages SET thread_id = 'at_legacy' WHERE thread_id IS NULL;
DELETE FROM settings WHERE key = 'assistant_thread';
CREATE INDEX IF NOT EXISTS assistant_messages_thread ON assistant_messages (thread_id, created_at);
