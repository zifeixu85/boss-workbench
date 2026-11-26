// 撤回一条改动（services/undo.ts 记下的“改之前的样子”）：对话栏结果卡上的“撤回”、命令 change-revert 用。
// 撤回本身记成一条新改动（“撤回：……”），也能再撤回。之后又被改过的、没记下改前样子的（比如改知识库文件）不撤，说清楚。
import { all, get, logChange, nowIso, open, run, tx } from '../db.ts'
import { applyRevert, dropPending, revertState } from './undo.ts'
import { BadRequest, NotFound, type Actor } from './common.ts'

type ChangeRow = { id: number; at: string; actor: string; entity: string; entity_id: string; action: string; summary: string }

/** 改动在网页上点“打开”去哪（认得出的几类；认不出不给） */
export function changeLink(c: Pick<ChangeRow, 'entity' | 'entity_id'>): string | null {
  const id = encodeURIComponent(c.entity_id)
  switch (c.entity) {
    case 'todo': return `/todos?todo=${id}`
    case 'event': return `/calendar?event=${id}`
    case 'project': return `/projects?project=${id}`
    case 'client': case 'care': case 'deal': case 'promise': case 'receivable': return c.entity === 'client' ? `/clients/${id}` : null
    case 'inbox': return '/inbox'
    case 'pa_object': return `/focus/-?o=${id}`
    case 'xhs_piece': return `/content/studio/${id}`
    case 'kb': return `/kb?path=${id}`
    default: return null
  }
}

/** 某段改动的结果卡：编号、谁、改了什么、去哪看、能不能撤 */
export function changeCards(fromId: number, toId: number | null, actors: string[] = ['Codex']) {
  const rows = all<ChangeRow>(`SELECT * FROM changes WHERE id > :a ${toId ? 'AND id <= :b' : ''} ORDER BY id`, { a: fromId, ...(toId ? { b: toId } : {}) })
  return rows.filter((c) => actors.includes(c.actor) && c.action !== '撤回').map((c) => {
    const st = revertState(open(), c.id)
    return { id: c.id, at: c.at, entity: c.entity, action: c.action, summary: c.summary, link: changeLink(c), revert: st.state, why: st.why ?? null }
  })
}

export const lastChangeId = () => get<{ id: number }>('SELECT MAX(id) AS id FROM changes')?.id ?? 0

export function revertChange(changeId: number, actor: Actor) {
  const c = get<ChangeRow>('SELECT * FROM changes WHERE id = :id', { id: changeId })
  if (!c) throw new NotFound('没有这条改动')
  const st = revertState(open(), changeId)
  if (st.state === 'reverted') throw new BadRequest('这条已经撤回过了')
  if (st.state !== 'ready') throw new BadRequest(`撤不了：${st.why}`)
  const d = open()
  return tx(() => {
    dropPending(d)
    const n = applyRevert(d, changeId)
    const by = logChange(actor, c.entity, c.entity_id, '撤回', `撤回：${c.summary}`)
    run('INSERT INTO undo_reverted (change_id, by_change_id, at) VALUES (:c, :b, :at)', { c: changeId, b: by, at: nowIso() })
    return { reverted: changeId, by, rows: n, summary: `撤回：${c.summary}` }
  })
}
