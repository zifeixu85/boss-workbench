// 今日、跟进清单、收件箱、设置、最近改动
// 今日页还要用 3 个业务模块的“今日接口”：经营 summary()/anomalies()、大客户 focus()、数据源 issues()；
// 装进来的模块通过接入点（server/module-hooks.ts）给今日页重点卡的数和今日概况里的一段，这里不写模块的名字。
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
import * as dataSources from '../modules/data/service.ts'
import { readRemindSettings } from '../reminders/settings.ts'
import { unreadCount } from '../reminders/store.ts'
import { enabled as enabledModules } from './modules.ts'
import { searchKb } from './kb.ts'
import { homeFocus, HOME_CARDS } from '../../shared/home.ts'
import { MODULE_SETTINGS } from '../../shared/modules.ts'
import { moduleHooks, hookErrors } from '../module-hooks.ts'
import type { TodaySection } from '../module-types.ts'
import { BadRequest } from './common.ts'

const moduleErrors: { module: string; error: string }[] = []
function safe<T>(module: string, fn: () => T, fallback: T): T {
  try { return fn() } catch (err) {
    console.error(`今日页：${module} 模块出错`, err)
    moduleErrors.push({ module, error: (err as Error).message })
    return fallback
  }
}

type Todo = { id: string; title: string; status: string; priority: string; due: string | null; due_time: string | null; client_id: string | null; client_name: string | null }

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
  // 模块开关（shared/modules.ts）：没打开的模块不算、不显示，命令行 today 也一样
  const on = new Set(enabledModules())
  const fuAll = followUps()
  const fu = on.has('clients') ? fuAll : { ...fuAll, due: [] as typeof fuAll.due } // 客户没开：不列“该联系的人”，“卡在哪”照常
  const cash = cashSummary()
  const overdueRecs = listReceivables().filter((r) => r.status === '逾期')
  const top = todayTodos.find((x) => x.priority === '紧急') ?? todayTodos[0] ?? weekTodos[0] ?? null
  moduleErrors.length = 0
  const sales = on.has('biz') ? safe('经营', () => biz.summary(), null) : null
  const alerts = [...(on.has('biz') ? safe('经营', () => biz.anomalies(), []) : []), ...(on.has('data') ? safe('数据源', () => dataSources.issues(), []) : [])]
  const keyClients = on.has('clients') ? safe('大客户', () => crm.focus(t, 6), []) : []
  // 装进来的模块：重点卡的数（键是卡片 id）、今日概况里的一段。模块收着的不调；出错只影响它自己那一块
  const cards: Record<string, unknown> = {}
  const moduleToday: (TodaySection & { module: string; name: string })[] = []
  for (const h of moduleHooks()) {
    if (!on.has(h.module)) continue
    for (const [id, fn] of Object.entries(h.hooks.home ?? {})) {
      if (HOME_CARDS.some((c) => c.id === id && c.module === h.module)) cards[id] = safe(h.name, () => fn(t), null)
    }
    const section = h.hooks.today ? safe(h.name, () => h.hooks.today!(t), null) : null
    if (section) moduleToday.push({ module: h.module, name: h.name, ...section })
  }
  for (const e of hookErrors()) moduleErrors.push(e)
  const dueRecs = listReceivables().filter((r) => r.status === '7天内到期')
  // 基础版的两张重点卡：项目推进到哪、收件箱等你看的（2026-10-15）
  const active = listProjects().filter((p) => p.stage !== '已完成' && p.stage !== '暂停')
  const openInbox = (listInbox() as { done_at: string | null }[]).filter((n) => !n.done_at)
  const homeSetting = get<{ value: string }>("SELECT value FROM settings WHERE key = 'home'")?.value
  return {
    date: t,
    sales, alerts, key_clients: keyClients, cards, module_today: moduleToday, module_errors: [...moduleErrors],
    headline: top ? { id: top.id, title: top.title, due: top.due, due_time: top.due_time } : null,
    events, upcoming,
    todos: { today: todayTodos, week: weekTodos, open: todos.length },
    follow: { due: fu.due.slice(0, 6), dueCount: fu.due.length, waitingOn: fu.waitingOn.slice(0, 5) },
    risks: risks.slice(0, 5).map((p) => ({ id: p.id, name: p.name, client_name: p.client_name, risks: p.risks })),
    cash: { outstanding: cash.outstanding, overdue: cash.overdue, due_30: cash.due_30, month: cash.month, overdueList: overdueRecs.slice(0, 4), dueSoon: dueRecs.slice(0, 4) },
    changes: recentChanges(8),
    // 提醒页没读的条数（菜单角标）；数据源有几个（数据异常面板的空状态要分“都正常”和“还没接”）。10-12 加
    reminders_unread: safe('提醒', () => unreadCount(), 0),
    source_count: on.has('data') ? safe('数据源', () => dataSources.sources().length, 0) : 0,
    modules: [...on],
    home: homeFocus(homeSetting, [...on]),
    projects_brief: active.slice(0, 5).map((p) => ({ id: p.id, name: p.name, stage: p.stage, due: p.due, next_step: p.next_step, waiting_on: p.waiting_on,
      next_milestone: p.next_milestone ? { date: p.next_milestone.date, title: p.next_milestone.title } : null, risks: p.risks.length })),
    projects_active: active.length,
    inbox_brief: openInbox.slice(0, 4),
    inbox_open: openInbox.length,
  }
}

export function recentChanges(limit = 20) {
  return all('SELECT * FROM changes ORDER BY id DESC LIMIT :n', { n: limit })
}

export function listInbox() {
  return all(`SELECT n.*, c.name AS client_name, p.name AS project_name FROM inbox n
    LEFT JOIN clients c ON c.id = n.client_id LEFT JOIN projects p ON p.id = n.project_id
    ORDER BY n.done_at IS NOT NULL, n.created_at DESC LIMIT 100`)
}
export function addInbox(input: unknown, actor: Actor) {
  const data = inboxInput.parse(input)
  const id = uid('n')
  run(`INSERT INTO inbox (id, text, source, kind, judgement, suggest, client_id, project_id, origin, created_at)
       VALUES (:id, :text, :source, :kind, :judgement, :suggest, :client_id, :project_id, :origin, :at)`,
  params({ kind: null, judgement: null, suggest: null, client_id: null, project_id: null, origin: null, ...data, id, at: nowIso() }))
  logChange(actor, 'inbox', id, '新建', `${data.kind && data.kind !== '随手记' ? `收件箱（${data.kind}）` : '随手记'}：${data.text.slice(0, 30)}`)
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
    nav_mode: (s.nav_mode as 'simple' | 'complex' | 'dual' | 'top') ?? 'complex',
    theme: s.theme ?? 'jade',
    mobile_nav: (s.mobile_nav as 'tabs' | 'drawer') ?? 'tabs',
    owner: id.owner, business: s.business || '我的工作台',
    // 店名（没设置时是中性说法，见 services/identity.ts）
    shop: id.shop,
    // 装进来的模块登记的设置项（module.json 的 settings）：只列开着的模块的；value 是存的原值，空着就是没设
    module_settings: moduleSettings(s),
    // “知识库”这一页叫什么（kb 是算好的名字；kb_name 是设置里存的原值，空着就是没设）
    kb: id.kb, kb_name: s.kb_name ?? '',
    today: today(), demo: demoDate() !== null,
    reminders: readRemindSettings(),
    // 打开着的模块（shared/modules.ts）；没设过 = 全部
    modules: enabledModules(),
    // 今日页重点卡（shared/home.ts）：存的原值，空 = 默认
    home: s.home ?? '',
  }
}
/** 开着的模块登记的设置项和现在的值 */
function moduleSettings(stored: Record<string, string>) {
  const on = enabledModules()
  return MODULE_SETTINGS.filter((d) => on.includes(d.module)).map((d) => ({ ...d, value: stored[d.key] ?? '' }))
}
export function saveSettings(input: unknown, actor: Actor) {
  const { module_settings: extra, ...data } = settingsInput.parse(input)
  const extraNames: string[] = []
  // 模块的设置项：只收登记过的 key，长度按登记的；写空 = 清掉（模块自己决定空着时用什么）
  for (const [key, value] of Object.entries(extra ?? {})) {
    const def = MODULE_SETTINGS.find((d) => d.key === key)
    if (!def) throw new BadRequest(`没有“${key}”这个设置项（装进来的模块登记的有：${MODULE_SETTINGS.map((d) => d.key).join('、') || '无'}）`)
    if (value.length > def.max) throw new BadRequest(`${def.label}最多 ${def.max} 个字`)
    if (value === '') run('DELETE FROM settings WHERE key = :key', { key })
    else run('INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value', { key, value })
    extraNames.push(def.label)
  }
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    // “知识库”页的名字写空 = 改回“知识库”
    if (key === 'kb_name' && value === '') { run("DELETE FROM settings WHERE key = 'kb_name'"); continue }
    run('INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value', { key, value })
  }
  const NAMES: Record<string, string> = {
    nav_mode: '电脑导航', theme: '风格', mobile_nav: '手机导航', owner: '称呼', business: '工作台名称（店名）', kb_name: '“知识库”页的名字', home: '首页重点卡', assistant_on: 'AI 助手开关',
    remind_on: '提醒开关', notify_at: '每天看汇总的时间', quiet_start: '免打扰时段', quiet_end: '免打扰时段', remind_demo_system: '演示时弹不弹系统通知',
  }
  const changed = [...new Set([...Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => NAMES[k] ?? k), ...extraNames])]
  logChange(actor, 'settings', 'app', '修改', `设置：改了${changed.join('、')}`)
  return getSettings()
}

/** 知识库那一组：文件名和正文都找（services/kb.ts 的 searchKb，和 AI 助手的 kb_search 同一套）；
 *  “不读”的文件夹、工作台/ 快照、标“私密”的笔记不列。知识库读不了（没接知识库、权限不对）就不出这一组，不影响别的结果 */
function searchKbHits(q: string) {
  try {
    // 命中的那一行去掉 Markdown 记号（链接只留名字、表格竖线换成 ·），README 显示成“某文件夹的说明”
    const plain = (line: string) => line.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, p: string, n: string) => n || p.split('/').pop() || p)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s*\|\s*/g, ' · ').replace(/^[·\s]+|[·\s]+$/g, '').replace(/[*_`]/g, '')
    return searchKb(q, { limit: 6, skipPrivate: true }).map((h) => {
      const folder = h.path.split('/').slice(0, -1)
      const title = /^README(-知识库)?$/.test(h.name) && folder.length ? `${folder[folder.length - 1]}的说明` : h.name
      return { type: 'kb' as const, id: h.path, title, sub: h.line === '（文件名）' ? folder.join(' / ') : plain(h.line) }
    })
  } catch { return [] }
}

/** 全局搜索：客户、项目、待办、日程、知识库（文件名和正文）。搜索词里的 % 和 _ 按普通字符找（E5 修 #8） */
export function search(q: string) {
  if (!q.trim()) return []
  const like = `%${escapeLike(q.trim())}%`
  const clientsOn = enabledModules().includes('clients')
  const L = (col: string) => `${col} LIKE :l ESCAPE '\\'`
  return [
    ...(clientsOn ? all(`SELECT 'client' AS type, id, name || COALESCE(' · ' || contact_name,'') AS title, stage AS sub FROM clients WHERE ${L('name')} OR ${L('label')} OR ${L('note')} OR ${L('contact_name')} LIMIT 6`, { l: like }) : []),
    ...all(`SELECT 'project' AS type, id, name AS title, stage AS sub FROM projects WHERE ${L('name')} LIMIT 4`, { l: like }),
    ...all(`SELECT 'todo' AS type, id, title, status AS sub FROM todos WHERE ${L('title')} LIMIT 4`, { l: like }),
    ...all(`SELECT 'event' AS type, id, title, substr(start,1,16) AS sub FROM events WHERE ${L('title')} LIMIT 4`, { l: like }),
    ...searchKbHits(q),
  ]
}
