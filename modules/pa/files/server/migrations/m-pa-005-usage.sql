-- AI 用量（2026-11-26）：每份对话记录文件、每天用了多少 token（只有数字）。
-- src 是记录文件名（去掉 .zst）：对话归档后文件挪走、压缩，名字不变，不会算两遍；接着聊另起的一份是另一个名字，各算各的。
CREATE TABLE IF NOT EXISTS pa_usage (
  src TEXT NOT NULL,
  day TEXT NOT NULL,              -- 本地日期
  session_id TEXT,
  tool TEXT NOT NULL,             -- codex / claude
  cwd TEXT NOT NULL DEFAULT '',
  fresh INTEGER NOT NULL DEFAULT 0,   -- 新算的输入
  cached INTEGER NOT NULL DEFAULT 0,  -- 缓存命中的输入
  output INTEGER NOT NULL DEFAULT 0,  -- 输出（含推理）
  PRIMARY KEY (src, day)
);
CREATE INDEX IF NOT EXISTS pa_usage_day ON pa_usage (day);
-- 以前扫过的文件没取 token：清掉“读过”的记号，下次扫的时候重读一遍（只读记录，表里的标记、报告不动）
DELETE FROM pa_files;
