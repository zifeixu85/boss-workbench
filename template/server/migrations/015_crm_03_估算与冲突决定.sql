-- 015-03 大客户（crm）模块：商机分“谈过的”和“按去年估的”；和判断规则对不上的答应，林总怎么定的。归属：大客户模块（E5，2026-10-10 第二轮）。
-- 1) deals.estimated = 1：金额是工作台按去年的单估的，还没跟对方谈过（例如“2027 春节员工礼（按中秋 300 份估）”）。
--    在谈金额、客户等级只算 estimated = 0 的；估的单灰字、前面写“估”。basis 写怎么估的、为什么还不算谈过。
-- 2) client_promises.decision：标黄的答应林总定了没有。'例外' = 这次算例外（decision_note 写原因）；'改规则' = 规则该改了（已记进知识库 90-持续生长/待确认的发现.md）。
--    定了以后不再标黄，改成灰字“林总 10/27 定为例外：……”。
ALTER TABLE deals ADD COLUMN estimated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN basis TEXT;

ALTER TABLE client_promises ADD COLUMN decision TEXT;        -- 例外 / 改规则；空 = 还没定
ALTER TABLE client_promises ADD COLUMN decision_note TEXT;   -- 林总写的原因
ALTER TABLE client_promises ADD COLUMN decision_at TEXT;     -- 哪天定的
