// 行业资讯模块：来源清单（0.3）。老板自己加、自己关；两类：
//   codex 默认：Codex 用老板接好的 MCP（或看网页）取了，用命令 news-add 写进来（entries.ts）。预设两个：生财有术、AI HOT，装好后都关着
//   rss   工作台后端每天定时去取公开的 RSS / Atom（fetch.ts）；0.2 的老用户 AI HOT 照旧是这种
// 关掉一个来源：不再取、不再收，页面上也不放它的；数据留着，打开又回来。不做删除。
// “给资讯加一个来源：××”说的是已有的（同名、同地址）就直接打开它，不另加一个。
import { all, get, run, uid, nowIso, logChange } from '../../db.ts'
import type { Actor } from '../../services/common.ts'
import { Invalid, KIND_LABEL, cleanSource, sourceName, sourceNote, sourceUrl, type SourceKind } from './clean.ts'

export type Source = { id: string; name: string; kind: SourceKind; url: string | null; note: string | null; enabled: boolean; position: number; created_at: string; enabled_at: string | null }
type Row = Omit<Source, 'enabled'> & { enabled: number }
const shape = (r: Row): Source => ({ ...r, enabled: r.enabled === 1 })
const ENTITY = '行业资讯'

export const listSources = (): Source[] => all<Row>('SELECT * FROM news_sources ORDER BY position, created_at').map(shape)

const same = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase()
/** 地址比较时不管 ? 后面的（AI HOT 的 MCP 地址可能带一个本机的匿名编号） */
const baseUrl = (u: string | null) => (u ? u.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase() : null)

/** 按编号或名字找来源（名字不分大小写、不管空格）；没登记过就说清楚有哪些、怎么登记 */
export function findSource(ref: string): Source {
  const want = ref.trim()
  const list = listSources()
  const hit = list.find((s) => s.id === want.toLowerCase()) ?? list.find((s) => same(s.name, want))
  if (hit) return hit
  throw new Invalid(`没有登记“${want}”这个来源。登记过的：${list.map((s) => s.name).join('、') || '还没有'}。要先登记：news-source-add "${want}" --note "取什么、怎么取"`)
}

function assertFree(name: string, url: string | null, except?: string) {
  for (const s of listSources()) {
    if (s.id === except) continue
    if (same(s.name, name)) throw new Invalid(`已经有“${s.name}”这个来源了`)
    if (url && baseUrl(s.url) === baseUrl(url)) throw new Invalid(`这个地址已经登记过了（“${s.name}”）`)
  }
}

/** 登记一个来源。已经有同名或同地址的（比如预设的生财有术、AI HOT）：打开它，写了地址、说明的顺手更新，不另加一个 */
export function addSource(input: unknown, actor: Actor): Source & { existed: boolean } {
  const s = cleanSource(input)
  const old = listSources().find((x) => same(x.name, s.name)) ?? (s.url ? listSources().find((x) => baseUrl(x.url) === baseUrl(s.url)) : undefined)
  if (old) {
    if (old.kind !== s.kind) throw new Invalid(`已经有“${old.name}”这个来源，取法是“${KIND_LABEL[old.kind]}”，不能改成“${KIND_LABEL[s.kind]}”：要换取法，关掉它（news-source-off "${old.name}"）再用新名字登记`)
    return { ...setSource(old.id, { enabled: true, url: s.url ?? undefined, note: s.note ?? undefined }, actor), existed: true }
  }
  const id = uid('nsrc')
  const position = (get<{ n: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM news_sources')?.n ?? 0)
  const at = nowIso()
  run('INSERT INTO news_sources (id, name, kind, url, note, enabled, position, created_at, enabled_at) VALUES (:id, :name, :kind, :url, :note, 1, :position, :at, :at)', { id, ...s, position, at })
  logChange(actor, ENTITY, id, '新增', `资讯来源：${s.name}（${KIND_LABEL[s.kind]}）`)
  return { ...findSource(id), existed: false }
}

/** 改一个来源：开关、名字、地址、说明（类型不能改：要换类型就关掉它，另登记一个） */
export function setSource(ref: string, input: unknown, actor: Actor): Source {
  const old = findSource(ref)
  const b = (input ?? {}) as Record<string, unknown>
  const next = {
    name: b.name === undefined ? old.name : sourceName(b.name),
    url: b.url === undefined ? old.url : sourceUrl(b.url),
    note: b.note === undefined ? old.note : sourceNote(b.note),
    enabled: b.enabled === undefined ? old.enabled : b.enabled === true || b.enabled === 1 || b.enabled === '1',
  }
  if (old.kind === 'rss' && !next.url) throw new Invalid('公开的来源要有 RSS 地址，不能清空')
  assertFree(next.name, next.url, old.id)
  const said = [
    next.enabled !== old.enabled ? (next.enabled ? '打开了' : '关掉了') : '',
    next.name !== old.name ? `改名为 ${next.name}` : '',
    next.url !== old.url ? `地址改成 ${next.url ?? '空'}` : '',
    next.note !== old.note ? '改了说明' : '',
  ].filter(Boolean)
  if (!said.length) return old
  run('UPDATE news_sources SET name = :name, url = :url, note = :note, enabled = :enabled, enabled_at = :on WHERE id = :id', {
    id: old.id, name: next.name, url: next.url, note: next.note, enabled: next.enabled ? 1 : 0, on: next.enabled && !old.enabled ? nowIso() : old.enabled_at,
  })
  logChange(actor, ENTITY, old.id, '修改', `资讯来源 ${old.name}：${said.join('、')}`)
  return findSource(old.id)
}
