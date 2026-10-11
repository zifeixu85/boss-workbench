-- 002 大客户（crm）模块：在公共的客户表上加深客户档案。
-- 归属：大客户模块。以后要改表，新建 002_crm_02_xxx.sql 这样的文件，不要改本文件（已经跑过的迁移不会再跑）。
-- 金额：订单用“元”（零售和茶礼单价都是元，按元记账不丢精度）；累计消费由订单汇总，不另存。
-- 日期：YYYY-MM-DD；每年重复的日子（生日）写 --MM-DD。

-- 客户档案补充字段
ALTER TABLE clients ADD COLUMN segment TEXT;            -- 企业茶礼 / 门店老茶客 / 渠道合作 / 零售
ALTER TABLE clients ADD COLUMN key_account INTEGER NOT NULL DEFAULT 0; -- 1 = 大客户（林总亲自跟）
ALTER TABLE clients ADD COLUMN contact_name TEXT;       -- 联系人，如“周明远”
ALTER TABLE clients ADD COLUMN contact_title TEXT;      -- 联系人职务，如“行政负责人”
ALTER TABLE clients ADD COLUMN decision_maker TEXT;     -- 最后谁拍板，如“合伙人会议”
ALTER TABLE clients ADD COLUMN headcount INTEGER;       -- 公司人数（企业客户）
ALTER TABLE clients ADD COLUMN source_detail TEXT;      -- 线索来源的细节：谁介绍的、哪场展会、哪篇笔记
ALTER TABLE clients ADD COLUMN since TEXT;              -- 第一次合作 / 认识的日期
ALTER TABLE clients ADD COLUMN next_step TEXT;          -- 下一步要做什么（日期用 next_follow）

-- 每次沟通补充：和谁聊的、对方的顾虑。“答应了什么”单独记在 client_promises，方便追踪有没有兑现
ALTER TABLE interactions ADD COLUMN with_whom TEXT;
ALTER TABLE interactions ADD COLUMN concerns TEXT;

-- 订单：企业茶礼、门店消费、渠道月结都记在这里
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('企业茶礼','门店','线上','渠道月结')),
  occasion TEXT,                  -- 春节 / 中秋 / 年会 / 教师节 / 日常 / 月结
  item TEXT NOT NULL,             -- 商品或礼盒，如“经典双罐”
  qty INTEGER NOT NULL,           -- 份数 / 件数 / 袋数
  unit TEXT NOT NULL DEFAULT '份',
  unit_price REAL,                -- 单价（元）
  amount REAL NOT NULL,           -- 金额（元）
  status TEXT NOT NULL DEFAULT '已完成' CHECK (status IN ('进行中','已完成','已取消')),
  note TEXT,
  created_at TEXT NOT NULL
);

-- 答应客户的事：来自哪次沟通、哪天前要做到、做到没有
CREATE TABLE client_promises (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  interaction_id TEXT REFERENCES interactions(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  due TEXT,
  status TEXT NOT NULL DEFAULT '待兑现' CHECK (status IN ('待兑现','已兑现','取消')),
  done_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

-- 偏好与顾虑：一条一句话，按类别分
CREATE TABLE client_traits (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('口味','包装','送礼对象','禁忌','顾虑','习惯')),
  text TEXT NOT NULL,
  source TEXT,                    -- 从哪听来的，如“10/26 电话”
  created_at TEXT NOT NULL
);

-- 生日和重要日子
CREATE TABLE client_dates (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL,             -- 2027-01-15，或每年重复的 --11-12
  label TEXT NOT NULL,            -- 周明远生日 / 年会 / 合伙人会议
  kind TEXT NOT NULL CHECK (kind IN ('生日','纪念日','节日','公司节点')),
  who TEXT,                       -- 谁的日子
  note TEXT
);

-- 关怀建议：什么日子、送什么、怎么说
CREATE TABLE client_care (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  occasion TEXT NOT NULL,
  date TEXT,
  gift TEXT,
  message TEXT,                   -- 怎么说（草稿，林总自己改、自己发）
  status TEXT NOT NULL DEFAULT '建议' CHECK (status IN ('建议','已安排','已送出','不做')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_orders_client ON orders(client_id, date);
CREATE INDEX idx_promises_client ON client_promises(client_id, status, due);
CREATE INDEX idx_traits_client ON client_traits(client_id, kind);
CREATE INDEX idx_dates_client ON client_dates(client_id);
CREATE INDEX idx_care_client ON client_care(client_id, date);
