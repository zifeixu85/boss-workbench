// 装模块（scripts/module.mjs）的测试：临时文件夹里一个最小的“程序”（只有模块开关那两份文件）和一个假的模块包。
// 不构建网页、不建数据库（没有数据库时不去开模块开关）。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('module.json 登记写入命令和能打开的对象：进服务端清单，Codex 的 capabilities / open / write 自动带上', () => {
  const server = { api: 'server/modules/memo/routes.ts#memoRoutes', cli: { file: 'server/modules/memo/cli.ts#memoCli', commands: ['memo'] } }
  const dir = makePack('memo', {
    server: { ...server, read: ['memo', { command: 'memo-list', what: '全部备忘' }], write: [{ command: 'memo-add', what: '加一条备忘' }, 'memo-done'] },
    open: [{ key: 'memo-item', label: '某一条备忘', to: '/memo?item={id}', id: '备忘编号' }, { key: 'memo-archive', label: '归档', to: '/memo/archive' }],
  })
  const m = M.readManifest(dir, ['today', 'kb'])
  assert.deepEqual(m.server.read, ['memo', 'memo-list'])
  assert.deepEqual(m.server.write, ['memo-add', 'memo-done'])
  assert.deepEqual(m.server.about, { 'memo-list': '全部备忘', 'memo-add': '加一条备忘' })
  const gen = M.genSources([m])['server/modules.gen.ts']
  assert.match(gen, /read: \["memo","memo-list"\]/)
  assert.match(gen, /write: \["memo-add","memo-done"\]/)
  assert.match(gen, /about: \{"memo-list":"全部备忘","memo-add":"加一条备忘"\}/)
  assert.match(gen, /open: \[\{"key":"memo-item","label":"某一条备忘","to":"\/memo\?item=\{id\}","id":"备忘编号"\},\{"key":"memo-archive","label":"归档","to":"\/memo\/archive"\}\]/)

  const bad = (patch, re) => assert.throws(() => M.readManifest(makePack('memo', patch), ['today', 'kb']), re)
  bad({ server: { ...server, write: ['todo-add'] } }, /todo-add 不是这个模块的命令/)
  bad({ server: { ...server, write: ['memo-add'], read: ['memo-add'] } }, /同时写在 server\.read 和 server\.write 里/)
  bad({ server: { ...server, write: [{ what: '没写命令名' }] } }, /server\.write 每一项写命令名/)
  bad({ server: { api: server.api, write: ['memo-add'] } }, /不是这个模块的命令/)
  bad({ open: [{ key: 'memo-item', label: '某一条', to: 'memo?item={id}', id: '编号' }] }, /open 每一项要写 key/)
  bad({ open: [{ key: 'memo-item', label: '某一条', to: '/memo?item={id}' }] }, /地址里有 \{id\}，要再写一个 id/)
  bad({ open: [{ key: 'memo-item', label: '某一条', to: '/memo?embed=1' }] }, /不用写 embed/)
  bad({ open: [{ key: 'memo-a', label: '甲', to: '/memo/a' }, { key: 'memo-a', label: '乙', to: '/memo/b' }] }, /memo-a 写了两次/)
})

test('只改内容（数据库里 edit_mode=content）：不装、不换、不拿掉模块，说清怎么放开；放开后照常装', async () => {
  const db = process.env.WORKBENCH_DB
  assert.ok(!existsSync(db), '这组测试开始时还没有数据库')
  mkdirSync(dirname(db), { recursive: true })
  const { DatabaseSync } = await import('node:sqlite')
  const d = new DatabaseSync(db)
  d.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); INSERT INTO settings VALUES ('edit_mode', 'content')")
  d.close()
  try {
    const app = makeApp('app-locked')
    assert.equal(M.editLocked(app), true)
    await assert.rejects(M.addModule('memo', { app, from: makePack(), noBuild: true }), /现在是“只改内容”[\s\S]*工作台放开改页面/)
    await assert.rejects(M.removeModule('memo', { app, noBuild: true }), /只改内容/)
    assert.ok(!existsSync(join(app, 'server/modules/memo')), '一个文件都没拷')
    const d2 = new DatabaseSync(db)
    d2.exec("UPDATE settings SET value = 'open' WHERE key = 'edit_mode'")
    d2.close()
    assert.equal(M.editLocked(app), false)
  } finally { rmSync(db, { force: true }) }
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

// ───────────────────────────── 2026-11-12 加的接入点：今日页重点卡、设置项、server.hooks、接手旧版自带的文件、进阶模块包去哪找

test('module.json 登记今日页重点卡、设置项、接入点：进共用清单、页面清单、服务端清单', () => {
  const server = { api: 'server/modules/memo/routes.ts#memoRoutes', hooks: 'server/modules/memo/hooks.ts#memoHooks' }
  const dir = makePack('memo', {
    server, home: [{ id: 'memo-today', name: '今天的备忘', file: 'src/features/memo/HomeCard.tsx' }],
    settings: [{ key: 'memo_title', label: '备忘本的名字', hint: '空着就叫“备忘”' }],
  })
  const m = M.readManifest(dir, ['today', 'kb'])
  assert.equal(m.settings[0].max, 30, 'max 不写按 30')
  const gen = M.genSources([m])
  assert.match(gen['shared/modules.gen.ts'], /INSTALLED_HOME: HomeCardDef\[\] = \[\n  \{ id: "memo-today", name: "今天的备忘", module: "memo" \},\n\]/)
  assert.match(gen['shared/modules.gen.ts'], /INSTALLED_SETTINGS: ModuleSettingDef\[\] = \[\n  \{"module":"memo","key":"memo_title","label":"备忘本的名字","hint":"空着就叫“备忘”","max":30\},\n\]/)
  assert.match(gen['src/app/modules.routes.gen.tsx'], /const Card_memo_today = card\(\(\) => import\("@\/features\/memo\/HomeCard"\)\)/)
  assert.match(gen['src/app/modules.routes.gen.tsx'], /MODULE_HOME_CARDS: Record<string, HomeCardComponent> = \{\n  "memo-today": Card_memo_today,\n\}/)
  assert.match(gen['server/modules.gen.ts'], /home: \[\{"id":"memo-today","name":"今天的备忘"\}\]/)
  assert.match(gen['server/modules.gen.ts'], /hooks: \(\) => import\(".\/modules\/memo\/hooks.ts"\)\.then\(\(x\) => x\.memoHooks\)/)

  const bad = (patch, re) => assert.throws(() => M.readManifest(makePack('memo', patch), ['today', 'kb']), re)
  bad({ home: [{ id: 'memo-today', name: '今天的备忘', file: 'src/features/memo/HomeCard.tsx' }] }, /还要有 server\.hooks/)
  bad({ server, home: [{ id: 'sales', name: '撞名', file: 'src/features/memo/HomeCard.tsx' }] }, /和核心的重点卡重名/)
  bad({ server, home: [{ id: 'memo-today', name: '今天的备忘', file: 'server/x.ts' }] }, /home 每一项要写 id/)
  bad({ settings: [{ key: 'owner', label: '称呼' }] }, /key 要用 memo_ 开头/)
  bad({ settings: [{ key: 'memo_title', label: '名字', max: 999 }] }, /max 写 1—200/)
  bad({ server: { hooks: 'hooks.ts' } }, /server\.hooks 写成/)
  bad({ replaces: { files: ['../outside.ts'] } }, /不在允许的位置/)
})

test('接手旧版自带的文件（replaces）：程序里留着的那批先挪进备份，再放模块包里的；别的文件不碰', async () => {
  const app = makeApp('app-legacy')
  put(join(app, 'src/features/oldmemo/Page.tsx'), '// 旧版模板自带的页面\n')
  put(join(app, 'server/modules/oldmemo/service.ts'), '// 旧版模板自带的服务\n')
  put(join(app, 'server/seed/oldmemo.ts'), '// 旧版模板自带的示例数据\n')
  put(join(app, 'src/features/mine/Mine.tsx'), '// 老板自己加的\n')
  const pack = makePack('memo', { replaces: { module: 'oldmemo', files: ['src/features/oldmemo/', 'server/modules/oldmemo/', 'server/seed/oldmemo.ts', 'server/seed/没有这个.ts'] } })
  const r = await M.addModule('memo', { app, from: pack, noBuild: true })
  assert.equal(r.adopted.files, 3)
  for (const f of ['src/features/oldmemo/Page.tsx', 'server/modules/oldmemo/service.ts', 'server/seed/oldmemo.ts']) {
    assert.ok(!existsSync(join(app, f)), `${f} 从程序里拿掉了`)
    assert.equal(read(join(r.adopted.backup, f)).startsWith('// 旧版模板自带'), true, `${f} 在备份里`)
  }
  assert.ok(!existsSync(join(app, 'src/features/oldmemo')), '空文件夹跟着拿掉')
  assert.ok(existsSync(join(app, 'src/features/mine/Mine.tsx')), '不在 replaces 里的不碰')
  assert.ok(existsSync(join(app, 'src/features/memo/MemoPage.tsx')))
})

test('另外发的模块包（比如以后的 pro 版）去哪找：知识库的 工作台/模块包/（文件夹或 .zip、多套一层也行）；找不到时按模块目录说清去哪拿', async (t) => {
  const app = makeApp('app-pro')
  const drop = M.dropDir(app)
  // 模块目录写在某个模块包文件夹的 catalog.json 里
  const skill = join(tmp, 'skill-pro')
  put(join(skill, 'modules', 'catalog.json'), JSON.stringify({ modules: [{ id: 'memo', name: '备忘', tier: '进阶', edition: 'pro', summary: '随手记', get: '向课程方要“备忘”的模块包。' }] }))
  process.env.BOSS_WORKBENCH_SKILL = skill
  t.after(() => { delete process.env.BOSS_WORKBENCH_SKILL; rmSync(drop, { recursive: true, force: true }) }) // 这几个测试共用一个知识库：用完清掉，不影响后面的
  assert.deepEqual(M.missingPacks(app).map((x) => x.id), ['memo'])
  await assert.rejects(M.addModule('memo', { app, noBuild: true }), (err) => {
    assert.match(err.message, /“备忘”的模块包要另外拿，不在老板工作台 Skill 里/)
    assert.match(err.message, /向课程方要“备忘”的模块包。/)
    assert.ok(err.message.includes(drop), '告诉老板放哪')
    return true
  })
  // 老板把拿到的包放进 工作台/模块包/（压缩包解出来多套了一层文件夹）
  cpSync(makePack('memo'), join(drop, '进阶模块包-2026', 'memo'), { recursive: true })
  assert.equal(M.findPack('memo', undefined, app), join(drop, '进阶模块包-2026', 'memo'))
  assert.deepEqual(M.missingPacks(app), [])
  assert.ok(M.listPacks(app).some((p) => p.id === 'memo'))
  const r = await M.addModule('memo', { app, noBuild: true })
  assert.equal(r.module.name, '备忘')
})

test('模块包是 .zip：--from 指压缩包，或把压缩包放进 工作台/模块包/', { skip: process.platform === 'win32' && '这条在 Mac / Linux 上测（用 zip 命令打包）' }, async () => {
  const { spawnSync } = await import('node:child_process')
  if (spawnSync('zip', ['-v']).status !== 0) return // 没有 zip 命令的机器不测
  const pack = makePack('memo')
  const holder = join(tmp, 'zip-src', 'memo')
  cpSync(pack, holder, { recursive: true })
  const zip = join(tmp, 'memo-pack.zip')
  assert.equal(spawnSync('zip', ['-q', '-r', zip, 'memo'], { cwd: join(tmp, 'zip-src') }).status, 0)
  const app = makeApp('app-zip')
  const r = await M.addModule('memo', { app, from: zip, noBuild: true })
  assert.equal(r.files, 4)
  const app2 = makeApp('app-zip2')
  mkdirSync(M.dropDir(app2), { recursive: true })
  cpSync(zip, join(M.dropDir(app2), 'memo-pack.zip'))
  assert.equal((await M.addModule('memo', { app: app2, noBuild: true })).module.id, 'memo')
})
