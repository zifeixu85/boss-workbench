-- 个人助理模块：本机对话记录的元信息、产出的文件路径、用户在工作台上点过的标记、登记过的报告。
-- 只存元信息（标题、所在文件夹、时间、第一句摘要、写文件的路径），不存对话正文；这些表删了可以重新扫出来，pa_marks 和 pa_reports 除外。

CREATE TABLE IF NOT EXISTS pa_sessions (
  id TEXT PRIMARY KEY,            -- 工具:对话编号，如 codex:01a2…
  tool TEXT NOT NULL,             -- codex / claude
  sid TEXT NOT NULL,
  file TEXT NOT NULL,             -- 记录文件在哪（只读）
  cwd TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  title_from TEXT NOT NULL DEFAULT '',   -- 索引 / 文件 / 第一句
  first TEXT NOT NULL DEFAULT '', -- 第一句用户消息的摘要（限长、遮过像密钥的串）
  origin TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '对话',     -- 对话 / 子任务 / 脚本
  started_at TEXT NOT NULL DEFAULT '',
  last_at TEXT NOT NULL DEFAULT '',
  last_role TEXT NOT NULL DEFAULT '',
  turn_open INTEGER NOT NULL DEFAULT 0,
  asks INTEGER NOT NULL DEFAULT 0,
  aborted INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pa_sessions_last ON pa_sessions (last_at);

-- 扫过的记录文件：大小和修改时间没变就不再读
CREATE TABLE IF NOT EXISTS pa_files (
  file TEXT PRIMARY KEY,
  mtime REAL NOT NULL,
  size INTEGER NOT NULL,
  session_id TEXT
);

-- 产出：对话里写文件动作的路径，和图片目录里的图片。文件本身不搬不存
CREATE TABLE IF NOT EXISTS pa_outputs (
  id TEXT PRIMARY KEY,
  session_id TEXT,                -- 哪次对话产生的；图片目录里认不出对话的为空
  path TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 图片 / 文档 / 表格 / 网页 / 代码 / 其他
  action TEXT NOT NULL,           -- 新建 / 修改 / 生成
  source TEXT NOT NULL,           -- 对话 / 图片目录
  tool TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pa_outputs_at ON pa_outputs (at);
CREATE INDEX IF NOT EXISTS pa_outputs_session ON pa_outputs (session_id);

-- 用户在工作台上点过的：标已看、手动改状态、手动指给哪个对象。不改知识库，也不改对话记录
CREATE TABLE IF NOT EXISTS pa_marks (
  session_id TEXT PRIMARY KEY,
  read_at TEXT,
  status TEXT,
  status_at TEXT,                 -- 改状态时这个对话的最后活动时间：之后对话又动了，手动的就不算了
  object TEXT,                    -- 手动指的对象（知识库里的路径）；'-' = 手动指为“不归类”
  updated_at TEXT NOT NULL
);

-- AI 用命令登记进来的报告（文件在知识库 90-日志与报告/ 里）
CREATE TABLE IF NOT EXISTS pa_reports (
  path TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  registered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pa_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
