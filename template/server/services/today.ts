// 今日、跟进清单、收件箱、设置、最近改动
// 今日页还要用 4 个业务模块的“今日接口”：经营 summary()/anomalies()、大客户 focus()、小红书 todayPlan()、数据源 issues()。
// 每块单独兜底：某个模块出错，今日页其他部分照常显示，出错的写进 module_errors。
import { all, get, run, uid, nowIso, logChange, params } from '../db.ts'
import { demoDate } from '../clock.ts'
import { inboxInput, settingsInput } from '../../shared/schema.ts'
import { type Actor, NotFound, today, addDays, daysBetween, dayOf } from './common.ts'
import { listClients, escapeLike } from './clients.ts'
import { identity } from './identity.ts'
import { listProjects } from './projects.ts'
import { listEvents, listTodos } from './schedule.ts'
import { cashSummary, listReceivables } from './money.ts'
import * as biz from '../modules/biz/service.ts'
import * as crm from '../modules/crm/service.ts'
import * as content from '../modules/content/service.ts'
import * as dataSources from '../modules/data/service.ts'

const moduleErrors: { module: string; error: string }[] = []
function safe<T>(module: string, fn: () => T, fallback: T): T {
  try { return fn() } catch (err) {
    console.error(`今日页：${module} 模块出错`, err)
    moduleErrors.push({ module, error: (err as Error).message })
    return fallback
  }
}

type Todo = { id: string; title: string; status: string; priority: string; due: string | null; client_id: string | null; client_name: string | null }

export function followUps() {
  const t = today()
  const clients = listClients().filter((c) => c.kind === '客户' && !['暂停', '流失'].includes(c.stage))
  const due = clients.filter((c) => c.next_follow && c.next_follow <= addDays(t, 2))
    .map((c) => ({ id: c.id, name: c.name, label: c.label, stage: c.stage, next_follow: c.next_follow, overdue: daysBetween(c.next_follow!, t), last_contact: c.last_contact, last_summary: c.last_summary }))
    .sort((a, b) => b.overdue - a.overdue)
  const todos = listTodos({ open: true }) as Todo[]
  const waitingOn = [
    ...listProjects().filter((p) => p.waiting_on && p.stage !== '已完成').map((p) => ({ kind: '项目', id: String(p.id), title: String(p.name), who: String(p.waiting_on), since: dayOf(p.updated_at) })),
    ...todos.filter((x) => x.status === '等别人').map((x) => ({ kind: '待办', id: x.id, title: x.title, who: x.client_name ?? '对方', since: x.due ?? '' })),
  ]
  const waitingForMe = todos.filter((x) => x.client_id && x.status !== '等别人' && x.due && daysBetween(t, x.due) <= 3)
    .map((x) => ({ ...x, left: daysBetween(t, x.due!) })).sort((a, b) => a.left - b.left)
  return { due, waitingOn, waitingForMe }
}

export function overview() {
  const t = today()
  const todos = listTodos({ open: true }) as Todo[]
  const todayTodos = todos.filter((x) => x.due && x.due <= t)
  const weekTodos = todos.filter((x) => x.due && x.due > t && x.due <= addDays(t, 7))
  const events = listEvents(t, `${addDays(t, 1)}T00:00`)
  const upcoming = listEvents(`${addDays(t, 1)}`, `${addDays(t, 7)}T23:59`)
  const risks = listProjects().filter((p) => p.risks.length)
  const fu = followUps()
  const cash = cashSummary()
  const overdueRecs = listReceivables().filter((r) => r.status === '逾期')
  const top = todayTodos.find((x) => x.priority === '紧急') ?? todayTodos[0] ?? weekTodos[0] ?? null
  moduleErrors.length = 0
  const sales = safe('经营', () => biz.summary(), null)
  const alerts = [...safe('经营', () => biz.anomalies(), []), ...safe('数据源', () => dataSources.issues(), [])]
  const keyClients = safe('大客户', () => crm.focus(t, 6), [])
  const xhs = safe('小红书', () => content.todayPlan(t), null)
  const dueRecs = listReceivables().filter((r) => r.status === '7天内到期')
  return {
    date: t,
    sales, alerts, key_clients: keyClients, xhs, module_errors: [...moduleErrors],
    headline: top ? { id: top.id, title: top.title, due: top.due } : null,
    events, upcoming,
    todos: { today: todayTodos, week: weekTodos, open: todos.length },
    follow: { due: fu.due.slice(0, 6), dueCount: fu.due.length, waitingOn: fu.waitingOn.slice(0, 5) },
    risks: risks.slice(0, 5).map((p) => ({ id: p.id, name: p.name, client_name: p.client_name, risks: p.risks })),
    cash: { outstanding: cash.outstanding, overdue: cash.overdue, due_30: cash.due_30, month: cash.month, overdueList: overdueRecs.slice(0, 4), dueSoon: dueRecs.slice(0, 4) },
    changes: recentChanges(8),
  }
}

export function recentChanges(limit = 20) {
  return all('SELECT * FROM changes ORDER BY id DESC LIMIT :n', { n: limit })
}

export function listInbox() {
  return all('SELECT * FROM inbox ORDER BY done_at IS NOT NULL, created_at DESC LIMIT 100')
}
export function addInbox(input: unknown, actor: Actor) {
  const data = inboxInput.parse(input)
  const id = uid('n')
  run('INSERT INTO inbox (id, text, source, created_at) VALUES (:id, :text, :source, :at)', params({ ...data, id, at: nowIso() }))
  logChange(actor, 'inbox', id, '新建', `随手记：${data.text.slice(0, 30)}`)
  return { id }
}
export function doneInbox(id: string, result: string, actor: Actor) {
  if (!get('SELECT id FROM inbox WHERE id = :id', { id })) throw new NotFound('找不到这条随手记')
  run('UPDATE inbox SET done_at = :at, result = :r WHERE id = :id', { at: nowIso(), r: result, id })
  logChange(actor, 'inbox', id, '处理', `随手记已处理：${result}`)
  return { id }
}

export function getSettings() {
  const rows = all<{ key: string; value: string }>('SELECT * FROM settings')
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const id = identity()
  return {
    nav_mode: (s.nav_mode as 'simple' | 'complex' | 'top') ?? 'complex',
    theme: s.theme ?? 'jade',
    mobile_nav: (s.mobile_nav as 'tabs' | 'drawer') ?? 'tabs',
    owner: id.owner, business: s.business || '我的工作台',
    // 店名、小红书账号名（没设置时是中性说法，见 services/identity.ts）；xhs_name 是设置里存的原值，空着就是没设
    shop: id.shop, xhs: id.xhs, xhs_name: s.xhs_name ?? '',
    today: today(), demo: demoDate() !== null,
  }
}
export function saveSettings(input: unknown, actor: Actor) {
  const data = settingsInput.parse(input)
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    // 小红书账号名写空 = 不单独设，跟着店名走
    if (key === 'xhs_name' && value === '') { run("DELETE FROM settings WHERE key = 'xhs_name'"); continue }
    run('INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value', { key, value })
  }
  const NAMES: Record<string, string> = { nav_mode: '电脑导航', theme: '风格', mobile_nav: '手机导航', owner: '称呼', business: '工作台名称（店名）', xhs_name: '小红书账号名' }
  logChange(actor, 'settings', 'app', '修改', `设置：改了${Object.keys(data).map((k) => NAMES[k] ?? k).join('、')}`)
  return getSettings()
}

/** 全局搜索：客户、项目、待办、日程、知识库文件名。搜索词里的 % 和 _ 按普通字符找（E5 修 #8） */
export function search(q: string) {
  if (!q.trim()) return []
  const like = `%${escapeLike(q.trim())}%`
  const L = (col: string) => `${col} LIKE :l ESCAPE '\\'`
  return [
    ...all(`SELECT 'client' AS type, id, name || COALESCE(' · ' || contact_name,'') AS title, stage AS sub FROM clients WHERE ${L('name')} OR ${L('label')} OR ${L('note')} OR ${L('contact_name')} LIMIT 6`, { l: like }),
    ...all(`SELECT 'project' AS type, id, name AS title, stage AS sub FROM projects WHERE ${L('name')} LIMIT 4`, { l: like }),
    ...all(`SELECT 'todo' AS type, id, title, status AS sub FROM todos WHERE ${L('title')} LIMIT 4`, { l: like }),
    ...all(`SELECT 'event' AS type, id, title, substr(start,1,16) AS sub FROM events WHERE ${L('title')} LIMIT 4`, { l: like }),
  ]
}
