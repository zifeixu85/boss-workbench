// “我关注的”：知识库档案里有几类就出几页；每页一个列表，点开是这个对象的详情——现在、下一步、时间线（人做的和 AI 做的放一起）、相关文件、相关对话。
// 都从知识库文件现读，不存进数据库；工作台不改这些文件。
import { NotFound } from '../../services/common.ts'
import { allObjects, findObject, focusClasses, objectsOf } from './kb.ts'
import { listSessions, type SessionView } from './store.ts'
import { listOutputs } from './outputs.ts'
import type { FocusClass, KbObject } from './types.ts'
import { kbFiles } from './text.ts'

const KNOWN: Record<string, (o: KbObject) => string> = { 更新: (o) => o.updated, 确认: (o) => o.confirm, 状态: (o) => o.status }
/** 列表上显示的字段：先看开头里有没有这个字段，没有就空着 */
const fieldOf = (o: KbObject, key: string) => o.fields[key] ?? KNOWN[key]?.(o) ?? ''

/** 菜单用：每一类的名字、地址、有几个待确认的 */
export function focusNav() {
  const { classes } = focusClasses()
  return classes.map((c) => ({ name: c.name, to: `/focus/${encodeURIComponent(c.name)}`, confirmed: c.confirmed }))
}

/** 状态显示成本人的叫法（文件里写原名或新叫法都认） */
const shown = (cls: FocusClass, status: string) => cls.rename[status] ?? status

function summary(cls: FocusClass, o: KbObject, sessions: SessionView[]) {
  const mine = sessions.filter((s) => s.object?.path === o.path)
  return {
    path: o.path, name: o.name, status: shown(cls, o.status), status_known: cls.statuses.includes(shown(cls, o.status)), updated: o.updated, confirm: o.confirm, privacy: o.privacy,
    fields: cls.fields.map((k) => ({ key: k, value: fieldOf(o, k) })), now: o.now, missing: o.missing, warnings: o.warnings, type_mismatch: !!o.type && o.type !== cls.name,
    sessions: mine.length, unread: mine.filter((s) => s.status === '做完未读' || s.status === '在等我').length, last_at: mine[0]?.last_at ?? null,
  }
}

/** 一类对象的列表页 */
export function focusList(name: string) {
  const { classes, problems } = focusClasses()
  const cls = classes.find((c) => c.name === name)
  if (!cls) throw new NotFound(`知识库档案的“我关注的”表里没有“${name}”这一类${problems.length ? `（${problems[0]}）` : ''}`)
  const { objects, problems: more } = objectsOf(cls)
  const sessions = listSessions({ days: 90 })
  const items = objects.map((o) => summary(cls, o, sessions))
  const counts: Record<string, number> = {}
  for (const o of items) counts[o.status || '没写状态'] = (counts[o.status || '没写状态'] ?? 0) + 1
  return { class: cls, items, counts, problems: [...problems, ...more] }
}

/** 一个对象的详情 */
export function focusObject(path: string) {
  const hit = findObject(path)
  if (!hit) throw new NotFound('知识库里没有这个对象（可能改名或挪走了）')
  const { cls, object: o } = hit
  const sessions = listSessions({ days: 365, all: false }).filter((s) => s.object?.path === o.path)
  const files = listOutputs({ days: 365, object: o.path, limit: 40 })
  // 时间线：往来记录（人做的）和 AI 对话（AI 做的）放一起，按日期从新到旧；没有日期的往来记录排最后
  const timeline = [
    ...o.log.map((l) => ({ kind: '往来' as const, date: l.date, at: l.date, title: l.text, sub: l.channel, pending: l.pending, session: null as string | null })),
    ...sessions.map((s) => ({ kind: 'AI' as const, date: localDay(s.last_at), at: s.last_at, title: s.title, sub: `${s.tool_name} · ${s.status}`, pending: false, session: s.id })),
  ].sort((a, b) => (b.at || '0').localeCompare(a.at || '0'))
  const links = o.links.map((l) => { const t = findObject(l); return { path: l, name: t?.object.name ?? l.split('/').pop() ?? l, type: t?.cls.name ?? null, to: t ? `/focus/${encodeURIComponent(t.cls.name)}?o=${encodeURIComponent(t.object.path)}` : null } })
  // 别的对象的“关联”里写了它：反过来也列出来
  const backlinks = allObjects().filter((x) => x.object.path !== o.path && x.object.links.some((l) => findObject(l)?.object.path === o.path))
    .map((x) => ({ path: x.object.path, name: x.object.name, type: x.cls.name, to: `/focus/${encodeURIComponent(x.cls.name)}?o=${encodeURIComponent(x.object.path)}` }))
  return {
    class: cls, object: { ...o, status: shown(cls, o.status), fields_shown: cls.fields.map((k) => ({ key: k, value: fieldOf(o, k) })) },
    timeline, sessions, files: files.items, files_total: files.total, links, backlinks,
    kb_files: kbFiles([o.path, ...o.source, ...o.sources]),
  }
}

/** 双链里的路径不带 .md：补上，知识库页才打得开 */


const localDay = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

/** 要用户确认的资料：收件箱里的文件、标着“待确认”的对象、还没确认的那几类、往来记录里 AI 记的待确认 */
export function pendingItems() {
  const { classes } = focusClasses()
  const out: { kind: string; title: string; sub: string; to: string }[] = []
  for (const c of classes) if (!c.confirmed) out.push({ kind: '分类', title: `“${c.name}”这一类还没确认`, sub: '知识库档案 · 我关注的', to: `/focus/${encodeURIComponent(c.name)}` })
  for (const { cls, object: o } of allObjects()) {
    const to = `/focus/${encodeURIComponent(cls.name)}?o=${encodeURIComponent(o.path)}`
    if (o.confirm === '待确认') out.push({ kind: cls.name, title: o.name, sub: `${cls.name} · 整份待确认`, to })
    const n = o.log.filter((l) => l.pending).length
    if (n) out.push({ kind: cls.name, title: `${o.name}：${n} 条往来记录`, sub: 'AI 记的，待确认', to })
  }
  return out
}
