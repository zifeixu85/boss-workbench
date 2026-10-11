// 经营数据新鲜度：每个渠道的数据从哪个数据源来、几点导进来、截至哪天、有没有按时。归属：经营模块。
// 只读“数据源与导入”模块的 data_sources / import_runs 两张表，不改它们。
import { all } from '../../db.ts'
import { today, addDays } from '../../services/common.ts'
import { channels, latestDate } from './service.ts'

/** 渠道 → 数据源（数据源 ID 见 seed/data.ts） */
export const SOURCE_OF: Record<string, string> = {
  douyin: 'src_douyin', tmall: 'src_tmall', xhs: 'src_xhs_shop', wechat: 'src_wechat', store: 'src_store',
}
export const REPORT_SOURCE = 'src_codex'

export type SourceRow = {
  id: string; name: string; kind: string; schedule: string; owner: string | null; status: string
  last_run_at: string | null; last_ok_at: string | null; next_run_at: string | null; data_through: string | null; note: string | null
}

export type ChannelFreshness = {
  channel_id: string; channel_name: string; source_id: string; source_name: string | null; schedule: string | null; owner: string | null
  status: string; last_ok_at: string | null; data_through: string | null; late: boolean; reason: string | null
}

function sourceRows(): Map<string, SourceRow> {
  try {
    return new Map(all<SourceRow>('SELECT id, name, kind, schedule, owner, status, last_run_at, last_ok_at, next_run_at, data_through, note FROM data_sources').map((s) => [s.id, s]))
  } catch {
    return new Map() // 数据源模块没装：只按经营数据本身判断
  }
}

/** 渠道数据最后一天（channel_daily 里实际有数的那天） */
function throughByChannel() {
  return new Map(all<{ channel_id: string; d: string }>('SELECT channel_id, MAX(date) AS d FROM channel_daily GROUP BY channel_id').map((r) => [r.channel_id, r.d]))
}

export function freshness() {
  const t = today()
  const expected = addDays(t, -1) // 早上导的是昨天的数；门店当晚报当天的，到第二天早上也是“昨天”
  const src = sourceRows()
  const through = throughByChannel()
  const list: ChannelFreshness[] = channels().map((c) => {
    const sid = SOURCE_OF[c.id]
    const s = sid ? src.get(sid) : undefined
    const dataThrough = through.get(c.id) ?? null
    const behind = !dataThrough || dataThrough < expected
    const bad = s ? s.status === '超时' || s.status === '失败' : false
    const reason = bad ? (s?.note ?? `数据源${s?.status}`) : behind ? `数据只到 ${dataThrough ?? '—'}，昨天的还没进来` : null
    return {
      channel_id: c.id, channel_name: c.name, source_id: sid ?? '', source_name: s?.name ?? null, schedule: s?.schedule ?? null, owner: s?.owner ?? null,
      status: s?.status ?? (behind ? '超时' : '正常'), last_ok_at: s?.last_ok_at ?? null, data_through: dataThrough, late: bad || behind, reason,
    }
  })
  const report = src.get(REPORT_SOURCE) ?? null
  const todays = list.map((x) => x.last_ok_at).filter((x): x is string => !!x && x.slice(0, 10) === t).sort()
  return {
    today: t, expected, data_through: latestDate(), channels: list, late: list.filter((x) => x.late),
    first_import_at: todays[0] ?? null, last_import_at: todays.at(-1) ?? null,
    report_source: report ? { id: report.id, name: report.name, schedule: report.schedule, status: report.status, last_ok_at: report.last_ok_at } : null,
  }
}

export type ImportRun = {
  id: string; source_id: string; source_name: string; started_at: string; finished_at: string | null; status: string
  file_name: string | null; data_date: string | null; rows_total: number | null; rows_ok: number | null; rows_failed: number | null; actor: string; message: string | null
}

/** 某几个渠道、某段日子的数据是哪几次导入进来的 */
export function runsFor(channelIds: string[], from: string, to: string): ImportRun[] {
  const ids = channelIds.map((c) => SOURCE_OF[c]).filter(Boolean)
  if (!ids.length) return []
  try {
    const marks = ids.map((_, i) => `:s${i}`).join(', ')
    const p = Object.fromEntries(ids.map((id, i) => [`s${i}`, id]))
    return all<ImportRun>(`SELECT r.id, r.source_id, s.name AS source_name, r.started_at, r.finished_at, r.status, r.file_name, r.data_date, r.rows_total, r.rows_ok, r.rows_failed, r.actor, r.message
      FROM import_runs r JOIN data_sources s ON s.id = r.source_id
      WHERE r.source_id IN (${marks}) AND r.data_date BETWEEN :f AND :t ORDER BY r.data_date DESC, r.started_at DESC`, { ...p, f: from, t: to })
  } catch {
    return []
  }
}
