// 接进 Codex 的两个入口（server/assistant/capabilities.ts、launch.ts）的测试：页面清单从菜单来、模块登记的命令和对象自动带上、
// 模块收起来就不列、打开时换成侧边栏地址、工作台没在运行先拉起。不起真的服务、不调真的 Codex。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'wb-cap-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, '数据', 'wb.db')
delete process.env.PORT
const { CORE_READ_COMMANDS, CORE_WRITE_COMMANDS, OpenError, buildCapabilities, embedPath, findPage, pagesFromNav, readCommands, resolveOpen, writeCommands } = await import('./capabilities.ts')
const { ensureRunning, probe, recordService, recordedPort, wantedPort } = await import('./launch.ts')
const { APP_DIR, DB_PATH } = await import('../db.ts')
type Nav = import('./capabilities.ts').NavLike
type Probe = import('./launch.ts').Probe
test.after(() => rmSync(dir, { recursive: true, force: true }))

// 网页那份菜单（纯数据，Node 能读）。路径是算出来的：服务端类型检查不跟进网页代码
const { NAV } = (await import(pathToFileURL(join(APP_DIR, 'src', 'app', 'nav.ts')).href)) as { NAV: Nav[] }

// 一个装进来的模块（虚构）：登记了能读、能写的命令和一个能打开的对象
const tea = {
  id: 'gifts', name: '茶礼订单', read: ['gifts'], write: ['gifts-add', 'todo-add'], about: { 'gifts-add': '加一张茶礼订单' },
  open: [{ key: 'gifts-order', label: '某一张订单', to: '/gifts?order={id}', id: '订单号' }, { key: 'gifts-board', label: '排产看板', to: '/gifts/board' }],
}
const nav: Nav[] = [...NAV, { key: 'gifts', to: '/gifts', label: '茶礼订单', section: '经营', module: 'gifts' }]
const input = { nav, modules: [tea], moduleNames: { gifts: '茶礼订单', biz: '经营', clients: '客户与跟进' } }

test('页面清单从菜单来：没有子页面的用菜单的 key，有子页面的每页一条，第一页沿用模块的 key', () => {
  const pages = pagesFromNav(NAV)
  const by = (key: string) => pages.find((p) => p.key === key)
  assert.deepEqual(by('projects'), { key: 'projects', title: '项目', trail: '今日 › 项目', to: '/projects', module: 'projects' })
  assert.equal(by('today')?.to, '/')
  assert.equal(by('clients')?.trail, '客户 › 客户列表')
  assert.equal(by('clients-pipeline')?.to, '/clients/pipeline')
  assert.equal(by('ch-tmall')?.to, '/channel/tmall')
  assert.equal(new Set(pages.map((p) => p.key)).size, pages.length, 'key 不重复')
  assert.equal(new Set(pages.map((p) => p.to)).size, pages.length, '地址不重复')
})

test('装了模块：菜单页、登记的固定页面、对象、读写命令都自动带上；和核心重名的命令不算', () => {
  const c = buildCapabilities(input)
  assert.ok(c.pages.some((p) => p.key === 'gifts' && p.trail === '经营 › 茶礼订单'))
  assert.ok(c.pages.some((p) => p.key === 'gifts-board' && p.trail === '茶礼订单 › 排产看板'))
  assert.deepEqual(c.objects.find((o) => o.kind === 'gifts-order'), { kind: 'gifts-order', title: '茶礼订单 · 某一张订单', id: '订单号', module: 'gifts' })
  assert.deepEqual(c.read.find((x) => x.command === 'gifts'), { command: 'gifts', what: '茶礼订单模块的命令（参数看 workbench_help）', module: 'gifts' })
  assert.deepEqual(c.write.find((x) => x.command === 'gifts-add'), { command: 'gifts-add', what: '加一张茶礼订单', module: 'gifts' })
  assert.equal(c.write.filter((x) => x.command === 'todo-add').length, 1, '核心的 todo-add 只列一次')
  assert.equal(c.write.find((x) => x.command === 'todo-add')?.module, undefined)
  assert.deepEqual(readCommands([tea]), [...CORE_READ_COMMANDS, 'gifts'])
  assert.deepEqual(writeCommands([tea]), [...CORE_WRITE_COMMANDS, 'gifts-add'])
  assert.equal(c.write.find((x) => x.command === 'stage')?.ask_first, true, '改阶段标着先问老板')
  for (const kind of ['project', 'client', 'todo', 'event', 'kb']) assert.ok(c.objects.some((o) => o.kind === kind), kind)
})

test('模块收起来：它的页面、对象、命令都不列，单独写在 off 里', () => {
  const on = ['today', 'tasks', 'projects', 'inbox', 'kb', 'settings']
  const c = buildCapabilities({ ...input, enabled: on })
  assert.deepEqual(c.pages.map((p) => p.key), ['today', 'calendar', 'todos', 'projects', 'inbox', 'kb', 'settings'])
  assert.deepEqual(c.objects.map((o) => o.kind), ['project', 'todo', 'event', 'kb'])
  assert.ok(!c.read.some((x) => ['clients', 'biz', 'gifts'].includes(x.command)))
  assert.ok(!c.write.some((x) => ['log', 'stage', 'gifts-add'].includes(x.command)))
  assert.ok(c.write.some((x) => x.command === 'project-set'))
  assert.ok(c.off.includes('茶礼订单（gifts）') && c.off.includes('客户与跟进（clients）'))
})

test('侧边栏地址：embed=1 放最前面，原来的参数留着，不重复加', () => {
  assert.equal(embedPath('/projects'), '/projects?embed=1')
  assert.equal(embedPath('/'), '/?embed=1')
  assert.equal(embedPath('/projects', { project: 'p_spring' }), '/projects?embed=1&project=p_spring')
  assert.equal(embedPath('/news?day=2026-11-12'), '/news?embed=1&day=2026-11-12')
  const kb = embedPath('/kb?embed=0', { path: '06-项目/春节茶礼.md' })
  assert.ok(kb.startsWith('/kb?embed=1&path='), kb)
  assert.equal(new URLSearchParams(kb.split('?')[1]).get('path'), '06-项目/春节茶礼.md')
})

test('打开页面：key、名字、地址、“分区 › 页面”都认；对不上说清楚，对上几个让老板选', () => {
  const open = (page: string) => resolveOpen({ page }, input)
  assert.equal(open('projects').path, '/projects?embed=1')
  assert.equal(open('待办').path, '/todos?embed=1')
  assert.equal(open('/clients/pipeline').path, '/clients/pipeline?embed=1')
  assert.equal(open('客户 › 应收款').key, 'clients-receivables')
  assert.equal(open('gifts-board').path, '/gifts/board?embed=1')
  assert.throws(() => open('不存在的页'), (e: Error) => e instanceof OpenError && /没有“不存在的页”这个页面/.test(e.message))
  assert.throws(() => resolveOpen({}, input), /告诉我打开什么/)
  const twins = [{ key: 'a', title: '看板', trail: '客户 › 看板', to: '/a' }, { key: 'b', title: '看板', trail: '经营 › 看板', to: '/b' }]
  assert.throws(() => findPage(twins, '看板'), /对上了几个页面[\s\S]*先问老板/)
})

test('打开对象：核心对象先核对再给地址（项目页带 ?embed=1&project=编号）；模块登记的对象照地址模板填', () => {
  const lookup = (kind: string, id: string) => {
    if (kind === 'project' && id === '春节茶礼') return { id: 'p_spring', title: '春节茶礼' }
    throw new Error('找不到这个项目')
  }
  const p = resolveOpen({ target: { kind: 'project', id: '春节茶礼' } }, input, lookup)
  assert.deepEqual({ path: p.path, id: p.id, title: p.title, trail: p.trail, verified: p.verified }, { path: '/projects?embed=1&project=p_spring', id: 'p_spring', title: '春节茶礼', trail: '今日 › 项目', verified: true })
  assert.throws(() => resolveOpen({ target: { kind: 'project', id: '没这个' } }, input, lookup), /找不到这个项目/)
  const g = resolveOpen({ target: { kind: 'gifts-order', id: 'A 01' } }, input, lookup)
  assert.equal(g.path, '/gifts?embed=1&order=A+01')
  assert.equal(g.verified, false, '模块的对象没法事先核对')
  assert.throws(() => resolveOpen({ target: { kind: 'order', id: '1' } }, input), /不认识“order”这类对象/)
  assert.throws(() => resolveOpen({ target: { kind: 'client', id: '' } }, input), /要写打开哪一个客户/)
})

test('模块收着的页面和对象不打开，告诉怎么打开模块开关', () => {
  const closed = { ...input, enabled: ['today', 'tasks', 'projects', 'inbox', 'kb', 'settings'] }
  assert.throws(() => resolveOpen({ page: 'clients' }, closed), /“客户与跟进”这个模块现在收着[\s\S]*modules --on clients/)
  assert.throws(() => resolveOpen({ target: { kind: 'gifts-order', id: '1' } }, closed), /modules --on gifts/)
  assert.equal(resolveOpen({ page: 'projects' }, closed).path, '/projects?embed=1')
})

// ───────────────────────────── 工作台没在运行先拉起（launch.ts）

test('端口：环境变量 PORT，没有就 4517；工作台启动时记下的端口读得回来', () => {
  assert.equal(wantedPort({}), 4517)
  assert.equal(wantedPort({ PORT: '4527' }), 4527)
  assert.equal(wantedPort({ PORT: 'abc' }), 4517)
  assert.equal(recordedPort(), null)
  recordService(4633)
  assert.equal(recordedPort(), 4633)
})

test('认端口上是谁：没人听 = 没人；别的程序（回网页、回别的工作台）= 别的，不能再往上拉一个；数据库对得上才是自己', async () => {
  let body = '<!doctype html><title>别的网站</title>'
  const server = createServer((_req, res) => { res.setHeader('content-type', body.startsWith('{') ? 'application/json' : 'text/html'); res.end(body) })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  try {
    assert.equal(await probe(port), 'other', '回的是网页')
    body = JSON.stringify({ ok: true, data: { app: '/别处/程序', db: '/别处/workbench.db' } })
    assert.equal(await probe(port), 'other', '另一个工作台')
    body = JSON.stringify({ ok: true, data: { app: APP_DIR, db: DB_PATH } })
    assert.equal(await probe(port), 'ours')
  } finally { server.closeAllConnections(); await new Promise((done) => server.close(done)) }
  assert.equal(await probe(port), 'down', '关掉以后没人听')
})

test('在运行就直接用（先认记下的端口）；没在运行就拉起来等它好；端口被别的程序占着、起不来都说清楚', async () => {
  recordService(4633)
  const states = new Map<number, Probe>([[4633, 'ours']])
  const look = async (port: number) => states.get(port) ?? 'down'
  const started: number[] = []
  const opts = { env: {}, probe: look, start: (port: number) => { started.push(port); states.set(port, 'ours') }, built: () => true, waitMs: 2000 }
  assert.deepEqual(await ensureRunning(opts), { url: 'http://127.0.0.1:4633', port: 4633, started: false })
  assert.deepEqual(started, [], '已经在运行，不再起一个')

  states.clear() // 记下的端口上没人了：在想用的端口上拉起来
  assert.deepEqual(await ensureRunning({ ...opts, env: { PORT: '4640' } }), { url: 'http://127.0.0.1:4640', port: 4640, started: true })
  assert.deepEqual(started, [4640])

  states.clear(); states.set(4517, 'other')
  await assert.rejects(ensureRunning(opts), /端口 4517 上开着的不是这个工作台/)
  states.clear()
  await assert.rejects(ensureRunning({ ...opts, built: () => false }), /网页还没构建/)
  await assert.rejects(ensureRunning({ ...opts, start: () => {}, waitMs: 400 }), /没能在 \d+ 秒内启动起来/)
})
