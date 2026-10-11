// 小红书内容中心的接口：/api/content/…  归属：小红书内容模块。
// 底座留下的只读接口（account notes topics schedule drafts assets today）保留；内容中心的在下面。
import { Hono } from 'hono'
import * as content from './service.ts'
import * as pieces from './pieces.ts'
import * as studio from './studio.ts'
import * as stats from './stats.ts'
import * as reviews from './reviews.ts'
import * as topics from './topics.ts'
import * as center from './center.ts'
import { checkRules } from './checks.ts'
import { codexStatus } from './codex.ts'

const ok = <T>(data: T) => ({ ok: true as const, data })
const WEB = '网页' as const
const body = async (c: { req: { json: () => Promise<unknown> } }) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>

export const contentRoutes = new Hono()
// 底座的只读接口
contentRoutes.get('/account', (c) => c.json(ok(content.account())))
contentRoutes.get('/pillars', (c) => c.json(ok(content.pillars())))
contentRoutes.get('/notes', (c) => c.json(ok(content.notes())))
contentRoutes.get('/notes/:id', (c) => c.json(ok(content.note(c.req.param('id')))))
contentRoutes.get('/topics', (c) => c.json(ok(content.topics(c.req.query('date') || undefined))))
contentRoutes.get('/schedule', (c) => c.json(ok(content.schedule(c.req.query('from') || undefined, c.req.query('to') || undefined))))
contentRoutes.get('/drafts', (c) => c.json(ok(content.drafts())))
contentRoutes.get('/drafts/:id', (c) => c.json(ok(content.draft(c.req.param('id')))))
contentRoutes.get('/assets', (c) => c.json(ok(content.assets())))
contentRoutes.get('/today', (c) => c.json(ok(content.todayPlan())))

// 内容中心：今天页、开写的起点、AI 手上有什么、本机 Codex 状态
contentRoutes.get('/center', (c) => c.json(ok(center.centerToday())))
contentRoutes.get('/starts', (c) => c.json(ok(center.starts())))
contentRoutes.get('/kit', (c) => c.json(ok(center.aiKit())))
contentRoutes.get('/skill', (c) => c.json(ok(center.skillText())))
contentRoutes.get('/codex', (c) => c.json(ok(codexStatus())))
contentRoutes.get('/feed', (c) => c.json(ok(stats.feed())))

// 一篇内容
contentRoutes.get('/pieces', (c) => c.json(ok(pieces.listPieces())))
contentRoutes.post('/pieces', async (c) => c.json(ok(pieces.createPiece(await body(c), WEB))))
contentRoutes.get('/pieces/:id', (c) => c.json(ok(pieces.pieceDetail(c.req.param('id')))))
contentRoutes.patch('/pieces/:id', async (c) => c.json(ok(pieces.updatePiece(c.req.param('id'), await body(c), WEB))))
contentRoutes.post('/pieces/:id/publish', async (c) => c.json(ok(pieces.markPublished(c.req.param('id'), await body(c) as { published_at?: string; publish_url?: string }, WEB))))
contentRoutes.post('/pieces/:id/versions', async (c) => {
  const b = await body(c)
  return c.json(ok(pieces.saveVersion(c.req.param('id'), b.data, { origin: '手动修改', author: String(b.author || '林总'), note: b.note ? String(b.note) : null })))
})
contentRoutes.get('/pieces/:id/versions/:v', (c) => c.json(ok(pieces.versions(c.req.param('id')).find((v) => v.version === Number(c.req.param('v'))) ?? null)))
contentRoutes.post('/pieces/:id/restore', async (c) => c.json(ok(pieces.restoreVersion(c.req.param('id'), Number((await body(c)).version), WEB))))
/** 发布前检查的词表：网页边改边查用（shared/xhs-check.ts 是同一套规则） */
contentRoutes.get('/check-rules', (c) => c.json(ok(checkRules())))
contentRoutes.get('/notes/:id/daily', (c) => c.json(ok(stats.noteDaily(c.req.param('id')))))

// 创作对话（只有创作页用）
contentRoutes.get('/pieces/:id/studio', (c) => {
  const id = c.req.param('id')
  return c.json(ok({ ...pieces.pieceDetail(id), messages: studio.messages(id), running: studio.isRunning(id) }))
})
contentRoutes.post('/pieces/:id/messages', async (c) => c.json(ok(studio.send(c.req.param('id'), await body(c) as { text?: string; pin?: string | null }, WEB))))
contentRoutes.post('/messages/:id/stop', (c) => c.json(ok(studio.stop(c.req.param('id')))))
contentRoutes.post('/messages/:id/retry', (c) => c.json(ok(studio.retry(c.req.param('id'), WEB))))
contentRoutes.post('/messages/:id/adopt', async (c) => c.json(ok(studio.adopt(c.req.param('id'), Number((await body(c)).index), WEB))))

// 数据、选题、复盘
contentRoutes.get('/data', (c) => c.json(ok(stats.dataPage({ days: Number(c.req.query('days')) || 60, traffic: c.req.query('traffic'), format: c.req.query('format'), pillar: c.req.query('pillar'), sort: c.req.query('sort') }))))
contentRoutes.post('/topics/generate', async (c) => c.json(ok(topics.generateTopics(await body(c) as { direction?: string; count?: number }))))
contentRoutes.get('/jobs', (c) => c.json(ok(topics.jobs(c.req.query('kind') || undefined))))
contentRoutes.get('/reviews', (c) => c.json(ok(reviews.weeks())))
contentRoutes.get('/reviews/:week', (c) => c.json(ok(reviews.reviewDetail(c.req.param('week')))))
contentRoutes.post('/reviews/:week/generate', (c) => c.json(ok(reviews.generateReview(c.req.param('week')))))
contentRoutes.patch('/reviews/:week/learnings/:i', async (c) => c.json(ok(reviews.updateLearning(c.req.param('week'), Number(c.req.param('i')), await body(c) as { rule?: string; status?: string }, WEB))))
contentRoutes.get('/reviews/:week/learnings/:i/preview', (c) => c.json(ok(reviews.learningPreview(c.req.param('week'), Number(c.req.param('i'))))))
contentRoutes.post('/reviews/:week/learnings/:i/save', (c) => c.json(ok(reviews.saveLearning(c.req.param('week'), Number(c.req.param('i')), WEB))))
contentRoutes.post('/reviews/:week/ideas/:i/pool', (c) => c.json(ok(reviews.ideaToPool(c.req.param('week'), Number(c.req.param('i')), WEB))))
