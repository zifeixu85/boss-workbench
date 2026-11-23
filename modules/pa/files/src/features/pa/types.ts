// 接口返回的数据形状（服务端在 server/modules/pa/）
export type FocusClass = { name: string; folder: string; statuses: string[]; fields: string[]; confirmed: boolean }
export type Field = { key: string; value: string }
export type ObjectRow = {
  path: string; name: string; status: string; status_known: boolean; updated: string; confirm: string; privacy: string
  fields: Field[]; now: string; missing: string[]; type_mismatch: boolean; sessions: number; unread: number; last_at: string | null
}
export type FocusList = { class: FocusClass; items: ObjectRow[]; counts: Record<string, number>; problems: string[] }

export type SessionStatus = '进行中' | '在等我' | '做完未读' | '已看' | '停了'
export type Session = {
  id: string; tool: string; tool_name: string; kind: string; title: string; title_from: string; first: string; cwd: string; folder: string
  started_at: string; last_at: string; turns: number; status: SessionStatus; why: string; inferred: boolean
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
}
export type Outputs = { items: Output[]; total: number; counts: Record<string, number>; objects: { path: string; name: string; type: string }[]; tools: { tool: string; name: string }[] }

export type ObjectDetail = {
  class: FocusClass
  object: {
    name: string; path: string; type: string; status: string; updated: string; confirm: string; privacy: string; aliases: string[]; workdirs: string[]
    now: string; next: { text: string; done: boolean }[]; missing: string[]; fields_shown: Field[]
  }
  timeline: { kind: '往来' | 'AI'; date: string; at: string; title: string; sub: string; pending: boolean; session: string | null }[]
  sessions: Session[]; files: Output[]; files_total: number
  links: { path: string; name: string; type: string | null; to: string | null }[]
  backlinks: { path: string; name: string; type: string; to: string }[]
  kb_files: string[]
}

export type Stats = { from: string; to: string; sessions: number; done: number; unread: number; waiting: number; outputs: { total: number; images: number; files: number }; top: { name: string; n: number; object: boolean } | null }
export type ReportView = {
  kind: string; period: string; range: { from: string; to: string }; prev: string; next: string | null
  counts: Record<string, number>; periods: string[]
  report: { path: string; by: string; updated: string; confirm: string; sections: { title: string; text: string }[]; problems: string[]; registered_at: string | null } | null
  stats: Stats; prev_stats: Stats
}

export type RoleFile = { name: string; path: string; exists: boolean; updated: string; confirm: string; problems: string[] }
export type Role = { role: '总助' | '分身' | '合伙人'; name: string; folder: string; exists: boolean; files: RoleFile[]; complete: boolean; updated: string }
export type Roles = { base: string; exists: boolean; roles: Role[] }

export type CardData = { count: number; items: { id?: string; title: string; sub: string; at?: string; link?: string | null; to?: string; kind?: string }[] } | null
