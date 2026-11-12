// 升级老工作台（scripts/upgrade.mjs）的测试：临时文件夹里一个“老程序”（只有认得出是工作台的那两份文件，加几份旧文件和老板自己的文件），
// 用这份模板去升级它。不装依赖、不构建、没有数据库（有数据库的整套升级在进阶模块包自己的测试里测）。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

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

test('老工作台在用“以前自带、现在是模块包”的功能，又找不到模块包：停下，什么都不改；--without 才继续', () => withEnv(makeOld('kb2'), (app) => {
  const db = join(app, '..', '数据', 'workbench.db')
  mkdirSync(dirname(db), { recursive: true })
  const d = new DatabaseSync(db)
  d.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE xhs_pieces (id TEXT); CREATE TABLE xhs_notes (id TEXT); INSERT INTO xhs_pieces VALUES ('p_1'), ('p_2'); INSERT INTO settings VALUES ('modules', 'today,content,data')")
  d.close()
  const used = U.movedOutInUse(app, [{ id: 'xhs', name: '小红书内容中心', was: { module: 'content', tables: ['xhs_pieces', 'xhs_notes'] } }, { id: 'news', name: '行业资讯' }])
  assert.deepEqual(used.map((x) => [x.id, x.rows]), [['xhs', 2]])
  // 这台电脑上真有小红书模块包的时候（开发的人、拿到包的人）这条不测“找不到”
  const p = U.plan(app)
  const xhs = p.need.find((x) => x.id === 'xhs')
  assert.ok(xhs, '认出在用小红书内容中心')
  if (xhs.pack) return
  assert.throws(() => U.upgrade(app, { noInstall: true, noBuild: true }), (err) => {
    assert.match(err.message, /这个工作台在用“小红书内容中心”/)
    assert.match(err.message, /现在什么都没改/)
    assert.match(err.message, /--without xhs/)
    return true
  })
  assert.ok(existsSync(join(app, RETIRED[0])), '停下时程序没动')
  assert.equal(readFileSync(join(app, 'server/cli.ts'), 'utf8'), '// 老版本的命令行\n')
  assert.ok(!existsSync(join(dirname(db), '备份')), '连备份都还没做')
  assert.equal(U.upgrade(app, { check: true, without: ['xhs'] }).need[0].skip, true)
}))
