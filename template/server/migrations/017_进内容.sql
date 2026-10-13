-- 进内容先判断（2026-10-13）：待办写清谁做、从哪来；收件箱每条带 AI 的判断和建议去向，不只是一段原文
ALTER TABLE todos ADD COLUMN owner TEXT;      -- 谁做：空 = 老板自己；团队里的人名；“对方”= 在等对方
ALTER TABLE todos ADD COLUMN source TEXT;     -- 从哪来：材料路径、会议、哪天的对话
ALTER TABLE inbox ADD COLUMN kind TEXT;       -- 随手记 / 材料 / 后台（定时任务、导入自动进来的）
ALTER TABLE inbox ADD COLUMN judgement TEXT;  -- AI 的判断：这是什么、要不要紧
ALTER TABLE inbox ADD COLUMN suggest TEXT;    -- 建议去向和默认做法
ALTER TABLE inbox ADD COLUMN client_id TEXT;
ALTER TABLE inbox ADD COLUMN project_id TEXT;
ALTER TABLE inbox ADD COLUMN origin TEXT;     -- 原件在哪（知识库里的路径）
