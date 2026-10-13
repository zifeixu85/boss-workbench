// 一张清单一次写入（2026-10-13 进内容先判断）：AI 在对话里把材料拆好、问清、老板说“确认”以后，
// 把清单写成一个 JSON 文件，用命令行 apply 一次写进工作台。不加 --yes 是预演：照样跑一遍所有规则，然后整个退回，什么都不留。
// 全部在一个事务里：中间哪一步不行，前面写的也一起退回，不会写一半。每一步走的都是网页和命令行同一套业务规则。
//
// 清单长这样（steps 里每一步一个 do，可以按需要只写几种）：
// {
//   "material": "00-收件箱/2026-10-28-云杉物流-电话.md",            ← 这张清单是从哪份材料来的（写进待办的来源）
//   "steps": [
//     { "do": "log", "client": "云杉物流", "text": "王总要两套年会礼盒报价", "date": "2026-10-28", "channel": "电话", "step": "10/30 前发方案", "next": "2026-11-04" },
//     { "do": "todo", "title": "做两套报价方案", "owner": "小周", "due": "2026-10-30", "client": "云杉物流" },
//     { "do": "promise", "client": "云杉物流", "text": "10/30 前发两套方案", "to": "王总", "due": "2026-10-30" },
//     { "do": "stage", "client": "云杉物流", "stage": "方案中", "reason": "王总要两套方案" },
//     { "do": "follow", "client": "云杉物流", "date": "2026-11-04", "step": "问预算定了没" },
//     { "do": "project", "project": "年底企业团购", "next_step": "等云杉定预算", "waiting_on": "云杉财务" },
//     { "do": "milestone", "project": "年底企业团购", "date": "2026-12-20", "title": "云杉年会" },
//     { "do": "event", "title": "云杉王总电话", "start": "2026-11-04T10:00", "client": "云杉物流" },
//     { "do": "inbox-done", "id": "n_xxx", "result": "已拆进云杉物流的往来、待办" }
//   ]
// }
import { tx } from '../db.ts'
import { type Actor, BadRequest } from './common.ts'
import { findClient, logInteraction } from './clients.ts'
import { createEvent, createTodo, updateTodo } from './schedule.ts'
import { addMilestones, getProject, updateProject } from './projects.ts'
import { doneInbox } from './today.ts'
import { addPromise, applyFollow, changeStage } from '../modules/crm/actions.ts'

type Step = Record<string, unknown> & { do?: string }
export type ApplyResult = { done: boolean; steps: { n: number; do: string; text: string }[] }

const STEP_KINDS = ['log', 'todo', 'todo-set', 'promise', 'stage', 'follow', 'project', 'milestone', 'event', 'inbox-done'] as const
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const clientOf = (s: Step) => {
  const q = str(s.client)
  return q ? findClient(q) : undefined
}
const projectOf = (s: Step) => {
  const q = str(s.project)
  return q ? getProject(q).project : undefined
}
const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new BadRequest(`要写${what}`)
  return v
}

/** 做一步，返回一句人话 */
function runStep(s: Step, material: string | undefined, actor: Actor): string {
  switch (s.do) {
    case 'log': {
      const c = need(clientOf(s), '客户（client）')
      logInteraction({ client_id: c.id, date: s.date, channel: s.channel ?? '微信', summary: s.text, next_step: s.step, next_follow: s.next }, actor)
      return `${c.name} 往来记录：${String(s.text ?? '').slice(0, 40)}`
    }
    case 'todo': {
      const c = clientOf(s)
      const p = projectOf(s)
      const t = createTodo({ title: s.title, owner: s.owner, due: s.due, due_time: s.time, priority: s.priority, status: s.status, note: s.note,
        client_id: c?.id, project_id: p?.id, source: s.source ?? material }, actor) as { id: string; title: string }
      return `待办 [${t.id}] ${t.title}${s.owner ? `｜${String(s.owner)}做` : ''}${s.due ? `｜${String(s.due)} 前` : ''}`
    }
    case 'todo-set': {
      const t = updateTodo(need(str(s.id), '待办编号（id）'), { status: s.status, due: s.due, owner: s.owner }, actor) as { id: string; title: string; status: string }
      return `待办 [${t.id}] ${t.title} → ${t.status}`
    }
    case 'promise': {
      const c = need(clientOf(s), '客户（client）')
      addPromise({ client_id: c.id, text: s.text, due: s.due, who: s.who, to_whom: s.to }, actor)
      return `${c.name} 答应的事：${String(s.text ?? '')}`
    }
    case 'stage': {
      const c = need(clientOf(s), '客户（client）')
      const r = changeStage(c.id, { stage: s.stage, reason: s.reason }, actor)
      return `${c.name} 阶段：${r.from} → ${r.to}（${String(s.reason ?? '')}）`
    }
    case 'follow': {
      const c = need(clientOf(s), '客户（client）')
      applyFollow(c.id, { next_follow: s.date ?? null, next_step: s.step, reason: s.reason }, actor)
      return `${c.name} 下次跟进：${String(s.date ?? '取消')}`
    }
    case 'project': {
      const p = need(projectOf(s), '项目（project）')
      const patch = Object.fromEntries(['stage', 'next_step', 'waiting_on', 'due', 'risk', 'goal'].filter((k) => s[k] !== undefined).map((k) => [k, s[k]]))
      updateProject(p.id, patch, actor)
      return `项目「${p.name}」：${Object.entries(patch).map(([k, v]) => `${k}=${String(v)}`).join('，')}`
    }
    case 'milestone': {
      const p = need(projectOf(s), '项目（project）')
      addMilestones(p.id, [{ date: String(s.date ?? ''), title: String(s.title ?? ''), status: str(s.status) }], actor)
      return `项目「${p.name}」里程碑：${String(s.date)} ${String(s.title)}`
    }
    case 'event': {
      const c = clientOf(s)
      const p = projectOf(s)
      createEvent({ title: s.title, start: s.start, end: s.end, kind: s.kind, location: s.location, client_id: c?.id, project_id: p?.id,
        all_day: !String(s.start ?? '').includes('T') }, actor)
      return `日程 ${String(s.start ?? '').replace('T', ' ')} ${String(s.title ?? '')}`
    }
    case 'inbox-done': {
      doneInbox(need(str(s.id), '收件箱编号（id）'), need(str(s.result), '处理结果（result）'), actor)
      return `收件箱 ${String(s.id)} 处理完：${String(s.result)}`
    }
    default:
      throw new BadRequest(`不认识的一步“${String(s.do)}”，只能是：${STEP_KINDS.join('、')}`)
  }
}

class DryRun extends Error {}

/** 报错只说人话：表单校验的错误只取每条的说明 */
const plain = (err: unknown) => {
  const e = err as { issues?: { message: string }[]; message: string }
  return e.issues ? [...new Set(e.issues.map((i) => i.message))].join('；') : e.message
}

/** 照清单写入。yes 为 false 时预演：照样跑一遍所有规则，最后整个退回 */
export function applyPlan(plan: unknown, opts: { yes: boolean; actor: Actor }): ApplyResult {
  const p = plan as { material?: unknown; steps?: unknown }
  if (!p || !Array.isArray(p.steps) || !p.steps.length) throw new BadRequest('清单里要有 steps：每一步写一个 do（比如 todo、log、promise）')
  const material = str(p.material)
  const out: ApplyResult['steps'] = []
  try {
    tx(() => {
      (p.steps as Step[]).forEach((s, i) => {
        try {
          out.push({ n: i + 1, do: String(s.do), text: runStep(s, material, opts.actor) })
        } catch (err) {
          throw new BadRequest(`第 ${i + 1} 步（${String(s.do)}）没办成：${plain(err)}。整张清单都没写入`)
        }
      })
      if (!opts.yes) throw new DryRun()
    })
  } catch (err) {
    if (!(err instanceof DryRun)) throw err
    return { done: false, steps: out }
  }
  return { done: true, steps: out }
}
