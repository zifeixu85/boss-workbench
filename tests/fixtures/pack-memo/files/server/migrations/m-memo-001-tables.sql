-- 接手：900_old_memo.sql
-- 备忘的表。测试里先假装老版本已经用 900_old_memo.sql 建过这张表：这份不能再建一遍（再建会报“表已存在”）。
CREATE TABLE memo_items (id TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT '');
