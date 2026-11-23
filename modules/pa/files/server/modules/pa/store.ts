// 进展：数据库里的对话元信息 + 用户点过的标记 → 带状态、带归类的清单。状态和归类每次现算（知识库、时间都会变）。
import { homedir } from 'node:os'
import { basename } from 'node:path'
import { all, get, run, logChange, nowIso } from '../../db.ts'
import { BadRequest, NotFound, type Actor } from '../../services/common.ts'
import { allObjects } from './kb.ts'
import { matchObject } from './match.ts'
import { inferStatus } from './status.ts'
import { STATUSES, type Status } from './types.ts'

type Row = {
  id: string; tool: string; sid: string; cwd: string; title: string; title_from: string; first: string; origin: string; kind: string
  started_at: string; last_at: string; last_role: string; turn_open: number; asks: number; aborted: number; turns: number; seen: number | null; archived: number; app_waiting: number | null; app_sid: string | null
  read_at: string | null; m_status: string | null; status_at: string | null; m_object: string | null
}
export type SessionView = {
  id: string; tool: string; tool_name: string; kind: string; title: string; title_from: string; first: string; cwd: string; folder: string
  started_at: string; last_at: string; turns: number
  status: Status; why: string; inferred: boolean
  /** 归到哪个对象；by：文件夹 / 名字 / 手动；null = 未归类 */
  object: { path: string; name: string; type: string; by: string } | null
  /** 能跳回对话的链接：Codex 是 codex://threads/<编号>；Claude 桌面版里开的是 claude://code/continue?session=<桌面版编号>；命令行开的 Claude Code 没有链接，给一条命令 */
  link: string | null; resume: string | null
  outputs: number
}

export const TOOL_NAMES: Record<string, string> = { codex: 'Codex', claude: 'Claude Code' }
export const now = () => (process.env.PA_NOW ? Date.parse(process.env.PA_NOW) : Date.now())

function view(r: Row, outputs: number): SessionView {
  const objects = allObjects()
  const st = inferStatus({ lastAt: r.last_at, turnOpen: !!r.turn_open, lastRole: r.last_role, asks: !!r.asks, aborted: !!r.aborted, seen: r.seen === null ? null : !!r.seen, archived: !!r.archived, ...(r.app_waiting === null ? {} : { appWaiting: !!r.app_waiting }) }, now(), { readAt: r.read_at, status: r.m_status, statusAt: r.status_at })
  const title = r.title || r.first || '（没有标题）'
  let object: SessionView['object'] = null
  if (r.m_object && r.m_object !== '-') {
    const o = objects.find((x) => x.object.path === r.m_object)
    if (o) object = { path: o.object.path, name: o.object.name, type: o.cls.name, by: '手动' }
  }
  if (!object && r.m_object !== '-') {
    const m = matchObject({ cwd: r.cwd, title: r.title, first: r.first }, objects.map((x) => x.object), homedir())
    const o = m && objects.find((x) => x.object.path === m.path)
    if (m && o) object = { path: m.path, name: o.object.name, type: o.cls.name, by: m.by }
  }
  return {
    id: r.id, tool: r.tool, tool_name: TOOL_NAMES[r.tool] ?? r.tool, kind: r.kind, title, title_from: r.title ? r.title_from : r.first ? '第一句' : '', first: r.first, cwd: r.cwd, folder: basename(r.cwd) || r.cwd,
    started_at: r.started_at, last_at: r.last_at, turns: r.turns, ...st, object,
    link: r.tool === 'codex' ? `codex://threads/${r.sid}` : r.app_sid ? `claude://code/continue?session=${r.app_sid}` : null,
    resume: r.tool === 'claude' ? `claude --resume ${r.sid}` : null,
    outputs,
  }
}

const SELECT = `SELECT s.*, m.read_at, m.status AS m_status, m.status_at, m.object AS m_object FROM pa_sessions s LEFT JOIN pa_marks m ON m.session_id = s.id`

/** 最近 days 天有动静的对话。默认只列人开的对话；all = 连 AI 自己派的子任务、脚本一次性调用也列 */
export function listSessions(opts: { days?: number; all?: boolean } = {}): SessionView[] {
  const since = new Date(now() - (opts.days ?? 30) * 864e5).toISOString()
  const rows = all<Row>(`${SELECT} WHERE s.last_at >= :since ${opts.all ? '' : "AND s.kind = '对话'"} ORDER BY s.last_at DESC LIMIT 500`, { since })
  const counts = new Map(all<{ session_id: string; n: number }>("SELECT session_id, COUNT(*) AS n FROM pa_outputs WHERE session_id IS NOT NULL AND action <> '修改' AND kind <> '代码' GROUP BY session_id").map((r) => [r.session_id, r.n]))
  return rows.map((r) => view(r, counts.get(r.id) ?? 0))
}

export function getSession(id: string): SessionView {
  const r = get<Row>(`${SELECT} WHERE s.id = :id`, { id })
  if (!r) throw new NotFound('找不到这个对话（可能记录文件已经不在了）')
  return view(r, get<{ n: number }>("SELECT COUNT(*) AS n FROM pa_outputs WHERE session_id = :id AND action <> '修改' AND kind <> '代码'", { id })?.n ?? 0)
}

/** 各状态几个（页签上的数、今日页的卡、菜单角标共用） */
export function statusCounts(list: SessionView[]) {
  const out: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const s of list) out[s.status]++
  return out
}

function upsertMark(id: string, patch: { read_at?: string | null; status?: string | null; status_at?: string | null; object?: string | null }) {
  const old = get<{ read_at: string | null; status: string | null; status_at: string | null; object: string | null }>('SELECT read_at, status, status_at, object FROM pa_marks WHERE session_id = :id', { id }) ?? { read_at: null, status: null, status_at: null, object: null }
  const next = { ...old, ...patch }
  run(`INSERT INTO pa_marks (session_id, read_at, status, status_at, object, updated_at) VALUES (:id, :read_at, :status, :status_at, :object, :at)
       ON CONFLICT(session_id) DO UPDATE SET read_at = :read_at, status = :status, status_at = :status_at, object = :object, updated_at = :at`, { id, ...next, at: nowIso() })
}

/** 标已看（点“打开对话”也算）。只记在工作台里，不动对话记录 */
export function markRead(id: string, actor: Actor) {
  const s = getSession(id)
  upsertMark(id, { read_at: new Date(Math.max(now(), Date.parse(s.last_at))).toISOString() })
  logChange(actor, 'pa_session', id, '标已看', `进展：标已看「${s.title.slice(0, 30)}」`)
  return getSession(id)
}

/** 手动改状态；status 传 null = 改回自动推断 */
export function setStatus(id: string, status: string | null, actor: Actor) {
  const s = getSession(id)
  if (status !== null && !STATUSES.includes(status as Status)) throw new BadRequest(`状态只能是：${STATUSES.join('、')}`)
  upsertMark(id, { status, status_at: status ? s.last_at : null })
  logChange(actor, 'pa_session', id, '改状态', `进展：「${s.title.slice(0, 30)}」${status ? `改成 ${status}` : '改回自动推断'}`)
  return getSession(id)
}

/** 手动归到某个对象；path 传 null = 改回自动认，传 '-' = 不归类 */
export function setObject(id: string, path: string | null, actor: Actor) {
  const s = getSession(id)
  if (path && path !== '-' && !allObjects().some((x) => x.object.path === path)) throw new BadRequest('知识库里没有这个对象')
  upsertMark(id, { object: path })
  logChange(actor, 'pa_session', id, '归类', `进展：「${s.title.slice(0, 30)}」${path === '-' ? '指为不归类' : path ? `归到 ${path}` : '改回自动归类'}`)
  return getSession(id)
}
