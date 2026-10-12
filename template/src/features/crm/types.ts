// 大客户模块的数据形状（与 server/modules/crm/ 对应）。归属：大客户模块
import type { CalEvent, Client, Deal, Interaction, KbNote, Project, Receivable, Todo } from '@/lib/types'

export type Level = 'A' | 'B' | 'C'
export type Flag = '久未联系' | '有新材料' | '生日临近' | '有冲突待定' | '撞上门店停业'
export type Material = { path: string; title: string; date: string | null }

/** 客户列表的一行：公共字段 + 消费、等级、四个关键数、标签 */
export type ClientRow = Client & {
  salutation: string | null; key_account: number
  total_spent: number; spent_12m: number; spent_year: number; order_count: number; last_order: string | null; pending_orders: number
  open_amount: number; open_deals: number; est_amount: number; est_basis: string | null; last_summary: string | null; open_promises: number; conflict_promises: number; next_promise_due: string | null
  receivable_left: number; receivable_due: string | null
  pending_count: number; pending_date: string | null; pending_item: string | null; firm_amount: number; last_order_amount: number | null
  deal_title: string | null; deal_stage: string | null; deal_close: string | null
  /** 最近记下的一条顾虑（卡在哪） */
  concern: { text: string; source: string | null } | null
  /** 大客户却是 B / C：为什么（“在谈金额没定，先算 C”） */
  level_note: string | null
  follow_overdue: number | null; days_silent: number | null; level: Level; flags: Flag[]
  birthday: { label: string; date: string; days_left: number } | null
  materials: Material[]
}

export type ClientPromise = {
  id: string; client_id: string; interaction_id: string | null; text: string; due: string | null; status: '待兑现' | '已兑现' | '取消'
  done_at: string | null; note: string | null; who: string; to_whom: string | null; conflict: string | null; source_file: string | null; created_at: string
  /** 哪天说的（所属往来记录的日期） */
  said_on?: string | null; said_channel?: string | null
  /** 标黄的老板定了没有：例外 / 改规则 */
  decision?: '例外' | '改规则' | null; decision_note?: string | null; decision_at?: string | null
}
export type Order = { id: string; date: string; channel: string; occasion: string | null; item: string; qty: number; unit: string; unit_price: number | null; amount: number; status: string; note: string | null; room_fee?: boolean }
export type TraitKind = '口味' | '包装' | '送礼对象' | '禁忌' | '顾虑' | '习惯'
export type Trait = { id: string; kind: TraitKind; text: string; source: string | null }
export type KeyDate = { id: string; date: string; label: string; kind: string; who: string | null; note: string | null; next: string; days_left: number; recurring: boolean }
/** 本人 = 老板自己写的（显示时用设置里的称呼） */
export type AuthorKind = '定时任务' | '现场写' | '知识库' | '模板' | '本人'
export type Care = { id: string; client_id: string; occasion: string; date: string | null; gift: string | null; message: string | null; status: string; note: string | null; author: string | null; sent_at: string | null; author_kind?: AuthorKind }
export type Talk = Interaction & {
  with_whom: string | null; concerns: string | null; their_status: string | null; signals: string | null; source_file: string | null; promises: ClientPromise[]
}
export type FactKind = '身份与决策' | '真实诉求' | '决策信号' | '执行条件' | '沟通摘要'
export type Fact = { id: string; kind: FactKind; text: string; date: string | null; source: string | null; author: string | null; created_at: string }
export type Edit = { id: number; client_id: string; entity: string; entity_id: string | null; old_value: string | null; new_value: string | null; reason: string; actor: string; at: string; client_name?: string }

export type ClientExtra = Client & { salutation?: string | null }

/** 单个客户的完整档案（/api/crm/clients/:id） */
export type ClientProfile = {
  client: ClientExtra
  summary: {
    level: Level; flags: Flag[]; days_silent: number | null; spent_year: number; receivable_left: number; receivable_due: string | null
    birthday: ClientRow['birthday']; materials: Material[]; open_amount: number; pending_orders: number; est_amount: number; est_basis: string | null
    level_note: string | null; firm_amount: number
  }
  interactions: Talk[]; deals: CrmDeal[]; projects: Project[]; todos: Todo[]; events: CalEvent[]; receivables: Receivable[]
  orders: Order[]; promises: ClientPromise[]; traits: Trait[]; dates: KeyDate[]; care: Care[]; facts: Fact[]; edits: Edit[]
  follow_todo: string | null
  stats: {
    total_spent: number; spent_12m: number; spent_year: number; order_count: number; first_order: string | null; last_order: string | null; avg_order: number | null
    by_year: { year: string; amount: number; orders: number; partial: 'now' | 'first' | null; from_month: number | null }[]
    by_month: { month: string; amount: number; orders: number }[]
    room_fees: number
    by_occasion: { occasion: string; amount: number }[]
    by_item: { item: string; times: number; qty: number; unit: string; amount: number }[]
    each: { date: string; occasion: string | null; item: string; qty: number; unit: string; unit_price: number | null; amount: number }[]
    units: number
  }
  kb_note: KbNote
  /** 撞上门店停业的事（答应的、重要日子、日程、下次跟进） */
  clashes: Clash[]
  closure: Closure | null
}
export type Closure = { from: string; to: string; label: string; source: string | null }
export type Clash = { what: string; date: string; kind: '答应的事' | '重要日子' | '日程' | '下次跟进'; why: string; also: string[] }

export type CareItem = {
  key: string; client_id: string; client_name: string; label: string | null; segment: string | null; key_account: number; call: string
  kind: '关怀安排' | '生日' | '纪念日' | '立冬' | '久未联系'; date: string | null; days_left: number | null
  reason: string; also: string[]; basis: string[]
  care_id: string | null; occasion: string; gift: string | null; message: string | null; status: string; author: string; sent_at: string | null
  generated: boolean; note: string | null; days_silent: number | null; kinds: CareItem['kind'][]; author_kind: AuthorKind
  tag: string; basis_items: { kind: string; text: string; source: string | null }[]; overdue: { from: string; days: number } | null
}
export type SpringClient = {
  client_id: string; name: string; label: string | null; segment: string | null; key_account: number; stage: string
  last_contact: string | null; next_follow: string | null; next_step: string | null
  bought: { occasion: string; date: string; item: string; qty: number; unit: string; amount: number }[]
  deal: { title: string; stage: string; amount: number | null; estimated?: number } | null
}
export type CareRules = { file: string; found: boolean; confirm: string | null; rules: string[]; donts: string[] }
export type CareData = { items: CareItem[]; spring: { date: string; days_left: number; presale: string; hint: string; clients: SpringClient[] }; rules: CareRules }

export type InboxFile = {
  path: string; title: string; date: string | null; speakers: string | null; recorder: string | null
  client_id: string | null; client_name: string | null; guess_why: string | null; size: number; updated: string
  extraction: { id: string; status: string; started_at: string } | null; in_kb: boolean; prepared: boolean
}

export type CodexPromise = { who: string; to_whom: string; text: string; due: string; quote: string; conflict: string; rule: string; conflict_by?: string[] }
export type Conflict = { about: string; rule: string; rule_file: string; why: string; suggestion: string; by: string[] }
export type CodexExtract = {
  client: { name: string; sure: boolean; why: string }
  date: string; channel: string; with_whom: string; summary: string
  my_promises: CodexPromise[]; their_status: string; not_decided: boolean
  concerns: string[]; signals: string[]; next_steps: { text: string; due: string }[]; next_follow: { date: string; why: string }
  facts: { kind: string; text: string; date: string; who: string }[]
  conflicts: Omit<Conflict, 'by'>[]; deal_size: { qty: string; unit_price: string; why: string }; unsure: string[]
}
export type OpenCare = { id: string; occasion: string; date: string | null; message: string | null; author: string | null; status: string }
export type ExtractDeal = { id: string; title: string; stage: string; amount: number | null; estimated: number; basis: string | null }
export type KbHeader = { key: string; old: string | null; new: string }
export type KbEdit = { label: string; old: string; new: string }
export type KbAdd = { label: string; line: string }
/** 写回知识库的预览：开头几行、答应过的事、偏好、顾虑、往来记录；收件箱原件的备注 */
export type KbPreview = { ok: true; path: string; line: string; after: string | null; new_section: boolean; header: KbHeader[]; rows: string[]; edits: KbEdit[]; adds: KbAdd[]; inbox: { path: string; line: string } | null }
  | { ok: false; error: string; line: string; inbox: { path: string; line: string } | null }
export type Hint = { line: string; tags: string[] }
export type ExtractStatus = '提取中' | '待确认' | '已写入' | '超时' | '出错' | '不可用' | '放弃'
export type Extraction = {
  id: string; source_kind: '知识库收件箱' | '粘贴'; source_path: string | null; raw_text: string; client_id: string | null; status: ExtractStatus
  engine: string | null; model: string | null; error: string | null; started_at: string; finished_at: string | null; written_at: string | null
  kb_path: string | null; kb_line: string | null; kb_backup: string | null; kb_written_at: string | null
  result: CodexExtract | null; promises: CodexPromise[]; conflicts: Conflict[]
  client: { id: string; name: string; contact_name: string | null; next_follow: string | null; next_step: string | null; stage: string; kb_path: string | null } | null
  client_guess_id: string | null; is_new_client: boolean; open_promises: ClientPromise[]; open_todos: { id: string; title: string; due: string | null; status: string }[]
  open_care: OpenCare[]; deals: ExtractDeal[]; deal_hint: { qty: number; unit_price: number; amount: number; why: string } | null
  traits: { kind: string; text: string }[]; hints: Hint[]; closure: Closure | null
  prepared: { label: string; seconds: number; model: string | null } | null
  elapsed_s: number; running: boolean; timeout_s: number
  /** 提取中：Codex 做到哪一步了（第几秒、做什么；从它的运行日志认出来的） */
  progress?: { s: number; text: string }[]
  written: {
    summary: string; kb_error: string | null; confirmed_at: string; todo_ids: string[]; promise_ids: string[]; skipped_todos?: string[]
    kb?: { path: string; line: string; header: KbHeader[]; rows: string[]; backup: string; new_section?: boolean; edits?: KbEdit[]; adds?: KbAdd[] } | null
    findings?: { title: string; backup: string }[]; finding_error?: string | null; before?: unknown
    inbox?: { path: string; line: string } | null
  } | null
}
export type ExtractionBrief = Pick<Extraction, 'id' | 'source_kind' | 'source_path' | 'client_id' | 'status' | 'engine' | 'model' | 'error' | 'started_at' | 'finished_at' | 'written_at' | 'kb_path'> & { client_name: string | null }
export type CodexInfo = { available: boolean; timeout_s: number }
/** 商机（带“按去年估的”标记） */
export type CrmDeal = Deal & { estimated?: number; basis?: string | null }
