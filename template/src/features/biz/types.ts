// 经营模块接口返回的数据形状（server/modules/biz/*）。只在经营模块里用；今日页用的 SalesSummary、Alert 在 lib/types.ts。
import type { Alert } from '@/lib/types'

export type Metric = 'gmv' | 'orders' | 'visitors' | 'conv_rate' | 'aov' | 'refund_rate' | 'ad_spend' | 'roi'
export type Days = 7 | 14 | 30

export type Kpi = {
  key: Metric; label: string; unit: string; value: number | null; prev: number | null; last_week: number | null
  vs_prev: number | null; vs_last_week: number | null; delta_kind: 'pct' | 'pt' | 'abs'; spark: (number | null)[]; hint: string | null
}

export type Coverage = { expected_rows: number; present_rows: number; missing_rows: number; known: Record<string, number>; complete_fields: string[]; channel_ids: string[]; missing_channel_ids: string[]; note: string }

export type Metrics = Record<Metric, number | null> & { new_share: number | null; ad_gmv: number | null; refund_amount: number | null; coverage: Coverage }

export type ChannelFresh = {
  channel_id: string; channel_name: string; source_id: string; source_name: string | null; schedule: string | null; owner: string | null
  status: string; last_ok_at: string | null; data_through: string | null; late: boolean; reason: string | null
}
export type Freshness = {
  today: string; expected: string; data_through: string | null; channels: ChannelFresh[]; late: ChannelFresh[]
  first_import_at: string | null; last_import_at: string | null
  report_source: { id: string; name: string; schedule: string; status: string; last_ok_at: string | null } | null
}

export type AnomalyItem = Alert & {
  /** 短说法（和今日页一致）：退款率偏高 / 推广 ROI 掉了一半 / 有货快卖断了 / 成交比上周少 */
  short?: string
  channel_name: string | null; status: '待处理' | '处理中' | '已处理'; owner: string | null; note: string | null
  suggestions: string[]; suggested_by: string | null; suggested_at: string | null; first_seen: string | null
  updated_at: string | null; updated_by: string | null; active: boolean
  /** 还没处理完、但按现在的阈值规则不再报了 */
  quiet: boolean
}
export type AnomalyList = { date: string | null; active: AnomalyItem[]; history: AnomalyItem[] }

export type Reason = { title: string; tags: { label: string; value: string }[]; source: string; ops: string[]; text: string }
export type Evidence = {
  title: string; desc: string; unit: string; label: string; base_label: string | null; shape: 'line' | 'stock'
  series: { date: string; value: number | null; base?: number | null; proj?: number | null }[]; threshold: number | null; threshold_label: string | null; since: string | null
  marks: { date: string; op_id: string | null; label: string }[]; bands: { from: string; to: string; label: string }[]
  table: { title: string; columns: string[]; rows: (string | number | null)[][] } | null; note: string
}
export type Op = { id: string; at: string; channel_id: string | null; channel_name?: string | null; who: string; kind: string; action: string }
export type AnomalyDetail = AnomalyItem & { evidence: Evidence; reasons: Reason[]; ops: Op[]; todo: { title: string; note: string; priority: '重要' | '普通' } }

export type Report = {
  id: string; date: string; written_at: string; author: string; method: string; title: string; body: string; created_at: string
  lead: string; sections: { heading: string; body: string }[]
}

export type BizConfig = {
  metrics: Metric[]; compare: ('prev' | 'last_week')[]
  refund_mult: number; refund_min: number; roi_min: number; roi_drop: number; stock_days: number; gmv_drop: number
  length: '简短' | '标准' | '详细'; write_at: string; updated_at: string | null; updated_by: string | null
}

export type TableRow = Metrics & {
  id: string; name: string; kind: string; owner: string; share: number | null; daily_gmv: number | null; vs_prev_period: number | null; yesterday_gmv: number | null
  roi_last3: number | null; daily_gmv_days: number
}

export type KpiFlag = { id: string; channel_name: string }
export type Board = {
  date: string; days: Days; from: string; to: string; prev_from: string; prev_to: string; has_prev: boolean
  range_holiday_days: number; prev_holiday_days: number; holidays: { f: string; t: string }[]
  yesterday: Metrics & { prev: number | null; last_week: number | null }
  kpis: Kpi[]; kpi_flags: Record<string, KpiFlag[]>; last3_label: string
  trend: { date: string; gmv: number | null; orders: number | null }[]; trend_avg: number | null; trend_avg_days: number
  channels: { id: string; name: string }[]
  stacked: ({ date: string } & Record<string, number | null | string>)[]
  total: Metrics & { daily_gmv: number | null; daily_gmv_days: number; vs_prev_period: number | null; prev_gmv: number | null }
  table: TableRow[]
  anomalies: AnomalyList; report: Report | null; freshness: Freshness; config: BizConfig; rules_text: string
}

export type ImportRun = {
  id: string; source_id: string; source_name: string; started_at: string; finished_at: string | null; status: string
  file_name: string | null; data_date: string | null; rows_total: number | null; rows_ok: number | null; rows_failed: number | null; actor: string; message: string | null
}

export type AdWindow = { days: number; spend: number | null; gmv: number | null; clicks: number | null; per_day: number | null; expected_days: number; roi: number | null; cpc: number | null; bid: number | null }
export type Campaign = {
  campaign: string; spend: number | null; gmv: number | null; clicks: number | null; known_days: number; expected_days: number; roi: number | null; cpc: number | null; daily_spend: number | null
  bid: number | null; bid_changed: { at: string; who: string; action: string; from: number; to: number } | null
  shift: { base: AdWindow; now: AdWindow } | null; spark: (number | null)[]
}
export type InventoryRow = {
  sku_id: string; sku_name: string; sku_status: string; warehouse_id: string; warehouse_name: string; stock: number; in_transit: number
  safety_days: number; avg_daily: number; days_left: number | null; level: string
}
export type Aftersale = {
  id: string; order_no: string; applied_at: string; sku_id: string | null; sku_name: string | null; qty: number; amount: number
  reason: string; batch: string | null; status: string; handler: string | null; buyer_note: string | null
}
export type ChannelDay = {
  date: string; gmv: number | null; orders: number | null; visitors: number | null; conv_rate: number | null; aov: number | null
  refund_rate: number | null; refund_amount: number | null; ad_spend: number | null; ad_gmv: number | null; roi: number | null; new_share: number | null
}

type AdsSum = { spend: number | null; ad_gmv: number | null; per_day: number | null; roi: number | null; days: number; known_days: number; coverage: Coverage }
export type ChannelData = {
  channel: { id: string; name: string; kind: string; owner: string; warehouse_id: string; warehouse_name: string | null; warehouse_note: string | null }
  date: string; days: Days; from: string; to: string; prev_from: string; prev_to: string
  prev_holiday_days: number; range_holiday_days: number; has_prev: boolean; roi_line: number
  kpis: Kpi[]
  range: Metrics & { vs_prev_period: number | null; prev_gmv: number | null }
  ads_shift: { base: AdsSum; now: AdsSum; base_label: string; now_label: string } | null
  daily: ChannelDay[]
  traffic: { source: string; visitors: number; share: number | null; prev_share: number | null }[]
  products: { sku_id: string; name: string; category: string; price: number; units: number; gmv: number; share: number | null; vs_prev: number | null; spark: (number | null)[] }[]
  refunds: { reasons: { reason: string; orders: number; amount: number; prev_orders: number }[]; batches: { reason: string; sku: string | null; batch: string; orders: number; amount: number }[] }
  campaigns: Campaign[]
  inventory: { rows: InventoryRow[]; shared_with: string[] }
  ops: Op[]
  anomalies: { active: AnomalyItem[]; history: AnomalyItem[] }
  freshness: ChannelFresh | null
  runs: ImportRun[]
  extras: {
    aftersales: {
      list: Aftersale[]; open: { pending: number; refunding: number }; handlers: string[]
      batches: { batch: string; sku_name: string | null; tickets: number; refunded: number; refunded_amount: number; refunding: number; pending: number; pending_amount: number; resent: number; shipped: number | null; ship_note: string | null }[]
    } | null
    cloud: { lead_days: number; earliest: string; stock: (InventoryRow & { book_by: string | null; too_late: boolean })[]; inbound: { id: string; sku_id: string; sku_name: string; qty: number; booked_at: string | null; arrive_date: string | null; status: string; who: string | null; note: string | null }[] } | null
    store: {
      week_from: string; by_day: { label: string; days: number; visitors: number | null; gmv: number | null }[]
      holiday: { days: number; visitors: number | null; gmv: number | null } | null
      weekday_avg: { days: number; visitors: number | null; gmv: number | null }; weekend_avg: { days: number; visitors: number | null; gmv: number | null }
      daily: { date: string; holiday: boolean; orders: number | null; members: number | null; share: number | null }[]
      member_share: number | null; new_share: number | null; members: number | null; buyers: number | null
    } | null
    notice: {
      project: { id: string; name: string; kb_path: string | null }; event_id: string; from: string; to: string; days: number; reopen: string
      clash: { id: string; title: string; at: string }[]; notice: { title: string; date: string; status: string; note: string | null } | null; lost_per_day: number | null
    } | null
  }
}

export type Trace = {
  metric: Metric; label: string; unit: string; formula: string; note: string; from: string; to: string; days: number; ratio: boolean
  parts: { key: string; label: string }[]
  channels: { id: string; name: string; value: number | null; parts: Record<string, number | null>; coverage: Coverage; source_name: string | null; schedule: string | null; last_ok_at: string | null; late: boolean }[]
  excluded: string | null
  daily: { date: string; value: number | null; parts: Record<string, number | null>; coverage: Coverage; provenance: { channel_id: string; batch_id: string | null; field_states: Record<string, string> | null; note: string }[]; cells: (number | null)[] }[]
  total: { value: number | null; parts: Record<string, number | null>; coverage: Coverage }
  runs: ImportRun[]
}
