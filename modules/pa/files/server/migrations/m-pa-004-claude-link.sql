-- Claude 桌面版里这个对话的编号（local_…）：用来生成 claude://code/continue?session=… 跳回对话的链接
ALTER TABLE pa_sessions ADD COLUMN app_sid TEXT;
