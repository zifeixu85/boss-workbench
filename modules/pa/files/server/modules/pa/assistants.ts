// 助理页的数据（约定 11.11，2026-11-27 A梦 定）：一张助理清单，点进去是这个助理自己的页（定位、档案、做了哪些事、用量、常驻对话）。
// 属性读 IDENTITY 开头的固定项，缺的用同事清单那一行补；两处不一致以 IDENTITY 为准，页面上说一句。
// 对话归到哪个助理见 assistant-parse.ts 的 matchAssistant；用量按归到的对话加总（估的：只算这台电脑上的对话记录）。只读，不改文件。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { all, ROOT } from '../../db.ts'
import { NotFound } from '../../services/common.ts'
import { canReadKbPath, readKbTextFile } from '../../services/kb.ts'
import { existsSync } from 'node:fs'
import { places } from './places.ts'
import { roles, type Role } from './roles.ts'
import { listSessions, now, type SessionView } from './store.ts'
import { localDay } from './usage-calc.ts'
import { assistantProps, matchAssistant, parseColleagues, parseDispatch, type Assistant, type Colleague, type Dispatch, type MatchBy } from './assistant-parse.ts'

const COLLEAGUES = '同事清单.md'
const DISPATCH = '派单记录.md'
/** 档案页签的顺序：三份在前，总助的三份规则文件跟着，别的按名字 */
const FILE_ORDER = ['IDENTITY', 'SOUL', 'MEMORY', '底稿', '路由表', '派单记录', '起名规则', '角色', '规矩', '记忆', '身份', '性格']
const FILE_CALL: Record<string, string> = { IDENTITY: '它是谁', SOUL: '怎么想、怎么做事', MEMORY: '记住的事', 底稿: '分身的底稿', 路由表: '哪类事交给谁', 派单记录: '交出去的事', 起名规则: '新对话怎么起名', 角色: '旧格式', 规矩: '旧格式', 记忆: '旧格式' }

const readable = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) }
const read = (rel: string) => (readable(rel) ? readKbTextFile(join(ROOT, rel)) : '')

type Usage = { today: number; d7: number; d30: number }
export type AssistantCard = Assistant & {
  folder: string; thread: string; mismatch: string[]
  recent: { id: string; title: string; status: string; last_at: string } | null
  sessions: number; usage: Usage; file_problems: number
}
export type SessionLink = { key: string; name: string; avatar: string; by: MatchBy }

function base() { return places()['助理'] }

/** 清单里这一行对应哪个助理文件夹：名字一栏链到的路径优先，不然按名字 */
const rowOf = (rows: Colleague[], folder: string, name: string) => rows.find((r) => r.path && r.path.split('/').slice(-2, -1)[0] === folder) ?? rows.find((r) => r.name === name)

/** 全部助理（总协调排最前，别的按名字），加上同事清单里补来的常驻对话 */
function loadAssistants(): { list: (Assistant & { folder: string; thread: string; mismatch: string[]; role: Role | undefined })[]; colleagues: Colleague[]; base: string; exists: boolean } {
  const BASE = base()
  const r = roles()
  const colleagues = parseColleagues(read(`${BASE}/${COLLEAGUES}`))
  const list = r.roles.map((role) => {
    const folder = role.folder.split('/').pop()!
    const idFile = role.files.find((f) => f.exists && (f.name === 'IDENTITY' || f.name === '角色'))
    const a = assistantProps(folder, idFile ? read(idFile.path) : '')
    const row = rowOf(colleagues, folder, a.name)
    const mismatch: string[] = []
    // 缺的用清单补；都写了又不一样的，以 IDENTITY 为准，说一句
    const fill = <K extends 'avatar' | 'duty' | 'owns' | 'notOwns' | 'call'>(k: K, label: string, from: string | undefined) => {
      if (!from) return a[k]
      if (!a[k] || (a.legacy && a.missing.includes(label))) return from
      if (a[k] !== from) mismatch.push(`${label}：IDENTITY 写“${a[k]}”，同事清单写“${from}”`)
      return a[k]
    }
    const merged = { ...a, avatar: fill('avatar', '头像', row?.avatar), duty: fill('duty', '职责', row?.duty), owns: fill('owns', '管什么', row?.owns), notOwns: fill('notOwns', '不管什么', row?.notOwns), call: fill('call', '怎么叫', row?.call) }
    return { ...merged, folder: role.folder, thread: row?.thread ?? '', mismatch, role }
  }).sort((x, y) => Number(y.chief) - Number(x.chief) || x.name.localeCompare(y.name, 'zh'))
  return { list, colleagues, base: BASE, exists: r.exists }
}

/** 总助派单记录（没有总助或没这份文件就是空的） */
function dispatchOf(list: { chief: boolean; folder: string }[]): Dispatch[] {
  const chief = list.find((a) => a.chief)
  return chief ? parseDispatch(read(`${chief.folder}/${DISPATCH}`)) : []
}

/** 工作台对话栏开的对话：Codex 对话编号 → 对话栏里的标题（Codex 那边的标题是第一句前面带的页面说明，不好看） */
function dockThreads(): Map<string, { title: string; persona: string | null }> {
  const read = (sql: string) => all<{ c: string; t: string; p: string | null }>(sql).map((x) => [`codex:${x.c}`, { title: x.t, persona: x.p ?? null }] as const)
  // 老版本的工作台还没有 persona 这一列
  try { return new Map(read('SELECT codex_thread_id AS c, title AS t, persona AS p FROM assistant_threads WHERE codex_thread_id IS NOT NULL')) } catch {
    try { return new Map(read('SELECT codex_thread_id AS c, title AS t, NULL AS p FROM assistant_threads WHERE codex_thread_id IS NOT NULL')) } catch { return new Map() }
  }
}
/** 给人看的标题：对话栏开的用对话栏里的标题 */
const shown = (s: SessionView, dock: ReturnType<typeof dockThreads>) => (dock.get(s.id) ? `对话栏：${dock.get(s.id)!.title}` : s.title)

/** 每个对话归哪个助理（进展、产出的“按助理”也用这个） */
export function sessionAssistants(sessions: SessionView[], loaded = loadAssistants()): Map<string, SessionLink> {
  const keys = loaded.list.map((a) => ({ key: a.key, name: a.name, avatar: a.avatar, thread: a.thread, chief: a.chief }))
  const dispatched = dispatchOf(loaded.list).map((d) => d.to).filter(Boolean)
  const dock = dockThreads()
  const out = new Map<string, SessionLink>()
  for (const s of sessions) {
    const m = matchAssistant({ title: s.title, first: s.first, dock: dock.has(s.id), persona: dock.get(s.id)?.persona }, keys, dispatched)
    const a = m && loaded.list.find((x) => x.key === m.key)
    if (m && a) out.set(s.id, { key: a.key, name: a.name, avatar: a.avatar, by: m.by })
  }
  return out
}

/** 对话栏里能叫的助理（接入点 assistantPersonas）：总协调在前；page 是它自己那一页 */
export function personaList() {
  return loadAssistants().list.map((a) => ({ key: a.key, name: a.name, avatar: a.avatar, duty: a.duty, call: a.call, page: `/roles/${a.key}` }))
}

/** 这些对话的 token 用量：今日、近 7 日、近 30 日 */
function usageOf(ids: string[]): Usage {
  if (!ids.length) return { today: 0, d7: 0, d30: 0 }
  const today = localDay(new Date(now()).toISOString())
  const back = (n: number) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n + 1); return localDay(d.toISOString()) }
  const rows = all<{ session_id: string; day: string; n: number }>(`SELECT session_id, day, fresh + cached + output AS n FROM pa_usage WHERE day >= :since AND session_id IN (${ids.map((_, i) => `:s${i}`).join(',')})`,
    { since: back(30), ...Object.fromEntries(ids.map((id, i) => [`s${i}`, id])) })
  const sum = (from: string) => rows.filter((r) => r.day >= from).reduce((k, r) => k + r.n, 0)
  return { today: sum(today), d7: sum(back(7)), d30: sum(back(30)) }
}

const fileProblems = (r: Role | undefined) => (r ? r.problems.length + r.files.reduce((k, f) => k + f.problems.length, 0) : 0)

/** 助理清单：每个助理一张卡 */
export function assistantList() {
  const loaded = loadAssistants()
  const sessions = listSessions({ days: 30 })
  const links = sessionAssistants(sessions, loaded)
  const dock = dockThreads()
  const cards: AssistantCard[] = loaded.list.map(({ role, ...a }) => {
    const mine = sessions.filter((s) => links.get(s.id)?.key === a.key)
    const r = mine[0]
    return { ...a, recent: r ? { id: r.id, title: shown(r, dock), status: r.status, last_at: r.last_at } : null, sessions: mine.length, usage: usageOf(mine.map((s) => s.id)), file_problems: fileProblems(role) }
  })
  const unmatched = sessions.filter((s) => !links.has(s.id)).length
  const chiefs = cards.filter((c) => c.chief).length
  return {
    base: loaded.base, exists: loaded.exists, assistants: cards, unmatched, colleagues: loaded.colleagues.length > 0,
    problems: [
      ...roles().problems,
      ...(chiefs > 1 ? [`总协调只能有一个，现在有 ${chiefs} 个写了“总协调: 是”`] : []),
      ...loaded.colleagues.filter((c) => !cards.some((a) => a.name === c.name)).map((c) => `同事清单里的“${c.name}”在助理文件夹里没找到`),
    ],
    note: '对话按标题、第一句、常驻对话和派单记录认是哪个助理的，认不出的不算；用量是这些对话在这台电脑上的记录加起来，估的。',
  }
}

/** 一个助理自己的页 */
export function assistantDetail(key: string) {
  const loaded = loadAssistants()
  const a = loaded.list.find((x) => x.key === key)
  if (!a) throw new NotFound(`没有“${key}”这个助理`)
  const sessions = listSessions({ days: 30 })
  const links = sessionAssistants(sessions, loaded)
  const dock = dockThreads()
  const mine = sessions.filter((s) => links.get(s.id)?.key === key).map((s) => ({ id: s.id, title: shown(s, dock), status: s.status, why: s.why, last_at: s.last_at, started_at: s.started_at, link: s.link, by: links.get(s.id)!.by, outputs: s.outputs, object: s.object }))
  const names = readable(a.folder) ? readdirSync(join(ROOT, a.folder)).filter((f) => f.endsWith('.md') && !f.startsWith('.')).map((f) => f.slice(0, -3)) : []
  const rank = (n: string) => { const i = FILE_ORDER.indexOf(n); return i < 0 ? 99 : i }
  const files = names.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y, 'zh')).map((n) => {
    const check = a.role?.files.find((f) => f.name === n)
    return { name: n, path: `${a.folder}/${n}.md`, call: FILE_CALL[n] ?? '', problems: check?.problems ?? [] }
  })
  const resident = a.thread ? sessions.find((s) => s.title === a.thread) : undefined
  const { role, ...rest } = a
  return {
    ...rest,
    files, folder_problems: role?.problems ?? [],
    sessions: mine,
    dispatch: a.chief ? dispatchOf(loaded.list) : [],
    usage: usageOf(mine.map((s) => s.id)),
    resident: resident ? { id: resident.id, title: resident.title, link: resident.link } : null,
    note: '这里只看。想改它的设定，在 Codex 里说“改一下<名字>的……”，或打开知识库原文。用量是归到它的对话在这台电脑上的记录加起来，估的。',
  }
}
