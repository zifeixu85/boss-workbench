// 接进 Codex 的整体测试：把模板拷进临时文件夹当一个工作台（路径带中文和空格），从一个和工作台无关的文件夹启动工作台工具
// （server/assistant/mcp.ts，Codex 插件挂的就是它），走真的 MCP 协议：看能力 → 预演 → 确认后写 → 打开项目页。
// 工作台一开始没在运行：workbench_open 会真的把它拉起来（端口现找一个空的），测完关掉。
// 网页不真构建（放一个假的 dist/index.html）。要先在 template/ 装好依赖。运行（仓库根目录）：node --test tests/codex-plugin.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(REPO, 'template')
const ready = existsSync(join(TEMPLATE, 'node_modules', 'hono'))

const tmp = realpathSync(mkdtempSync(join(os.tmpdir(), 'wb-codex-')))
const KB = join(tmp, 'ABC茶社 知识库')
const APP = join(KB, '工作台', '程序')
const ELSEWHERE = join(tmp, '别的项目')

const freePort = () => new Promise((done) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)) }) })

/** 和工作台工具说话：一行一条 JSON-RPC */
function connect(env) {
  const child = spawn(process.execPath, [join(APP, 'server', 'assistant', 'mcp.ts')], { cwd: ELSEWHERE, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map()
  let err = ''
  child.stderr.on('data', (b) => { err += b })
  createInterface({ input: child.stdout }).on('line', (line) => { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id) })
  let seq = 0
  const send = (method, params) => new Promise((done, fail) => {
    const id = ++seq
    const timer = setTimeout(() => fail(new Error(`${method} 60 秒没回：${err}`)), 60000)
    waiting.set(id, (m) => { clearTimeout(timer); done(m) })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  const call = async (name, args = {}) => {
    const m = await send('tools/call', { name, arguments: args })
    const text = m.result.content[0].text
    return { error: !!m.result.isError, text, data: m.result.isError ? null : (() => { try { return JSON.parse(text) } catch { return text } })() }
  }
  return { send, call, close: () => child.stdin.end() }
}

test('在别的文件夹里说一句进展：看能力 → 拆成清单预演 → 确认后写 → 拿到项目页的侧边栏地址（工作台没开会先拉起）', { skip: !ready && '先在 template/ 里 npm install' }, async (t) => {
  mkdirSync(APP, { recursive: true })
  mkdirSync(ELSEWHERE, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite|Codex插件)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  mkdirSync(join(APP, 'dist'))
  writeFileSync(join(APP, 'dist', 'index.html'), '<!doctype html><html><head><title>工作台</title></head><body><div id="root"></div></body></html>')
  const port = await freePort()
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(KB, '工作台', '数据', 'workbench.db'), PORT: String(port), DEMO_TODAY: '2030-03-05', NO_COLOR: '1' }
  delete env.WORKBENCH_NO_START
  const cli = (...args) => { const r = spawnSync(process.execPath, ['server/cli.ts', ...args], { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  assert.equal(cli('settings-set', '--owner', '林总', '--business', 'ABC茶社', '--modules', 'clients').code, 0)
  assert.equal(cli('client-add', '锦川置业', '--label', '企业茶礼 · 对接人孙蕾').code, 0)
  assert.equal(cli('project-add', '春节茶礼', '--stage', '筹备', '--client', '锦川置业').code, 0)

  // 插件目录：.mcp.json 指向的就是下面启动的这一份
  const built = spawnSync(process.execPath, ['scripts/codex-plugin.mjs', 'build'], { cwd: APP, env, encoding: 'utf8' })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  const server = JSON.parse(readFileSync(join(APP, 'Codex插件', 'plugins', 'boss-workbench', '.mcp.json'), 'utf8')).mcpServers['boss-workbench']
  assert.deepEqual(server.args, [join(APP, 'server', 'assistant', 'mcp.ts')])
  assert.deepEqual(server.env, { WORKBENCH_ROOT: KB, WORKBENCH_DB: env.WORKBENCH_DB, PORT: String(port) })

  const mcp = connect(env)
  t.after(() => {
    mcp.close()
    try { process.kill(JSON.parse(readFileSync(join(KB, '工作台', '数据', '服务.json'), 'utf8')).pid) } catch { /* 没起来过 */ }
  })
  const init = await mcp.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
  assert.match(init.result.instructions, /workbench_capabilities[\s\S]*预演/)
  assert.ok(Buffer.byteLength(init.result.instructions) < 1000, '服务说明要短：Codex 只取开头一小段')
  const tools = (await mcp.send('tools/list')).result.tools.map((x) => x.name)
  assert.deepEqual(tools.slice(0, 2), ['workbench_capabilities', 'workbench_open'])

  const caps = (await mcp.call('workbench_capabilities')).data
  assert.equal(caps.workbench, 'ABC茶社')
  assert.ok(caps.pages.some((p) => p.key === 'projects') && caps.pages.some((p) => p.key === 'clients'))
  assert.ok(!caps.pages.some((p) => p.key === 'biz'), '没打开的模块不列')
  assert.ok(caps.off.some((x) => x.includes('biz')))

  // 更新进展：先预演给老板核对，确认后原样再发
  const plan = { steps: [
    { do: 'project', project: '春节茶礼', next_step: '11/20 前和孙蕾确认礼盒数量' },
    { do: 'log', client: '锦川置业', text: '孙蕾说今年茶礼预算和去年差不多，月底前定数量', date: '2030-03-05', channel: '电话' },
    { do: 'todo', title: '给孙蕾寄两款礼盒样品', due: '2030-03-08', project: '春节茶礼', client: '锦川置业' },
  ] }
  assert.match((await mcp.call('workbench_apply', { plan, yes: true, confirmation: '好' })).text, /还没预演过/)
  const preview = (await mcp.call('workbench_apply', { plan })).data
  assert.deepEqual([preview.done, preview.steps.length], [false, 3])
  assert.equal(JSON.parse(cli('todos', '--json').out).length, 0, '预演什么都没写')
  const done = (await mcp.call('workbench_apply', { plan, yes: true, confirmation: '可以，就这么写' })).data
  assert.equal(done.done, true)
  const projects = (await mcp.call('workbench_read', { command: 'projects' })).data
  assert.equal(projects[0].next_step, '11/20 前和孙蕾确认礼盒数量')
  assert.equal(JSON.parse(cli('todos', '--json').out).length, 1)

  // 打开项目页：工作台还没开，会先拉起来
  const opened = await mcp.call('workbench_open', { target: { kind: 'project', id: '春节茶礼' } })
  assert.ok(!opened.error, opened.text)
  assert.equal(opened.data.running, 'started')
  assert.equal(opened.data.url, `http://127.0.0.1:${port}/projects?embed=1&project=${projects[0].id}`)
  assert.deepEqual(opened.data.open, { tool: 'open_in_codex', args: { target: { type: 'browser', url: opened.data.url }, placement: 'right' } })
  const page = await fetch(opened.data.url)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<div id="root">/)
  const inst = await (await fetch(`http://127.0.0.1:${port}/api/instance`)).json()
  assert.equal(realpathSync(inst.data.db), realpathSync(env.WORKBENCH_DB))
  assert.equal(JSON.parse(readFileSync(join(KB, '工作台', '数据', '服务.json'), 'utf8')).port, port)

  const again = (await mcp.call('workbench_open', { page: '待办' })).data
  assert.deepEqual([again.running, again.url], ['yes', `http://127.0.0.1:${port}/todos?embed=1`])
  assert.match(cli('open', 'client', '孙蕾').out, new RegExp(`http://127\\.0\\.0\\.1:${port}/clients\\?embed=1&client=c_`), '命令行也能用：按联系人名找到客户')
})
