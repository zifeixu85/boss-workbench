// 装模块（scripts/module.mjs）的测试：临时文件夹里一个最小的“程序”（只有模块开关那两份文件）和一个假的模块包。
// 不构建网页、不建数据库（没有数据库时不去开模块开关）。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(os.tmpdir(), 'wb-module-'))
process.env.WORKBENCH_ROOT = join(tmp, 'kb')
process.env.WORKBENCH_DB = join(tmp, 'kb', '工作台', '数据', 'workbench.db')
const M = await import('./module.mjs')

const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text) }
const read = (file) => readFileSync(file, 'utf8')

/** 一个最小的程序：模块开关和四份清单 */
function makeApp(name) {
  const app = join(tmp, name)
  for (const f of ['shared/modules.ts', 'shared/modules.gen.ts', 'server/modules.gen.ts', 'src/app/modules.nav.gen.ts', 'src/app/modules.routes.gen.tsx']) cpSync(join(TEMPLATE, f), join(app, f))
  return app
}

/** 一个假的模块包 */
function makePack(id = 'memo', extra = {}) {
  const dir = join(tmp, `pack-${id}-${Math.random().toString(36).slice(2, 7)}`)
  const m = {
    id, name: '备忘', version: '0.1.0', needs: [],
    nav: [{ key: id, to: `/${id}`, label: '备忘', icon: 'StickyNote', section: '今日' }],
    pages: [{ path: id, file: `src/features/${id}/MemoPage.tsx` }],
    server: { api: `server/modules/${id}/routes.ts#memoRoutes`, cli: { file: `server/modules/${id}/cli.ts#memoCli`, commands: [id] }, read: [id] },
    ...extra,
  }
  put(join(dir, 'module.json'), JSON.stringify(m, null, 2))
  put(join(dir, '需求文档.md'), '# 备忘\n')
  put(join(dir, 'tests', 'x.test.ts'), '// 不拷进程序\n')
  put(join(dir, 'files', `src/features/${id}/MemoPage.tsx`), 'export default function MemoPage() { return null }\n')
  put(join(dir, 'files', `server/modules/${id}/routes.ts`), 'export const memoRoutes = null\n')
  put(join(dir, 'files', `server/modules/${id}/cli.ts`), 'export const memoCli = null\n')
  put(join(dir, 'files', `server/migrations/m-${id}-001-tables.sql`), 'CREATE TABLE memo (id TEXT);\n')
  return dir
}

test('模板里带的四份清单就是“没装模块”时生成的样子', () => {
  for (const [file, text] of Object.entries(M.genSources([]))) assert.equal(read(join(TEMPLATE, file)), text, file)
})

test('module.json 写错了说清楚哪里错', () => {
  const bad = (patch, re) => { const d = makePack('memo', patch); assert.throws(() => M.readManifest(d, ['today', 'kb']), re) }
  bad({ id: 'Memo' }, /id 要写小写英文/)
  bad({ id: 'kb' }, /和核心模块重名/)
  bad({ nav: [{ key: 'memo', to: '/memo', label: '备忘', icon: 'StickyNote', section: '别处' }] }, /section 只能是/)
  bad({ nav: [{ key: 'memo', to: '/memo', label: '备忘', icon: 'sticky-note', section: '今日' }] }, /lucide 图标/)
  bad({ server: { api: 'routes.ts' } }, /server\.api 写成/)
})

test('装：文件按原位置拷进程序、登记指纹、生成清单；说明拷到 modules/<编号>/，测试不拷', async () => {
  const app = makeApp('app1')
  const r = await M.addModule('memo', { app, from: makePack(), noBuild: true })
  assert.equal(r.files, 4)
  assert.ok(existsSync(join(app, 'server/modules/memo/routes.ts')))
  assert.ok(existsSync(join(app, 'server/migrations/m-memo-001-tables.sql')))
  assert.ok(existsSync(join(app, 'modules/memo/需求文档.md')))
  assert.ok(!existsSync(join(app, 'modules/memo/tests')))
  const lock = JSON.parse(read(join(app, 'modules.lock.json')))
  assert.equal(Object.keys(lock.modules.memo.files).length, 4)
  assert.match(read(join(app, 'src/app/modules.nav.gen.ts')), /import \{ StickyNote \} from 'lucide-react'[\s\S]*key: "memo".*module: "memo"/)
  assert.match(read(join(app, 'src/app/modules.routes.gen.tsx')), /const Page_memo_0 = page\(\(\) => import\("@\/features\/memo\/MemoPage"\)\)[\s\S]*gate\("memo", <Page_memo_0 \/>\)/)
  assert.match(read(join(app, 'server/modules.gen.ts')), /api: \(\) => import\("\.\/modules\/memo\/routes\.ts"\)\.then\(\(x\) => x\.memoRoutes\)/)
  assert.match(read(join(app, 'shared/modules.gen.ts')), /\{ id: "memo", name: "备忘", needs: \[\] \}/)
  assert.deepEqual(M.checkModules(app).problems, [])
  await assert.rejects(M.addModule('memo', { app, from: makePack(), noBuild: true }), /已经装了/)
})

test('程序里已经有、内容又不一样的文件：不装，列出来', async () => {
  const app = makeApp('app2')
  put(join(app, 'server/modules/memo/routes.ts'), '// 老板自己写的\n')
  await assert.rejects(M.addModule('memo', { app, from: makePack(), noBuild: true }), /这些文件程序里已经有了[\s\S]*server\/modules\/memo\/routes\.ts/)
  assert.ok(!existsSync(join(app, 'modules.lock.json')))
})

test('文件放错位置、迁移文件名不对的模块包不装', async () => {
  const app = makeApp('app3')
  const p1 = makePack()
  put(join(p1, 'files', 'package.json'), '{}')
  await assert.rejects(M.addModule('memo', { app, from: p1, noBuild: true }), /不在允许的位置/)
  const p2 = makePack()
  put(join(p2, 'files', 'server/migrations/021_memo.sql'), '')
  await assert.rejects(M.addModule('memo', { app, from: p2, noBuild: true }), /m-memo-001-说明\.sql/)
})

test('升级：没改过的直接换；改过的默认不盖，--force 先挪进备份', async () => {
  const app = makeApp('app4')
  await M.addModule('memo', { app, from: makePack(), noBuild: true })
  const v2 = makePack('memo', { version: '0.2.0' })
  put(join(v2, 'files', 'server/modules/memo/routes.ts'), 'export const memoRoutes = 2\n')
  await M.updateModule('memo', { app, from: v2, noBuild: true })
  assert.equal(read(join(app, 'server/modules/memo/routes.ts')), 'export const memoRoutes = 2\n')
  put(join(app, 'server/modules/memo/cli.ts'), 'export const memoCli = "老板改过"\n')
  const v3 = makePack('memo', { version: '0.3.0' })
  await assert.rejects(M.updateModule('memo', { app, from: v3, noBuild: true }), /被改过[\s\S]*server\/modules\/memo\/cli\.ts/)
  const r = await M.updateModule('memo', { app, from: v3, noBuild: true, force: true })
  assert.ok(r.backup && read(join(r.backup, 'server/modules/memo/cli.ts')).includes('老板改过'))
  assert.equal(M.moduleStatus(app)[0].version, '0.3.0')
})

test('拿掉：没改过的删掉，改过的挪进备份，清单回到没装的样子', async () => {
  const app = makeApp('app5')
  await M.addModule('memo', { app, from: makePack(), noBuild: true })
  put(join(app, 'src/features/memo/MemoPage.tsx'), '// 改过\n')
  const r = await M.removeModule('memo', { app, noBuild: true })
  assert.deepEqual(r.kept, ['src/features/memo/MemoPage.tsx'])
  assert.ok(existsSync(join(r.backup, 'src/features/memo/MemoPage.tsx')))
  assert.ok(existsSync(join(r.backup, 'modules/memo/需求文档.md')))
  assert.ok(!existsSync(join(app, 'server/modules/memo')))
  for (const [file, text] of Object.entries(M.genSources([]))) assert.equal(read(join(app, file)), text, file)
})

test('有别的模块要用它时不能拿掉；要的模块没装时不能装', async () => {
  const app = makeApp('app6')
  await assert.rejects(M.addModule('memo2', { app, from: makePack('memo2', { needs: ['memo'] }), noBuild: true }), /要先有：memo/)
  await M.addModule('memo', { app, from: makePack(), noBuild: true })
  await M.addModule('memo2', { app, from: makePack('memo2', { needs: ['memo'] }), noBuild: true })
  await assert.rejects(M.removeModule('memo', { app, noBuild: true }), /还要用“备忘”/)
})

test('体检：清单被手改了、装的文件丢了都报出来', async () => {
  const app = makeApp('app7')
  await M.addModule('memo', { app, from: makePack(), noBuild: true })
  put(join(app, 'src/app/modules.nav.gen.ts'), '// 手改了\n')
  assert.match(M.checkModules(app).problems.join('\n'), /对不上：运行 node scripts\/module\.mjs gen/)
  M.writeGen(app)
  assert.deepEqual(M.checkModules(app).problems, [])
  const { rmSync } = await import('node:fs')
  rmSync(join(app, 'server/modules/memo/cli.ts'))
  assert.match(M.checkModules(app).problems.join('\n'), /少了 1 个文件/)
})
