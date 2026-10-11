-- 工作台业务数据（公共部分）。知识（关于我/生意/资料/原始材料）不在这里，仍是 Markdown。
-- 金额单位：万元（REAL）；日期：YYYY-MM-DD；时间：YYYY-MM-DDTHH:mm（本地时间）
-- ABC茶社示例相对模板（2026-10-07 工作台v2）的改动：日程类型、项目阶段换成茶社用词；项目加负责人、目标、预算和里程碑；
-- 去掉了月度经营表和周报表（经营数据见 003_biz，周报模块没有搬过来）。新库从零建，所以直接改在这里。

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- 称呼，如“澜拓科技”“许国平”
  label TEXT,                      -- 补充说明，如“约 350 人 · 员工礼”
  kind TEXT NOT NULL DEFAULT '客户' CHECK (kind IN ('客户','伙伴')),
  stage TEXT NOT NULL DEFAULT '初次接触',
  source TEXT, city TEXT, phone TEXT, wechat TEXT,
  budget REAL,
  last_contact TEXT, next_follow TEXT,
  kb_path TEXT,                    -- 长背景笔记，指向知识库里的 MD
  tags TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE interactions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '微信',
  summary TEXT NOT NULL, next_step TEXT,
  actor TEXT NOT NULL DEFAULT '网页',
  created_at TEXT NOT NULL
);

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '需求确认' CHECK (stage IN ('需求确认','方案中','报价中','待签约','已签约','没成')),
  amount REAL, expected_close TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT '筹备' CHECK (stage IN ('筹备','进行中','收尾','已完成','暂停')),
  contract REAL,
  next_step TEXT, waiting_on TEXT, due TEXT, risk TEXT,
  owner TEXT,                      -- 负责人，如“林总；线上部分阿杰”
  goal TEXT,                       -- 想达到的结果
  budget REAL,                     -- 预算（万元）
  kb_path TEXT,                    -- 项目说明在知识库里的位置，如 06-项目/门店改造.md
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- 项目里程碑：关键日期和完成情况
CREATE TABLE project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '未开始' CHECK (status IN ('未开始','进行中','完成','延期')),
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start TEXT NOT NULL, end TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT '会面' CHECK (kind IN ('会面','品鉴','送货','内部','个人')),
  location TEXT,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  note TEXT, source TEXT NOT NULL DEFAULT '手动',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待办' CHECK (status IN ('待办','进行中','等别人','完成','取消')),
  priority TEXT NOT NULL DEFAULT '普通' CHECK (priority IN ('紧急','重要','普通')),
  due TEXT,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  note TEXT, done_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE receivables (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  milestone TEXT NOT NULL,          -- 定金 / 尾款 / 月结货款 / 寄卖结算
  amount REAL NOT NULL,
  due TEXT NOT NULL,
  received REAL NOT NULL DEFAULT 0,
  received_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('收入','支出')),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  receivable_id TEXT REFERENCES receivables(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL, source TEXT NOT NULL DEFAULT '网页',
  created_at TEXT NOT NULL, done_at TEXT, result TEXT
);

-- 谁在什么时候改了什么：网页、Codex（命令行）、导入脚本都记一笔
CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL, actor TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL, summary TEXT NOT NULL
);

CREATE INDEX idx_events_start ON events(start);
CREATE INDEX idx_todos_due ON todos(due);
CREATE INDEX idx_interactions_client ON interactions(client_id, date);
CREATE INDEX idx_receivables_due ON receivables(due);
CREATE INDEX idx_ledger_date ON ledger(date);
CREATE INDEX idx_milestones_project ON project_milestones(project_id, date);
