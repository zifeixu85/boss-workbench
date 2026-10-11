-- 003 经营（biz）模块：5 个渠道每天的生意数据。数据由“数据源与导入”从各平台导出文件、门店日报导进来。
-- 归属：经营模块。以后要改表，新建 003_biz_02_xxx.sql，不要改本文件。
-- 金额：元（REAL）；比率在视图里算，不另存；日期 YYYY-MM-DD；企业茶礼不进这里（见客户订单 orders）。

-- 仓库：抖店爆款单独放在平台云仓，其余线上渠道从杭州总仓发，门店有自己的货架库存
CREATE TABLE warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,            -- douyin / tmall / xhs / wechat / store
  name TEXT NOT NULL,             -- 抖店 / 天猫 / 小红书店 / 视频号小店 / 门店
  kind TEXT NOT NULL CHECK (kind IN ('线上','门店')),
  owner TEXT,                     -- 运营负责人
  warehouse_id TEXT REFERENCES warehouses(id),
  sort INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE skus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('白茶','岩茶','花草茶','茶具')),
  spec TEXT,                      -- 规格，如“100g 罐装”
  price REAL NOT NULL,            -- 零售价（元）
  status TEXT NOT NULL DEFAULT '在售' CHECK (status IN ('在售','待上线','停售')),
  launch_date TEXT,
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

-- 每渠道每天一行：只存平台直接给的数，转化率、客单价、退款率、ROI、新客占比在视图里算
CREATE TABLE channel_daily (
  date TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  gmv REAL NOT NULL,              -- 成交额（元）
  orders INTEGER NOT NULL,        -- 订单数
  visitors INTEGER NOT NULL,      -- 访客数（门店是进店人数）
  refund_amount REAL NOT NULL DEFAULT 0,  -- 当天退款金额（元）
  refund_orders INTEGER NOT NULL DEFAULT 0,
  ad_spend REAL NOT NULL DEFAULT 0,       -- 推广花费（元）
  ad_gmv REAL NOT NULL DEFAULT 0,         -- 推广带来的成交额（元）
  new_buyers INTEGER NOT NULL DEFAULT 0,  -- 新客人数
  old_buyers INTEGER NOT NULL DEFAULT 0,  -- 老客人数
  PRIMARY KEY (date, channel_id)
);

CREATE VIEW channel_daily_v AS
SELECT d.*,
  ROUND(CASE WHEN d.visitors > 0 THEN d.orders * 100.0 / d.visitors END, 2) AS conv_rate,      -- 转化率 %
  ROUND(CASE WHEN d.orders > 0 THEN d.gmv / d.orders END, 1) AS aov,                            -- 客单价 元
  ROUND(CASE WHEN d.gmv > 0 THEN d.refund_amount * 100.0 / d.gmv END, 1) AS refund_rate,        -- 退款率 %（退款金额 / 成交额）
  ROUND(CASE WHEN d.ad_spend > 0 THEN d.ad_gmv / d.ad_spend END, 2) AS roi,                     -- 推广 ROI
  ROUND(CASE WHEN d.new_buyers + d.old_buyers > 0 THEN d.new_buyers * 100.0 / (d.new_buyers + d.old_buyers) END, 1) AS new_share -- 新客占比 %
FROM channel_daily d;

-- 流量来源构成（每渠道每天按来源拆访客）
CREATE TABLE channel_traffic (
  date TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  source TEXT NOT NULL,           -- 抖店：直播/短视频/商城/搜索；天猫：搜索/推荐/推广/会员；小红书店：笔记/直播/搜索/店铺；视频号：直播/短视频/私域；门店：路过进店/会员复购/朋友介绍/线上引流
  visitors INTEGER NOT NULL,
  PRIMARY KEY (date, channel_id, source)
);

-- 商品销售（每渠道每天每个 SKU）：商品排行从这里算
CREATE TABLE channel_products (
  date TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  sku_id TEXT NOT NULL REFERENCES skus(id),
  units INTEGER NOT NULL,
  gmv REAL NOT NULL,
  PRIMARY KEY (date, channel_id, sku_id)
);

-- 退款原因（按退款发生的日子记）
CREATE TABLE channel_refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  reason TEXT NOT NULL,           -- 不想要了 / 口味不喜欢 / 物流太慢 / 运输破损 / 少件漏发 / 质量问题 / 其他
  sku_id TEXT REFERENCES skus(id),
  orders INTEGER NOT NULL,
  amount REAL NOT NULL,
  batch TEXT                      -- 发货批次，如“10/23 发货”
);

-- 推广计划（每渠道每天每个计划）
CREATE TABLE channel_ads (
  date TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  campaign TEXT NOT NULL,
  spend REAL NOT NULL,
  clicks INTEGER NOT NULL,
  gmv REAL NOT NULL,
  bid REAL,                       -- 平均出价（元 / 点击）
  PRIMARY KEY (date, channel_id, campaign)
);

-- 库存（当前）：近 7 天日均销量和可售天数由 channel_products 现算，不另存
CREATE TABLE inventory (
  sku_id TEXT NOT NULL REFERENCES skus(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  stock INTEGER NOT NULL,
  in_transit INTEGER NOT NULL DEFAULT 0,  -- 已下单在路上的
  safety_days INTEGER NOT NULL DEFAULT 7, -- 少于几天算告急
  updated_at TEXT NOT NULL,
  PRIMARY KEY (sku_id, warehouse_id)
);

-- 运营动作记录：改价、改出价、发货、活动……找异常原因时对着看
CREATE TABLE biz_ops_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,               -- YYYY-MM-DDTHH:mm
  channel_id TEXT REFERENCES channels(id),
  who TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('出价','价格','发货','活动','库存','上新','其他')),
  action TEXT NOT NULL,
  note TEXT
);

CREATE INDEX idx_daily_channel ON channel_daily(channel_id, date);
CREATE INDEX idx_products_sku ON channel_products(sku_id, date);
CREATE INDEX idx_refunds_channel ON channel_refunds(channel_id, date);
CREATE INDEX idx_ops_at ON biz_ops_log(at);
