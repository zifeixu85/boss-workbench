// 小红书内容中心模块包的整体测试：装、用、拿掉、再装；老工作台（模板自带小红书的那一版）升级。
// 用这个仓库的 template/（要先在 template/ 里装好依赖：npm install）。运行（仓库根目录）：node --test modules/xhs/tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const PACK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(PACK, '..', '..')
const TEMPLATE = join(REPO, 'template')
const ready = existsSync(join(TEMPLATE, 'node_modules', 'hono')) && existsSync(join(TEMPLATE, 'scripts', 'upgrade.mjs'))
const skip = !ready && `先在 template/ 里 npm install（${TEMPLATE}）`
/** 模板自带小红书内容中心的最后一版（2026-11-12 抽出来之前；在这个仓库的 git 历史里） */
const OLD_COMMIT = '5c54739'

function bench(name) {
  const tmp = mkdtempSync(join(os.tmpdir(), `wb-xhs-${name}-`))
  const KB = join(tmp, '知识库 测试')
  const APP = join(KB, '工作台', '程序')
  const DB = join(KB, '工作台', '数据', 'workbench.db')
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: DB, NO_COLOR: '1', BOSS_WORKBENCH_SKILL: '', BOSS_WORKBENCH_MODULES: '', HOME: tmp } // HOME 换掉：这台电脑上另外装着的老板工作台 Skill 不算
  delete env.DEMO_TODAY
  const sh = (cmd, args, cwd = APP) => { const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  const node = (...args) => sh(process.execPath, args)
  const cli = (...args) => node('server/cli.ts', ...args)
  const json = (...args) => { const r = cli(...args, '--json'); assert.equal(r.code, 0, r.out); return JSON.parse(r.out) }
  const db = (fn) => { const d = new DatabaseSync(DB); try { return fn(d) } finally { d.close() } }
  const count = (t) => db((d) => d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n)
  const typecheck = () => {
    const web = sh(join(APP, 'node_modules', '.bin', 'tsc'), ['-b'])
    assert.equal(web.code, 0, `网页类型检查：${web.out}`)
    const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
    const server = sh(join(APP, 'node_modules', '.bin', 'tsc'), pkg.scripts['check:server'].replace(/^tsc /, '').split(' '))
    assert.equal(server.code, 0, `服务端类型检查：${server.out}`)
  }
  return { tmp, KB, APP, DB, env, sh, node, cli, json, db, count, typecheck }
}
const copyTemplate = (to) => {
  mkdirSync(to, { recursive: true })
  cpSync(TEMPLATE, to, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(to, 'node_modules'), 'junction')
}

test('全新的基础工作台（示例库）：没有小红书 → 装上 → 五个页面和命令都在、笔记数据能导能撤 → 拿掉数据还在 → 再装接着用', { skip }, () => {
  const b = bench('new')
  copyTemplate(b.APP)
  assert.equal(b.node('server/seed/index.ts', '--demo', '--reset').code, 0)
  assert.doesNotMatch(b.cli('modules').out, /小红书/)
  assert.doesNotMatch(b.cli('today').out, /小红书今天发什么/)
  assert.doesNotMatch(b.cli('sources').out, /笔记数据/)
  assert.equal(b.db((d) => d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'xhs%'").get().n), 0)

  // 一句话装上：模块包放在知识库的 工作台/模块包/ 里（老板拿到包以后放的地方），不用 --from
  assert.match(b.node('scripts/module.mjs', 'add', 'xhs', '--no-build').out, /找不到“xhs”这个模块包|是进阶模块/, '没放模块包时说清楚')
  cpSync(PACK, join(b.KB, '工作台', '模块包', 'xhs'), { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src) })
  const add = b.node('scripts/module.mjs', 'add', 'xhs', '--no-build')
  assert.equal(add.code, 0, add.out)
  assert.match(add.out, /装好了：小红书内容中心 \d+\.\d+\.\d+/)
  assert.match(add.out, /示例数据（ABC茶社，虚构）也写进去了/)
  assert.match(b.cli('modules').out, /开着 {2}小红书内容中心（xhs）/)

  // 功能和以前一样：命令行、今日概况、重点卡、账号名、数据源里的笔记数据
  const x = b.json('xhs')
  assert.equal(x.plan.posts[0].title, '开会前 5 分钟，一杯不苦的岩茶怎么泡')
  assert.equal(x.plan.account.stats_through, '2026-10-25')
  const v = b.json('today')
  assert.deepEqual(v.home, ['sales', 'clients', 'xhs'])
  assert.equal(v.cards.xhs.topics_total, 10)
  assert.match(b.cli('today').out, /## 小红书今天发什么\n- 12:10 开会前 5 分钟/)
  assert.deepEqual(b.json('settings-set', '--set', 'help').map((d) => [d.key, d.value]), [['xhs_name', 'ABC茶社']])
  assert.match(b.cli('sources').out, /小红书 · 笔记数据导出：失败/)
  assert.equal(b.count('xhs_pieces'), 66)
  const mcp = b.node('-e', "import('./server/assistant/mcp.ts').then((m) => console.log(JSON.stringify([m.READ_COMMANDS.includes('xhs'), m.WRITE_COMMANDS.includes('xhs-topics-add')])))")
  assert.deepEqual(JSON.parse(mcp.out.trim().split('\n').pop()), [true, true], 'Codex 能读 xhs、能写 xhs-topics-add')

  // 选题写回灵感池（每天早上的定时任务用的命令）
  const topics = join(b.tmp, 'topics.json')
  writeFileSync(topics, JSON.stringify([{ title: '测试：给锦川孙蕾的春节茶礼，怎么写成一篇笔记' }]))
  assert.match(b.cli('xhs-topics-add', '--file', topics).out, /已写进灵感池 1 个选题/)
  assert.equal(b.count('xhs_pieces'), 67)

  // 笔记数据：先确认对照（网页上点的那几下），再导入，再撤销
  assert.match(b.cli('xhs-notes-import', '--yes').out, /还有 4 列对照没确认/)
  const decide = b.node('-e', `const { loadHooks } = await import('./server/module-hooks.ts'); await loadHooks()
    const data = await import('./server/modules/data/service.ts')
    for (const m of data.mappings('src_xhs_notes')) if (['AI 建议', '未匹配'].includes(m.status)) data.decideMapping(m.id, { action: m.target ? 'accept' : 'ignore' }, '网页')
    console.log('ok')`)
  assert.match(decide.out, /ok/, decide.out)
  const imported = b.json('xhs-notes-import', '--yes')
  assert.equal(imported.notes, 41)
  assert.equal(b.json('xhs').plan.account.stats_through, '2026-10-26')
  assert.equal(b.cli('import-undo', imported.batch_id, '--yes').code, 0)
  assert.equal(b.json('xhs').plan.account.stats_through, '2026-10-25')
  assert.equal(b.cli('import-reset', '--yes').code, 0)
  assert.match(b.cli('sources').out, /小红书 · 笔记数据导出：失败/, '彩排复原后笔记数据源回到演示起点')

  b.typecheck()
  assert.equal(b.node('scripts/module.mjs', 'check').code, 0)

  // 拿掉：菜单和代码没了，数据留着；清单回到基础版的样子
  const rm = b.node('scripts/module.mjs', 'remove', 'xhs', '--no-build')
  assert.equal(rm.code, 0, rm.out)
  assert.ok(!existsSync(join(b.APP, 'server', 'modules', 'xhs')) && !existsSync(join(b.APP, 'src', 'features', 'xhs')))
  for (const f of ['server/modules.gen.ts', 'shared/modules.gen.ts', 'src/app/modules.nav.gen.ts', 'src/app/modules.routes.gen.tsx']) assert.equal(readFileSync(join(b.APP, f), 'utf8'), readFileSync(join(TEMPLATE, f), 'utf8'), f)
  assert.equal(b.count('xhs_pieces'), 67, '拿掉以后数据还在')
  assert.doesNotMatch(b.cli('today').out, /小红书今天发什么/)
  assert.match(b.cli('xhs').out, /没有「xhs」这个命令/)
  b.typecheck()

  // 再装回来：原来的数据接着用，不重灌示例
  const again = b.node('scripts/module.mjs', 'add', 'xhs', '--no-build')
  assert.equal(again.code, 0, again.out)
  assert.doesNotMatch(again.out, /也写进去了/)
  assert.equal(b.count('xhs_pieces'), 67)
  assert.ok(b.db((d) => d.prepare("SELECT 1 AS ok FROM xhs_pieces WHERE title LIKE '测试：给锦川孙蕾%'").get()))
})

test('老工作台（模板自带小红书的那一版，小红书开着、有自己的数据）升级：数据和页面都在，登记成装进来的 xhs 模块', { skip }, (t) => {
  const b = bench('old')
  const got = spawnSync('git', ['-C', REPO, 'archive', OLD_COMMIT, 'template'], { encoding: 'buffer', maxBuffer: 1 << 28 })
  if (got.status !== 0) return t.skip(`老板工作台仓库里没有 ${OLD_COMMIT} 这个提交，造不出老工作台`)
  mkdirSync(join(b.tmp, 'x'), { recursive: true })
  assert.equal(spawnSync('tar', ['-x', '-C', join(b.tmp, 'x')], { input: got.stdout }).status, 0)
  mkdirSync(dirname(b.APP), { recursive: true })
  cpSync(join(b.tmp, 'x', 'template'), b.APP, { recursive: true })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(b.APP, 'node_modules'), 'junction')

  // 老工作台：示例数据 + 只开了客户和小红书 + 自己的账号名 + 自己记的一个选题 + 让 Codex 改过的一个核心文件
  assert.equal(b.node('server/seed/index.ts', '--demo', '--reset').code, 0)
  assert.equal(b.cli('settings-set', '--modules', 'clients,content', '--xhs', 'ABC茶社的小红书', '--home', 'xhs,clients').code, 0)
  const topics = join(b.tmp, 'topics.json')
  writeFileSync(topics, JSON.stringify([{ title: '老工作台里自己记的一个选题' }]))
  assert.equal(b.cli('xhs-topics-add', '--file', topics).code, 0)
  writeFileSync(join(b.APP, 'src', 'main.tsx'), `${readFileSync(join(b.APP, 'src', 'main.tsx'), 'utf8')}\n// 老板让 Codex 加的一行\n`)
  const before = { pieces: b.count('xhs_pieces'), notes: b.count('xhs_notes'), versions: b.count('xhs_versions'), stats: b.count('xhs_note_stats'), rules: b.count('import_rules'), todos: b.count('todos'), clients: b.count('clients') }
  assert.equal(before.pieces, 67)

  const up = (...args) => spawnSync(process.execPath, [join(TEMPLATE, 'scripts', 'upgrade.mjs'), '--app', b.APP, ...args], { env: b.env, encoding: 'utf8' })
  // 先看会做什么：模块包就在新版 Skill 的 modules/ 里，不用另外指；--check 什么都不改
  const seen = up('--check', '--no-install', '--no-build')
  assert.equal(seen.status, 0, `${seen.stdout}${seen.stderr}`)
  assert.ok(seen.stdout.includes(`升级后从 ${PACK} 装上模块包`), seen.stdout)
  assert.ok(existsSync(join(b.APP, 'server', 'modules', 'content', 'service.ts')), '--check 时老程序原样')

  const done = up('--no-install', '--no-build')
  assert.equal(done.status, 0, `${done.stdout}${done.stderr}`)
  assert.match(done.stdout, /“小红书内容中心”已经按模块包装上，原来的数据接着用/)

  // 数据一行没少；旧迁移由模块的迁移接手，没有重建表
  assert.deepEqual({ pieces: b.count('xhs_pieces'), notes: b.count('xhs_notes'), versions: b.count('xhs_versions'), stats: b.count('xhs_note_stats'), rules: b.count('import_rules'), todos: b.count('todos'), clients: b.count('clients') }, before)
  const migs = b.db((d) => d.prepare('SELECT name FROM _migrations').all().map((r) => r.name))
  for (const m of ['004_content.sql', 'm-xhs-001-content.sql', 'm-xhs-002-content-center.sql', 'm-xhs-003-来源与评论.sql', '022_导入目标.sql']) assert.ok(migs.includes(m), m)
  // 模块开关、账号名、重点卡都接上了
  assert.match(b.cli('modules').out, /开着 {2}小红书内容中心（xhs）/)
  const s = b.json('settings-set', '--set', 'help')
  assert.deepEqual(s.map((d) => [d.key, d.value]), [['xhs_name', 'ABC茶社的小红书']])
  assert.deepEqual(b.json('today').home, ['xhs', 'clients'])
  assert.ok(b.json('xhs').schedule.length > 0)
  assert.ok(b.db((d) => d.prepare("SELECT 1 AS ok FROM xhs_pieces WHERE title = '老工作台里自己记的一个选题'").get()))
  // 程序：旧的那批文件没了，新的在模块自己的位置；改过的核心文件在备份里
  assert.ok(!existsSync(join(b.APP, 'server', 'modules', 'content')) && !existsSync(join(b.APP, 'src', 'features', 'content')))
  assert.ok(existsSync(join(b.APP, 'server', 'modules', 'xhs', 'hooks.ts')) && existsSync(join(b.APP, 'src', 'features', 'xhs', 'TodayPage.tsx')))
  const backups = readdirSync(join(dirname(b.DB), '备份'))
  assert.ok(backups.some((f) => f.startsWith('workbench-升级前-')) && backups.some((f) => f.startsWith('程序-')))
  const kept = join(dirname(b.DB), '备份', backups.find((f) => f.startsWith('程序-')))
  assert.match(readFileSync(join(kept, 'src', 'main.tsx'), 'utf8'), /老板让 Codex 加的一行/)
  assert.ok(existsSync(join(kept, 'server', 'modules', 'content', 'service.ts')), '旧版自带的代码在备份里')
  b.typecheck()
  assert.equal(b.node('scripts/module.mjs', 'check').code, 0)
})

test('模块包里没有真实资料的痕迹：示例只用虚构的 ABC茶社', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '.git' ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]))
  const hits = []
  for (const f of walk(PACK)) {
    if (!/\.(ts|tsx|json|md|sql|css|mjs)$/.test(f) || f.endsWith('install.test.mjs')) continue
    const text = readFileSync(f, 'utf8')
    if (/sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{12,}|1[3-9]\d{9}(?!\d)|@(qq|163|gmail)\.com/.test(text)) hits.push(f.slice(PACK.length + 1))
  }
  assert.deepEqual(hits, [])
})
