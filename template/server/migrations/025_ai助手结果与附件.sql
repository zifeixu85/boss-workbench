-- AI 助手的回答下面的结果卡、生成的图、带的附件（2026-11-26，照 A梦 自用工作台）：
-- change_from / change_to：这一轮答的时候改动记录（changes）的编号范围，结果卡按它列出 AI 写了哪些、能不能撤回；
-- attachments_json：他这一句带的附件（存在数据库旁边的 对话附件/ 里）。生成的图记在 steps_json 的步骤上（image）。
ALTER TABLE assistant_messages ADD COLUMN change_from INTEGER;
ALTER TABLE assistant_messages ADD COLUMN change_to INTEGER;
ALTER TABLE assistant_messages ADD COLUMN attachments_json TEXT;
