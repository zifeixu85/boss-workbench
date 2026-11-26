// 升级老工作台（scripts/upgrade.mjs）的测试：临时文件夹里一个“老程序”（只有认得出是工作台的那两份文件，加几份旧文件和老板自己的文件），
// 用这份模板去升级它。不装依赖、不构建、没有数据库（有数据库的整套升级在进阶模块包自己的测试里测）。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(os.tmpdir(), 'wb-upgrade-'))
const U = await import('./upgrade.mjs')
const RETIRED = JSON.parse(readFileSync(join(TEMPLATE, 'scripts', 'retired-files.json'), 'utf8')).files

const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text) }
/** 一个老程序：放在自己的知识库里（工作台/程序），数据库位置按默认算 */
function makeOld(name) {
  const app = join(tmp, name, '工作台', '程序')
  put(join(app, 'package.json'), JSON.stringify({ name: 'boss-workbench', version: '0.3.0' }))
  put(join(app, 'server/cli.ts'), '// 老版本的命令行\n')
  put(join(app, RETIRED[0]), '// 旧版模板自带的\n')
  put(join(app, 'src/features/mine/Mine.tsx'), '// 老板让 Codex 加的页面\n')
  put(join(app, 'modules.lock.json'), JSON.stringify({ modules: {} }))
  return app
}
const withEnv = (app, fn) => {
  const keep = { r: process.env.WORKBENCH_ROOT, d: process.env.WORKBENCH_DB }
  delete process.env.WORKBENCH_ROOT; delete process.env.WORKBENCH_DB
  try { return fn(app) } finally { if (keep.r) process.env.WORKBENCH_ROOT = keep.r; if (keep.d) process.env.WORKBENCH_DB = keep.d }
}

test('模板不再带的文件清单：列在里面的，模板里确实没有了', () => {
  assert.ok(RETIRED.length > 0)
  assert.deepEqual(RETIRED.filter((f) => existsSync(join(TEMPLATE, f))), [])
})

test('不是工作台的文件夹、指到模板自己：不动，说清楚', () => {
  assert.throws(() => U.plan(join(tmp, 'nowhere')), /不是老板工作台的程序文件夹/)
  assert.throws(() => U.plan(TEMPLATE), /就是这份新模板自己/)
})

test('升级：先备份；不再带的旧文件拿掉、新版盖上去；老板自己的文件和模块登记不动', () => withEnv(makeOld('kb1'), (app) => {
  const seen = U.upgrade(app, { check: true })
  assert.equal(seen.done, false)
  assert.deepEqual(seen.retired, [RETIRED[0]])
  assert.ok(existsSync(join(app, RETIRED[0])), '--check 什么都不改')

  const r = U.upgrade(app, { noInstall: true, noBuild: true })
  assert.equal(r.done, true)
  assert.equal(r.removed, 1)
  assert.ok(!existsSync(join(app, RETIRED[0])), '旧文件从程序里拿掉了')
  assert.equal(readFileSync(join(r.appBackup, RETIRED[0]), 'utf8'), '// 旧版模板自带的\n', '备份里有')
  assert.equal(readFileSync(join(r.appBackup, 'server/cli.ts'), 'utf8'), '// 老版本的命令行\n', '被盖掉的核心文件在备份里')
  assert.equal(readFileSync(join(app, 'server/cli.ts'), 'utf8'), readFileSync(join(TEMPLATE, 'server/cli.ts'), 'utf8'), '核心换成新版')
  assert.equal(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version, JSON.parse(readFileSync(join(TEMPLATE, 'package.json'), 'utf8')).version)
  assert.ok(existsSync(join(app, 'src/features/mine/Mine.tsx')), '老板自己的文件不动')
  assert.equal(readFileSync(join(app, 'modules.lock.json'), 'utf8'), JSON.stringify({ modules: {} }), '模块登记不动')
  assert.ok(!existsSync(join(app, 'node_modules')) && !existsSync(join(app, 'dist')), '不拷依赖和构建结果')
  assert.ok(readdirSync(r.backup).some((f) => f.startsWith('程序-')))
}))

test('老工作台在用“以前自带、现在是模块包”的功能：Skill 里有模块包就用；找不到就停下，什么都不改，--without 才继续', () => withEnv(makeOld('kb2'), (app) => {
  const db = join(app, '..', '数据', 'workbench.db')
  mkdirSync(dirname(db), { recursive: true })
  const d = new DatabaseSync(db)
  d.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE xhs_pieces (id TEXT); CREATE TABLE xhs_notes (id TEXT); INSERT INTO xhs_pieces VALUES ('p_1'), ('p_2'); INSERT INTO settings VALUES ('modules', 'today,content,data')")
  d.close()
  const used = U.movedOutInUse(app, [{ id: 'xhs', name: '小红书内容中心', was: { module: 'content', tables: ['xhs_pieces', 'xhs_notes'] } }, { id: 'news', name: '行业资讯' }])
  assert.deepEqual(used.map((x) => [x.id, x.rows]), [['xhs', 2]])
  // 小红书的模块包就在这个 Skill 的 modules/ 里：升级时直接找得到。
  // 装好的工作台（程序文件夹是模板的一份拷贝，旁边没有 Skill 的 modules/）里跑这份测试时这一句不适用，跳过
  if (existsSync(join(TEMPLATE, '..', 'modules', 'xhs'))) assert.equal(U.plan(app).need.find((x) => x.id === 'xhs')?.pack, join(TEMPLATE, '..', 'modules', 'xhs'))
  // 换一个这台电脑上没有模块包的（比如以后另外发的 pro 版模块）：停下，什么都不改
  const catalog = [{ id: 'xhs-pro-test', name: '测试用的进阶模块', tier: '进阶', get: '向课程方要模块包。', was: { module: 'content', tables: ['xhs_pieces'] } }]
  assert.throws(() => U.upgrade(app, { noInstall: true, noBuild: true, catalog }), (err) => {
    assert.match(err.message, /这个工作台在用“测试用的进阶模块”/)
    assert.match(err.message, /现在什么都没改/)
    assert.match(err.message, /向课程方要模块包。/)
    assert.match(err.message, /--without xhs-pro-test/)
    return true
  })
  assert.ok(existsSync(join(app, RETIRED[0])), '停下时程序没动')
  assert.equal(readFileSync(join(app, 'server/cli.ts'), 'utf8'), '// 老版本的命令行\n')
  assert.ok(!existsSync(join(dirname(db), '备份')), '连备份都还没做')
  assert.equal(U.upgrade(app, { check: true, without: ['xhs-pro-test'], catalog }).need[0].skip, true)
}))

// 2026-11-26：“把工作台升级到新版”一句话要把装着的模块一起换（坤汀、Mac mini 上的都靠这一句）。
// 新版 Skill 的 modules/ 里有同一个模块、内容和装着的不一样，就列进 updates；老板改过的文件列出来（升级时先挪进备份）
test('升级时装着的模块一起换：Skill 里的模块包和装着的不一样就换，一样就不动；老板改过的文件列出来', () => withEnv(makeOld('kb3'), (app) => {
  const packs = join(tmp, 'kb3-packs')
  const sha = (s) => createHash('sha256').update(s).digest('hex')
  put(join(packs, 'demo', 'module.json'), JSON.stringify({ id: 'demo', name: '示范模块', version: '0.2.0' }))
  put(join(packs, 'demo', 'files', 'server/modules/demo/a.ts'), '// 新版 a\n')
  put(join(packs, 'demo', 'files', 'server/modules/demo/b.ts'), '// b\n')
  put(join(packs, 'same', 'module.json'), JSON.stringify({ id: 'same', name: '没变的模块', version: '1.0.0' }))
  put(join(packs, 'same', 'files', 'server/modules/same/x.ts'), '// x\n')
  put(join(app, 'server/modules/demo/a.ts'), '// 旧版 a\n')
  put(join(app, 'server/modules/demo/b.ts'), '// b 被老板改过\n')
  put(join(app, 'server/modules/same/x.ts'), '// x\n')
  put(join(app, 'modules.lock.json'), JSON.stringify({ modules: {
    demo: { name: '示范模块', version: '0.1.0', files: { 'server/modules/demo/a.ts': sha('// 旧版 a\n'), 'server/modules/demo/b.ts': sha('// b\n') } },
    same: { name: '没变的模块', version: '1.0.0', files: { 'server/modules/same/x.ts': sha('// x\n') } },
  } }))
  const p = U.plan(app, { packs })
  assert.deepEqual(p.updates.map((x) => [x.id, x.from, x.to]), [['demo', '0.1.0', '0.2.0']])
  assert.deepEqual(p.updates[0].modified, ['server/modules/demo/b.ts'])
  assert.equal(p.updates[0].pack, join(packs, 'demo'))
}))

test('升完让工作台用上新版：本来没开着的不开；在后台开着的（服务.json 记着进程号）停掉、按原来的端口在后台重开', { skip: process.platform === 'win32' }, async () => {
  const app = makeOld('kb4')
  const db = join(tmp, 'kb4', '工作台', '数据', 'workbench.db')
  const p = { root: join(tmp, 'kb4'), db }
  assert.match(U.restartService(app, p).how, /本来没开着/)
  // 一个“开着的工作台”：等着被停掉；新版的 server/index.ts 起来以后写一个记号
  // 不能是本测试的子进程（停掉后等不到回收会一直像“还活着”）：经一个中间进程起，真的工作台也不是升级脚本的子进程
  const pid = Number(spawnSync(process.execPath, ['-e', "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }); c.unref(); console.log(c.pid)"], { encoding: 'utf8' }).stdout.trim())
  const alive = () => { try { process.kill(pid, 0); return true } catch { return false } }
  put(join(dirname(db), '服务.json'), JSON.stringify({ port: 4999, pid }))
  put(join(app, 'server', 'index.ts'), "require('node:fs').writeFileSync('started.txt', process.env.PORT)\n".replace("require('node:fs')", "(await import('node:fs'))"))
  const r = U.restartService(app, p)
  assert.match(r.how, /用新版重新开好（端口 4999）/)
  assert.equal(alive(), false, '原来那个停掉了')
  for (let i = 0; i < 50 && !existsSync(join(app, 'started.txt')); i++) await new Promise((d) => setTimeout(d, 100))
  assert.equal(readFileSync(join(app, 'started.txt'), 'utf8'), '4999')
})
