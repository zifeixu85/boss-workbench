// “填了下次跟进日期，自动生成一条待办和提醒”。归属：大客户模块。
// 一位客户只留一条自动待办（crm_follow_todos 记着是哪条）：改日期就改这条；清空日期就取消；
// 记了一笔跟进：约了新日子或原来的日子已到 → 这条完成（有新日子再建一条）；日子没变、还没到 → 这条留着。
// 那天已经有这家没做完的待办或日程，就不再建（10-12）：同一件事只留一条。自动建的优先级是“重要”。
// 只依赖 db 和 common，公共的 services/clients.ts 也会调用它（记一笔、改资料时），不会循环引用。
import { get, run, uid, nowIso, logChange } from '../../db.ts'
import type { Actor } from '../../services/common.ts'

type ClientLite = { id: string; name: string; next_follow: string | null; next_step: string | null; key_account: number | null }
type TodoLite = { id: string; status: string; due: string | null; title: string }

const OPEN = new Set(['待办', '进行中', '等别人'])

/** 这位客户在 day 那天已有的事：没做完的待办（截止那天）或日程（那天开始），有就返回它的 ID，没有返回 null。
 *  skip：自动待办自己（刚标完成的旧那条不算） */
function sameDayItem(clientId: string, day: string, skip?: string): string | null {
  const todo = get<{ id: string }>(`SELECT id FROM todos WHERE client_id = :cid AND due = :day AND id != :skip
    AND status IN ('待办','进行中','等别人') ORDER BY created_at LIMIT 1`, { cid: clientId, day, skip: skip ?? '' })
  if (todo) return todo.id
  const ev = get<{ id: string }>("SELECT id FROM events WHERE client_id = :cid AND substr(start, 1, 10) = :day ORDER BY start LIMIT 1", { cid: clientId, day })
  return ev?.id ?? null
}

function titleOf(c: ClientLite) {
  const step = c.next_step?.trim()
  return `跟进${c.name}${step ? `：${step.length > 40 ? `${step.slice(0, 40)}…` : step}` : ''}`.slice(0, 120)
}

/** 按客户现在的“下次跟进”同步那条自动待办。done=true：这次是记了一笔跟进，旧的那条算做完了 */
export function syncFollowTodo(clientId: string, actor: Actor, opts: { done?: boolean } = {}) {
  const c = get<ClientLite>('SELECT id, name, next_follow, next_step, key_account FROM clients WHERE id = :id', { id: clientId })
  if (!c) return null
  const link = get<{ todo_id: string }>('SELECT todo_id FROM crm_follow_todos WHERE client_id = :id', { id: c.id })
  const old = link ? get<TodoLite>('SELECT id, status, due, title FROM todos WHERE id = :id', { id: link.todo_id }) : undefined
  const at = nowIso()
  const oldOpen = old && OPEN.has(old.status)

  // 记一笔、但下次跟进的日子没变（还没到那天）：那天的跟进还没做，这条留着，不“完成了又建一条一样的”（第二轮修 #7）
  if (opts.done && oldOpen && c.next_follow && old!.due === c.next_follow) {
    const title = titleOf(c)
    if (old!.title !== title) run('UPDATE todos SET title = :title, updated_at = :at WHERE id = :id', { title, at, id: old!.id })
    return old!.id
  }

  // 旧的那条：记了一笔（日子到了或约了新日子）→ 完成；日期清空 → 取消；日期变了且不是记一笔 → 直接改日期（下面）
  if (oldOpen && (opts.done || !c.next_follow)) {
    const status = opts.done ? '完成' : '取消'
    run('UPDATE todos SET status = :s, done_at = :done, updated_at = :at WHERE id = :id', { s: status, done: opts.done ? at : null, at, id: old!.id })
    logChange(actor, 'todo', old!.id, status, `${c.name}的自动跟进待办${status === '完成' ? '已完成（记了一笔跟进）' : '已取消（下次跟进清空了）'}`)
  }
  if (!c.next_follow) {
    if (link) run('DELETE FROM crm_follow_todos WHERE client_id = :id', { id: c.id })
    return null
  }
  const title = titleOf(c)
  if (oldOpen && !opts.done) {
    // 改到的那天已经有这家的待办或日程：自动那条取消，不留两条一样的
    const same = old!.due !== c.next_follow ? sameDayItem(c.id, c.next_follow, old!.id) : null
    if (same) {
      run("UPDATE todos SET status = '取消', updated_at = :at WHERE id = :id", { at, id: old!.id })
      run('DELETE FROM crm_follow_todos WHERE client_id = :id', { id: c.id })
      logChange(actor, 'todo', old!.id, '取消', `${c.name}的自动跟进待办已取消（${c.next_follow} 那天已经有这家的安排）`)
      return null
    }
    if (old!.due !== c.next_follow || old!.title !== title) {
      run('UPDATE todos SET due = :due, title = :title, updated_at = :at WHERE id = :id', { due: c.next_follow, title, at, id: old!.id })
      logChange(actor, 'todo', old!.id, '修改', `${c.name}的自动跟进待办改到 ${c.next_follow}`)
    }
    return old!.id
  }
  // 那天已经有这家的事（没做完的待办或日程，按关联客户对）：就是同一件事，不再多建一条“跟进某某”（10-12 修：
  // 锦川 10/28 已有“去锦川送补发 6 盒、当面道歉”待办和日程，记一笔后又建了“跟进锦川置业：送补发的 6 盒……”）
  // 返回 null：没有自动待办（调用方据此说“已改下次跟进”，不说“自动建了一条跟进待办”）
  if (sameDayItem(c.id, c.next_follow, old?.id)) return null
  const id = uid('t')
  run(`INSERT INTO todos (id, title, status, priority, due, client_id, project_id, note, created_at, updated_at)
       VALUES (:id, :title, '待办', :priority, :due, :cid, NULL, :note, :at, :at)`, {
    // 优先级：自动跟进待办一律“重要”（原来普通客户是“普通”，排在“这周还要做”的后面，今日页第一屏看不到）
    id, title, priority: '重要', due: c.next_follow, cid: c.id,
    note: '填了“下次跟进”日期，工作台自动建的；改日期这条跟着改，记一笔跟进后自动完成。', at,
  })
  run('INSERT INTO crm_follow_todos (client_id, todo_id) VALUES (:cid, :tid) ON CONFLICT(client_id) DO UPDATE SET todo_id = :tid', { cid: c.id, tid: id })
  logChange(actor, 'todo', id, '新建', `${c.name}：下次跟进 ${c.next_follow}，自动建了待办`)
  return id
}
