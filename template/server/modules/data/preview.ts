// 预览：按对好的字段把每一行读成“哪天、哪个渠道、各项多少”，挑出有问题的行（行号 + 原因），和工作台里已有的数比一比。
// 规矩：缺的数不当 0；同一天同一渠道按“日期 + 渠道”覆盖，不累加；数字和平常差太多的提醒核对，但不拦。归属：数据源与导入模块。
import { all } from '../../db.ts'
import { today, addDays, daysBetween } from '../../services/common.ts'
import { CHANNELS, CORE, FIELD, NUMERIC, TOTAL_ROW, channelByName, isTotalRow, parseDate, parseNumber, type FieldKey } from './fields.ts'
import type { Analysis } from './recognize.ts'
import type { Table } from './csv.ts'
import { md } from './time.ts'

export type CoreNum = 'gmv' | 'orders' | 'visitors'
export type DailyValues = Record<CoreNum, number> & Record<Exclude<FieldKey, 'date' | 'channel' | CoreNum>, number | null>
export type FieldState = 'provided' | 'derived' | 'empty' | 'absent' | 'kept_empty' | 'kept_absent'
type NumKey = keyof DailyValues
export type PreviewRow = {
  line: number; date: string; channel_id: string; values: DailyValues; before: DailyValues | null
  status: '新增' | '覆盖' | '一样'; changed: NumKey[]; kept: NumKey[]; warnings: string[]; field_states: Record<NumKey, FieldState>
}
export type Problem = { line: number; date: string | null; channel_id: string | null; kind: '跳过' | '有问题'; reason: string }
export type Preview = {
  rows: PreviewRow[]; problems: Problem[]
  counts: { total: number; ok: number; new: number; update: number; same: number; skipped: number; bad: number; warned: number }
  /** 能导的行和工作台里一模一样：导进去一个数都不会变 */
  all_same: boolean
  /** 一样的行里，有几行现在是预置示例数据（先清掉这个渠道的示例再看，就是“从无到有”） */
  same_from_samples: number
  /** 这些“一样”的行归哪几个渠道的预置示例（清的时候只清这几个渠道） */
  sample_channels: { id: string; name: string; rows: number }[]
  date_from: string | null; date_to: string | null
  channels: { id: string; name: string; rows: number; date_from: string; date_to: string }[]
}

const yuanText = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(1)} 万` : `${Math.round(n).toLocaleString('zh-CN')} 元`)
const valueText = (k: NumKey, n: number | null) => n === null ? '暂无' : (FIELD[k].kind === 'money' ? yuanText(n) : `${Math.round(n).toLocaleString('zh-CN')}`)

type Existing = Map<string, DailyValues>
function existingRows(keys: { date: string; channel_id: string }[]): Existing {
  if (!keys.length) return new Map()
  const dates = [...new Set(keys.map((k) => k.date))].sort()
  const rows = all<DailyValues & { date: string; channel_id: string }>(
    'SELECT * FROM channel_daily WHERE date BETWEEN :f AND :t', { f: dates[0], t: dates[dates.length - 1] })
  return new Map(rows.map((r) => {
    const v = Object.fromEntries(NUMERIC.map((k) => [k, r[k as NumKey] === null ? null : Number(r[k as NumKey])])) as DailyValues
    return [`${r.date}|${r.channel_id}`, v]
  }))
}

/** 每个渠道近 30 天的中位数（成交额、订单、访客），用来提醒“这个数和平常差太多” */
function usualByChannel(): Map<string, Record<'gmv' | 'orders' | 'visitors', number>> {
  const rows = all<{ channel_id: string; gmv: number; orders: number; visitors: number }>(
    "SELECT channel_id, gmv, orders, visitors FROM channel_daily WHERE date >= date(:t, '-30 days') AND date < :t", { t: today() })
  const by = new Map<string, typeof rows>()
  rows.forEach((r) => by.set(r.channel_id, [...(by.get(r.channel_id) ?? []), r]))
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  return new Map([...by.entries()].map(([c, xs]) => [c, { gmv: median(xs.map((x) => x.gmv)), orders: median(xs.map((x) => x.orders)), visitors: median(xs.map((x) => x.visitors)) }]))
}

export function buildPreview(table: Table, a: Analysis): Preview {
  const t = today()
  const cols = a.columns.filter((c) => c.state === '已对上' && c.field && c.field !== 'date' && c.field !== 'channel')
  const chCol = a.columns.find((c) => c.field === 'channel' && c.state === '已对上')
  const problems: Problem[] = []
  type Parsed = { line: number; date: string; channel_id: string; got: Partial<DailyValues>; empty: NumKey[]; warnings: string[] }
  const parsed: Parsed[] = []
  const seen = new Map<string, number>()

  for (const r of table.rows) {
    const rawDate = a.date ? r.cells[a.date.index] : ''
    if (TOTAL_ROW.test(rawDate.trim()) || isTotalRow(r.cells)) {
      problems.push({ line: r.line, date: null, channel_id: null, kind: '跳过', reason: `“${(TOTAL_ROW.test(rawDate.trim()) ? rawDate : r.cells.find((c) => TOTAL_ROW.test(c.trim())) ?? r.cells[0]).trim()}”这一行是汇总，工作台自己会加总，跳过` }); continue
    }
    const date = a.date?.fmt ? parseDate(rawDate, a.date.fmt, t) : null
    if (!date) { problems.push({ line: r.line, date: null, channel_id: null, kind: '有问题', reason: rawDate ? `日期“${rawDate}”认不出来` : '这一行没有日期' }); continue }
    if (date > t) { problems.push({ line: r.line, date, channel_id: null, kind: '有问题', reason: `日期 ${md(date)} 在今天之后` }); continue }
    const channel_id = chCol ? channelByName(r.cells[chCol.index]) : a.channel_id
    if (!channel_id) { problems.push({ line: r.line, date, channel_id: null, kind: '有问题', reason: `渠道“${chCol ? r.cells[chCol.index] : ''}”不认识（工作台有：${Object.values(CHANNELS).map((c) => c.name).join('、')}）` }); continue }
    const key = `${date}|${channel_id}`
    if (seen.has(key)) { problems.push({ line: r.line, date, channel_id, kind: '有问题', reason: `和第 ${seen.get(key)} 行是同一天同一渠道，重复了，只导第 ${seen.get(key)} 行` }); continue }

    const got: Partial<DailyValues> = {}
    const empty: NumKey[] = []
    const bad: string[] = []
    for (const c of cols) {
      const k = c.field as NumKey
      const raw = r.cells[c.index] ?? ''
      const unit = c.unit === '元' || c.unit === '万元' ? c.unit : FIELD[k].kind === 'money' ? a.amount_unit : null
      const n = parseNumber(raw, unit)
      if (n === null) { empty.push(k); continue }
      if (Number.isNaN(n)) { bad.push(`${FIELD[k].label}“${raw}”不是数`); continue }
      if (n < 0) { bad.push(`${FIELD[k].label}是负数（${raw}）`); continue }
      got[k] = FIELD[k].kind === 'count' ? Math.round(n) : n
    }
    // 按知识库口径算出来的字段（门店新客 = 单数 − 会员单数）
    for (const d of a.derived) {
      if (d.field === 'new_buyers' && got.orders != null && got.old_buyers != null) got.new_buyers = Math.max(0, got.orders - got.old_buyers)
    }
    const coreEmpty = empty.filter((k) => CORE.includes(k))
    if (bad.length) { problems.push({ line: r.line, date, channel_id, kind: '有问题', reason: bad.join('；') }); continue }
    if (coreEmpty.length) {
      const raw = r.cells[cols.find((c) => c.field === coreEmpty[0])!.index] || '空的'
      problems.push({ line: r.line, date, channel_id, kind: '有问题', reason: `${coreEmpty.map((k) => FIELD[k].label).join('、')}没有数（表里是“${raw}”），不能当 0，这一行先不导` })
      continue
    }
    seen.set(key, r.line)
    parsed.push({ line: r.line, date, channel_id, got, empty, warnings: [] })
  }

  const before = existingRows(parsed)
  const usual = usualByChannel()
  const rows: PreviewRow[] = []
  for (const p of parsed) {
    const prev = before.get(`${p.date}|${p.channel_id}`) ?? null
    const kept: NumKey[] = []
    const values = {} as DailyValues
    const field_states = {} as Record<NumKey, FieldState>
    for (const k of NUMERIC as NumKey[]) {
      if (p.got[k] !== undefined) {
        Object.assign(values, { [k]: p.got[k] })
        field_states[k] = a.derived.some((d) => d.field === k) ? 'derived' : 'provided'
        continue
      }
      const empty = p.empty.includes(k)
      const reason = empty ? `${FIELD[k].label}单元格为空` : `表里没有${FIELD[k].label}这一列`
      Object.assign(values, { [k]: prev ? prev[k] : null })
      field_states[k] = prev ? (empty ? 'kept_empty' : 'kept_absent') : (empty ? 'empty' : 'absent')
      if (prev) kept.push(k)
      p.warnings.push(prev ? `${reason}，沿用旧值 ${valueText(k, prev[k])}（不是本次新报的数）` : `${reason}，记为暂无，不当 0`)
    }
    const u = usual.get(p.channel_id)
    if (u) {
      for (const k of ['gmv', 'orders', 'visitors'] as const) {
        const m = u[k]
        if (m <= 0) continue
        const ratio = values[k] / m
        if (ratio >= 3 || ratio <= 1 / 3) p.warnings.push(`${FIELD[k].label} ${valueText(k, values[k])}，是平常（近 30 天中位数 ${valueText(k, m)}）的 ${ratio >= 1 ? `${ratio.toFixed(1)} 倍` : `${Math.round(ratio * 100)}%`}，核对一下`)
      }
    }
    if (p.channel_id !== 'store' && values.orders > values.visitors && values.visitors > 0) p.warnings.push('订单比访客还多，核对一下是不是两列对反了')
    // 日期要核对：今天的还没过完；离今天太远的多半是年份写错了（例如 2025-10-26）
    if (p.date === t) p.warnings.push('这是今天的数，今天还没过完、数不全；明早导昨天的表会覆盖它')
    else if (p.date < addDays(t, -60)) p.warnings.push(`这一天离今天 ${daysBetween(p.date, t)} 天，比近两个月还早，核对一下年份写没写错`)
    if (values.ad_gmv !== null && values.ad_gmv > 0 && values.ad_spend === 0 && !kept.includes('ad_spend')) p.warnings.push('有推广成交、推广花费却是 0')
    const changed = prev ? (NUMERIC as NumKey[]).filter((k) => prev[k] === null || values[k] === null ? prev[k] !== values[k] : Math.abs(prev[k]! - values[k]!) > 0.005) : []
    rows.push({ line: p.line, date: p.date, channel_id: p.channel_id, values, before: prev, field_states, status: !prev ? '新增' : changed.length ? '覆盖' : '一样', changed, kept, warnings: p.warnings })
  }

  rows.sort((x, y) => x.date.localeCompare(y.date) || x.channel_id.localeCompare(y.channel_id))
  const counted = { new: rows.filter((r) => r.status === '新增').length, update: rows.filter((r) => r.status === '覆盖').length }
  const byCh = new Map<string, PreviewRow[]>()
  rows.forEach((r) => byCh.set(r.channel_id, [...(byCh.get(r.channel_id) ?? []), r]))
  return {
    rows, problems: problems.sort((x, y) => x.line - y.line),
    counts: {
      total: table.rows.length, ok: rows.length, new: counted.new, update: counted.update,
      same: rows.filter((r) => r.status === '一样').length, skipped: problems.filter((p) => p.kind === '跳过').length, bad: problems.filter((p) => p.kind === '有问题').length,
      warned: rows.filter((r) => r.warnings.length).length,
    },
    all_same: rows.length > 0 && counted.new === 0 && counted.update === 0, same_from_samples: 0, sample_channels: [],
    date_from: rows[0]?.date ?? null, date_to: rows.at(-1)?.date ?? null,
    channels: [...byCh.entries()].map(([id, xs]) => ({ id, name: CHANNELS[id]?.name ?? id, rows: xs.length, date_from: xs[0].date, date_to: xs.at(-1)!.date })),
  }
}
