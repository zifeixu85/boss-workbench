// 认表 + 对字段：先认出是哪家平台的哪张表、有没有存过的规则；再按规则、同平台停用的旧规则（人确认过、改版后名字没变的列）、常见叫法、知识库的数据口径自动对；
// 对不上或有两种意思的标“拿不准”，等老板选。不猜，不把缺的列算成 0。归属：数据源与导入模块。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, ROOT } from '../../db.ts'
import { today } from '../../services/common.ts'
import {
  CHANNELS, CORE, DATE_FMT_LABEL, FIELD, PROFILES, detectDateFmt, guessByLook, guessByName, isTotalRow, normHeader, unitOf,
  type DateFmt, type FieldKey, type Profile,
} from './fields.ts'
import type { Table } from './csv.ts'
import { activeRules, listRules, type Rule } from './rules.ts'

export type ColState = '已对上' | '拿不准' | '用不上'
export type ColHow = '规则' | '旧规则' | '常见叫法' | '知识库' | '名字像' | 'Codex' | '你选的' | '没见过'
export type Column = {
  index: number; header: string; samples: string[]; unit: '元' | '万元' | '%' | null
  field: FieldKey | null; state: ColState; how: ColHow; why: string
  /** 几列争同一个字段时，工作台更倾向的那一列（例：门店的“实收金额”） */
  prefer?: boolean
  /** 按旧规则对上的列：旧规则里谁、哪天确认的（存新规则时沿用） */
  by?: string; at?: string
}
/** 几列都像同一个字段、只能选一列：网页上做成一行“二选一” */
export type PickOne = { field: FieldKey; label: string; options: { index: number; header: string; samples: string[]; why: string }[]; suggested: number; why: string }
/** 表里没有、但能按知识库口径算出来的字段（例：门店新客 = 单数 − 会员单数） */
export type Derived = { field: FieldKey; label: string; how: string; from: FieldKey[] }
export type Choices = {
  columns?: Record<string, { field: FieldKey | null; by: '你选的' | 'Codex' }>
  channel_id?: string | null
  date_fmt?: DateFmt | null
  amount_unit?: '元' | '万元'
  ack_missing?: FieldKey[]
}
export type Missing = { field: FieldKey; label: string; why: string; col?: string; canAck: boolean }
export type Analysis = {
  header_row: number; preamble: string[]; row_count: number
  recognized: { profile: string; platform: string; report: string; sure: boolean; reasons: string[] } | null
  rule: { id: string; name: string; matched: number; total: number; missing_cols: string[]; extra_cols: string[]; created: string; origin: string } | null
  /** 没有在用的规则、但同一平台有停用的旧规则：名字没变的列按它对（人确认过的） */
  retired: { id: string; name: string; used: number; total: number } | null
  channel_id: string | null; channel_from: '表里有渠道列' | '认出来的' | '规则里的' | '你选的' | null
  date: { index: number; fmt: DateFmt | null; label: string; year_inferred: boolean; auto: DateFmt | null } | null
  amount_unit: '元' | '万元'; amount_unit_from: '表头写了' | '规则里的' | '你选的' | '默认'
  columns: Column[]
  pick_one: PickOne[]
  derived: Derived[]
  /** 合计、总计这类汇总行有几行（不算进“几行数据”） */
  total_rows: number
  /** 文件开头写了“示例数据”的演示样例表（只用来提示，记录仍算现场导的） */
  sample_file: boolean
  counts: { matched: number; unsure: number; unused: number }
  required: { field: FieldKey; label: string; why: string }[]
  missing: Missing[]
  blocking: string[]
  target: 'channel_daily' | 'xhs_notes'
}

const KB_FILE = '10-渠道与经营/数据口径.md'
let kbCache: { at: number; text: string | null; confirmed: boolean } | null = null
/** 知识库的《数据口径》：各平台的叫法写在这里，读得到就拿来对字段（只读）。文件开头“确认: 已确认”才算林总点过头 */
function kbDoc(): { text: string | null; confirmed: boolean } {
  if (kbCache && Date.now() - kbCache.at < 30_000) return kbCache
  const p = join(ROOT, KB_FILE)
  const text = existsSync(p) ? readFileSync(p, 'utf8') : null
  const head = text?.split(/^---\s*$/m)[1] ?? ''
  kbCache = { at: Date.now(), text, confirmed: /^确认:\s*已确认/m.test(head) }
  return kbCache
}

/** 知识库里写明了的叫法：数据口径表格里“某指标”那一行出现了 “叫法” */
function kbSays(header: string, channel: string | null): { field: FieldKey; why: string; confirmed: boolean } | null {
  const { text, confirmed } = kbDoc()
  if (!text) return null
  const h = header.replace(/[（(][^）)]*[）)]/g, '').trim()
  if (channel === 'store' && /会员/.test(h) && !/非会员/.test(h) && text.includes('会员单算老客')) return { field: 'old_buyers', why: '知识库《数据口径》写了：门店会员单算老客', confirmed }
  if (channel === 'store' && /非会员|散客/.test(h) && text.includes('其余算新客')) return { field: 'new_buyers', why: '知识库《数据口径》写了：门店非会员算新客', confirmed }
  const rows: [string, FieldKey][] = [['成交额', 'gmv'], ['订单数', 'orders'], ['访客数', 'visitors'], ['推广花费', 'ad_spend'], ['推广成交额', 'ad_gmv']]
  for (const line of text.split('\n')) {
    for (const [metric, field] of rows) {
      if (line.startsWith(`| ${metric} |`) && line.includes(`“${h}”`)) {
        const note = line.split('|').map((s) => s.trim()).filter(Boolean).pop() ?? ''
        return { field, why: `知识库《数据口径》写了“${h}”就是${FIELD[field].label}${note && !note.includes(h) ? `（${note.replace(/。$/, '')}）` : ''}`, confirmed }
      }
    }
  }
  return null
}

function recognize(headers: string[], preamble: string[]): Analysis['recognized'] {
  const hs = new Set(headers.map(normHeader))
  const pre = preamble.join(' ')
  let best: { p: Profile; hits: string[] } | null = null
  for (const p of PROFILES) {
    const hits = p.markers.filter((m) => hs.has(normHeader(m)))
    if (p.hint && pre.includes(p.hint)) hits.push(`表头上方写着“${p.hint}”`)
    if (!best || hits.length > best.hits.length) best = { p, hits }
  }
  if (!best || best.hits.length < 2) return null
  const named = best.hits.filter((h) => !h.startsWith('表头上方')).slice(0, 4).map((h) => `“${h}”`).join('')
  const reasons = [named && `有 ${named} 这几列，是${best.p.platform}${best.p.report.split(' · ')[0]}的叫法`, ...best.hits.filter((h) => h.startsWith('表头上方'))].filter(Boolean)
  return { profile: best.p.id, platform: best.p.platform, report: best.p.report, sure: best.hits.length >= 3, reasons }
}

function matchRule(headers: string[]): { rule: Rule; matched: number } | null {
  const hs = new Set(headers.map(normHeader))
  let best: { rule: Rule; matched: number; ratio: number } | null = null
  for (const rule of activeRules()) {
    const matched = rule.signature.filter((s) => hs.has(normHeader(s))).length
    const ratio = matched / Math.max(1, rule.signature.length)
    if (ratio >= 0.6 && (!best || ratio > best.ratio)) best = { rule, matched, ratio }
  }
  return best
}

/** 同一渠道（或同一平台）停用的旧规则：平台改版后，名字没变的列还按它对，不用再问一遍 */
function retiredRule(channel: string | null, platform?: string | null): Rule | null {
  return listRules().filter((r) => r.status === '停用' && r.target === 'channel_daily' && ((!!channel && r.channel_id === channel) || (!!platform && r.platform === platform)))
    .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))[0] ?? null
}
const cnDay = (at?: string) => (at ? `${Number(at.slice(5, 7))}月${Number(at.slice(8, 10))}日` : '')

/** 这个渠道近 30 天哪些数一直有：表里缺了这些就停下来（缺的不能当 0） */
function usualFields(channelIds: string[]): { field: FieldKey; why: string }[] {
  if (!channelIds.length) return []
  const marks = channelIds.map((_, i) => `:c${i}`).join(',')
  const p = Object.fromEntries(channelIds.map((c, i) => [`c${i}`, c]))
  const t = today()
  const r = all<Record<string, number>>(`SELECT COUNT(*) AS days, SUM(refund_amount > 0) AS refund_amount, SUM(refund_orders > 0) AS refund_orders, SUM(ad_spend > 0) AS ad_spend,
    SUM(ad_gmv > 0) AS ad_gmv, SUM(new_buyers > 0) AS new_buyers, SUM(old_buyers > 0) AS old_buyers, AVG(ad_spend) AS avg_ad, AVG(refund_amount) AS avg_refund
    FROM channel_daily WHERE channel_id IN (${marks}) AND date >= date(:t, '-30 days') AND date < :t`, { ...p, t })[0]
  if (!r || !r.days) return []
  const name = channelIds.length === 1 ? CHANNELS[channelIds[0]]?.name ?? channelIds[0] : '这几个渠道'
  const out: { field: FieldKey; why: string }[] = []
  for (const f of ['refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers'] as FieldKey[]) {
    const n = Number(r[f] ?? 0)
    if (n < r.days * 0.3) continue
    const extra = f === 'ad_spend' ? `，日均 ${Math.round(r.avg_ad).toLocaleString('zh-CN')} 元` : f === 'refund_amount' ? `，日均 ${Math.round(r.avg_refund).toLocaleString('zh-CN')} 元` : ''
    out.push({ field: f, why: n >= r.days ? `${name}这 ${r.days} 天每天都有${FIELD[f].label}${extra}` : `${name}这 ${r.days} 天里有 ${n} 天有${FIELD[f].label}${extra}` })
  }
  return out
}

/** 谁说了算：你选的 / Codex（采用了的）> 规则 > 知识库 > 常见叫法（确定）> 常见叫法（有歧义） */
function rank(c: Column) {
  if (c.how === '你选的' || c.how === 'Codex') return 5
  if (c.how === '规则' || c.how === '旧规则') return 4
  if (c.how === '知识库') return 3
  return c.state === '已对上' ? 2 : 1
}

/** 同一个工作台字段被好几列占了：说了算的那列留下，其余标用不上；分不出高低的几列都标拿不准 */
function resolveConflicts(columns: Column[]): Column[] {
  const byField = new Map<FieldKey, Column[]>()
  columns.forEach((c) => { if (c.field && c.field !== 'channel') byField.set(c.field, [...(byField.get(c.field) ?? []), c]) })
  const patch = new Map<number, Column>()
  for (const [field, cols] of byField) {
    if (cols.length < 2) continue
    const top = Math.max(...cols.map(rank))
    const winners = cols.filter((c) => rank(c) === top)
    const label = FIELD[field].label
    for (const c of cols) {
      if (rank(c) === 5) continue // 人选的不动；真重复了由 blocking 提醒
      if (rank(c) < top) {
        patch.set(c.index, { ...c, field: null, state: '用不上', why: `${label}已经用「${winners[0].header}」对上了${c.state === '拿不准' ? `；${c.why}` : ''}` })
      } else if (winners.length > 1) {
        const others = winners.filter((o) => o.index !== c.index).map((o) => o.header)
        patch.set(c.index, { ...c, state: '拿不准', why: `「${others.join('」「')}」也像${label}，只能选一列。${c.why}` })
      }
    }
  }
  return columns.map((c) => patch.get(c.index) ?? c)
}

/** 几列拿不准、又都像同一个字段：合成一组“二选一”，默认选工作台更倾向的那一列 */
function pickOneGroups(columns: Column[]): PickOne[] {
  const by = new Map<FieldKey, Column[]>()
  columns.forEach((c) => { if (c.state === '拿不准' && c.field && c.field !== 'channel') by.set(c.field, [...(by.get(c.field) ?? []), c]) })
  return [...by.entries()].filter(([, cs]) => cs.length > 1).map(([field, cs]) => {
    const best = cs.find((c) => c.prefer) ?? cs[0]
    const clean = (why: string) => why.replace(/^「[^」]*」(「[^」]*」)*也像[^，。]*，只能选一列。/, '')
    return {
      field, label: FIELD[field].label, suggested: best.index,
      options: cs.map((c) => ({ index: c.index, header: c.header, samples: c.samples, why: clean(c.why) })),
      why: `${cs.map((c) => `「${c.header}」`).join('')}都像${FIELD[field].label}，只能选一列；${clean(best.why)}`,
    }
  })
}

export function analyze(table: Table, choices: Choices = {}): Analysis {
  const { headers, rows } = table
  const samples = (i: number) => rows.map((r) => r.cells[i]).filter((v) => v !== '').slice(0, 3)
  const recognized = recognize(headers, table.preamble)
  const ruleHit = matchRule(headers)
  const rule = ruleHit?.rule ?? null
  const isNotes = recognized?.profile === 'xhs_notes'
  const ruleByCol = new Map((rule?.mapping ?? []).map((m) => [normHeader(m.col), m]))

  // 渠道：老板选的 > 规则里的 > 认出来的
  let channel_id: string | null = null
  let channel_from: Analysis['channel_from'] = null
  if (choices.channel_id) { channel_id = choices.channel_id; channel_from = '你选的' }
  else if (rule?.channel_id) { channel_id = rule.channel_id; channel_from = '规则里的' }
  else if (recognized?.profile && PROFILES.find((p) => p.id === recognized.profile)?.channel) { channel_id = PROFILES.find((p) => p.id === recognized.profile)!.channel; channel_from = '认出来的' }

  const ruleLabel = rule ? `按规则「${rule.platform} · ${rule.report}」` : ''
  const retired = rule || isNotes ? null : retiredRule(channel_id, recognized?.platform)
  const retiredByCol = new Map((retired?.mapping ?? []).filter((m) => m.field).map((m) => [normHeader(m.col), m]))
  let columns: Column[] = headers.map((header, index) => {
    const base = { index, header, samples: samples(index), unit: unitOf(header) }
    const picked = choices.columns?.[String(index)]
    if (picked) return { ...base, field: picked.field, state: picked.field ? '已对上' : '用不上', how: picked.by, why: picked.by === 'Codex' ? '采用了 Codex 的建议' : '你选的' }
    const fromRule = ruleByCol.get(normHeader(header))
    if (fromRule) return { ...base, field: fromRule.field as FieldKey | null, state: fromRule.field ? '已对上' : '用不上', how: '规则', why: `按规则对的（规则 ${Number(rule!.created_at.slice(5, 7))}月${Number(rule!.created_at.slice(8, 10))}日存）` }
    const old = retiredByCol.get(normHeader(header))
    if (old) {
      const who = old.by && old.by !== '你选的' ? old.by : retired!.created_by ?? ''
      return { ...base, field: old.field as FieldKey, state: '已对上', how: '旧规则', by: who || undefined, at: old.at ?? retired!.created_at,
        why: `旧规则里${who} ${cnDay(old.at ?? retired!.created_at)}确认过，改版后这一列名字没变` }
    }
    const g = guessByName(header)
    // 常见叫法里确定的直接对上；有歧义的，知识库写了也只在林总确认过口径时才算数，没确认就标拿不准并说明
    if (g && (g.sure || g.field === null)) return { ...base, field: g.field, state: g.field === null ? '用不上' : '已对上', how: '常见叫法', why: g.why }
    const kb = kbSays(header, channel_id)
    if (kb) {
      return kb.confirmed
        ? { ...base, field: kb.field, state: '已对上', how: '知识库', why: kb.why }
        : { ...base, field: kb.field, state: '拿不准', how: '知识库', prefer: g?.prefer, why: `${kb.why}，但这份口径林总还没确认（待确认）${g?.why && !g.why.includes('知识库') ? `；${g.why}` : ''}` }
    }
    if (g) return { ...base, field: g.field, state: '拿不准', how: '常见叫法', prefer: g.prefer, why: g.why }
    const numeric = base.samples.length > 0 && base.samples.every((v) => /^[-¥￥\d,.%万]+$/.test(v))
    const look = numeric ? guessByLook(header) : null
    if (look) return { ...base, field: look.field, state: '拿不准', how: '名字像', why: look.why }
    return numeric
      ? { ...base, field: null, state: '拿不准', how: '没见过', why: '没见过这个叫法，看不出对应工作台哪一项' }
      : { ...base, field: null, state: '用不上', how: '没见过', why: '不是数，也不是日期，用不上' }
  })

  columns = resolveConflicts(columns)
  const pick_one = pickOneGroups(columns)

  // 日期列和格式
  const dateCol = columns.find((c) => c.field === 'date' && c.state === '已对上') ?? null
  let date: Analysis['date'] = null
  if (dateCol) {
    const fmts = rows.slice(0, 40).map((r) => detectDateFmt(r.cells[dateCol.index])).filter((f): f is DateFmt => !!f)
    const counts = new Map<DateFmt, number>()
    fmts.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1))
    const auto = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const fmt = choices.date_fmt ?? auto ?? rule?.date_format ?? null
    date = { index: dateCol.index, fmt, label: fmt ? DATE_FMT_LABEL[fmt] : '认不出来', year_inferred: fmt === 'md-cn', auto }
  }

  const channelCol = columns.find((c) => c.field === 'channel' && c.state === '已对上')
  if (channelCol && !choices.channel_id) { channel_id = null; channel_from = '表里有渠道列' }

  // 必须有的字段：每张表都要的 + 规则里要的 + 这个渠道平常一直有的
  const reqMap = new Map<FieldKey, string>()
  CORE.forEach((f) => reqMap.set(f, '每张表都得有'))
  rule?.required.forEach((f) => { if (!reqMap.has(f)) reqMap.set(f, `${ruleLabel}，这一列是必须的`) })
  const chans = channel_id ? [channel_id] : channelCol ? [...new Set(rows.map((r) => r.cells[channelCol.index]))].map((n) => Object.entries(CHANNELS).find(([, c]) => c.aliases.includes(n))?.[0]).filter((x): x is string => !!x) : []
  usualFields(chans).forEach(({ field, why }) => reqMap.set(field, reqMap.has(field) && !CORE.includes(field) ? `${reqMap.get(field)}；${why}` : reqMap.get(field) ?? why))
  const required = [...reqMap.entries()].map(([field, why]) => ({ field, label: FIELD[field].label, why }))

  // 拿不准的列里有建议的字段，先不算“缺”：选好之后自然就有了
  const mapped = new Set(columns.filter((c) => (c.state === '已对上' || c.state === '拿不准') && c.field).map((c) => c.field))
  // 表里没有、但知识库口径能算出来的：门店新客 = 单数 − 会员单数（《数据口径》：会员单算老客，其余算新客）
  const derived: Derived[] = []
  const isStore = channel_id === 'store'
  if (isStore && !mapped.has('new_buyers') && mapped.has('orders') && mapped.has('old_buyers')) {
    derived.push({ field: 'new_buyers', label: FIELD.new_buyers.label, how: '单数 − 会员单数（知识库《数据口径》：门店会员单算老客，其余算新客）', from: ['orders', 'old_buyers'] })
    mapped.add('new_buyers')
  }
  const ack = new Set(choices.ack_missing ?? [])
  const ruleMissing = rule ? rule.mapping.filter((m) => !headers.some((h) => normHeader(h) === normHeader(m.col))) : []
  const missing: Missing[] = isNotes ? [] : required.filter((r) => !mapped.has(r.field) && !ack.has(r.field)).map((r) => ({
    ...r, col: ruleMissing.find((m) => m.field === r.field)?.col, canAck: !CORE.includes(r.field),
  }))

  const counts = { matched: columns.filter((c) => c.state === '已对上').length, unsure: columns.filter((c) => c.state === '拿不准').length, unused: columns.filter((c) => c.state === '用不上').length }
  const total_rows = rows.filter((r) => isTotalRow(r.cells)).length
  const blocking: string[] = []
  if (isNotes) blocking.push('这是小红书笔记数据（内容模块用的），不在这里导：到“数据源 → 小红书 · 笔记数据导出”里确认字段对照，再按新规则重新导入')
  else {
    if (!rows.length) blocking.push('表里没有数据行')
    if (counts.unsure) blocking.push(`还差 ${counts.unsure} 列要你点头`)
    missing.forEach((m) => blocking.push(`缺「${m.col ?? m.label}」：${m.label}${m.canAck ? '不能当 0' : '是必须的'}`))
    if (!channel_id && !channelCol) blocking.push('选一下这张表是哪个渠道的')
    if (date && !date.fmt) blocking.push('日期格式认不出来')
  }

  // 金额单位：表头括号里写了就按表头；否则 你选的 > 规则里的 > 元
  const amount_unit = choices.amount_unit ?? rule?.amount_unit ?? '元'
  const amount_unit_from: Analysis['amount_unit_from'] = choices.amount_unit ? '你选的' : rule ? '规则里的' : columns.some((c) => c.unit === '元' || c.unit === '万元') ? '表头写了' : '默认'
  const sample_file = /示例数据/.test(table.preamble.join(' '))

  return {
    header_row: table.headerRow, preamble: table.preamble, row_count: rows.length - total_rows, total_rows, recognized, amount_unit, amount_unit_from, sample_file, pick_one, derived,
    rule: rule ? { id: rule.id, name: `${rule.platform} · ${rule.report}`, matched: ruleHit!.matched, total: rule.signature.length, missing_cols: ruleMissing.map((m) => m.col), extra_cols: headers.filter((h) => !rule.signature.some((s) => normHeader(s) === normHeader(h))), created: rule.created_at, origin: rule.origin } : null,
    retired: retired ? { id: retired.id, name: `${retired.platform} · ${retired.report}`, used: columns.filter((c) => c.how === '旧规则').length, total: retired.mapping.filter((m) => m.field).length } : null,
    channel_id, channel_from, date, columns, counts, required, missing, blocking, target: isNotes ? 'xhs_notes' : 'channel_daily',
  }
}
