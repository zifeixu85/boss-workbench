// 项目、里程碑与风险：风险由规则推算，规则写在这里，网页和 Codex 看到的一样
import { all, get, run, uid, nowIso, logChange, params } from '../db.ts'
import { projectInput, MILESTONE_STATUS } from '../../shared/schema.ts'
import { type Actor, NotFound, BadRequest, today, daysBetween, dayOf, setClause, onlyGiven } from './common.ts'
import { findDoc } from './kb.ts'

export type Risk = { level: '高' | '中'; text: string }
export type Milestone = { id: string; project_id: string; date: string; title: string; status: string; note: string | null; sort: number }

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export function projectRisks(p: ProjectRow, miles: Milestone[] = [], t = today()): Risk[] {
  if (p.stage === '已完成' || p.stage === '暂停') return []
  const risks: Risk[] = []
  const due = p.due
  if (due) {
    const left = daysBetween(t, due)
    if (left < 0) risks.push({ level: '高', text: `截止已过 ${-left} 天` })
    else if (left <= 3 && p.waiting_on) risks.push({ level: '中', text: `${left === 0 ? '今天' : `${left} 天后`}截止，还在等${String(p.waiting_on).replace(/^等/, '')}` })
  }
  // 里程碑：过了日子还没完成 → 高；3 天内要到、还没完成 → 中
  for (const m of miles.filter((x) => x.status !== '完成')) {
    const left = daysBetween(t, m.date)
    if (left < 0) risks.push({ level: '高', text: `里程碑“${m.title}”（${md(m.date)}）已过 ${-left} 天还没完成` })
    else if (left <= 3) risks.push({ level: '中', text: `${left === 0 ? '今天' : `${md(m.date)}（${left} 天后）`}到期：${m.title}${m.title.includes('定') && p.waiting_on ? `，还在等${String(p.waiting_on).replace(/^等/, '')}` : ''}` })
  }
  const updated = dayOf(p.updated_at) // UTC 时间戳按本地日期取（审查 #6）
  if (updated) {
    const idle = daysBetween(updated, t)
    if (idle > 7) risks.push({ level: '中', text: `${idle} 天没有更新` })
  }
  if (p.risk) risks.push({ level: '高', text: String(p.risk) })
  return risks
}

export type ProjectRow = {
  id: string; name: string; client_id: string | null; client_name: string | null; stage: string; contract: number | null
  next_step: string | null; waiting_on: string | null; due: string | null; risk: string | null; owner: string | null; goal: string | null
  budget: number | null; kb_path: string | null; outstanding: number; created_at: string; updated_at: string
}

const SQL = `SELECT p.*, c.name AS client_name,
  (SELECT COALESCE(SUM(amount - received),0) FROM receivables r WHERE r.project_id = p.id) AS outstanding
  FROM projects p LEFT JOIN clients c ON c.id = p.client_id`

const milestonesOf = (pid: string) => all<Milestone>('SELECT * FROM project_milestones WHERE project_id = :pid ORDER BY date, sort', { pid })

export function listProjects() {
  const t = today()
  return all<ProjectRow>(`${SQL} ORDER BY CASE p.stage WHEN '已完成' THEN 1 WHEN '暂停' THEN 2 ELSE 0 END, COALESCE(p.due,'9999')`).map((p) => {
    const miles = milestonesOf(p.id)
    const next = miles.find((m) => m.status !== '完成') ?? null
    return { ...p, risks: projectRisks(p, miles, t), milestones: miles, next_milestone: next, milestones_done: miles.filter((m) => m.status === '完成').length }
  })
}

export function getProject(id: string) {
  const p = get<ProjectRow>(`${SQL} WHERE p.id = :id OR p.name = :id`, { id })
  if (!p) throw new NotFound('找不到这个项目')
  const pid = p.id
  const miles = milestonesOf(pid)
  return {
    project: { ...p, risks: projectRisks(p, miles) },
    milestones: miles,
    kb_note: findDoc(p.kb_path, p.name),
    todos: all("SELECT * FROM todos WHERE project_id = :pid ORDER BY status = '完成', COALESCE(due,'9999')", { pid }),
    events: all('SELECT * FROM events WHERE project_id = :pid ORDER BY start LIMIT 20', { pid }),
    receivables: all('SELECT * FROM receivables WHERE project_id = :pid ORDER BY due', { pid }),
  }
}

export function createProject(input: unknown, actor: Actor) {
  const data = projectInput.parse(input)
  const id = uid('p')
  const at = nowIso()
  run(`INSERT INTO projects (id, name, client_id, stage, contract, next_step, waiting_on, due, risk, owner, goal, budget, kb_path, created_at, updated_at)
       VALUES (:id, :name, :client_id, :stage, :contract, :next_step, :waiting_on, :due, :risk, :owner, :goal, :budget, :kb_path, :at, :at)`,
  params({ client_id: null, contract: null, next_step: null, waiting_on: null, due: null, risk: null, owner: null, goal: null, budget: null, kb_path: null, ...data, id, at }))
  logChange(actor, 'project', id, '新建', `新项目「${data.name}」`)
  return getProject(id)
}

export function updateProject(id: string, input: unknown, actor: Actor) {
  const before = getProject(id).project
  const patch = onlyGiven(projectInput.partial().parse(input), input)
  if (!Object.keys(patch).length) throw new BadRequest('没有要修改的字段')
  run(`UPDATE projects SET ${setClause(patch)}, updated_at = :at WHERE id = :id`, params({ ...patch, at: nowIso(), id: before.id }))
  logChange(actor, 'project', before.id, '修改', `项目「${before.name}」${patch.stage ? `→${patch.stage}` : '已更新'}`)
  return getProject(before.id)
}

/** 加里程碑（关键日期）：搭建时从知识库的项目文件导入，命令行 project-add --milestone "2026-11-05 四平台上线" */
export function addMilestones(projectId: string, items: { date: string; title: string; status?: string }[], actor: Actor) {
  const p = getProject(projectId).project
  const start = (get<{ n: number }>('SELECT COUNT(*) AS n FROM project_milestones WHERE project_id = :pid', { pid: p.id })?.n ?? 0)
  items.forEach((m, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) throw new BadRequest(`里程碑日期要写成 2026-11-05：${m.date}`)
    if (!m.title.trim()) throw new BadRequest('里程碑要写做什么')
    const status = m.status ?? '未开始'
    if (!(MILESTONE_STATUS as readonly string[]).includes(status)) throw new BadRequest(`状态只能是：${MILESTONE_STATUS.join('、')}`)
    run('INSERT INTO project_milestones (id, project_id, date, title, status, sort) VALUES (:id, :pid, :date, :title, :status, :sort)',
      { id: uid('m'), pid: p.id, date: m.date, title: m.title.trim(), status, sort: start + i })
  })
  if (items.length) {
    run('UPDATE projects SET updated_at = :at WHERE id = :pid', { at: nowIso(), pid: p.id })
    logChange(actor, 'project', p.id, '修改', `项目「${p.name}」加了 ${items.length} 个里程碑`)
  }
  return getProject(p.id)
}

/** 改里程碑的状态（完成 / 进行中 / 延期） */
export function updateMilestone(id: string, input: unknown, actor: Actor) {
  const m = get<Milestone>('SELECT * FROM project_milestones WHERE id = :id', { id })
  if (!m) throw new NotFound('找不到这个里程碑')
  const status = String((input as { status?: string })?.status ?? '')
  if (!(MILESTONE_STATUS as readonly string[]).includes(status)) throw new BadRequest(`状态只能是：${MILESTONE_STATUS.join('、')}`)
  run('UPDATE project_milestones SET status = :status WHERE id = :id', { status, id })
  run('UPDATE projects SET updated_at = :at WHERE id = :pid', { at: nowIso(), pid: m.project_id })
  logChange(actor, 'project', m.project_id, '修改', `里程碑「${m.title}」→${status}`)
  return getProject(m.project_id)
}
