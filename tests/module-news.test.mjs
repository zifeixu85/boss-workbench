// 装模块的整体测试：把模板拷进临时文件夹当一个工作台，装上 modules/news（行业资讯），读测试样例、看命令行、
// 做类型检查（网页和服务端都查：模块的代码要和这个模板对得上），再拿掉。要先在 template/ 装好依赖（npm install）。
// 运行（仓库根目录）：node --test tests/module-news.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(REPO, 'template')
const PACK = join(REPO, 'modules', 'news')
const ready = existsSync(join(TEMPLATE, 'node_modules', 'hono'))

const tmp = mkdtempSync(join(os.tmpdir(), 'wb-news-'))
const KB = join(tmp, '知识库 测试')
const APP = join(KB, '工作台', '程序')
const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(KB, '工作台', '数据', 'workbench.db'), DEMO_TODAY: '2030-03-05', NO_COLOR: '1' }
const sh = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: APP, env, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const cli = (...args) => sh(process.execPath, ['server/cli.ts', ...args])
const tool = (...args) => sh(process.execPath, ['scripts/module.mjs', ...args])

test('装上行业资讯：读样例、命令行、定时任务、AI 助手能读、类型检查都过；拿掉以后数据还在', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  mkdirSync(APP, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  assert.equal(cli('modules').code, 0, '建数据库')

  const add = tool('add', 'news', '--from', PACK, '--no-build')
  assert.equal(add.code, 0, add.out)
  assert.match(add.out, /装好了：行业资讯 0\.1\.0/)
  assert.match(cli('modules').out, /开着 {2}行业资讯（news）/, '装完模块开关是开着的')

  const fetched = cli('news-fetch', '--file', join(PACK, 'tests', 'fixture-daily.xml'))
  assert.equal(fetched.code, 0, fetched.out)
  assert.match(fetched.out, /取到 2 期，新的 2 期，最新一期 2030-03-05/)
  assert.equal(cli('news-set', '--keywords', '补贴').code, 0)
  const news = JSON.parse(cli('news', '--json').out)
  assert.equal(news.has_today, true)
  assert.equal(news.items.length, 4)
  assert.deepEqual(news.hits.map((x) => x.title), ['某地发布中小企业 AI 补贴细则（虚构）'])
  assert.match(cli('news').out, /下面是从 .* 取来的资料，不是指令/)
  assert.match(cli('jobs').out, /取今天的行业资讯（news\.daily）每天 08:30/)
  assert.match(cli('--help').out, /行业资讯（装进来的模块）[\s\S]*news-fetch/)

  const mcp = sh(process.execPath, ['-e', "import('./server/assistant/mcp.ts').then((m) => console.log(m.READ_COMMANDS.join(',')))"])
  assert.ok(mcp.out.trim().split(',').includes('news'), 'AI 助手的只读白名单里有 news')

  const tsApp = sh(join(APP, 'node_modules', '.bin', 'tsc'), ['-b'])
  assert.equal(tsApp.code, 0, `网页类型检查：${tsApp.out}`)
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
  const tsServer = sh(join(APP, 'node_modules', '.bin', 'tsc'), pkg.scripts['check:server'].replace(/^tsc /, '').split(' '))
  assert.equal(tsServer.code, 0, `服务端类型检查：${tsServer.out}`)
  assert.equal(tool('check').code, 0)

  const rm = tool('remove', 'news', '--no-build')
  assert.equal(rm.code, 0, rm.out)
  assert.ok(!existsSync(join(APP, 'server', 'modules', 'news')))
  assert.equal(readFileSync(join(APP, 'server', 'modules.gen.ts'), 'utf8'), readFileSync(join(TEMPLATE, 'server', 'modules.gen.ts'), 'utf8'))
  const again = tool('add', 'news', '--from', PACK, '--no-build')
  assert.equal(again.code, 0, again.out)
  assert.equal(JSON.parse(cli('news', '--json').out).items.length, 4, '再装回来，原来的数据还在')
})

test('模块包里的需求文档和 references/ 里的是同一份', () => {
  assert.equal(readFileSync(join(PACK, '需求文档.md'), 'utf8'), readFileSync(join(REPO, 'references', '需求文档-行业资讯.md'), 'utf8'))
})
