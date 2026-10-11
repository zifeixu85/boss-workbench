// 数据源与导入模块的接口：/api/data/…  归属：数据源与导入模块
import { Hono } from 'hono'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { NotFound } from '../../services/common.ts'
import * as data from './service.ts'
import * as imp from './importer.ts'
import * as batches from './batches.ts'
import * as rules from './rules.ts'
import { syncSource } from './sync.ts'
import { codexSuggest } from './codex.ts'
import { reimportNotes, notesState } from './notes.ts'
import { CHANNELS, DATE_FMT_LABEL, FIELDS } from './fields.ts'
import { SAMPLE_DIR, sampleMeta } from './origin.ts'

const ok = <T>(d: T) => ({ ok: true as const, data: d })
const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => ({}))
const WEB = '网页'

export const dataRoutes = new Hono()

// 数据源
dataRoutes.get('/sources', (c) => c.json(ok(data.sources())))
dataRoutes.get('/sources/strips', (c) => c.json(ok(data.strips())))
dataRoutes.get('/sources/summary', (c) => c.json(ok(data.summary())))
dataRoutes.get('/sources/:id', (c) => c.json(ok(data.source(c.req.param('id')))))
dataRoutes.post('/sources/:id/sync', (c) => c.json(ok(syncSource(c.req.param('id')))))
dataRoutes.get('/runs', (c) => c.json(ok(data.runs({ source: c.req.query('source') || undefined, origin: c.req.query('origin') || undefined, limit: c.req.query('limit'), files: c.req.query('files') === '1' }))))
dataRoutes.get('/mappings', (c) => c.json(ok(data.mappings(c.req.query('source') || undefined))))
dataRoutes.get('/mapping-targets', (c) => c.json(ok(data.mappingTargets())))
dataRoutes.post('/mappings/:id', async (c) => c.json(ok(data.decideMapping(c.req.param('id'), await body(c), WEB))))
dataRoutes.get('/issues', (c) => c.json(ok(data.issues())))

// 小红书笔记数据：对照确认完以后，按新对照重新导入（写内容模块的笔记数据，能撤销）
dataRoutes.get('/notes', (c) => c.json(ok(notesState())))
dataRoutes.post('/notes/reimport', (c) => c.json(ok(reimportNotes(WEB))))

// 导入：字典、草稿（拖进来的文件）、预览、让 Codex 看看、导入、放弃
dataRoutes.get('/meta', (c) => c.json(ok({
  fields: FIELDS, channels: Object.entries(CHANNELS).map(([id, ch]) => ({ id, name: ch.name })),
  date_formats: Object.entries(DATE_FMT_LABEL).map(([value, label]) => ({ value, label })),
})))
dataRoutes.get('/drafts', (c) => c.json(ok(imp.listDrafts())))
dataRoutes.post('/drafts', async (c) => c.json(ok(imp.createDraft(await body(c)))))
dataRoutes.get('/drafts/:id', (c) => c.json(ok(imp.draftView(c.req.param('id')))))
dataRoutes.patch('/drafts/:id', async (c) => c.json(ok(imp.updateChoices(c.req.param('id'), await body(c)))))
dataRoutes.post('/drafts/:id/codex', async (c) => {
  await codexSuggest(c.req.param('id'))
  return c.json(ok(imp.draftView(c.req.param('id'))))
})
dataRoutes.post('/drafts/:id/commit', async (c) => c.json(ok(imp.commitDraft(c.req.param('id'), await body(c), WEB))))
dataRoutes.post('/drafts/:id/discard', (c) => c.json(ok(imp.discardDraft(c.req.param('id')))))

// 导入规则
dataRoutes.get('/rules', (c) => c.json(ok(data.rulesView())))
dataRoutes.get('/rules/:id', (c) => c.json(ok(data.ruleView(c.req.param('id')))))
dataRoutes.patch('/rules/:id', async (c) => c.json(ok(rules.updateRule(c.req.param('id'), await body(c)))))

// 导入的批次：撤销；示例数据：清掉、恢复
dataRoutes.get('/batches', (c) => c.json(ok(batches.listBatches(c.req.query('origin') || undefined))))
dataRoutes.get('/batches/:id/result', (c) => {
  const b = batches.getBatch(c.req.param('id'))
  if (b.target !== 'channel_daily') throw new NotFound('这一批不是经营每天的数')
  return c.json(ok(imp.resultOf(b.id)))
})
dataRoutes.post('/batches/:id/undo', (c) => c.json(ok(batches.undoBatch(c.req.param('id'), WEB))))
dataRoutes.get('/samples', (c) => c.json(ok(batches.sampleStatus())))
// 只清 / 放回一个渠道：body 里写 { channel: 'tmall' }；不写就是 5 个渠道一起
dataRoutes.post('/samples/clear', async (c) => c.json(ok(batches.clearSamples(WEB, batches.channelArg(((await body(c)) as { channel?: unknown }).channel)))))
dataRoutes.post('/samples/restore', async (c) => c.json(ok(batches.restoreSamples(WEB, batches.channelArg(((await body(c)) as { channel?: unknown }).channel)))))

// 样例导出表（工作台/示例数据/），网页上能直接下载
dataRoutes.get('/sample-files', (c) => {
  if (!existsSync(SAMPLE_DIR)) return c.json(ok([]))
  return c.json(ok(readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.csv')).map((f) => ({ name: f, size: statSync(join(SAMPLE_DIR, f)).size, ...(sampleMeta(f) ?? { title: f.replace(/\.csv$/, ''), note: '', channel: null, range: '', order: 99 }) }))
    .sort((a, b) => a.order - b.order).map(({ prefix: _p, ...x }: { prefix?: string } & Record<string, unknown>) => x)))
})
dataRoutes.get('/sample-files/:name', (c) => {
  const name = basename(c.req.param('name'))
  const p = join(SAMPLE_DIR, name)
  if (!name.endsWith('.csv') || !existsSync(p)) throw new NotFound('找不到这份样例表')
  return c.body(readFileSync(p), 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` })
})
