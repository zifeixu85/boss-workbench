-- Codex 桌面版自己记的“看没看”和“归档没有”（本机 ~/.codex/state_5.sqlite，只读取）。NULL = 不知道（Claude Code、命令行调用的都没有）
ALTER TABLE pa_sessions ADD COLUMN seen INTEGER;
ALTER TABLE pa_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
