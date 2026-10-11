// 大客户模块的接口：/api/crm/…  归属：大客户模块
import { Hono } from 'hono'
import * as crm from './service.ts'
import * as act from './actions.ts'
import { careList, careRules, springList } from './care.ts'
import { careDraft } from './care-draft.ts'
import { findingPreview, listInbox, readInbox } from './materials.ts'
import { today } from '../../services/common.ts'
import { z } from 'zod'
import * as ex from './extract.ts'
import * as exw from './extract-write.ts'
import { precheck } from './rules.ts'

const WEB = '网页' as const
const ok = <T>(data: T) => ({ ok: true as const, data })
const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => ({}))
const days = (v: string | undefined, def: number) => Math.min(Math.max(Number.parseInt(v ?? '', 10) || def, 1), 120)

export const crmRoutes = new Hono()
// 读
crmRoutes.get('/clients', (c) => c.json(ok(crm.clientList())))
crmRoutes.get('/clients/:id', (c) => c.json(ok(crm.profile(c.req.param('id')))))
crmRoutes.get('/key-accounts', (c) => c.json(ok(crm.keyAccounts())))
crmRoutes.get('/focus', (c) => c.json(ok(crm.focus())))
crmRoutes.get('/dates', (c) => c.json(ok(crm.upcomingDates(days(c.req.query('days'), 45)))))
crmRoutes.get('/stage-edits', (c) => c.json(ok(crm.recentStageEdits())))
crmRoutes.get('/care', (c) => c.json(ok({ items: careList(days(c.req.query('days'), 30)), spring: springList(), rules: careRules() })))
crmRoutes.get('/materials', (c) => c.json(ok(listInbox())))
// 原件 + 工作台按字面先标出来的几句（价格、日子、“考虑一下”、来门店；不用 AI，给演示的人等 Codex 时有话说）
crmRoutes.get('/materials/file', (c) => { const path = c.req.query('path') ?? ''; const body = readInbox(path); return c.json(ok({ path, body, hints: precheck(body) })) })
crmRoutes.get('/codex', (c) => c.json(ok(ex.codexStatus())))
crmRoutes.get('/extractions', (c) => c.json(ok(ex.listExtractions())))
crmRoutes.get('/extractions/:id', (c) => c.json(ok(ex.getExtraction(c.req.param('id')))))

// 写（改历史都要写原因，见 actions.ts）
crmRoutes.patch('/clients/:id/stage', async (c) => c.json(ok(act.changeStage(c.req.param('id'), await body(c), WEB))))
crmRoutes.patch('/clients/:id/follow', async (c) => c.json(ok(act.setFollow(c.req.param('id'), await body(c), WEB))))
crmRoutes.post('/promises', async (c) => c.json(ok(act.addPromise(await body(c), WEB))))
crmRoutes.patch('/promises/:id', async (c) => c.json(ok(act.updatePromise(c.req.param('id'), await body(c), WEB))))
crmRoutes.post('/promises/:id/decision/preview', async (c) => c.json(ok(act.previewDecision(c.req.param('id'), await body(c)))))
crmRoutes.post('/promises/:id/decision', async (c) => c.json(ok(act.decidePromise(c.req.param('id'), await body(c), WEB))))
// “规则该改了”要加进待确认发现的那一节（提取结果里还没写入时先给看）
const findingIn = z.object({ client: z.string().min(1), promise: z.string().min(1), said: z.string().default('这次'), source: z.string().nullable().default(null), conflict: z.string().min(1), note: z.string().default('') })
crmRoutes.post('/findings/preview', async (c) => c.json(ok(findingPreview({ ...findingIn.parse(await body(c)), today: today() }))))
crmRoutes.post('/care', async (c) => c.json(ok(act.addCare(await body(c), WEB))))
crmRoutes.patch('/care/:id', async (c) => c.json(ok(act.updateCare(c.req.param('id'), await body(c), WEB))))
crmRoutes.post('/care/draft', async (c) => c.json(ok(await careDraft(await body(c), WEB))))
crmRoutes.post('/extractions', async (c) => c.json(ok(ex.startExtraction(await body(c), WEB))))
crmRoutes.post('/extractions/prepared', async (c) => c.json(ok(ex.startPrepared(await body(c), WEB))))
crmRoutes.post('/extractions/:id/preview', async (c) => c.json(ok(exw.previewKb(c.req.param('id'), await body(c)))))
crmRoutes.post('/extractions/:id/confirm', async (c) => c.json(ok(exw.confirmExtraction(c.req.param('id'), await body(c), WEB))))
crmRoutes.post('/extractions/:id/undo', (c) => c.json(ok(exw.undoExtraction(c.req.param('id'), WEB))))
crmRoutes.post('/extractions/:id/discard', (c) => c.json(ok(exw.discardExtraction(c.req.param('id'), WEB))))
