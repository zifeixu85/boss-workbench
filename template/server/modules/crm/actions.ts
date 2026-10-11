// 大客户模块（写）：改阶段、改下次跟进、答应的事、关怀草稿。归属：大客户模块。
// 规矩：改历史记录（阶段、答应过的事、下次跟进）要写原因，留下新旧值和时间（crm_edits）；全部也记进“最近改动”。
import { get, run, tx, uid, nowIso, logChange, params } from '../../db.ts'
import { now } from '../../clock.ts'
import { type Actor, BadRequest, NotFound, today } from '../../services/common.ts'
import { findClient } from '../../services/clients.ts'
import { syncFollowTodo } from './follow.ts'
import { findingAppend, findingPreview, kbDecisionNote, type FindingInput } from './materials.ts'
import { careInput, careUpdate, decisionInput, followInput, promiseInput, promiseUpdate, stageInput } from './schema.ts'

/** 记一笔改动留痕 */
export function recordEdit(clientId: string, entity: '阶段' | '答应的事' | '下次跟进' | '关怀' | '商机', entityId: string | null, oldValue: string | null, newValue: string | null, reason: string, actor: Actor) {
  run(`INSERT INTO crm_edits (client_id, entity, entity_id, old_value, new_value, reason, actor, at)
       VALUES (:cid, :entity, :eid, :old, :new, :reason, :actor, :at)`, { cid: clientId, entity, eid: entityId, old: oldValue, new: newValue, reason, actor, at: nowIso() })
}

/** 改阶段（看板拖动、抽屉里改）：必须写原因 */
export function changeStage(id: string, input: unknown, actor: Actor) {
  const data = stageInput.parse(input)
  const c = findClient(id)
  if (c.stage === data.stage) throw new BadRequest(`${c.name}已经是“${data.stage}”了`)
  return tx(() => {
    run('UPDATE clients SET stage = :stage, updated_at = :at WHERE id = :id', { stage: data.stage, at: nowIso(), id: c.id })
    recordEdit(c.id, '阶段', c.id, c.stage, data.stage, data.reason, actor)
    logChange(actor, 'client', c.id, '改阶段', `${c.name}：${c.stage} → ${data.stage}（${data.reason}）`)
    return { id: c.id, from: c.stage, to: data.stage }
  })
}

/** 改下次跟进（和下一步）：自动待办跟着建 / 改 / 取消。applyFollow 不开事务，给别的写入（新材料确认）在同一个事务里用 */
export function applyFollow(id: string, input: unknown, actor: Actor, opts: { allowPast?: boolean } = {}) {
  const data = followInput.parse(input)
  const c = findClient(id)
  // 第三轮：下次跟进不能约在已经过了的日子（新材料提取时按材料日期算的除外）
  if (data.next_follow && data.next_follow < today() && !opts.allowPast) throw new BadRequest(`下次跟进要选今天（${Number(today().slice(5, 7))}/${Number(today().slice(8, 10))}）或以后的日子`)
  const cur = get<{ next_step: string | null }>('SELECT next_step FROM clients WHERE id = :id', { id: c.id })
  const step = data.next_step === undefined ? cur?.next_step ?? null : (data.next_step?.trim() || null)
  run('UPDATE clients SET next_follow = :next, next_step = :step, updated_at = :at WHERE id = :id', { next: data.next_follow, step, at: nowIso(), id: c.id })
  if (c.next_follow !== data.next_follow) {
    recordEdit(c.id, '下次跟进', c.id, c.next_follow, data.next_follow, data.reason?.trim() || '改了下次跟进日期', actor)
  }
  logChange(actor, 'client', c.id, '修改', `${c.name}：下次跟进 ${c.next_follow ?? '未定'} → ${data.next_follow ?? '未定'}`)
  const todo = syncFollowTodo(c.id, actor)
  return { id: c.id, next_follow: data.next_follow, todo_id: todo }
}
export const setFollow = (id: string, input: unknown, actor: Actor) => tx(() => applyFollow(id, input, actor))

type PromiseRow = { id: string; client_id: string; text: string; due: string | null; status: string; note: string | null }

/** 答应的事：标已兑现 / 取消 / 改日期，都要写原因 */
export function updatePromise(id: string, input: unknown, actor: Actor) {
  const data = promiseUpdate.parse(input)
  const p = get<PromiseRow>('SELECT * FROM client_promises WHERE id = :id', { id })
  if (!p) throw new NotFound('找不到这件答应的事')
  const c = findClient(p.client_id)
  const changes: [string, string | null, string | null][] = []
  if (data.status && data.status !== p.status) changes.push(['状态', p.status, data.status])
  if (data.due !== undefined && data.due !== p.due) changes.push(['日期', p.due, data.due])
  if (data.text && data.text !== p.text) changes.push(['内容', p.text, data.text])
  if (!changes.length && data.note === undefined) throw new BadRequest('没有要改的')
  return tx(() => {
    run(`UPDATE client_promises SET status = :status, due = :due, text = :text, note = :note,
         done_at = CASE WHEN :status = '已兑现' THEN COALESCE(done_at, :today) ELSE NULL END WHERE id = :id`, {
      status: data.status ?? p.status, due: data.due === undefined ? p.due : data.due, text: data.text ?? p.text,
      note: data.note === undefined ? p.note : data.note, today: today(), id,
    })
    const desc = changes.map(([k, a, b]) => `${k}：${a ?? '无'} → ${b ?? '无'}`).join('；')
    recordEdit(c.id, '答应的事', id, changes.map(([k, a]) => `${k}=${a ?? '无'}`).join('；') || null, changes.map(([k, , b]) => `${k}=${b ?? '无'}`).join('；') || null, data.reason, actor)
    logChange(actor, 'promise', id, '修改', `${c.name}答应的“${p.text.slice(0, 24)}”${desc ? `：${desc}` : ''}（${data.reason}）`)
    return get('SELECT * FROM client_promises WHERE id = :id', { id })
  })
}

type ConflictRow = PromiseRow & { conflict: string | null; decision: string | null; interaction_id: string | null; source_file: string | null }

/** “规则该改了”要追加进知识库的那一节（先给林总看） */
function findingOf(id: string, note: string): { p: ConflictRow; input: FindingInput } {
  const p = get<ConflictRow>('SELECT * FROM client_promises WHERE id = :id', { id })
  if (!p) throw new NotFound('找不到这件答应的事')
  if (!p.conflict) throw new BadRequest('这件事和判断规则没有对不上的地方，不用定')
  const c = findClient(p.client_id)
  const talk = p.interaction_id ? get<{ date: string; channel: string }>('SELECT date, channel FROM interactions WHERE id = :id', { id: p.interaction_id }) : undefined
  const said = talk ? `${Number(talk.date.slice(5, 7))}/${Number(talk.date.slice(8, 10))} ${talk.channel}` : '之前'
  return { p, input: { client: c.name, promise: p.text, said, source: p.source_file, conflict: p.conflict, note: note.trim() || '规则该改了', today: today() } }
}

export function previewDecision(id: string, input: unknown) {
  const note = String((input as { note?: string } | null)?.note ?? '')
  const { input: x } = findingOf(id, note)
  return findingPreview(x)
}

/** 标黄的答应林总定了：这次算例外（写原因），或者规则该改了（在知识库待确认的发现里加一节，先备份）。定了以后不再标黄 */
export function decidePromise(id: string, input: unknown, actor: Actor) {
  const data = decisionInput.parse(input)
  const { p, input: x } = findingOf(id, data.note)
  if (p.decision) throw new BadRequest(`这件事 ${p.decision === '例外' ? '已经定为例外' : '已经说了规则该改'}，不用再定`)
  const c = findClient(p.client_id)
  let finding: { path: string; title: string; backup: string } | null = null
  const d0 = now()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${today()}T${pad(d0.getHours())}${pad(d0.getMinutes())}${pad(d0.getSeconds())}`
  if (data.decision === '改规则') {
    finding = findingAppend(x, stamp)
    logChange(actor, 'kb', finding.path, '追加', `待确认的发现：${finding.title}（备份在 ${finding.backup}）`)
  }
  // 第三轮修数据评审 #8：客户文件“答应过的事”那一行后面追加林总怎么定的（找不到那一行就只记在工作台）
  let kbNote: { path: string; backup: string } | null = null
  try {
    const n = kbDecisionNote(c.id, p.text, data.decision, data.note, today(), stamp)
    if (n) { kbNote = { path: n.path, backup: n.backup }; logChange(actor, 'kb', n.path, '追加', `${c.name}“答应过的事”：${p.text.slice(0, 20)}后面记了林总怎么定的（备份在 ${n.backup}）`) }
  } catch { kbNote = null }
  tx(() => {
    run('UPDATE client_promises SET decision = :d, decision_note = :n, decision_at = :at WHERE id = :id', { d: data.decision, n: data.note, at: today(), id })
    recordEdit(c.id, '答应的事', id, '和判断规则对不上，等林总定', data.decision === '例外' ? '这次算例外' : '规则该改了（记进待确认的发现）', data.note, actor)
    logChange(actor, 'promise', id, '修改', `${c.name}答应的“${p.text.slice(0, 24)}”：${data.decision === '例外' ? '这次算例外' : '规则该改了'}（${data.note}）`)
  })
  return { ...get('SELECT * FROM client_promises WHERE id = :id', { id }), finding, kb_note: kbNote }
}

/** 手动加一件答应的事 */
export function addPromise(input: unknown, actor: Actor) {
  const data = promiseInput.parse(input)
  const c = findClient(data.client_id)
  const id = uid('pr')
  run(`INSERT INTO client_promises (id, client_id, text, due, status, who, to_whom, created_at)
       VALUES (:id, :cid, :text, :due, '待兑现', :who, :to, :at)`, { id, cid: c.id, text: data.text, due: data.due ?? null, who: data.who, to: data.to_whom ?? null, at: nowIso() })
  logChange(actor, 'promise', id, '新建', `${c.name}：${data.who}答应“${data.text.slice(0, 30)}”`)
  return get('SELECT * FROM client_promises WHERE id = :id', { id })
}

// ───────────── 关怀 ─────────────

/** 存一条关怀草稿（工作台按模板拼的、Codex 写的、林总自己写的都存这里；author 写清是谁写的） */
export function addCare(input: unknown, actor: Actor) {
  const data = careInput.parse(input)
  const c = findClient(data.client_id)
  const id = uid('cr')
  const at = nowIso()
  run(`INSERT INTO client_care (id, client_id, occasion, date, gift, message, status, note, author, sent_at, created_at)
       VALUES (:id, :cid, :occasion, :date, :gift, :message, :status, :note, :author, :sent, :at)`,
  params({ id, cid: c.id, occasion: data.occasion, date: data.date ?? null, gift: data.gift ?? null, message: data.message ?? null, status: data.status,
    note: data.note ?? null, author: data.author ?? '林总', sent: data.status === '已送出' ? at : null, at }))
  logChange(actor, 'care', id, '新建', `${c.name}：${data.occasion}${data.status === '已送出' ? '（已发出）' : '的关怀草稿'}`)
  return get('SELECT * FROM client_care WHERE id = :id', { id })
}

/** 改草稿、标已发、不做 */
export function updateCare(id: string, input: unknown, actor: Actor) {
  const data = careUpdate.parse(input)
  const x = get<{ id: string; client_id: string; occasion: string; status: string; message: string | null; author: string | null }>('SELECT * FROM client_care WHERE id = :id', { id })
  if (!x) throw new NotFound('找不到这条关怀')
  const c = findClient(x.client_id)
  const at = nowIso()
  const status = data.status ?? x.status
  // 林总改了草稿：来源后面记一笔“林总改过”，不把改过的话还算成 AI 写的
  const edited = !!data.message && data.message !== x.message
  const author = edited && !(x.author ?? '').includes('林总改过') ? `${x.author ?? '林总'} · 林总改过` : x.author
  run(`UPDATE client_care SET status = :status, gift = COALESCE(:gift, gift), message = COALESCE(:message, message), author = :author,
       sent_at = CASE WHEN :status = '已送出' THEN COALESCE(sent_at, :at) ELSE NULL END WHERE id = :id`,
  { status, gift: data.gift ?? null, message: data.message ?? null, author, at, id })
  const what = data.status === '已送出' ? '标记已发出' : data.status === '不做' ? '这次不做' : data.message ? '改了草稿' : `状态→${status}`
  logChange(actor, 'care', id, '修改', `${c.name}：${x.occasion}${what}`)
  return get('SELECT * FROM client_care WHERE id = :id', { id })
}
