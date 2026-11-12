// 模块接入点的整体测试（2026-11-12）：把模板拷进临时文件夹当一个工作台（示例库），装上 tests/fixtures/pack-memo（测试用的假模块包），
// 把今日页重点卡、今日概况里的一段、模块自带的设置项、导入目标（导入 + 撤销）、示例数据、“接手旧表”的迁移都走一遍，再做类型检查。
// 核心不写任何一个模块的名字：这些都只靠 module.json 和 server.hooks。要先在 template/ 装好依赖（npm install）。
// 运行（仓库根目录）：node --test tests/module-hooks.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(REPO, 'template')
const PACK = join(REPO, 'tests', 'fixtures', 'pack-memo')
const ready = existsSync(join(TEMPLATE, 'node_modules', 'hono'))

const tmp = mkdtempSync(join(os.tmpdir(), 'wb-hooks-'))
const KB = join(tmp, '知识库 测试')
const APP = join(KB, '工作台', '程序')
const DB = join(KB, '工作台', '数据', 'workbench.db')
const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: DB, NO_COLOR: '1', BOSS_WORKBENCH_SKILL: '', BOSS_WORKBENCH_MODULES: '' }
delete env.DEMO_TODAY
const sh = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: APP, env, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const cli = (...args) => sh(process.execPath, ['server/cli.ts', ...args])
const tool = (...args) => sh(process.execPath, ['scripts/module.mjs', ...args])
const json = (...args) => { const r = cli(...args, '--json'); assert.equal(r.code, 0, r.out); return JSON.parse(r.out) }
const db = (fn) => { const d = new DatabaseSync(DB); try { return fn(d) } finally { d.close() } }

test('基础工作台 + 一个用了全部接入点的模块包：今日卡、今日概况、设置项、导入目标、示例数据、接手旧表', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  mkdirSync(APP, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  const seeded = sh(process.execPath, ['server/seed/index.ts', '--demo', '--reset'])
  assert.equal(seeded.code, 0, seeded.out)

  // 基础版（示例库）：没有进阶模块的任何东西
  const base = json('today')
  assert.deepEqual(base.cards, {})
  assert.deepEqual(base.module_today, [])
  assert.deepEqual(base.home, ['sales', 'clients'])
  assert.deepEqual(json('settings-set', '--set', 'help'), [])
  assert.equal(db((d) => d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'xhs%' OR name LIKE 'content%'").get().n), 0, '基础版的数据库里没有小红书的表')

  // 假装老版本已经建过备忘的表、里面有老板的一条数据
  db((d) => {
    d.exec("CREATE TABLE memo_items (id TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT ''); INSERT INTO memo_items VALUES ('m_old', '老版本里记的一条')")
    d.prepare('INSERT INTO _migrations (name, at) VALUES (?, ?)').run('900_old_memo.sql', '2026-10-01T00:00:00.000Z')
  })

  const add = tool('add', 'memo', '--from', PACK, '--no-build')
  assert.equal(add.code, 0, add.out)
  assert.match(add.out, /装好了：备忘 0\.1\.0/)
  assert.doesNotMatch(add.out, /示例数据.*也写进去了/, '表里已经有数据：装的时候不重灌示例')
  db((d) => {
    assert.deepEqual(d.prepare('SELECT id FROM memo_items').all().map((r) => r.id), ['m_old'], '接手旧表：没再建一遍，老数据还在')
    assert.ok(d.prepare("SELECT 1 AS ok FROM _migrations WHERE name = 'm-memo-001-tables.sql'").get(), '模块的迁移登记成跑过了')
    assert.ok(!d.prepare("SELECT sql FROM sqlite_master WHERE name = 'import_rules'").get().sql.includes('CHECK (target'), '导入规则的 target 不再写死两种')
  })

  // 今日页重点卡的数、今日概况里的一段
  const v = json('today')
  assert.deepEqual(v.home, ['sales', 'clients', 'memo-today'], '模块的卡算业务卡，排在经营、客户后面')
  assert.equal(v.cards['memo-today'].count, 1)
  assert.deepEqual(v.module_today.map((m) => [m.module, m.title, m.lines, m.brief]), [['memo', '备忘（1 条）', ['老版本里记的一条'], '备忘里有 1 条']])
  assert.match(cli('today').out, /## 备忘（1 条）\n- 老版本里记的一条/)
  assert.equal(cli('snapshot').code, 0)
  assert.match(readFileSync(join(KB, '工作台', '快照', '今日概况.md'), 'utf8'), /## 备忘（1 条）\n\n- 老版本里记的一条/)

  // 模块自带的设置项：只收登记过的 key，长度按登记的
  assert.deepEqual(json('settings-set', '--set', 'help').map((d) => [d.key, d.label, d.value]), [['memo_title', '备忘本的名字', '']])
  assert.equal(cli('settings-set', '--set', 'memo_title=茶话本').code, 0)
  assert.equal(json('memo').title, '茶话本')
  assert.match(cli('settings-set', '--set', 'owner=乱写').out, /没有“owner”这个设置项/)
  assert.match(cli('settings-set', '--set', 'memo_title=这个名字实在是太长太长了').out, /备忘本的名字最多 10 个字/)
  assert.equal(cli('settings-set', '--set', 'memo_title=').code, 0)
  assert.equal(json('memo').title, '备忘', '写空 = 清掉')
  assert.equal(cli('settings-set', '--home', 'memo-today,inbox').code, 0)
  assert.deepEqual(json('today').home, ['memo-today', 'inbox'])

  // 示例数据：模块自己的表；只在示例库里、点名要才重灌
  const only = sh(process.execPath, ['server/seed/index.ts', '--only', 'memo'])
  assert.equal(only.code, 0, only.out)
  assert.deepEqual(json('memo').items.map((x) => x.id), ['m_1', 'm_2'])
  assert.match(sh(process.execPath, ['server/seed/index.ts', '--only', 'memo', '--if-empty']).out, /已经有数据/)

  // 导入目标：模块登记的数据源能导、能整批撤销，撤销后回调模块
  assert.match(cli('sources').out, /备忘 · 清单导出/)
  const imported = json('import-target', 'src_memo', '--yes')
  assert.deepEqual(json('memo').items.map((x) => x.id), ['m_1', 'm_2', 'm_imported'])
  const undone = cli('import-undo', imported.batch_id, '--yes')
  assert.equal(undone.code, 0, undone.out)
  assert.deepEqual(json('memo').items.map((x) => x.id), ['m_1', 'm_2'])
  assert.equal(db((d) => d.prepare("SELECT note FROM data_sources WHERE id = 'src_memo'").get().note), '撤销过一次')
  assert.match(cli('import-target', 'src_douyin', '--yes').out, /没有登记导入目标/)

  // 网页和服务端都做类型检查（今日卡、页面、接入点要和这个模板对得上）
  const tsApp = sh(join(APP, 'node_modules', '.bin', 'tsc'), ['-b'])
  assert.equal(tsApp.code, 0, `网页类型检查：${tsApp.out}`)
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
  const tsServer = sh(join(APP, 'node_modules', '.bin', 'tsc'), pkg.scripts['check:server'].replace(/^tsc /, '').split(' '))
  assert.equal(tsServer.code, 0, `服务端类型检查：${tsServer.out}`)
  assert.equal(tool('check').code, 0)

  // 模块收起来：卡、今日概况、设置项都不出现；数据源模块还开着时不能把它依赖的关掉
  assert.equal(cli('modules', '--off', 'memo').code, 0)
  const off = json('today')
  assert.deepEqual(off.cards, {})
  assert.deepEqual(off.module_today, [])
  assert.deepEqual(json('settings-set', '--set', 'help'), [])
  assert.equal(cli('modules', '--on', 'memo').code, 0)
  assert.match(cli('modules', '--off', 'data').out, /还在被经营、备忘用着/)

  // 拿掉：代码和菜单没了，表和数据留着；清单回到没装的样子
  const rm = tool('remove', 'memo', '--no-build')
  assert.equal(rm.code, 0, rm.out)
  assert.ok(!existsSync(join(APP, 'server', 'modules', 'memo')))
  for (const f of ['server/modules.gen.ts', 'shared/modules.gen.ts', 'src/app/modules.routes.gen.tsx']) assert.equal(readFileSync(join(APP, f), 'utf8'), readFileSync(join(TEMPLATE, f), 'utf8'), f)
  assert.equal(db((d) => d.prepare('SELECT COUNT(*) AS n FROM memo_items').get().n), 2, '拿掉以后数据还在')
  const after = json('today')
  assert.deepEqual(after.cards, {})
  assert.deepEqual(after.home, ['inbox'], '存的重点卡里模块那张不认了，剩下老板定的那张')
})

test('基础模板里没有小红书内容中心的代码；模块目录里它是进阶模块', () => {
  for (const f of ['src/features/content', 'server/modules/content', 'shared/xhs-check.ts', 'server/seed/content.ts', 'server/migrations/004_content.sql', 'src/features/today/XhsToday.tsx']) {
    assert.ok(!existsSync(join(TEMPLATE, f)), `${f} 不该在基础模板里`)
  }
  assert.ok(!existsSync(join(REPO, 'modules', 'xhs')), '进阶模块包不放在公开仓库里')
  const cat = JSON.parse(readFileSync(join(REPO, 'modules', 'catalog.json'), 'utf8')).modules
  assert.equal(cat.find((x) => x.id === 'xhs').tier, '进阶')
  assert.equal(cat.find((x) => x.id === 'news').tier, '基础')
  const modules = readFileSync(join(TEMPLATE, 'shared', 'modules.ts'), 'utf8')
  assert.doesNotMatch(modules, /id: 'content'|id: 'xhs'/)
})
