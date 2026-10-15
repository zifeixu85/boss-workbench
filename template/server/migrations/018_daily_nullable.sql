-- Unknown optional values stay NULL. Historical zeros and audit JSON are copied unchanged.
DROP VIEW channel_daily_v;
CREATE TABLE channel_daily_nullable (
 date TEXT NOT NULL,
 channel_id TEXT NOT NULL REFERENCES channels(id),
 gmv REAL NOT NULL, orders INTEGER NOT NULL, visitors INTEGER NOT NULL,
 refund_amount REAL, refund_orders INTEGER, ad_spend REAL, ad_gmv REAL,
 new_buyers INTEGER, old_buyers INTEGER,
 PRIMARY KEY(date, channel_id)
);
INSERT INTO channel_daily_nullable SELECT * FROM channel_daily;
DROP TABLE channel_daily;
ALTER TABLE channel_daily_nullable RENAME TO channel_daily;
CREATE INDEX idx_daily_channel ON channel_daily(channel_id, date);
CREATE VIEW channel_daily_v AS
SELECT d.*,
  ROUND(CASE WHEN d.visitors > 0 THEN d.orders * 100.0 / d.visitors END, 2) AS conv_rate,      -- 转化率 %
  ROUND(CASE WHEN d.orders > 0 THEN d.gmv / d.orders END, 1) AS aov,                            -- 客单价 元
  ROUND(CASE WHEN d.gmv > 0 THEN d.refund_amount * 100.0 / d.gmv END, 1) AS refund_rate,        -- 退款率 %（退款金额 / 成交额）
  ROUND(CASE WHEN d.ad_spend > 0 THEN d.ad_gmv / d.ad_spend END, 2) AS roi,                     -- 推广 ROI
  ROUND(CASE WHEN d.new_buyers + d.old_buyers > 0 THEN d.new_buyers * 100.0 / (d.new_buyers + d.old_buyers) END, 1) AS new_share -- 新客占比 %
FROM channel_daily d;
-- NULL means legacy/unrecorded input provenance, never infer a missing field from an old zero.
ALTER TABLE data_batch_rows ADD COLUMN field_states_json TEXT;
