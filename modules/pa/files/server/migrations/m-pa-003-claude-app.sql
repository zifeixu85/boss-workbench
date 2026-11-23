-- Claude 桌面版给每个对话记的“在等你处理”（会话信息里的 status_category = blocked）。NULL = 不知道（命令行里开的 Claude Code 没有）
ALTER TABLE pa_sessions ADD COLUMN app_waiting INTEGER;
