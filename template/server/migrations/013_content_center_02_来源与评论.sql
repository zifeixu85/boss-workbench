-- 013-02 小红书内容中心（E3，2026-10-10 评审后）：每个选题记是哪一次“出选题”写的；后台任务分示例和现场；
-- 复盘重新生成时留下被替换的那一份；已发笔记的几条评论（评论区问题是选题来源）。归属：内容模块。
-- 文件名排在 013_content_center.sql 之后（'.' < '_'），014 之前。

-- 这个选题是哪一次出选题写的（xhs_jobs.id）；今天页按它分组，写清“谁、几点、用了多久”
ALTER TABLE xhs_pieces ADD COLUMN job_id TEXT;

-- 后台任务是示例数据（预置）还是现场跑的
ALTER TABLE xhs_jobs ADD COLUMN origin TEXT NOT NULL DEFAULT '现场';

-- 复盘“重新生成”时，被替换的那一份（JSON：summary worked change ideas learnings written_by origin created_at）
ALTER TABLE xhs_reviews ADD COLUMN previous TEXT;

-- 已发笔记的评论（从小红书后台导出的几条代表性的；不是全部）
CREATE TABLE xhs_comments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,           -- xhs_notes.id；不设外键，导入会重写笔记表
  author TEXT NOT NULL,            -- 评论的人（小红书昵称，虚构）
  text TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL,                -- YYYY-MM-DDTHH:mm
  reply TEXT,                      -- 账号的回复
  topic TEXT                       -- 后来成了哪个选题（xhs_pieces.id），没有就空
);
CREATE INDEX idx_comments_note ON xhs_comments(note_id, likes DESC);
CREATE INDEX idx_pieces_job ON xhs_pieces(job_id);
