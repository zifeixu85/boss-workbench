-- 012 经营（biz）模块第二批表：AI 日报、日报设置、异常的处理状态、小红书店售后明细、门店时段客流、抖店云仓入仓预约。
-- 归属：经营模块（E2）。只加表，不改 003_biz.sql 里的表。以后再改表，新建 012_biz_02_xxx.sql。
-- 时间：YYYY-MM-DDTHH:mm（本地时间）；金额：元。

-- 经营日报：Codex 定时任务每天早上读工作台数据写好，用命令 biz-report-set 写回；网页只读
CREATE TABLE biz_reports (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,             -- 写的是哪一天的数（一般是昨天）
  written_at TEXT NOT NULL,       -- 几点写好的
  author TEXT NOT NULL,           -- 谁写的：Codex 定时任务 / Codex / 老板的称呼
  method TEXT NOT NULL,           -- 怎么来的：定时任务 / 命令行 / 手写
  title TEXT NOT NULL,
  body TEXT NOT NULL,             -- Markdown，按“## 昨天怎么样 / ## 哪里不对劲 / ## 可能的原因 / ## 建议”四段写
  created_at TEXT NOT NULL
);
CREATE INDEX idx_biz_reports_date ON biz_reports(date, written_at);

-- 日报设置（只有一行）：看哪些指标、跟谁比、多少算异常、写多长。异常规则和 Codex 写日报都按这里来
CREATE TABLE biz_report_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  metrics TEXT NOT NULL,          -- JSON 数组：gmv orders visitors conv_rate aov refund_rate ad_spend roi
  compare TEXT NOT NULL,          -- JSON 数组：prev（前一天）、last_week（上周同日）
  refund_mult REAL NOT NULL,      -- 退款率是近期平常的几倍算异常（2 = 高一倍）
  refund_min REAL NOT NULL,       -- 而且超过百分之几
  roi_min REAL NOT NULL,          -- 推广 ROI 低于多少算异常
  roi_drop REAL NOT NULL,         -- 或者比之前掉了百分之几
  stock_days REAL NOT NULL,       -- 库存可售天数少于几天
  gmv_drop REAL NOT NULL,         -- 某渠道成交比上周同日少百分之几
  length TEXT NOT NULL CHECK (length IN ('简短','标准','详细')),
  write_at TEXT NOT NULL,         -- 几点写（给 Codex 定时任务看的）
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- 异常的处理状态：异常本身由规则每天现算（service.ts 的 anomalies()），这里记谁在处理、处理到哪、AI 给的建议
CREATE TABLE biz_anomalies (
  id TEXT PRIMARY KEY,            -- 和规则算出来的 id 一致：refund_xhs、roi_tmall、stock_wh_dy_sku_yinzhen……
  kind TEXT NOT NULL,             -- 退款 / 推广 / 库存 / 成交
  channel_id TEXT REFERENCES channels(id),
  first_seen TEXT NOT NULL,       -- 规则第一次发现的日子
  title TEXT,                     -- 记下当时的说法：规则不再报的旧异常，靠这几列显示
  detail TEXT,
  status TEXT NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理','处理中','已处理')),
  owner TEXT,                     -- 谁跟
  note TEXT,                      -- 处理记录
  suggestions TEXT,               -- JSON 数组：建议（AI 写的）
  suggested_by TEXT,              -- 建议是谁写的，如“Codex 定时任务”
  suggested_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- 售后明细（目前只有小红书店导出了逐单的售后表）
CREATE TABLE biz_aftersales (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  order_no TEXT NOT NULL,
  applied_at TEXT NOT NULL,       -- 买家申请的时间
  sku_id TEXT REFERENCES skus(id),
  qty INTEGER NOT NULL DEFAULT 1,
  amount REAL NOT NULL,           -- 退款金额（元）
  reason TEXT NOT NULL,
  batch TEXT,                     -- 发货批次
  status TEXT NOT NULL CHECK (status IN ('待处理','退款中','已退款','已补发','已拒绝')),
  handler TEXT,                   -- 客服
  buyer_note TEXT                 -- 买家说的
);
CREATE INDEX idx_aftersales_channel ON biz_aftersales(channel_id, applied_at);

-- 门店每小时的进店人数和成交单数（宋姐的门店日报里按小时记）
CREATE TABLE biz_store_hourly (
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,          -- 10 = 10:00—11:00
  visitors INTEGER NOT NULL,
  orders INTEGER NOT NULL,
  members INTEGER NOT NULL DEFAULT 0, -- 其中会员单
  PRIMARY KEY (date, hour)
);

-- 云仓入仓预约（抖店云仓要提前 5 天约）
CREATE TABLE biz_inbound (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty INTEGER NOT NULL,
  booked_at TEXT,                 -- 哪天约的
  arrive_date TEXT,               -- 约好哪天入仓
  status TEXT NOT NULL CHECK (status IN ('已入仓','已预约','在途')),
  who TEXT,
  note TEXT
);
