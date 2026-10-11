// 经营异常：规则现算（service.ts 的 anomalies()）+ 处理状态（biz_anomalies 表）+ 证据和可能的原因。归属：经营模块。
// 原因都是规则从数据里对出来的（退款原因、运营记录、推广计划、流量、库存、入仓预约），每条带数据依据；
// 建议是 AI 写的（Codex 定时任务写日报时一起写进 biz_anomalies.suggestions），显示时标明是谁、几点写的。
import { z } from 'zod'
import { all, get, run, nowIso, logChange } from '../../db.ts'
import { NotFound, today, addDays, type Actor } from '../../services/common.ts'
import { anomalies, channels, latestDate, SHORT, type Alert } from './service.ts'
import { getConfig } from './config.ts'
import { evidenceFor } from './evidence.ts'
import { md } from './period.ts'

export const ANOMALY_STATUS = ['待处理', '处理中', '已处理'] as const

type StateRow = {
  id: string; kind: string; channel_id: string | null; first_seen: string; title: string | null; detail: string | null
  status: string; owner: string | null; note: string | null; suggestions: string | null; suggested_by: string | null; suggested_at: string | null
  updated_at: string; updated_by: string
}

export type AnomalyItem = Alert & {
  channel_name: string | null; status: string; owner: string | null; note: string | null
  suggestions: string[]; suggested_by: string | null; suggested_at: string | null; first_seen: string | null
  updated_at: string | null; updated_by: string | null; active: boolean
  /** 还没处理完、但按现在的阈值规则不再报了（例如在日报设置里把下限调高了） */
  quiet: boolean
}

const states = () => new Map(all<StateRow>('SELECT * FROM biz_anomalies').map((r) => [r.id, r]))
const chName = () => new Map(channels().map((c) => [c.id, c.name]))

function merge(a: Alert, s: StateRow | undefined, names: Map<string, string>): AnomalyItem {
  return {
    ...a, channel_name: a.channel_id ? names.get(a.channel_id) ?? null : null,
    status: s?.status ?? '待处理', owner: s?.owner ?? null, note: s?.note ?? null,
    suggestions: s?.suggestions ? JSON.parse(s.suggestions) : [], suggested_by: s?.suggested_by ?? null, suggested_at: s?.suggested_at ?? null,
    first_seen: s?.first_seen ?? a.since, updated_at: s?.updated_at ?? null, updated_by: s?.updated_by ?? null, active: true, quiet: false,
  }
}

/** 规则不再报、但处理过的旧异常（id 形如 gmv_store@2026-10-08） */
function fromHistory(s: StateRow, names: Map<string, string>): AnomalyItem {
  const ruleId = s.id.split('@')[0]
  const ch = s.channel_id
  return {
    id: s.id, level: s.kind === '成交' ? '中' : '高', module: 'biz', kind: s.kind, channel_id: ch, title: s.title ?? ruleId, detail: s.detail ?? '', cause: null,
    short: (SHORT as Record<string, string>)[s.kind],
    since: s.first_seen, link: ch ? `/channel/${ch}?anomaly=${encodeURIComponent(s.id)}` : `/biz?anomaly=${encodeURIComponent(s.id)}`,
    channel_name: ch ? names.get(ch) ?? null : null, status: s.status, owner: s.owner, note: s.note,
    suggestions: s.suggestions ? JSON.parse(s.suggestions) : [], suggested_by: s.suggested_by, suggested_at: s.suggested_at,
    first_seen: s.first_seen, updated_at: s.updated_at, updated_by: s.updated_by, active: false, quiet: s.status !== '已处理',
  }
}

const RANK: Record<string, number> = { 待处理: 0, 处理中: 1, 已处理: 2 }

/** 当前规则报出来的异常（带处理状态）+ 规则不再报的（处理过的旧异常；还没处理完的标 quiet） */
export function listAnomalies(date = latestDate()) {
  const names = chName()
  const st = states()
  const active = anomalies(date ?? undefined, undefined, { all: true }).map((a) => merge(a, st.get(a.id), names))
    .sort((p, q) => (RANK[p.status] ?? 9) - (RANK[q.status] ?? 9))
  const activeIds = new Set(active.map((a) => a.id))
  const history = [...st.values()].filter((s) => !activeIds.has(s.id)).map((s) => fromHistory(s, names))
    .sort((p, q) => String(q.first_seen).localeCompare(String(p.first_seen)))
  return { date, active, history }
}

export function findAnomaly(id: string) {
  const { active, history } = listAnomalies()
  return active.find((a) => a.id === id) ?? history.find((a) => a.id === id) ?? null
}

export function anomalyDetail(id: string) {
  const item = findAnomaly(id)
  if (!item) throw new NotFound('这条异常已经处理完或不再报了')
  const date = latestDate() ?? today()
  const ev = evidenceFor(item, date, getConfig())
  return { ...item, ...ev, todo: todoOf(item, ev.reasons[0]?.title ?? null) }
}

/** “转成待办”：标题短（一句要做的事），建议放备注，备注最后附上回到这条异常的地址 */
function todoOf(a: AnomalyItem, firstReason: string | null) {
  const ch = a.channel_name ?? '全店'
  const sku = a.title.match(/「(.+?)」/)?.[1]
  const camp = a.cause?.match(/「(.+?)」/)?.[1]
  const title = a.kind === '库存' ? `约「${sku ?? '这款'}」入${ch}云仓`
    : a.kind === '退款' ? `处理${ch}退款：回完售后单，问一遍同批买家`
    : a.kind === '推广' ? `和${a.channel_id === 'tmall' ? '晓雯' : '负责人'}定${ch}${camp ? `「${camp}」` : ''}出价要不要调回`
    : `看${ch}成交为什么比上周少`
  const by = a.suggested_by ? `（${a.suggested_by} ${a.suggested_at ? stamp(a.suggested_at) : ''} 写）` : ''
  const note = [
    `来自经营异常：${a.title}${a.since ? `（${md(a.since)} 起）` : ''}`,
    firstReason ? `原因：${firstReason}` : null,
    a.suggestions.length ? `建议${by}：\n${a.suggestions.map((x, i) => `${i + 1}. ${plain(x)}`).join('\n')}` : null,
    `回到这条异常：${a.link}`,
  ].filter(Boolean).join('\n\n')
  return { title, note: note.slice(0, 1900), priority: a.level === '高' ? '重要' : '普通' }
}

/** 建议里的知识库链接 [售后与补偿](05-…md) 在待办备注里只留名字 */
const plain = (x: string) => x.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/** ISO 时间换成本地的“10/27 07:55” */
function stamp(iso: string) {
  if (!iso.endsWith('Z')) return `${md(iso)} ${iso.slice(11, 16)}`
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const anomalyInput = z.object({
  status: z.enum(ANOMALY_STATUS, { message: '状态只能是 待处理、处理中、已处理' }).optional(),
  owner: z.string({ message: '谁跟要写名字' }).trim().max(20, '谁跟最多 20 个字').optional().nullable(),
  note: z.string({ message: '处理记录要写文字' }).trim().max(1000, '处理记录最多 1000 字').optional().nullable(),
  suggestions: z.array(z.string({ message: '建议要写文字' }).trim().min(1, '建议不能是空的').max(300, '一条建议不超过 300 字'), { message: '建议要写成列表' }).max(8, '建议最多 8 条').optional(),
  /** true：新建议追加在原来的后面（默认替换） */
  append: z.boolean({ message: 'append 只能是 true 或 false' }).optional(),
}, { message: '要写成 JSON 对象' })

export function setAnomaly(id: string, input: unknown, actor: Actor | string) {
  const data = anomalyInput.parse(input)
  const item = findAnomaly(id)
  if (!item) throw new NotFound('找不到这条异常')
  const at = nowIso()
  const exists = get<{ id: string }>('SELECT id FROM biz_anomalies WHERE id = :id', { id })
  if (!exists) {
    run(`INSERT INTO biz_anomalies (id, kind, channel_id, first_seen, title, detail, status, updated_at, updated_by)
      VALUES (:id, :kind, :ch, :first, :title, :detail, '待处理', :at, :by)`, { id, kind: item.kind, ch: item.channel_id, first: item.since ?? today(), title: item.title, detail: item.detail, at, by: String(actor) })
  }
  const sets: string[] = ['updated_at = :at', 'updated_by = :by']
  const p: Record<string, string | null> = { id, at, by: String(actor) }
  if (data.status) { sets.push('status = :status'); p.status = data.status }
  if (data.owner !== undefined) { sets.push('owner = :owner'); p.owner = data.owner || null }
  if (data.note !== undefined) { sets.push('note = :note'); p.note = data.note || null }
  if (data.suggestions) {
    const merged = data.append ? [...item.suggestions, ...data.suggestions.filter((x) => !item.suggestions.includes(x))].slice(0, 12) : data.suggestions
    sets.push('suggestions = :sug, suggested_by = :by, suggested_at = :at'); p.sug = JSON.stringify(merged)
  }
  run(`UPDATE biz_anomalies SET ${sets.join(', ')} WHERE id = :id`, p)
  const what = [data.status && `状态改成${data.status}`, data.owner !== undefined && `交给${data.owner || '（未定）'}`, data.note !== undefined && '写了处理记录', data.suggestions && `${data.append ? '追加' : '写'}了 ${data.suggestions.length} 条建议`].filter(Boolean).join('，')
  logChange(String(actor), '经营异常', id, '修改', `${item.title}：${what || '更新'}`)
  return findAnomaly(id)
}

/** 种子用：按日期往回跑一遍规则，找出每条异常第一次被报出来的那天 */
export function firstSeen(id: string, from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (anomalies(d, undefined, { all: true }).some((a) => a.id === id)) return d
  }
  return null
}

