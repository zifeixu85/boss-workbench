// 数据源与导入模块：接口返回的数据形状（和 server/modules/data/ 对应）。归属：数据源与导入模块
export type FieldKey = 'date' | 'channel' | 'gmv' | 'orders' | 'visitors' | 'refund_amount' | 'refund_orders' | 'ad_spend' | 'ad_gmv' | 'new_buyers' | 'old_buyers'
export type NumKey = Exclude<FieldKey, 'date' | 'channel'>
export type Display = '正常' | '没按时更新' | '读取失败' | '没数据' | '停用'

export type Source = {
  id: string; name: string; kind: string; way: string; feeds: string; method: string; schedule: string; owner: string | null
  status: string; display: Display; reason: string | null
  last_run_at: string | null; last_ok_at: string | null; next_run_at: string | null; data_through: string | null; note: string | null
  channel_id: string | null; inbox_dir: string | null; runs_7d: number; problems_7d: number; last_status: string | null; last_message: string | null
  pending: number; rule: { id: string; name: string } | null
  sort: number; short: string; next_text: string; overdue_min: number; next_held: boolean; auto: string | null; realtime: boolean
  /** 这个渠道清掉、能放回的示例数据有几行 */
  sample_rows: number
  kb: { notes: number; latest: { path: string; at: string } | null } | null
  parts: { label: string; text: string; tone: 'ok' | 'warn' | 'danger' }[]
}
export type StripDay = { date: string; status: string | null; runs: number }
export type SourcesSummary = {
  fresh: { ok: number; total: number; through: string | null; behind: string[]; empty: string[] }
  runs_7d: { total: number; failed: number; partial: number; late: number }
  rules: { active: number; stopped: number; mine: number; missing: { id: string; name: string }[] }
  morning: { first: string; last: string; arrived: number; total: number; later: { name: string; at: string }[] } | null
  problems: string[]
}
export type Provenance = '预置' | '样例表' | '自己的表'

export type Run = {
  id: string; source_id: string; source_name: string; source_kind: string; started_at: string; finished_at: string | null
  status: '成功' | '部分成功' | '失败' | '超时' | '进行中'; file_name: string | null; data_date: string | null; date_from: string | null
  rows_total: number | null; rows_ok: number | null; rows_failed: number | null; actor: string; message: string | null
  detail: RunDetail | null; rule_id: string | null; rule_name: string | null; batch_id: string | null; origin: '示例' | '自己的'
  batch_status: '有效' | '已撤销' | '已清除' | null; batch_origin: string | null; batch_label: string | null; batch_file: string | null; batch_rows: number | null
  preset: boolean; provenance: Provenance; source_short: string
  /** 文件名带路径时，这份原件现在还在不在（预置记录多数没放原件） */
  file_exists: boolean
}
export type RunDetail = {
  缺少的列?: string[]; 多出来的列?: string[]; 拿不准的列?: string[]; 样例行?: Record<string, string>; 建议?: string; 表头?: string[]
  rows?: { 行: number; 商品?: string; 原因: string }[]; 有问题的行?: { 行: number; 原因: string }[]; 跳过的行?: { 行: number; 原因: string }[]
  新增?: number; 覆盖?: number; 一样?: number; 跳过?: number; 有问题?: number; 规则?: { id: string; name: string; action: string } | null
  sub?: string; meeting?: string; 第一次有数?: string[]
  /** 这次一起导的几张表：[表名, 几行, 单位] */
  表?: [string, number, string][]
}

export type Mapping = {
  id: string; source_id: string; source_name: string; source_field: string; target: string | null; target_label: string; transform: string | null
  sample: string | null; status: '已确认' | 'AI 建议' | '未匹配' | '忽略'; confidence: number | null; reason: string | null; updated_at: string
  suggested_by: string | null; suggested_at: string | null; decided_by: string | null; decided_at: string | null; suggested_target: string | null
}

export type NotesState = { pending: number; pending_cols: string[]; file: { rel: string; name: string; data_date: string | null; imported_at: string | null } | null; can_import: boolean }
export type SourceDetail = Source & { strip: StripDay[]; runs: Run[]; mappings: Mapping[]; rules: Rule[]; notes: NotesState | null }

export type RuleMap = { col: string; field: string | null; how?: string; by?: string; at?: string }
export type Rule = {
  id: string; source_id: string | null; platform: string; report: string; channel_id: string | null; target: 'channel_daily' | 'xhs_note_stats'
  signature: string[]; mapping: RuleMap[]; required: NumKey[] | FieldKey[]; date_format: string | null; amount_unit: '元' | '万元'
  status: '在用' | '停用'; origin: '示例' | '自己的'; file_path: string | null; created_at: string; created_by: string | null
  updated_at: string; last_used_at: string | null; use_count: number; note: string | null
  alert: { kind: '表头变了'; pending: number; source_id: string; source_display: string } | null
}

export type ColState = '已对上' | '拿不准' | '用不上'
export type Column = {
  index: number; header: string; samples: string[]; unit: '元' | '万元' | '%' | null
  field: FieldKey | null; state: ColState; how: '规则' | '旧规则' | '常见叫法' | '知识库' | '名字像' | 'Codex' | '你选的' | '没见过'; why: string
  by?: string; at?: string
}
export type Choices = {
  columns?: Record<string, { field: FieldKey | null; by: '你选的' | 'Codex' }>
  channel_id?: string | null; date_fmt?: string | null; amount_unit?: '元' | '万元'; ack_missing?: FieldKey[]
}
export type Analysis = {
  header_row: number; preamble: string[]; row_count: number
  recognized: { profile: string; platform: string; report: string; sure: boolean; reasons: string[] } | null
  rule: { id: string; name: string; matched: number; total: number; missing_cols: string[]; extra_cols: string[]; created: string; origin: string } | null
  retired: { id: string; name: string; used: number; total: number } | null
  channel_id: string | null; channel_from: string | null
  date: { index: number; fmt: string | null; label: string; year_inferred: boolean; auto: string | null } | null
  amount_unit: '元' | '万元'; amount_unit_from: string; sample_file: boolean; total_rows: number
  pick_one: { field: FieldKey; label: string; options: { index: number; header: string; samples: string[]; why: string }[]; suggested: number; why: string }[]
  derived: { field: FieldKey; label: string; how: string; from: FieldKey[] }[]
  columns: Column[]; counts: { matched: number; unsure: number; unused: number }
  required: { field: FieldKey; label: string; why: string }[]
  missing: { field: FieldKey; label: string; why: string; col?: string; canAck: boolean }[]
  blocking: string[]; target: 'channel_daily' | 'xhs_notes'
}
export type Values = Record<NumKey, number | null>
export type PreviewRow = { line: number; date: string; channel_id: string; values: Values; before: Values | null; status: '新增' | '覆盖' | '一样'; changed: NumKey[]; kept: NumKey[]; warnings: string[]; field_states: Record<NumKey, string> }
export type Problem = { line: number; date: string | null; channel_id: string | null; kind: '跳过' | '有问题'; reason: string }
export type Preview = {
  rows: PreviewRow[]; problems: Problem[]
  counts: { total: number; ok: number; new: number; update: number; same: number; skipped: number; bad: number; warned: number }
  all_same: boolean; same_from_samples: number; sample_channels: { id: string; name: string; rows: number }[]
  date_from: string | null; date_to: string | null; channels: { id: string; name: string; rows: number; date_from: string; date_to: string }[]
}
export type CodexAdvice = {
  ok: boolean; at: string; seconds: number; model: string | null; reason?: string; platform?: string | null; report?: string | null
  columns: { col: string; index: number; field: FieldKey | null; confidence: number; reason: string }[]
}
export type Batch = {
  id: string; origin: '示例' | '自己的'; label: string; file_name: string | null; date_from: string | null; date_to: string | null; rows: number
  status: '有效' | '已撤销' | '已清除'; created_at: string; created_by: string; undone_at: string | null; channel_id: string | null; source_id: string | null; rule_id: string | null
}
export type ImportResult = {
  batch: Batch; runs: { id: string; source_id: string; source_name: string; rows: number }[]
  rule: { id: string; name: string; action: '新存' | '更新' | '沿用' | '没存' } | null
  rows: number; new: number; update: number; same: number; problems: number; all_same: boolean; provenance: Provenance
  channels: { id: string; name: string; rows: number; date_from: string; date_to: string }[]; date_from: string | null; date_to: string | null
  series: { date: string; gmv: number | null }[]; problem_rows: { 行: number; 原因: string }[]
  days: number; gmv_total: number; sample_cleared: { id: string; name: string; rows: number }[]
}
export type DraftView = {
  draft: { id: string; file_name: string; file_size: number | null; encoding: string | null; status: '对字段' | '已导入' | '已放弃'; run_id: string | null; batch_id: string | null; rule_id: string | null; created_at: string; updated_at: string }
  table: { headers: string[]; rows: string[][]; row_count: number; preamble: string[] }
  choices: Choices; analysis: Analysis; codex: CodexAdvice | null; preview: Preview | null; result: ImportResult | null
}
export type Meta = { fields: { key: FieldKey; label: string; kind: string; hint: string }[]; channels: { id: string; name: string }[]; date_formats: { value: string; label: string }[] }
export type SampleStatus = {
  batches: { id: string; label: string; channel_id: string | null; channel: string | null; rows: number; status: string; range: string; cleared_rows: number }[]
  rows_live: number; rows_cleared: number; my_batches: number; cleared: boolean; cleared_channels: string[]; has_presets: boolean
}
export type UndoResult = { restored: number; removed: number; kept: number; empty_channels: { id: string; name: string; sample_rows: number }[] }
export type SampleFile = { name: string; size: number; title: string; note: string; channel: string | null; range: string; order: number }
