// 演示复原：排练一次就会把演示状态用掉，这里把大客户模块在演示里改过的东西退回去。归属：大客户模块。
// 第三轮（数据评审 #1）：不再按“今天的改动留痕”一条条往回退（撤销留下的空值会把澜拓的下次跟进退成空、自动待办跟着乱），
//   改成和“演示起点”整张对一遍：crm-reset --save 把现在的样子存进 工作台/数据/大客户演示起点.json（事先存一次），
//   crm-reset --yes 把客户的阶段 / 下次跟进 / 下一步 / 上次联系、挂在客户上的待办和自动跟进待办、答应的事、往来记录、喜好、日子、关怀草稿、商机、改动留痕
//   都恢复成起点那样；起点之后新加的删掉。知识库里工作台加的东西（客户文件几处、待确认的发现、收件箱备注、老板定例外的那句）也退回。
// 不动：别的模块的数据、没挂在客户上的待办、最近改动（changes）这份日志。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, tx, logChange, nowIso, DATA_DIR } from '../../db.ts'
import { type Actor, today } from '../../services/common.ts'
import { findingRemoveAllFromWorkbench, inboxNotesRemoveAll, kbDecisionNotesRemoveAll } from './materials.ts'
import { undoExtraction } from './extract-write.ts'

export const BASELINE_FILE = join(DATA_DIR, '大客户演示起点.json')

type R = Record<string, string | number | null>
type Baseline = {
  saved_at: string; demo_today: string
  clients: R[]; todos: R[]; follow: R[]; promises: R[]; care: R[]; deals: R[]
  interactions: string[]; traits: string[]; dates: string[]; edit_max: number
}

/** 存演示起点：事先存一次；以后每次 crm-reset 都退回这个样子 */
export function saveBaseline(): { file: string; counts: string } {
  const b: Baseline = {
    saved_at: nowIso(), demo_today: today(),
    clients: all<R>('SELECT id, stage, next_follow, next_step, last_contact FROM clients'),
    todos: all<R>('SELECT * FROM todos WHERE client_id IS NOT NULL'),
    follow: all<R>('SELECT * FROM crm_follow_todos'),
    promises: all<R>('SELECT * FROM client_promises'),
    care: all<R>('SELECT * FROM client_care'),
    deals: all<R>('SELECT id, title, stage, amount, estimated, basis, expected_close FROM deals'),
    interactions: all<{ id: string }>('SELECT id FROM interactions').map((x) => x.id),
    traits: all<{ id: string }>('SELECT id FROM client_traits').map((x) => x.id),
    dates: all<{ id: string }>('SELECT id FROM client_dates').map((x) => x.id),
    edit_max: get<{ n: number | null }>('SELECT MAX(id) AS n FROM crm_edits')?.n ?? 0,
  }
  writeFileSync(BASELINE_FILE, JSON.stringify(b), 'utf8')
  return { file: BASELINE_FILE, counts: `客户 ${b.clients.length} 位、挂在客户上的待办 ${b.todos.length} 条、答应的事 ${b.promises.length} 件、往来 ${b.interactions.length} 条、关怀草稿 ${b.care.length} 条` }
}

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_FILE)) return null
  try { return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline } catch { return null }
}

/** 整行放回去（被删了就重新插入） */
function putBack(table: string, row: R) {
  const keys = Object.keys(row)
  run(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((k) => `:${k}`).join(', ')})`, row)
}
/** 起点之后新加的行删掉 */
function dropNew(table: string, keep: string[], where = '1 = 1') {
  const set = new Set(keep)
  let n = 0
  for (const x of all<{ id: string }>(`SELECT id FROM ${table} WHERE ${where}`)) if (!set.has(x.id)) { run(`DELETE FROM ${table} WHERE id = :id`, { id: x.id }); n++ }
  return n
}

export function crmReset(actor: Actor) {
  const report: string[] = []
  const base = loadBaseline()
  // ⓪ 先去掉客户文件里“定为例外 / 规则该改”的追加（不然撤销时那一行对不上原样，删不掉）
  const decisions = kbDecisionNotesRemoveAll()
  if (decisions) report.push(`客户文件里“定为例外 / 规则该改”的追加去掉了（${decisions} 份文件）`)
  // ① 提取写入：新的先撤（知识库客户文件、收件箱备注、待确认的发现跟着退回）
  for (const x of all<{ id: string }>("SELECT id FROM crm_extractions WHERE status = '已写入' ORDER BY written_at DESC")) {
    try { undoExtraction(x.id, actor); report.push(`撤销提取写入 ${x.id}`) } catch (err) { report.push(`撤销 ${x.id} 没成：${(err as Error).message}`) }
  }
  // ② 知识库里工作台加的、上面没退干净的
  const findings = findingRemoveAllFromWorkbench()
  if (findings) report.push(`知识库“待确认的发现”删了工作台加的 ${findings} 节`)
  const notes = inboxNotesRemoveAll()
  if (notes) report.push(`收件箱原件末尾工作台加的备注删了（${notes} 份）`)
  tx(() => {
    const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM crm_extractions')?.n ?? 0
    run('DELETE FROM crm_extractions')
    if (n) report.push(`提取记录清空 ${n} 条`)
    if (!base) {
      // 没存过起点：只能退回标黄答应的决定（以后先 crm-reset --save）
      run('UPDATE client_promises SET decision = NULL, decision_note = NULL, decision_at = NULL WHERE decision IS NOT NULL')
      report.push('还没存“演示起点”：只撤了提取写入和标黄答应的决定。事先先运行 crm-reset --save 存一次，以后就能整份退回')
      return
    }
    for (const c of base.clients) run('UPDATE clients SET stage = :stage, next_follow = :next_follow, next_step = :next_step, last_contact = :last_contact WHERE id = :id', c)
    const p = dropNew('client_promises', base.promises.map((x) => String(x.id)))
    for (const x of base.promises) putBack('client_promises', x)
    const i = dropNew('interactions', base.interactions)
    const t = dropNew('client_traits', base.traits) + dropNew('client_dates', base.dates)
    const care = dropNew('client_care', base.care.map((x) => String(x.id)))
    for (const x of base.care) putBack('client_care', x)
    const todo = dropNew('todos', base.todos.map((x) => String(x.id)), 'client_id IS NOT NULL')
    for (const x of base.todos) putBack('todos', x)
    run('DELETE FROM crm_follow_todos')
    for (const x of base.follow) putBack('crm_follow_todos', x)
    for (const d of base.deals) run('UPDATE deals SET title = :title, stage = :stage, amount = :amount, estimated = :estimated, basis = :basis, expected_close = :expected_close WHERE id = :id', d)
    const edits = get<{ n: number }>('SELECT COUNT(*) AS n FROM crm_edits WHERE id > :m', { m: base.edit_max })?.n ?? 0
    run('DELETE FROM crm_edits WHERE id > :m', { m: base.edit_max })
    const saved = new Date(base.saved_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    report.push(`客户的阶段、下次跟进、下一步、上次联系、待办、答应的事、关怀草稿、商机退回演示起点（${saved.getMonth() + 1}/${saved.getDate()} ${pad(saved.getHours())}:${pad(saved.getMinutes())} 存的）`)
    const dropped = [p && `答应的事 ${p} 件`, i && `往来 ${i} 条`, t && `喜好和日子 ${t} 条`, care && `关怀草稿 ${care} 条`, todo && `待办 ${todo} 条`, edits && `改动留痕 ${edits} 条`].filter(Boolean)
    if (dropped.length) report.push(`起点之后新加的删掉：${dropped.join('、')}`)
  })
  logChange(actor, 'crm', 'reset', '演示复原', report.join('；'))
  return report
}
