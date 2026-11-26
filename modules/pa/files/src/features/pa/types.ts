// 接口返回的数据形状（服务端在 server/modules/pa/）
export type FocusClass = { name: string; folder: string; statuses: string[]; fields: string[]; links: string[]; icon: string; rename: Record<string, string>; confirmed: boolean
  /** 每个叫法归哪个阶段（未开始、进行中、已结束）；空的是不分阶段的类 */
  stageOf?: Record<string, string>; statusField?: string }
export type Field = { key: string; value: string }
export type ObjectRow = {
  path: string; name: string; status: string; stage: string | null; status_known: boolean; updated: string; confirm: string; privacy: string
  fields: Field[]; now: string; missing: string[]; warnings: string[]; type_mismatch: boolean; sessions: number; unread: number; last_at: string | null
}
export type FocusList = { class: FocusClass; items: ObjectRow[]; counts: Record<string, number>; stages: Record<string, number> | null; problems: string[] }

export type SessionStatus = '进行中' | '在等我' | '做完未读' | '做完了' | '没做完'
export type Session = {
  id: string; tool: string; tool_name: string; kind: string; title: string; title_from: string; first: string; cwd: string; folder: string
  started_at: string; last_at: string; turns: number; status: SessionStatus; why: string; inferred: boolean; manual: boolean
  object: { path: string; name: string; type: string; by: string } | null
  link: string | null; resume: string | null; outputs: number
  /** 归到哪个助理（约定 11.11；只有进展接口给） */
  assistant?: AssistantLink | null
}
export type Progress = {
  sessions: Session[]; counts: Record<string, number>; scanned_at: string | null; left: number; errors: string[]; scanning?: boolean
  sources: { tool: string; name: string; dir: string; found: boolean }[]
  rules: { running_min: number; stale_days: number; done_hours: number; scan_days: number }
  objects: { path: string; name: string; type: string }[]
}

export type Output = {
  id: string; name: string; path: string; folder: string; kind: string; action: string; at: string; tool: string; tool_name: string
  session: { id: string; title: string; link: string | null } | null
  object: { path: string; name: string; type: string } | null
  exists: boolean
  width?: number | null; height?: number | null
}
export type Outputs = { items: Output[]; total: number; counts: Record<string, number>; gone: number; objects: { path: string; name: string; type: string }[]; tools: { tool: string; name: string }[]; assistants: { key: string; name: string; avatar: string }[] }

export type ObjectDetail = {
  class: FocusClass
  object: {
    name: string; path: string; type: string; status: string; updated: string; confirm: string; privacy: string; aliases: string[]; workdirs: string[]
    now: string; next: { text: string; done: boolean }[]; missing: string[]; warnings: string[]; fields_shown: Field[]
    /** 老板自己的写法：读不到的“现在”“下一步”不显示 */
    own?: boolean
    /** 开头里其余的字段（作品的“工作台: xhs-piece:<编号>”从这里取） */
    fields?: Record<string, string>
  }
  timeline: { kind: '往来' | 'AI'; date: string; at: string; title: string; sub: string; pending: boolean; session: string | null }[]
  sessions: Session[]; files: Output[]; files_total: number
  links: { path: string; name: string; type: string | null; to: string | null }[]
  backlinks: { path: string; name: string; type: string; to: string }[]
  kb_files: string[]
}

export type Stats = { from: string; to: string; sessions: number; done: number; unread: number; waiting: number; outputs: { total: number; images: number; files: number }; top: { name: string; n: number; object: boolean } | null }
export type ReportView = { on: string[]; kind: null } | {
  on: string[]; kind: string; period: string; range: { from: string; to: string }; prev: string; next: string | null
  counts: Record<string, number>; periods: string[]
  report: { path: string; by: string; updated: string; confirm: string; sections: { title: string; text: string }[]; problems: string[]; registered_at: string | null } | null
  stats: Stats; prev_stats: Stats
  /** 报告模板：这种报告有哪几节、每节用哪种块（按它显示，不认死标题） */
  template: { path: string; exists: boolean; sections: TemplateSection[]; problems: string[] }
  /** 这一期、上一期的数（“来源：工作台”的节画图用） */
  data: PeriodData; prev_data: PeriodData
}

export type Block = '一段话' | '要点' | '数字卡' | '柱图' | '线图' | '占比' | '表格' | '待你点头'
export type TemplateSection = { title: string; blocks: Block[]; source: 'AI' | '工作台' | '工作台+AI'; data: string[]; note: string; who: '总助' | '分身' }
export type PeriodCard = { value: number | null; unit: string }
export type PeriodData = {
  from: string; to: string
  cards: Record<string, PeriodCard>
  series: { 按天对话: { label: string; date: string; talks: number; done: number }[]; 按天token: { label: string; date: string; value: number }[]; 按小时: { label: string; value: number }[]; 按对象: { label: string; value: number }[] }
  lists: { 重复开对话: { 对象: string; 日期: string; 对话: number }[] }
}

export type RoleKind = '总助' | '内容' | '分身' | '合伙人'
export type RoleFileName = 'IDENTITY' | 'SOUL' | 'MEMORY' | '底稿' | '角色' | '规矩' | '记忆'
export type RoleFile = { name: RoleFileName; path: string; exists: boolean; optional?: boolean; updated: string; confirm: string; lines?: number; entries?: number; undated?: number; first?: string; last?: string; problems: string[] }
export type Role = { kind: RoleKind; name: string; display: string; folder: string; files: RoleFile[]; complete: boolean; updated: string; legacy: boolean; problems: string[] }
export type UserFile = { path: string; exists: boolean; updated: string; confirm: string; problems: string[] }
export type Roles = { base: string; exists: boolean; roles: Role[]; problems: string[]; user: UserFile }

export type CardData = { count: number; items: { id?: string; title: string; sub: string; at?: string; link?: string | null; to?: string; kind?: string }[] } | null

export type PulseDay = { date: string; label: string; done: number; talks: number; images: number; files: number }
export type Pulse = {
  days: PulseDay[]
  week: { from: string; done: number; talks: number; images: number; files: number; last: { done: number; outputs: number } }
  streak: number
  top: { name: string; n: number }[]
  total: { done: number; talks: number; images: number; files: number }
}

/** AI 用量（/m/pa/usage） */
export type Tokens = { fresh: number; cached: number; output: number; all: number }
export type Usage = {
  range: 'today' | '7d' | '30d'; label: string; from: string; to: string
  total: Tokens; cachedShare: number | null
  days: { date: string; all: number }[]
  top: { name: string; cwd: string; all: number }[]
  claude: Tokens | null
  limits: { used_percent: number; text: string; at: string } | null
  note: string
}

// ── 助理（约定 11.11：都叫助理，不分种类）
export type AssistantLink = { key: string; name: string; avatar: string; by: string }
export type AssistantBase = {
  key: string; name: string; avatar: string; duty: string; owns: string; notOwns: string; call: string; can: string[]; chief: boolean
  legacy: boolean; missing: string[]; folder: string; thread: string; mismatch: string[]
}
export type AssistantUsage = { today: number; d7: number; d30: number }
export type AssistantCard = AssistantBase & { recent: { id: string; title: string; status: SessionStatus; last_at: string } | null; sessions: number; usage: AssistantUsage; file_problems: number }
export type AssistantList = { base: string; exists: boolean; assistants: AssistantCard[]; unmatched: number; colleagues: boolean; problems: string[]; note: string }
export type Dispatch = { day: string; what: string; to: string; done: string; stage: string; note: string; open: boolean }
export type AssistantDetail = AssistantBase & {
  files: { name: string; path: string; call: string; problems: string[] }[]; folder_problems: string[]
  sessions: { id: string; title: string; status: SessionStatus; why: string; last_at: string; started_at: string; link: string | null; by: string; outputs: number; object: Session['object'] }[]
  dispatch: Dispatch[]; usage: AssistantUsage
  resident: { id: string; title: string; link: string | null } | null
  note: string
}
