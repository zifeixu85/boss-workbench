// /api 下的接口。统一返回 { ok, data } 或 { ok:false, error }
// 公共接口写在这里；4 个业务模块各自的接口在 modules/<模块>/routes.ts，挂在 /api/crm、/api/biz、/api/content、/api/data 下。
import { Hono } from 'hono'
import * as clients from './services/clients.ts'
import * as schedule from './services/schedule.ts'
import * as projects from './services/projects.ts'
import * as money from './services/money.ts'
import * as kb from './services/kb.ts'
import * as home from './services/today.ts'
import * as modules from './services/modules.ts'
import { crmRoutes } from './modules/crm/routes.ts'
import { bizRoutes } from './modules/biz/routes.ts'
import { contentRoutes } from './modules/content/routes.ts'
import { dataRoutes } from './modules/data/routes.ts'
import { reminderRoutes } from './reminders/routes.ts'

const WEB = '网页' as const
export const routes = new Hono()
const ok = <T>(data: T) => ({ ok: true as const, data })
const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => ({}))

routes.get('/overview', (c) => c.json(ok(home.overview())))
routes.get('/follow', (c) => c.json(ok(home.followUps())))
routes.get('/changes', (c) => c.json(ok(home.recentChanges(50))))
routes.get('/search', (c) => c.json(ok(home.search(c.req.query('q') ?? ''))))
routes.get('/settings', (c) => c.json(ok(home.getSettings())))
routes.patch('/settings', async (c) => c.json(ok(home.saveSettings(await body(c), WEB))))
// 模块开关（shared/modules.ts）：GET 看每个模块开没开；PATCH { on: [...], off: [...] } 打开 / 收起，或 { set: [...] | 'all' } 整组设
routes.get('/modules', (c) => c.json(ok(modules.list())))
routes.patch('/modules', async (c) => {
  const b = (await body(c)) as { on?: unknown; off?: unknown; set?: unknown }
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  if (b.set !== undefined) return c.json(ok(modules.setModules(b.set === 'all' ? 'all' : ids(b.set), WEB)))
  return c.json(ok(modules.toggleModules(ids(b.on), ids(b.off), WEB)))
})

routes.get('/clients', (c) => c.json(ok(clients.listClients())))
routes.post('/clients', async (c) => c.json(ok(clients.createClient(await body(c), WEB))))
routes.get('/clients/:id', (c) => c.json(ok(clients.clientDetail(c.req.param('id')))))
routes.patch('/clients/:id', async (c) => c.json(ok(clients.updateClient(c.req.param('id'), await body(c), WEB))))
routes.post('/interactions', async (c) => c.json(ok(clients.logInteraction(await body(c), WEB))))
routes.get('/deals', (c) => c.json(ok(clients.listDeals())))
routes.post('/deals', async (c) => c.json(ok(clients.createDeal(await body(c), WEB))))
routes.patch('/deals/:id', async (c) => c.json(ok(clients.updateDeal(c.req.param('id'), await body(c), WEB))))

routes.get('/events', (c) => c.json(ok(schedule.listEvents(c.req.query('from'), c.req.query('to')))))
routes.post('/events', async (c) => c.json(ok(schedule.createEvent(await body(c), WEB))))
routes.get('/events/:id', (c) => c.json(ok(schedule.getEvent(c.req.param('id')))))
routes.patch('/events/:id', async (c) => c.json(ok(schedule.updateEvent(c.req.param('id'), await body(c), WEB))))
routes.delete('/events/:id', (c) => c.json(ok(schedule.deleteEvent(c.req.param('id'), WEB))))

routes.get('/todos', (c) => c.json(ok(schedule.listTodos({ open: c.req.query('open') === '1' }))))
routes.get('/todos/:id', (c) => c.json(ok(schedule.getTodo(c.req.param('id')))))
routes.post('/todos', async (c) => c.json(ok(schedule.createTodo(await body(c), WEB))))
routes.patch('/todos/:id', async (c) => c.json(ok(schedule.updateTodo(c.req.param('id'), await body(c), WEB))))
routes.delete('/todos/:id', (c) => c.json(ok(schedule.deleteTodo(c.req.param('id'), WEB))))

routes.get('/projects', (c) => c.json(ok(projects.listProjects())))
routes.post('/projects', async (c) => c.json(ok(projects.createProject(await body(c), WEB))))
routes.get('/projects/:id', (c) => c.json(ok(projects.getProject(c.req.param('id')))))
routes.patch('/projects/:id', async (c) => c.json(ok(projects.updateProject(c.req.param('id'), await body(c), WEB))))
routes.patch('/milestones/:id', async (c) => c.json(ok(projects.updateMilestone(c.req.param('id'), await body(c), WEB))))

routes.get('/cash', (c) => c.json(ok(money.cashSummary())))
routes.get('/receivables', (c) => c.json(ok(money.listReceivables())))
routes.post('/receivables', async (c) => c.json(ok(money.createReceivable(await body(c), WEB))))
routes.post('/collect', async (c) => c.json(ok(money.collect(await body(c), WEB))))
routes.get('/ledger', (c) => c.json(ok(money.listLedger(c.req.query('month')))))
routes.post('/ledger', async (c) => c.json(ok(money.addLedger(await body(c), WEB))))

routes.get('/kb/tree', (c) => c.json(ok(kb.kbTree())))
routes.get('/kb/file', (c) => c.json(ok(kb.readKb(c.req.query('path') ?? ''))))
routes.get('/kb/recent', (c) => c.json(ok(kb.recentKb())))

routes.get('/inbox', (c) => c.json(ok(home.listInbox())))
routes.post('/inbox', async (c) => c.json(ok(home.addInbox(await body(c), WEB))))
routes.post('/inbox/:id/done', async (c) => c.json(ok(home.doneInbox(c.req.param('id'), String((await body(c) as { result?: string }).result ?? '已处理'), WEB))))

// 业务模块（各自的文件夹，见 README“后续模块开发者须知”）
routes.route('/crm', crmRoutes)
routes.route('/biz', bizRoutes)
routes.route('/content', contentRoutes)
routes.route('/data', dataRoutes)
routes.route('/reminders', reminderRoutes) // 提醒（公共，2026-10-12）
