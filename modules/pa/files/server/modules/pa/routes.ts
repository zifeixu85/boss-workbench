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
import { scan, scanIfStale, scannedAt, sources, SCAN_DAYS } from './scan.ts'
import { allObjects } from './kb.ts'
import { DONE_HOURS, RUNNING_MIN, STALE_DAYS } from './status.ts'
import type { ReportKind } from './report-parse.ts'

export const paRoutes = moduleApp()

paRoutes.get('/focus', (c) => c.json(ok(focusClasses())))
paRoutes.get('/focus/:name', (c) => c.json(ok(focusList(decodeURIComponent(c.req.param('name'))))))
paRoutes.get('/object', (c) => c.json(ok(focusObject(c.req.query('path') ?? ''))))
paRoutes.get('/pending', (c) => c.json(ok(pendingItems())))

paRoutes.get('/progress', async (c) => {
  const scanned = await scanIfStale()
  const list = listSessions({ days: Number(c.req.query('days')) || 30, all: c.req.query('all') === '1' })
  return c.json(ok({
    sessions: list, counts: statusCounts(list), scanned_at: scannedAt(), left: scanned?.left ?? 0, errors: scanned?.errors ?? [], sources: sources(),
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
  await scanIfStale()
  const q = (k: string) => c.req.query(k) || undefined
  return c.json(ok(listOutputs({ days: Number(q('days')) || 30, kind: q('kind'), object: q('object'), tool: q('tool'), session: q('session'), edits: q('edits') === '1', gone: q('gone') === '1', limit: Math.min(Number(q('limit')) || 60, 200), offset: Number(q('offset')) || 0 })))
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
  await scanIfStale()
  const days = Math.min(Math.max(Number(c.req.query('days')) || 14, 7), 60)
  return c.json(ok(buildPulse(listSessions({ days: days + 14 }), recentOutputs(days + 14), now(), days)))
})

paRoutes.get('/reports', async (c) => { await scanIfStale(); return c.json(ok(reportView((c.req.query('kind') || undefined) as ReportKind | undefined, c.req.query('period') || undefined))) })
paRoutes.get('/roles', (c) => c.json(ok(roles())))
