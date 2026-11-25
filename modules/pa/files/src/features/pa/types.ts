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
}
export type Progress = {
  sessions: Session[]; counts: Record<string, number>; scanned_at: string | null; left: number; errors: string[]
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
export type Outputs = { items: Output[]; total: number; counts: Record<string, number>; gone: number; objects: { path: string; name: string; type: string }[]; tools: { tool: string; name: string }[] }

export type ObjectDetail = {
  class: FocusClass
  object: {
    name: string; path: string; type: string; status: string; updated: string; confirm: string; privacy: string; aliases: string[]; workdirs: string[]
    now: string; next: { text: string; done: boolean }[]; missing: string[]; warnings: string[]; fields_shown: Field[]
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
