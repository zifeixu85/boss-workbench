-- 归属：公共（定时任务，2026-10-18）。模块的“每天几点跑一次、电脑没开或者没赶上就补跑”，每跑一次记一行。
-- 以后要改表，新建 020_定时任务_02_xxx.sql，不要改本文件。
CREATE TABLE job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,                -- 模块编号.名字，比如 news.daily
  day TEXT NOT NULL,                   -- 算哪一天的（本地日期）
  trigger TEXT NOT NULL,               -- 定时 / 补跑 / 手动
  status TEXT NOT NULL,                -- 在跑 / 成功 / 失败
  started_at TEXT NOT NULL,
  finished_at TEXT,
  note TEXT                            -- 一句话结果，或者出错原因
);
CREATE INDEX job_runs_job_day ON job_runs (job_id, day);
