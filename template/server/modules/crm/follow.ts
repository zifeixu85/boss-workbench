// “填了下次跟进日期，自动生成一条待办和提醒”。归属：大客户模块。
// 一位客户只留一条自动待办（crm_follow_todos 记着是哪条）：改日期就改这条；清空日期就取消；
// 记了一笔跟进：约了新日子或原来的日子已到 → 这条完成（有新日子再建一条）；日子没变、还没到 → 这条留着。
// 只依赖 db 和 common，公共的 services/clients.ts 也会调用它（记一笔、改资料时），不会循环引用。
import { get, run, uid, nowIso, logChange } from '../../db.ts'
import type { Actor } from '../../services/common.ts'

type ClientLite = { id: string; name: string; next_follow: string | null; next_step: string | null; key_account: number | null }
type TodoLite = { id: string; status: string; due: string | null; title: string }

const OPEN = new Set(['待办', '进行中', '等别人'])

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
    if (old!.due !== c.next_follow || old!.title !== title) {
      run('UPDATE todos SET due = :due, title = :title, updated_at = :at WHERE id = :id', { due: c.next_follow, title, at, id: old!.id })
      logChange(actor, 'todo', old!.id, '修改', `${c.name}的自动跟进待办改到 ${c.next_follow}`)
    }
    return old!.id
  }
  const id = uid('t')
  run(`INSERT INTO todos (id, title, status, priority, due, client_id, project_id, note, created_at, updated_at)
       VALUES (:id, :title, '待办', :priority, :due, :cid, NULL, :note, :at, :at)`, {
    id, title, priority: c.key_account ? '重要' : '普通', due: c.next_follow, cid: c.id,
    note: '填了“下次跟进”日期，工作台自动建的；改日期这条跟着改，记一笔跟进后自动完成。', at,
  })
  run('INSERT INTO crm_follow_todos (client_id, todo_id) VALUES (:cid, :tid) ON CONFLICT(client_id) DO UPDATE SET todo_id = :tid', { cid: c.id, tid: id })
  logChange(actor, 'todo', id, '新建', `${c.name}：下次跟进 ${c.next_follow}，自动建了待办`)
  return id
}
