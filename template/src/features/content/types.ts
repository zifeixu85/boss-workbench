// 小红书内容中心：接口返回的数据形状（对应 server/modules/content/*）。归属：小红书内容模块。
import type { CheckRule, CheckSource, CheckResult } from '@shared/xhs-check'

export type PieceStatus = '灵感池' | '已选' | '写稿中' | '待发布' | '已发布' | '已放弃'
export type Cover = { template: string; pad: string; tone: string }
export type DraftPage = { role: '封面' | '内页'; text: string; pad?: string | null }
export type Draft = {
  format: '图文' | '视频'; title: string; titles: string[]; cover_text: string; cover: Cover
  pages: DraftPage[]; body: string; tags: string[]; checks: { item: string; result: string }[]
}
export type Metrics = { impressions: number; reads: number; likes: number; saves: number; comments: number; new_followers: number; spend?: number }
/** 缩略图要画的：每页第一行（一周茶单的五格从这里来） */
export type PageLite = { role: '封面' | '内页'; text: string; pad?: string | null }

export type Piece = {
  id: string; title: string; angle: string | null; format: '图文' | '视频'; pillar_id: string | null; pillar_name: string | null
  source: string; reason: string | null; ref: string | null; warn: string | null; status: PieceStatus; topic_date: string | null; job_id: string | null; created_by: string
  scheduled_date: string | null; scheduled_time: string | null; published_at: string | null; publish_url: string | null; note_id: string | null
  memo: string | null; start: { kind?: string; ref?: string; label?: string; text?: string } | null; sort: number; created_at: string; updated_at: string
  version: number | null; version_at: string | null; version_origin: string | null; ai: boolean
  draft: { title: string; cover_text: string; cover: Cover; pages: PageLite[]; tags: string[]; body_len: number } | null
  check: { blocks: number; warns: number } | null
  reads: number | null; likes: number | null; saves: number | null; comments: number | null; impressions: number | null; new_followers: number | null; stats_date: string | null
  paid_reads: number | null; paid_spend: number | null
  total: Metrics | null; boosted: boolean
}
export type VersionMeta = { id: string; version: number; origin: string; author: string | null; note: string | null; message_id: string | null; created_at: string; title: string; body_len: number; example: boolean }
export type AiCheck = { version: number; author: string | null; at: string; example: boolean; items: { item: string; result: string }[]; later: { version: number; origin: string; author: string | null; note: string | null }[] }
export type Comment = { id: string; author: string; text: string; likes: number; at: string; reply: string | null; topic: string | null; topic_title: string | null }
export type Related = { text: string; href: string; label: string }
export type PieceDetail = { piece: Piece; draft: Draft; version: number; has_draft: boolean; checks: CheckResult | null; ai_check: AiCheck | null; versions: VersionMeta[]; comments: Comment[]; related: Related[] }

export type Message = {
  id: string; piece_id: string; role: 'user' | 'ai'; author: string; text: string; status: 'running' | 'done' | 'failed' | 'stopped'; kind: string
  options: { field: string; items: { text: string; note: string }[]; chosen: number | null } | null
  refs: string[]; files_read: string[]; version: number | null; progress: string | null; error: string | null; duration_ms: number | null
  origin: '现场' | '示例'; created_at: string
}
export type StudioData = PieceDetail & { messages: Message[]; running: boolean }

export type Job = { id: string; kind: string; ref: string | null; who: string | null; status: 'running' | 'done' | 'failed' | 'stopped'; progress: string | null; error: string | null; result_count: number | null; duration_ms: number | null; started_at: string; finished_at: string | null; origin: '现场' | '示例' }
export type Reminder = { id: string; tone: 'info' | 'warn'; title: string; detail: string; action: { label: string; kind: 'topics' | 'piece' | 'link'; value: string } }
export type CenterToday = {
  date: string; weekday: string
  account: { name: string; red_id: string | null; followers: number | null; followers_7d: number | null; likes_saves: number | null; owner: string | null; through: string | null }
  main: PieceDetail | null; fallback: Piece | null
  week: { key: string; from: string; to: string; days: { date: string; weekday: string; is_today: boolean; items: { id: string; title: string; status: PieceStatus; time: string | null; pillar_name: string | null }[] }[] }
  topics: { date: string; items: Piece[]; groups: { job: Job | null; fresh: boolean; items: Piece[] }[]; warns: number; running: Job | null }
  reminders: Reminder[]; counts: Record<string, number>
}

export type NoteRow = {
  id: string; piece_id: string | null; title: string; kind: string; published_at: string; date: string; pillar_id: string | null; pillar_name: string | null
  cover_text: string | null; cover: Cover | null; pages: PageLite[]; stats_date: string | null; organic: Metrics | null; paid: Metrics | null; total: Metrics | null; boosted: boolean
}
type SumMetrics = Metrics & { notes: number; save_rate: number | null; median_rate: number | null }
export type DataPage = {
  from: string; to: string; days: number; through: string | null; rows: NoteRow[]
  summary: {
    organic: SumMetrics | null; paid: (SumMetrics & { cost_per_read: number | null; cost_per_follower: number | null }) | null; no_data: number
    prev: { from: string; to: string; organic: SumMetrics | null; paid: SumMetrics | null }; first_date: string | null
  }
  pillars: { id: string; name: string; notes: number; avg_saves: number | null; median_saves: number | null; median_rate: number | null; hits: { title: string; saves: number }[]; recent_14d: number }[]
  account_median_rate: number | null
  hits: { title: string; saves: number }[]
  weekly: { week: string; start: string; label: string; partial_from: string | null; posts: number; avg_engaged: number | null; with_data: number; spike: { title: string; saves: number } | null }[]
}
export type DailyRow = { day: number; date: string; organic_reads: number | null; paid_reads: number | null; organic_saves: number | null; likes: number; saves: number; reads: number; comments: number; new_followers: number; spend: number }
export type NoteDaily = { series: DailyRow[]; milestones: { day: number; date: string; state: 'ready' | 'waiting' | 'missing'; row: DailyRow | null }[]; through: string | null; age: number; takeaway: string | null }

export type FeedItem = { id: string; piece_id: string | null; title: string; cover_text: string | null; cover: Cover | null; pages: PageLite[]; likes: number | null; own: boolean; account: string }
export type Feed = { own: FeedItem[]; bench: FeedItem[] }

export type Learning = { rule: string; evidence: string; scope?: string; prior?: string | null; prior_path?: string | null; status: '待定' | '已存进知识库' | '不要'; saved_at?: string | null; kb_path?: string | null; number?: number | null }
export type Idea = { title: string; reason: string; pillar?: string | null; piece_id?: string | null }
export type Review = {
  id: string; week: string; date_from: string; date_to: string; summary: string | null; worked: string[]; change: string[]; ideas: Idea[]; learnings: Learning[]
  inputs: Record<string, unknown>; written_by: string; origin: '现场' | '示例'; duration_ms: number | null; created_at: string; updated_at: string
  previous: { summary: string | null; worked: string[]; change: string[]; written_by: string; origin: string; created_at: string } | null
}
export type WeekRow = { week: string; from: string; to: string; label: string; posts: number; state: '本周' | '未复盘' | '已复盘'; pending: number; written_by: string | null }
export type WeekMetrics = {
  week: string; from: string; to: string; label: string; through: string | null; posts: number; with_data: number; organic_reads: number; organic_saves: number; organic_likes: number
  new_followers: number; total_reads: number; total_saves: number; save_rate: number | null; paid_reads: number; spend: number; median_rate: number | null
  notes: { id: string; piece_id: string | null; title: string; date: string; kind: string; pillar_name: string | null; boosted: boolean; organic: Metrics | null; paid: Metrics | null; total: Metrics | null; cover_text: string | null; cover: Cover | null; pages: PageLite[] }[]
}
export type ReviewDetail = { metrics: WeekMetrics; prev: Omit<WeekMetrics, 'notes'>; review: Review | null; running: { id: string; progress: string | null; started_at: string } | null; last_error: string | null }

export type Kit = { skill: string | null; groups: { label: string; note: string; files: string[] }[]; data_note: string; last_review: string | null }
export type Starts = {
  recent: (Piece & { last_at: string })[]; topics: Piece[]
  notes: { id: string; piece_id: string | null; title: string; date: string; pillar_name: string | null; saves: number; reads: number; cover_text: string | null; cover: Cover | null; pages?: PageLite[] }[]
  teas: { name: string; kind: string; spec: string; price: string; status: string; note: string; secret: boolean }[]
  benchmarks: { id: string; account: string; title: string; cover_text: string | null; pad: string | null; likes: number | null; saves: number | null; comments: number | null; structure: string | null; borrow: string | null; saved_at: string }[]
}
export type CodexStatus = { available: boolean; detail: string; version: string | null; timeout_s: number; slow_s: number }
/** store_closed：门店停业的日子（服务端按项目里程碑、日程算的；没有就是 null） */
export type Rules = { rules: CheckRule[]; sources: CheckSource[]; today: string; store_closed?: { from: string; to: string } | null }
export type Pillar = { id: string; name: string; description: string | null }
