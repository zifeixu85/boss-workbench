-- 提醒（公共，2026-10-12 加）：经营异常按“一段持续的时间”只提醒一次。seen_at 记这条异常最近一次还在的时间；
-- 连着几天都在不再提醒，消失两天以上又出现才算“新出现”（见 server/reminders/service.ts）。
ALTER TABLE reminders ADD COLUMN seen_at TEXT;
