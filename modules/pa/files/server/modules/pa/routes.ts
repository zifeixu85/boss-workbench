// 个人助理模块的接口：核心挂在 /api/m/pa/ 下。读的居多；写的只有三种标记（标已看、改状态、归类），都只记在工作台数据库里。
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { moduleApp, ok, body } from '../../module-kit.ts'
import { focusClasses, roles } from './kb.ts'
import { focusList, focusObject, pendingItems } from './focus.ts'
import { getSession, listSessions, markRead, setObject, setStatus, statusCounts } from './store.ts'
import { getOutput, imageFile, listOutputs, openOnMac, recentOutputs, thumbFile } from './outputs.ts'
import { buildPulse } from './pulse-calc.ts'
import { now } from './store.ts'
import { reportView } from './reports.ts'
import { scan, scanSoon, scannedAt, sources, SCAN_DAYS } from './scan.ts'
import { allObjects } from './kb.ts'
import { DONE_HOURS, RUNNING_MIN, STALE_DAYS } from './status.ts'
import type { ReportKind } from './report-parse.ts'
import { kbCheck, kbCheckText } from './check.ts'
import { usage } from './usage.ts'
import { assistantDetail, assistantList, sessionAssistants } from './assistants.ts'
import type { UsageRange } from './usage-calc.ts'

export const paRoutes = moduleApp()

paRoutes.get('/focus', (c) => c.json(ok(focusClasses())))
paRoutes.get('/focus/:name', (c) => c.json(ok(focusList(decodeURIComponent(c.req.param('name'))))))
paRoutes.get('/object', (c) => c.json(ok(focusObject(c.req.query('path') ?? ''))))
paRoutes.get('/pending', (c) => c.json(ok(pendingItems())))
paRoutes.get('/check', (c) => { const r = kbCheck(); return c.json(ok({ ...r, text: kbCheckText(r) })) })

paRoutes.get('/progress', async (c) => {
  // 不等扫描，先给现有的；在后台扫的话告诉页面，过一会儿再取一次
  const scanning = scanSoon()
  const list = listSessions({ days: Number(c.req.query('days')) || 30, all: c.req.query('all') === '1' })
  // 每个对话归哪个助理（进展页的“按助理”筛选）
  const links = sessionAssistants(list)
  return c.json(ok({
    sessions: list.map((s) => ({ ...s, assistant: links.get(s.id) ?? null })), counts: statusCounts(list), scanned_at: scannedAt(), scanning, left: 0, errors: [], sources: sources(),
    rules: { running_min: RUNNING_MIN, stale_days: STALE_DAYS, done_hours: DONE_HOURS, scan_days: SCAN_DAYS },
    objects: allObjects().map((x) => ({ path: x.object.path, name: x.object.name, type: x.cls.name })),
  }))
})
paRoutes.post('/scan', async (c) => c.json(ok(await scan({ budgetMs: 8000, force: (await body(c) as { force?: boolean }).force === true }))))
paRoutes.get('/sessions/:id', (c) => c.json(ok(getSession(c.req.param('id')))))
paRoutes.post('/sessions/:id/read', (c) => c.json(ok(markRead(c.req.param('id'), '网页'))))
paRoutes.post('/sessions/:id/status', async (c) => c.json(ok(setStatus(c.req.param('id'), ((await body(c)) as { status?: string | null }).status ?? null, '网页'))))
paRoutes.post('/sessions/:id/object', async (c) => c.json(ok(setObject(c.req.param('id'), ((await body(c)) as { path?: string | null }).path ?? null, '网页'))))

paRoutes.get('/outputs', async (c) => {
  scanSoon()
  const q = (k: string) => c.req.query(k) || undefined
  // 按助理：这个助理的对话里出的文件
  const who = q('assistant')
  const links = sessionAssistants(listSessions({ days: 365, all: true }))
  const assistants = [...new Map([...links.values()].map((a) => [a.key, { key: a.key, name: a.name, avatar: a.avatar }])).values()]
  const sessionIn = who ? new Set([...links].filter(([, a]) => a.key === who).map(([id]) => id)) : undefined
  return c.json(ok({ assistants, ...listOutputs({ sessionIn, days: Number(q('days')) || 30, kind: q('kind'), object: q('object'), tool: q('tool'), session: q('session'), edits: q('edits') === '1', gone: q('gone') === '1', limit: Math.min(Number(q('limit')) || 60, 200), offset: Number(q('offset')) || 0 }) }))
})
paRoutes.get('/outputs/:id', (c) => c.json(ok(getOutput(c.req.param('id')))))
// 在本机打开 / 在访达里显示（只认清单里的编号）
paRoutes.post('/outputs/:id/open', async (c) => c.json(ok(await openOnMac(c.req.param('id'), ((await body(c)) as { reveal?: boolean }).reveal === true))))
// 看一张图：只按清单里的编号给，原文件只读。SVG 里能写脚本：直接打开这个地址时也不让它跑、不让它连外面
paRoutes.get('/outputs/:id/file', async (c) => {
  const f = c.req.query('size') === 'thumb' ? await thumbFile(c.req.param('id')) : imageFile(c.req.param('id'))
  const svg = f.type === 'image/svg+xml' ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" } : {}
  return new Response(Readable.toWeb(createReadStream(f.path)) as ReadableStream, { headers: { 'content-type': f.type, 'content-length': String(f.size), 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', ...svg } })
})
// 进展的数字和图：近 days 天每天做完几件、出了几张图几个文件，本周对比上周，连续几天在用，本周花在哪
paRoutes.get('/pulse', async (c) => {
  scanSoon()
  const days = Math.min(Math.max(Number(c.req.query('days')) || 14, 7), 60)
  return c.json(ok(buildPulse(listSessions({ days: days + 14 }), recentOutputs(days + 14), now(), days)))
})

// AI 用量：今日 / 近 7 日 / 近 30 日（只有数字）
paRoutes.get('/usage', async (c) => {
  scanSoon()
  const range = c.req.query('range')
  return c.json(ok(usage((range === 'today' || range === '30d' ? range : '7d') as UsageRange)))
})

paRoutes.get('/reports', async (c) => { scanSoon(); return c.json(ok(reportView((c.req.query('kind') || undefined) as ReportKind | undefined, c.req.query('period') || undefined))) })
paRoutes.get('/roles', (c) => c.json(ok(roles())))
// 助理页（约定 11.11）：一张助理清单；一个助理自己的页
paRoutes.get('/assistants', (c) => { scanSoon(); return c.json(ok(assistantList())) })
paRoutes.get('/assistants/:key', (c) => c.json(ok(assistantDetail(decodeURIComponent(c.req.param('key'))))))
