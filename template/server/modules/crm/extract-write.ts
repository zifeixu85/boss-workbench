// 新材料提取的写入、撤销、放弃。归属：大客户模块。
// 老板确认后才写：往来记录、答应的事（标黄的可以当场定“例外 / 规则该改了”）、待办、下次跟进（自动待办）、喜好和重要日子、商机金额（勾了才改）、
// 这份材料让之前记着的事不用做了（答应的事、待办、关怀草稿，勾了才关）；
// 勾了“写回知识库”：客户文件开头几行、答应过的事、偏好与重要日子、顾虑、往来记录一起改（先备份）；收件箱原件末尾加一行备注；
// “规则该改了”在 90-持续生长/待确认的发现.md 加一节。
// 第二轮修 #5：写进去的每一样都记下 ID 和改之前的值，可以“撤销这次写入”（演示排练完能复原）。
// 第三轮修（数据评审 #1 #2）：确认前给这位客户的待办、自动跟进待办的关联、改动留痕拍一张“快照”；撤销时按快照原样恢复，
//   不再调 syncFollowTodo（它会把待办标题改成“跟进某某：…”、或者给衡言多建一条），也不再写“下次跟进”的留痕（crm-reset 会按留痕往回退，把澜拓的下次跟进退成空）。
import { all, get, run, tx, uid, nowIso, logChange } from '../../db.ts'
import { now } from '../../clock.ts'
import { type Actor, BadRequest, NotFound, today } from '../../services/common.ts'
import { findClient } from '../../services/clients.ts'
import { applyFollow, recordEdit } from './actions.ts'
import { findingAppend, findingRemove, findingRemoveFor, inboxNote, inboxNoteRevert, kbAppend, kbPreview, kbRevert, type ClientKbInput, type HeaderChange, type LineAdd, type LineEdit } from './materials.ts'
import { extractConfirm, type ExtractConfirm } from './schema.ts'
import { getExtraction, type Row } from './extract.ts'
import { plain, sameTrait, similar, tidy } from './tidy.ts'
import { identity, ownerRe } from '../../services/identity.ts'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const stampNow = () => { const d0 = now(); const p = (n: number) => String(n).padStart(2, '0'); return `${today()}T${p(d0.getHours())}${p(d0.getMinutes())}${p(d0.getSeconds())}` }
const hhmm = () => { const d = now(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
/** 文字里已经写了日子（10/30、10月30日、30 号），就不再拼一遍 */
const hasDate = (s: string) => /\d{1,2}\s*[/月]\s*\d{1,2}|\d{1,2}\s*[号日]/.test(s)
const clean = (x: string) => x.trim().replace(/[。；;，,.\s]+$/, '')
/** 知识库里的日期照客户文件的写法：10/28、1/20；跨年的写 2027/1/10（第三轮修数据评审 #21：一行里不再混“11月2日”和“10/30 前”） */
const kbDates = (s: string) => s.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, '$1/$2/$3').replace(/(\d{1,2})月(\d{1,2})日/g, '$1/$2')
const kbText = (s: string, y: string) => kbDates(clean(tidy(s, y)))
/** 写回知识库的话里，老板用设置里的称呼（“张总 10/28 确认”） */
const me = () => identity().owner
const DECIDED = (p: { decision?: string | null; decision_note?: string | null }) =>
  p.decision === '例外' ? `${me()} ${md(today())} 定为例外${p.decision_note ? `：${p.decision_note.replace(/[（）()]/g, ' ').trim()}` : ''}`
    : p.decision === '改规则' ? `${me()} ${md(today())} 说规则该改，见待确认的发现` : null

/** 写回知识库“往来记录”的那一行，格式照客户文件的规矩：日期｜渠道｜说了什么；答应：…（没有写“无”）；来源：… */
export function kbLineOf(d: Pick<ExtractConfirm, 'date' | 'channel' | 'summary' | 'their_status' | 'promises'>, source: string | null) {
  const y = today().slice(0, 4)
  const owner = me()
  const lead = new RegExp(`^(${ownerRe()})?(答应)?`)
  const promised = d.promises.length
    ? d.promises.map((p) => {
      const what = kbText(p.text, y).replace(lead, '')
      const when = p.due && !hasDate(what) ? ` ${kbDates(md(p.due))} 前` : ''
      const decided = DECIDED(p)
      const flag = p.conflict ? `（和判断规则对不上，${decided ?? `等${owner}定`}）` : ''
      return `${p.who}答应${when}${what}${flag}`
    }).join('、')
    : '无'
  const undecided = d.their_status && /考虑|再看|没定|未定|未成交|尚未/.test(d.their_status) && !/考虑|没定|未定|未成交|尚未/.test(d.summary) ? '；对方还没定' : ''
  return `- ${d.date}｜${d.channel}｜${kbText(d.summary, y)}${undecided}；答应：${promised}；来源：${source ?? `${owner}粘贴的文字`}（工作台 Codex 提取，${owner} ${md(today())} 确认）`
}

/** “答应过的事”表格要加的行：| 谁答应 | 答应了什么 | 哪天前 | 状态 | */
export function kbRowsOf(d: Pick<ExtractConfirm, 'date' | 'channel' | 'promises'>) {
  const y = today().slice(0, 4)
  return d.promises.map((p) => {
    const decided = DECIDED(p)
    const status = p.conflict ? `待兑现（和规则对不上，${decided ?? `等${me()}定`}）` : '待兑现'
    return `| ${p.who} | ${kbText(p.text, y).replace(/\|/g, '／')} | ${p.due ?? '没说'} | ${status}（${md(d.date)} ${d.channel}） |`
  })
}

/** 喜好和重要日子写进“偏好与重要日子”哪一行 */
function prefsOf(d: ExtractConfirm) {
  const y = today().slice(0, 4)
  // 第四轮：和这位客户已经记着的说的是一件事，知识库也不再补（和写进工作台的去重同一把尺子）
  const known = all<{ kind: string; text: string }>('SELECT kind, text FROM client_traits WHERE client_id = :cid', { cid: d.client_id })
  const traits = d.traits.filter((t, i) => t.kind !== '顾虑' && !known.some((k) => sameTrait(k, t)) && !d.traits.slice(0, i).some((o) => sameTrait(o, t)))
    .map((t) => ({ key: t.kind, text: kbText(t.text, y) }))
  const dates = d.dates.map((x) => {
    const when = x.date.startsWith('--') ? `${Number(x.date.slice(2, 4))} 月 ${Number(x.date.slice(5, 7))} 日` : x.date
    return x.kind === '生日' ? { key: '生日', text: `${when}（${x.who ?? x.label.replace(/生日$/, '')}）` } : { key: '重要日子', text: `${x.label} ${when}` }
  })
  return [...dates, ...traits]
}

const kbInput = (d: ExtractConfirm, line: string): ClientKbInput => ({
  line, date: d.date, next_follow: d.next_follow ?? null, today: today(), rows: kbRowsOf(d), prefs: prefsOf(d),
  concerns: [...d.traits.filter((t) => t.kind === '顾虑').map((t) => t.text), ...(d.concerns ? d.concerns.split(/[；;]/) : [])].map((x) => kbText(x, today().slice(0, 4))).filter(Boolean).slice(0, 3),
  said: `${md(d.date)} ${d.channel}`,
})

export function previewKb(id: string, input: unknown) {
  const r = get<Row>('SELECT * FROM crm_extractions WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这次提取')
  const d = extractConfirm.parse(input)
  const line = kbLineOf(d, r.source_path)
  const inbox = r.source_path ? { path: r.source_path, line: inboxLine(d, true) } : null
  try { return { ok: true as const, ...kbPreview(d.client_id, kbInput(d, line)), inbox } } catch (err) { return { ok: false as const, error: (err as Error).message, line, inbox } }
}

const inboxLine = (d: ExtractConfirm, kb: boolean) => `${today()} 已由工作台提取，写进工作台${kb ? '和客户档案' : ''}（${md(d.date)} ${d.channel}），${me()}确认。原件还在这里，整理时再移走。`

type TodoSnap = { id: string; title: string; status: string; priority: string; due: string | null; note: string | null; done_at: string | null; updated_at: string }
type Written = {
  interaction_id: string; promise_ids: string[]; todo_ids: string[]; trait_ids: string[]; date_ids: string[]; skipped_todos: string[]
  before: { last_contact: string | null; next_follow: string | null; next_step: string | null }
  deal_before: { id: string; title: string; amount: number | null; estimated: number; basis: string | null } | null
  /** 第三轮：确认前这位客户的待办和自动跟进待办关联、留痕的最大编号；撤销按它原样恢复 */
  snap?: { todos: TodoSnap[]; follow_link: string | null; edit_max: number }
  closed?: { promises: { id: string; status: string; done_at: string | null; note: string | null }[]; todos: string[]; care: { id: string; status: string }[] }
  follow: unknown; summary: string
  kb: { path: string; line: string; header: HeaderChange[]; rows: string[]; backup: string; new_section: boolean; edits?: LineEdit[]; adds?: LineAdd[] } | null
  kb_error: string | null; findings: { title: string; backup: string }[]; finding_error: string | null; confirmed_at: string
  inbox?: { path: string; line: string; suffix: string } | null
}

const TODO_COLS = 'id, title, status, priority, due, note, done_at, updated_at'
const snapTodos = (cid: string) => all<TodoSnap>(`SELECT ${TODO_COLS} FROM todos WHERE client_id = :cid`, { cid })

/** 老板确认：写进工作台；勾了“写回知识库”就改客户文件几处 */
export function confirmExtraction(id: string, input: unknown, actor: Actor) {
  const r = get<Row>('SELECT * FROM crm_extractions WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这次提取')
  if (r.status === '已写入') throw new BadRequest('这次提取已经写入过了')
  if (r.status !== '待确认') throw new BadRequest(`这次提取的状态是“${r.status}”，不能写入`)
  const d = extractConfirm.parse(input)
  const c = findClient(d.client_id)
  const at = nowIso()
  const y = today().slice(0, 4)
  const before = get<{ last_contact: string | null; next_follow: string | null; next_step: string | null }>('SELECT last_contact, next_follow, next_step FROM clients WHERE id = :id', { id: c.id })!
  // 写回知识库的内容在写工作台之前算好（喜好去重要和“写之前已经记着的”比，写完再算就全算成重复了）
  const kbIn = d.kb_append ? kbInput(d, d.kb_line?.trim() || kbLineOf(d, r.source_path)) : null
  const written = tx(() => {
    const snap = {
      todos: snapTodos(c.id),
      follow_link: get<{ todo_id: string }>('SELECT todo_id FROM crm_follow_todos WHERE client_id = :cid', { cid: c.id })?.todo_id ?? null,
      edit_max: get<{ n: number | null }>('SELECT MAX(id) AS n FROM crm_edits')?.n ?? 0,
    }
    const iid = uid('i')
    run(`INSERT INTO interactions (id, client_id, date, channel, summary, next_step, actor, with_whom, concerns, their_status, signals, source_file, created_at)
         VALUES (:id, :cid, :date, :channel, :summary, :step, 'Codex', :with, :concerns, :status, :signals, :src, :at)`, {
      id: iid, cid: c.id, date: d.date, channel: d.channel, summary: tidy(d.summary, y), step: d.next_step ?? null, with: d.with_whom ?? null,
      concerns: d.concerns ? tidy(d.concerns, y) : null, status: d.their_status ? tidy(d.their_status, y) : null, signals: d.signals ? tidy(d.signals, y) : null, src: r.source_path, at,
    })
    const promiseIds = d.promises.map((p) => {
      const pid = uid('pr')
      const decided = p.conflict && p.decision ? { decision: p.decision, note: p.decision_note ?? null, at: today() } : { decision: null, note: null, at: null }
      run(`INSERT INTO client_promises (id, client_id, interaction_id, text, due, status, who, to_whom, conflict, source_file, decision, decision_note, decision_at, created_at)
           VALUES (:id, :cid, :iid, :text, :due, '待兑现', :who, :to, :conflict, :src, :dec, :dnote, :dat, :at)`, {
        id: pid, cid: c.id, iid, text: clean(tidy(p.text, y)), due: p.due ?? null, who: p.who, to: p.to_whom ?? null, conflict: p.conflict?.trim() || null, src: r.source_path,
        dec: decided.decision, dnote: decided.note, dat: decided.at, at,
      })
      if (decided.decision) recordEdit(c.id, '答应的事', pid, '和判断规则对不上', decided.decision === '例外' ? '这次算例外' : '规则该改了', decided.note ?? '提取时定的', actor)
      return pid
    })
    // 不重复建待办：和这位客户还开着的待办说的是一件事（去掉标点比），或者就是“下次跟进”那天要做的事（自动跟进待办会建）
    const openTodos = all<{ id: string; title: string; due: string | null }>("SELECT id, title, due FROM todos WHERE client_id = :id AND status IN ('待办','进行中','等别人')", { id: c.id })
      .filter((o) => !d.close_todos.includes(o.id))
    const skipped: string[] = []
    const todos = d.todos.filter((x) => {
      const dupOpen = openTodos.some((o) => plain(o.title) === plain(x.title) || (similar(o.title, x.title) >= 0.6 && (!x.due || !o.due || o.due === x.due)))
      const dupFollow = !!(d.next_follow && x.due === d.next_follow && d.next_step && similar(x.title, d.next_step) >= 0.5)
      if (dupOpen || dupFollow) skipped.push(x.title)
      return !dupOpen && !dupFollow
    })
    const todoIds = todos.map((x) => {
      const tid = uid('t')
      run(`INSERT INTO todos (id, title, status, priority, due, client_id, note, created_at, updated_at)
           VALUES (:id, :title, '待办', :pri, :due, :cid, :note, :at, :at)`, {
        id: tid, title: clean(tidy(x.title, y)), pri: c.kind === '客户' ? '重要' : '普通', due: x.due ?? null, cid: c.id, note: `从新材料提取（${r.source_path ?? '粘贴的文字'}），${me()}确认`, at,
      })
      return tid
    })
    // 喜好：和这位客户已经记着的说的是一件事就不再加（第三轮修数据评审 #13：衡言的“送礼对象：合伙人送客户”会出现两次）
    const known = all<{ kind: string; text: string }>('SELECT kind, text FROM client_traits WHERE client_id = :cid', { cid: c.id })
    const traitIds = d.traits.filter((tr, i) => !known.some((k) => sameTrait(k, tr)) && !d.traits.slice(0, i).some((o) => sameTrait(o, tr))).map((tr) => {
      const tid = uid('tr')
      run('INSERT INTO client_traits (id, client_id, kind, text, source, created_at) VALUES (:id, :cid, :kind, :text, :src, :at)', {
        id: tid, cid: c.id, kind: tr.kind, text: tidy(tr.text, y), src: `${md(d.date)} ${d.channel}`, at,
      })
      return tid
    })
    const dateIds = d.dates.map((x) => {
      const did = uid('dt')
      run('INSERT INTO client_dates (id, client_id, date, label, kind, who, note) VALUES (:id, :cid, :date, :label, :kind, :who, :note)', {
        id: did, cid: c.id, date: x.date, label: x.label, kind: x.kind, who: x.who ?? null, note: `${md(d.date)} ${d.channel}里说的`,
      })
      return did
    })
    if (!before.last_contact || before.last_contact < d.date) run('UPDATE clients SET last_contact = :d, updated_at = :at WHERE id = :id', { d: d.date, at, id: c.id })
    let follow: unknown = null
    if (d.next_follow !== undefined && (d.next_follow !== before.next_follow || d.next_step)) {
      follow = applyFollow(c.id, { next_follow: d.next_follow ?? null, next_step: d.next_step ?? undefined, reason: `新材料提取：${md(d.date)} ${d.channel}` }, actor, { allowPast: true })
    }
    // 之前记着、这份材料让它不用做了的：老板勾了才关，关之前记下原来的状态
    const why = `${md(d.date)} ${d.channel}后不用做了（新材料提取时关掉）`
    const closed: NonNullable<Written['closed']> = { promises: [], todos: [], care: [] }
    for (const pid of d.close_promises) {
      const p = get<{ id: string; client_id: string; status: string; done_at: string | null; note: string | null; text: string }>('SELECT id, client_id, status, done_at, note, text FROM client_promises WHERE id = :id', { id: pid })
      if (!p || p.client_id !== c.id || p.status !== '待兑现') continue
      run("UPDATE client_promises SET status = '取消', note = :note, done_at = NULL WHERE id = :id", { note: why, id: pid })
      recordEdit(c.id, '答应的事', pid, '状态=待兑现', '状态=取消', why, actor)
      closed.promises.push({ id: pid, status: p.status, done_at: p.done_at, note: p.note })
    }
    for (const tid of d.close_todos) {
      const t = snap.todos.find((x) => x.id === tid)
      if (!t || !['待办', '进行中', '等别人'].includes(t.status)) continue
      run("UPDATE todos SET status = '取消', note = :note, updated_at = :at WHERE id = :id", { note: `${t.note ? `${t.note}；` : ''}${why}`, at, id: tid })
      closed.todos.push(tid)
    }
    for (const cid2 of d.skip_care) {
      const x = get<{ id: string; client_id: string; status: string }>('SELECT id, client_id, status FROM client_care WHERE id = :id', { id: cid2 })
      if (!x || x.client_id !== c.id || !['建议', '已安排'].includes(x.status)) continue
      run("UPDATE client_care SET status = '不做' WHERE id = :id", { id: cid2 })
      closed.care.push({ id: cid2, status: x.status })
    }
    // 商机金额：老板勾了才改，改成“谈过的”，留痕
    let dealBefore: Written['deal_before'] = null
    if (d.deal) {
      const old = get<{ id: string; client_id: string; title: string; amount: number | null; estimated: number; basis: string | null }>('SELECT id, client_id, title, amount, estimated, basis FROM deals WHERE id = :id', { id: d.deal.id })
      if (!old || old.client_id !== c.id) throw new BadRequest('这个商机不是这位客户的')
      dealBefore = { id: old.id, title: old.title, amount: old.amount, estimated: old.estimated, basis: old.basis }
      run('UPDATE deals SET amount = :amount, title = :title, estimated = 0, basis = :basis, updated_at = :at WHERE id = :id', {
        amount: d.deal.amount, title: d.deal.title?.trim() || old.title, basis: d.deal.basis ?? `${md(d.date)} ${d.channel}谈过`, at, id: old.id,
      })
      logChange(actor, 'deal', old.id, '修改', `${c.name}：${old.title} ${old.amount ?? '—'} 万${old.estimated ? '（估的）' : ''} → ${d.deal.amount} 万（${md(d.date)} ${d.channel}谈过）`)
    }
    const closedN = closed.promises.length + closed.todos.length + closed.care.length
    const summary = `往来记录 1 条、答应的事 ${promiseIds.length} 件、待办 ${todoIds.length} 条${traitIds.length ? `、喜好 ${traitIds.length} 条` : ''}${dateIds.length ? `、重要日子 ${dateIds.length} 个` : ''}${d.deal ? '、商机金额 1 处' : ''}${closedN ? `、关掉之前记着的 ${closedN} 件` : ''}`
    logChange(actor, 'client', c.id, '提取写入', `${c.name}：从新材料写入${summary}`)
    return { interaction_id: iid, promise_ids: promiseIds, todo_ids: todoIds, trait_ids: traitIds, date_ids: dateIds, skipped_todos: skipped, before, deal_before: dealBefore, snap, closed, follow, summary }
  })
  // 知识库：客户文件几处 + “规则该改了”的发现 + 收件箱原件末尾的备注
  let kb: Written['kb'] = null
  let kbError: string | null = null
  if (kbIn) {
    try {
      kb = kbAppend(c.id, kbIn, stampNow())
      const n = 1 + kb.header.length + kb.rows.length + (kb.edits?.length ?? 0) + (kb.adds?.length ?? 0)
      logChange(actor, 'kb', kb.path, '追加', `${c.name}的知识库客户文件改了 ${n} 处（备份在 ${kb.backup}）`)
    } catch (err) { kbError = (err as Error).message }
  }
  const findings: Written['findings'] = []
  let findingError: string | null = null
  for (const p of d.promises.filter((x) => x.conflict && x.decision === '改规则')) {
    try {
      const f = findingAppend({ client: c.name, promise: clean(tidy(p.text, y)), said: `${md(d.date)} ${d.channel}`, source: r.source_path, conflict: p.conflict!, note: p.decision_note ?? '规则该改了', today: today() }, stampNow())
      findings.push({ title: f.title, backup: f.backup })
      logChange(actor, 'kb', f.path, '追加', `待确认的发现：${f.title}（备份在 ${f.backup}）`)
    } catch (err) { findingError = (err as Error).message }
  }
  let inbox: Written['inbox'] = null
  if (r.source_path) {
    try { inbox = inboxNote(r.source_path, inboxLine(d, !!kb)) } catch { inbox = null }
    if (inbox) logChange(actor, 'kb', inbox.path, '追加', `收件箱原件末尾加了一行备注：已写进工作台${kb ? '和客户档案' : ''}`)
  }
  const full: Written = { ...written, kb, kb_error: kbError, findings, finding_error: findingError, inbox, confirmed_at: `${md(today())} ${hhmm()}` }
  run(`UPDATE crm_extractions SET status = '已写入', client_id = :cid, written_at = :at, written = :w, kb_path = :kp, kb_line = :kl, kb_backup = :kb, kb_written_at = :kat WHERE id = :id`, {
    cid: c.id, at, w: JSON.stringify(full), kp: kb?.path ?? null, kl: kb?.line ?? null, kb: kb?.backup ?? null, kat: kb ? at : null, id,
  })
  return getExtraction(id)
}

/** 撤销这次写入：删掉写进去的行，客户的上次联系 / 下次跟进 / 下一步、待办、自动跟进待办、商机金额、关掉的事按写入前的样子恢复，
 *  知识库里加的几处退回；提取回到“待确认”。不另写留痕（写入时记的留痕一并删掉），撤销完和没写过一样 */
export function undoExtraction(id: string, actor: Actor) {
  const r = get<Row>('SELECT * FROM crm_extractions WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这次提取')
  if (r.status !== '已写入' || !r.written || !r.client_id) throw new BadRequest('这次提取还没写入，不用撤销')
  const w = JSON.parse(r.written) as Partial<Written>
  if (!w.interaction_id || !w.before) throw new BadRequest('这次写入是旧版本记的，缺少撤销要用的信息；请在客户详情里手动改')
  const c = findClient(r.client_id)
  const iid = w.interaction_id
  // 写入后在工作台定了“规则该改了”的答应：知识库待确认的发现里那一节也撤掉
  const ruled = all<{ text: string }>("SELECT text FROM client_promises WHERE interaction_id = :iid AND decision = '改规则'", { iid })
  const del = (table: string, ids: string[] | undefined) => { for (const x of ids ?? []) run(`DELETE FROM ${table} WHERE id = :id`, { id: x }) }
  tx(() => {
    del('client_promises', w.promise_ids)
    run('DELETE FROM client_promises WHERE interaction_id = :iid', { iid })
    del('interactions', [iid])
    del('todos', w.todo_ids)
    del('client_traits', w.trait_ids)
    del('client_dates', w.date_ids)
    const b = w.before!
    run('UPDATE clients SET last_contact = :last, next_follow = :next, next_step = :step, updated_at = :at WHERE id = :id', { last: b.last_contact, next: b.next_follow, step: b.next_step, at: nowIso(), id: c.id })
    if (w.snap) {
      // 待办：写入时新建的（含自动跟进待办）删掉；原来就有的按快照恢复标题、日期、状态
      const keep = new Set(w.snap.todos.map((t) => t.id))
      for (const t of all<{ id: string }>('SELECT id FROM todos WHERE client_id = :cid', { cid: c.id })) if (!keep.has(t.id)) run('DELETE FROM todos WHERE id = :id', { id: t.id })
      for (const t of w.snap.todos) {
        run('UPDATE todos SET title = :title, status = :status, priority = :priority, due = :due, note = :note, done_at = :done_at, updated_at = :updated_at WHERE id = :id', t)
      }
      run('DELETE FROM crm_follow_todos WHERE client_id = :cid', { cid: c.id })
      if (w.snap.follow_link) run('INSERT INTO crm_follow_todos (client_id, todo_id) VALUES (:cid, :tid)', { cid: c.id, tid: w.snap.follow_link })
      run('DELETE FROM crm_edits WHERE client_id = :cid AND id > :n', { cid: c.id, n: w.snap.edit_max })
    }
    for (const p of w.closed?.promises ?? []) run('UPDATE client_promises SET status = :s, done_at = :d, note = :n WHERE id = :id', { s: p.status, d: p.done_at, n: p.note, id: p.id })
    for (const x of w.closed?.care ?? []) run('UPDATE client_care SET status = :s WHERE id = :id', { s: x.status, id: x.id })
    if (w.deal_before) {
      const x = w.deal_before
      run('UPDATE deals SET amount = :amount, title = :title, estimated = :est, basis = :basis, updated_at = :at WHERE id = :id', { amount: x.amount, title: x.title, est: x.estimated, basis: x.basis, at: nowIso(), id: x.id })
    }
    run("UPDATE crm_extractions SET status = '待确认', written = NULL, written_at = NULL, kb_path = NULL, kb_line = NULL, kb_backup = NULL, kb_written_at = NULL WHERE id = :id", { id })
  })
  const kb = w.kb ? kbRevert(w.kb.path, w.kb) : null
  const findings = (w.findings ?? []).filter((f) => findingRemove(f.title)).length + ruled.reduce((n, p) => n + findingRemoveFor(c.name, p.text), 0)
  const inbox = w.inbox ? inboxNoteRevert(w.inbox) : false
  logChange(actor, 'extraction', id, '撤销', `${c.name}：撤销了这次提取写进的东西（${w.summary ?? ''}）${kb?.ok ? '，知识库客户文件退回' : ''}${inbox ? '，收件箱原件的备注删了' : ''}${findings ? `，待确认的发现删了 ${findings} 节` : ''}`)
  return getExtraction(id)
}

export function discardExtraction(id: string, actor: Actor) {
  const r = get<Row>('SELECT * FROM crm_extractions WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这次提取')
  if (r.status === '已写入') throw new BadRequest('已经写入的不能放弃；先“撤销这次写入”')
  run("UPDATE crm_extractions SET status = '放弃', finished_at = COALESCE(finished_at, :at) WHERE id = :id", { at: nowIso(), id })
  logChange(actor, 'extraction', id, '放弃', '这次提取不要了，什么都没写')
  return { id }
}
