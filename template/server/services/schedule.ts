// 日程与待办
import { all, get, run, uid, nowIso, logChange, params } from '../db.ts'
import { eventInput, todoInput } from '../../shared/schema.ts'
import { type Actor, NotFound, BadRequest, today, setClause, onlyGiven } from './common.ts'

const EVENT_SQL = `SELECT e.*, c.name AS client_name, p.name AS project_name FROM events e
  LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN projects p ON p.id = e.project_id`

// 时间一律换成“YYYY-MM-DDTHH:MM”再比（底座审查 #5）：全天日程的 start 只有日期（'2026-10-31'），
// 直接和 '2026-10-31T00:00' 比字符串会被当成更早，提前一天漏进查询范围。
// 全天日程的 end 是“结束后的那一天”（FullCalendar 的写法：end 写 5/13 = 实际到 5/12），没写 end 就是只占当天。
const START_N = `CASE WHEN length(e.start) = 10 THEN e.start || 'T00:00' ELSE e.start END`
const END_N = `CASE WHEN e.end IS NOT NULL THEN (CASE WHEN length(e.end) = 10 THEN e.end || 'T00:00' ELSE e.end END)
  WHEN length(e.start) = 10 THEN date(e.start, '+1 day') || 'T00:00' ELSE e.start END`
const norm = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00` : s)

/** [from, to) 之间有安排的日程（和这段时间有重叠就算） */
export function listEvents(from?: string, to?: string) {
  const f = from ? norm(from) : '0000'
  const t = to ? norm(to) : '9999'
  return all(`${EVENT_SQL} WHERE ${START_N} < :t AND (${END_N} > :f OR ${START_N} >= :f) ORDER BY ${START_N}`, { f, t })
}

export function getEvent(id: string) {
  const row = get(`${EVENT_SQL} WHERE e.id = :id`, { id })
  if (!row) throw new NotFound('找不到这个日程')
  return row
}

export function createEvent(input: unknown, actor: Actor) {
  const data = eventInput.parse(input)
  if (data.end && data.end < data.start) throw new BadRequest('结束时间早于开始时间')
  const id = uid('e')
  const at = nowIso()
  run(`INSERT INTO events (id, title, start, end, all_day, kind, location, client_id, project_id, note, source, created_at, updated_at)
       VALUES (:id, :title, :start, :end, :all_day, :kind, :location, :client_id, :project_id, :note, :source, :at, :at)`,
  params({ end: null, location: null, client_id: null, project_id: null, note: null, ...data, id, source: actor === 'Codex' ? 'Codex' : '手动', at }))
  logChange(actor, 'event', id, '新建', `日程「${data.title}」${data.start.replace('T', ' ')}`)
  return getEvent(id)
}

export function updateEvent(id: string, input: unknown, actor: Actor) {
  const before = getEvent(id) as { title: string }
  const patch = onlyGiven(eventInput.partial().parse(input), input)
  if (!Object.keys(patch).length) throw new BadRequest('没有要修改的字段')
  run(`UPDATE events SET ${setClause(patch)}, updated_at = :at WHERE id = :id`, params({ ...patch, at: nowIso(), id }))
  logChange(actor, 'event', id, '修改', `日程「${patch.title ?? before.title}」${patch.start ? `改到 ${patch.start.replace('T', ' ')}` : '已更新'}`)
  return getEvent(id)
}

export function deleteEvent(id: string, actor: Actor) {
  const before = getEvent(id) as { title: string }
  run('DELETE FROM events WHERE id = :id', { id })
  logChange(actor, 'event', id, '删除', `删除日程「${before.title}」`)
  return { id }
}

const TODO_SQL = `SELECT t.*, c.name AS client_name, p.name AS project_name FROM todos t
  LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN projects p ON p.id = t.project_id`

export function listTodos(opts: { open?: boolean } = {}) {
  const where = opts.open ? "WHERE t.status NOT IN ('完成','取消')" : ''
  return all(`${TODO_SQL} ${where} ORDER BY CASE t.status WHEN '完成' THEN 1 WHEN '取消' THEN 2 ELSE 0 END,
    CASE t.priority WHEN '紧急' THEN 0 WHEN '重要' THEN 1 ELSE 2 END, COALESCE(t.due, '9999'), COALESCE(t.due_time, '99:99')`)
}

export function getTodo(id: string) {
  const row = get(`${TODO_SQL} WHERE t.id = :id`, { id })
  if (!row) throw new NotFound('找不到这条待办')
  return row
}

/** 到期时间要跟着日期：没有截止日期就不能单写时间（提醒按“日期 + 时间”算，见 server/reminders/） */
const NEED_DATE = '定了到期时间，要先选截止日期'

export function createTodo(input: unknown, actor: Actor) {
  const data = todoInput.parse(input)
  if (data.due_time && !data.due) throw new BadRequest(NEED_DATE)
  const id = uid('t')
  const at = nowIso()
  run(`INSERT INTO todos (id, title, status, priority, due, due_time, client_id, project_id, note, created_at, updated_at)
       VALUES (:id, :title, :status, :priority, :due, :due_time, :client_id, :project_id, :note, :at, :at)`,
  params({ due: null, due_time: null, client_id: null, project_id: null, note: null, ...data, id, at }))
  logChange(actor, 'todo', id, '新建', `待办「${data.title}」${data.due_time ? `，${data.due} ${data.due_time} 到期` : ''}`)
  return getTodo(id)
}

export function updateTodo(id: string, input: unknown, actor: Actor) {
  const before = getTodo(id) as { title: string; status: string; due: string | null }
  const patch = onlyGiven(todoInput.partial().parse(input), input)
  // 截止日期清空了，到期时间也一起清掉（只剩时间没有意义）
  if (patch.due === null) Object.assign(patch, { due_time: null })
  if (!Object.keys(patch).length) throw new BadRequest('没有要修改的字段')
  if (patch.due_time && !(patch.due ?? before.due)) throw new BadRequest(NEED_DATE)
  const doneAt = patch.status === '完成' && before.status !== '完成' ? today() : patch.status && patch.status !== '完成' ? null : undefined
  run(`UPDATE todos SET ${setClause(patch)}${doneAt !== undefined ? ', done_at = :done_at' : ''}, updated_at = :at WHERE id = :id`,
    params({ ...patch, ...(doneAt !== undefined ? { done_at: doneAt } : {}), at: nowIso(), id }))
  logChange(actor, 'todo', id, '修改', `待办「${before.title}」${patch.status ? `→${patch.status}` : '已更新'}`)
  return getTodo(id)
}

export function deleteTodo(id: string, actor: Actor) {
  const before = getTodo(id) as { title: string }
  run('DELETE FROM todos WHERE id = :id', { id })
  logChange(actor, 'todo', id, '删除', `删除待办「${before.title}」`)
  return { id }
}
