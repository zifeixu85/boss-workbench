-- 提醒（公共，2026-10-12 加）：工作台后台服务按规则算出该提醒的事，每条只记一次、只弹一次。规则和弹法见 server/reminders/。
-- 待办加“到期时间”：只有日期的待办不单独弹，算进每天的汇总；填了时间的，到期前 1 小时提醒。
ALTER TABLE todos ADD COLUMN due_time TEXT;   -- HH:mm（本地时间），可以空着

CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,          -- 同一件事同一个时刻只有一条：todo:t_1:2026-10-27T15:30、alert:roi_tmall:2026-10-22、summary:2026-10-27
  kind TEXT NOT NULL,                -- 待办 / 日程 / 跟进 / 异常 / 数据源 / 汇总 / 测试
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,                         -- 点开去哪，如 /todos?todo=t_1
  at TEXT NOT NULL,                  -- 记下的时间（nowIso；演示模式下日期是演示日）
  via TEXT NOT NULL,                 -- 浏览器通知 / 系统通知 / 只记
  note TEXT,                         -- 只记的原因（免打扰、提醒已关、演示模式……）或系统通知出错的原文
  read_at TEXT
);
CREATE INDEX idx_reminders_at ON reminders(at);
