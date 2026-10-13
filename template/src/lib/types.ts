// 接口返回的数据形状（与 server/services 对应）
export type Client = {
  id: string; name: string; label: string | null; kind: '客户' | '伙伴'; stage: string
  source: string | null; city: string | null; phone: string | null; wechat: string | null
  budget: number | null; last_contact: string | null; next_follow: string | null
  kb_path: string | null; tags: string[]; note: string | null; created_at: string; updated_at: string
  open_amount?: number; open_deals?: number; last_summary?: string | null; follow_overdue?: number | null
  // 大客户模块（002_crm）加的字段
  segment?: string | null; key_account?: number; contact_name?: string | null; contact_title?: string | null; decision_maker?: string | null
  headcount?: number | null; source_detail?: string | null; since?: string | null; next_step?: string | null
}
export type Interaction = { id: string; client_id: string; date: string; channel: string; summary: string; next_step: string | null; actor: string; created_at: string }
export type Deal = { id: string; client_id: string; title: string; stage: string; amount: number | null; expected_close: string | null; updated_at: string; client_name?: string; client_label?: string | null; client_source?: string | null }
export type Risk = { level: '高' | '中'; text: string }
export type Milestone = { id: string; project_id: string; date: string; title: string; status: '未开始' | '进行中' | '完成' | '延期'; note: string | null; sort: number }
export type Project = {
  id: string; name: string; client_id: string | null; client_name: string | null; stage: string; contract: number | null
  next_step: string | null; waiting_on: string | null; due: string | null; risk: string | null; updated_at: string; outstanding: number; risks: Risk[]
  owner: string | null; goal: string | null; budget: number | null; kb_path: string | null
  milestones?: Milestone[]; next_milestone?: Milestone | null; milestones_done?: number
}
/** 知识库里某篇文档的位置：path 是找到的，expected 是档案里记的（可能还没建） */
export type KbNote = { path: string | null; expected: string | null }
export type CalEvent = {
  id: string; title: string; start: string; end: string | null; all_day: number; kind: string; location: string | null
  client_id: string | null; client_name: string | null; project_id: string | null; project_name: string | null; note: string | null; source: string
}
export type Todo = {
  id: string; title: string; status: string; priority: string; due: string | null; due_time?: string | null; client_id: string | null; client_name: string | null
  project_id: string | null; project_name: string | null; note: string | null; done_at: string | null; created_at: string; updated_at: string
  /** 谁做（空 = 老板自己；“对方”= 在等对方）、从哪来（2026-10-13） */
  owner?: string | null; source?: string | null
}
export type Receivable = {
  id: string; project_id: string | null; client_id: string | null; client_name: string | null; project_name: string | null
  milestone: string; amount: number; due: string; received: number; received_date: string | null; note: string | null
  outstanding: number; status: '已收清' | '部分收款' | '逾期' | '7天内到期' | '未到期'; overdue_days: number
}
export type Change = { id: number; at: string; actor: string; entity: string; entity_id: string; action: string; summary: string }
export type ClientDetail = { client: Client; interactions: Interaction[]; deals: Deal[]; projects: Project[]; todos: Todo[]; events: CalEvent[]; receivables: Receivable[] }
export type NavMode = 'simple' | 'complex' | 'top'
export type Theme = 'jade' | 'wood' | 'navy' | 'mono' | 'night'
/** owner 称呼、business 工作台名称（也当店名）；shop、xhs 是服务端按设置算好的店名和小红书账号名（没设置时是“我的店”“我的账号”），xhs_name 是设置里存的原值 */
export type Settings = { nav_mode: NavMode; theme: Theme; mobile_nav: 'tabs' | 'drawer'; owner: string; business: string; shop: string; xhs: string; xhs_name: string; today?: string; demo?: boolean; reminders?: RemindSettings
  /** 打开着的模块 id（shared/modules.ts）；老服务没有这个字段 = 全部打开 */
  modules?: string[] }

/** 提醒的设置（server/reminders/settings.ts）；改的时候 PATCH /settings 用 remind_on、notify_at、quiet_start、quiet_end、remind_demo_system */
export type RemindSettings = { on: boolean; notify_at: string; quiet_start: string; quiet_end: string; demo_system: boolean }
/** 一条提醒（reminders 表） */
export type Reminder = { id: number; key: string; kind: string; title: string; body: string; link: string | null; at: string; via: '浏览器通知' | '系统通知' | '只记'; note: string | null; read_at: string | null }
export type ReminderStatus = {
  settings: RemindSettings; demo: boolean; now: string; browsers: number; platform: 'mac' | 'windows' | 'other'
  system_supported: boolean; morning: string; now_via: Reminder['via']; now_note: string | null
}
export type RemindersData = { items: Reminder[]; unread: number; status: ReminderStatus }

export type FollowUps = {
  due: { id: string; name: string; label: string | null; stage: string; next_follow: string; overdue: number; last_contact: string | null; last_summary: string | null }[]
  waitingOn: { kind: string; id: string; title: string; who: string; since: string }[]
  waitingForMe: (Todo & { left: number })[]
}

export type Overview = {
  date: string
  /** 打开着的模块（服务端已按它算好；这里给页面决定显示哪些卡片） */
  modules?: string[]
  headline: { id: string; title: string; due: string | null; due_time?: string | null } | null
  events: CalEvent[]; upcoming: CalEvent[]
  todos: { today: Todo[]; week: Todo[]; open: number }
  follow: { due: FollowUps['due']; dueCount: number; waitingOn: FollowUps['waitingOn'] }
  risks: { id: string; name: string; client_name: string | null; risks: Risk[] }[]
  cash: { outstanding: number; overdue: { amount: number; count: number }; due_30: number; month: { m: string; inflow: number; outflow: number }; overdueList: Receivable[]; dueSoon: Receivable[] }
  changes: Change[]
  // 业务模块给今日页的数据（各模块出错时为空，错误写在 module_errors）
  sales: SalesSummary | null
  alerts: Alert[]
  key_clients: FocusClient[]
  xhs: XhsToday | null
  module_errors: { module: string; error: string }[]
  /** 提醒页没读的条数（菜单角标）、数据源有几个（数据异常面板的空状态用）。10-12 加 */
  reminders_unread?: number
  source_count?: number
}

/** 经营：某一天各渠道的成绩单（server/modules/biz/service.ts 的 summary()） */
export type SalesChannel = {
  id: string; name: string; kind: string; owner: string; gmv: number | null; orders: number | null; visitors: number | null
  conv_rate: number | null; aov: number | null; refund_rate: number | null; roi: number | null; ad_spend: number | null; new_share: number | null
  vs_prev: number | null; vs_last_week: number | null
}
export type SalesSummary = {
  date: string; channels: SalesChannel[]
  total: { gmv: number; orders: number; refund_amount: number; ad_spend: number; ad_gmv: number; vs_prev: number | null; vs_last_week: number | null; refund_rate: number | null; roi: number | null }
}
/** 数据异常提醒：经营规则算出来的 + 数据源出问题的 */
export type Alert = { id: string; level: '高' | '中'; module: 'biz' | 'data'; kind: string; channel_id: string | null; title: string; detail: string; cause: string | null; since: string | null; link: string }
/** 今天该跟进的大客户（server/modules/crm/service.ts 的 focus()） */
export type FocusClient = {
  id: string; name: string; label: string | null; stage: string; contact: string | null; contact_title: string | null
  next_follow: string | null; next_step: string | null; total_spent: number; open_amount: number; score: number; reasons: string[]
}
/** 小红书今天发什么（server/modules/content/service.ts 的 todayPlan()） */
export type XhsToday = {
  date: string
  posts: { id: string; time: string | null; title: string; status: string; draft_id: string | null; pillar_name: string | null; cover_text: string | null; draft_status: string | null; memo: string | null }[]
  upcoming: { date: string; time: string | null; title: string; status: string }[]
  topics: { id: string; title: string; source: string; reason: string; pillar_name: string | null; status: string }[]
  topics_total: number
  account: { followers: number | null; followers_7d: number | null; stats_through: string | null }
}

export type CashSummary = {
  as_of: string; month: { m: string; inflow: number; outflow: number }; outstanding: number
  overdue: { amount: number; count: number }; due_30: number; avg_monthly_expense: number
  aging: { bucket: string; amount: number }[]; forecast: { week: string; label: string; amount: number }[]
  flow: { m: string; inflow: number; outflow: number }[]
}
export type LedgerRow = { id: string; date: string; direction: '收入' | '支出'; category: string; amount: number; client_name: string | null; project_name: string | null; note: string | null }

export type KbNode = { name: string; path: string; type: 'dir' | 'file'; children?: KbNode[]; updated?: string }
export type InboxItem = {
  id: string; text: string; source: string; created_at: string; done_at: string | null; result: string | null
  /** 2026-10-13 起：随手记 / 材料 / 后台；AI 的判断、建议去向、关联的客户和项目、原件在哪 */
  kind?: string | null; judgement?: string | null; suggest?: string | null; origin?: string | null
  client_id?: string | null; client_name?: string | null; project_id?: string | null; project_name?: string | null
}
export type SearchHit = { type: 'client' | 'project' | 'todo' | 'event'; id: string; title: string; sub: string }
