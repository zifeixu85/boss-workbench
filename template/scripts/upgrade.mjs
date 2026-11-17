#!/usr/bin/env node
// 把一个已经搭好的工作台的程序换成新版（2026-11-12）。在新版老板工作台 Skill 的 template/ 里运行，指向要升级的那个工作台：
//
//   node <Skill>/template/scripts/upgrade.mjs --app <知识库>/工作台/程序 --check      只看会做什么，不改任何东西
//   node <Skill>/template/scripts/upgrade.mjs --app <知识库>/工作台/程序              升级
//       [--modules <模块包文件夹或.zip>]   进阶模块的模块包在哪（不写就按 scripts/module.mjs 的找法找）
//       [--without <编号,…>]              这几个模块先不装（页面先没有，数据留着，以后装回来接着用）
//       [--no-install] [--no-build]      不装依赖 / 不重新构建网页（测试用）
//
// 做什么（数据库里的数据一行不删）：
//   ① 看这个工作台在不在用“以前模板自带、现在改成模块包”的功能（modules/catalog.json 的 was，比如小红书内容中心）。
//      在用、又找不到它的模块包：停下，什么都不改，告诉老板去哪拿。
//   ② 备份：数据库存一份到 备份/workbench-升级前-<时间>.db；程序文件夹（不含 node_modules、dist）拷一份到 备份/程序-<时间>/。
//   ③ 模板不再带的文件（scripts/retired-files.json）从程序里拿掉（备份里有）；再把新版模板盖上去。
//      装进来的模块、自己写在程序里的模块（modules/、modules.lock.json 和它们的文件）不动。
//   ④ 重新生成模块清单，把 ① 里要的模块包装上（旧版自带的表由模块的迁移“接手”，数据接着用）。
//   ⑤ 跑数据库迁移、装依赖、构建网页。
// 老板让 Codex 改过核心文件的：新版会盖掉，原样在 ② 的备份里，升级完让 Codex 对着备份把改动合回来。
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './is-main.mjs'
import { catalog, findPack, ModuleError } from './module.mjs'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite'])
/** 新版盖上去时不动的：装了哪些模块的登记、模块的说明、四份清单（升级完按现在装着的模块重新生成） */
const KEEP = new Set(['modules.lock.json', 'shared/modules.gen.ts', 'server/modules.gen.ts', 'src/app/modules.nav.gen.ts', 'src/app/modules.routes.gen.tsx'])

export class UpgradeError extends Error {}
const fail = (msg) => { throw new UpgradeError(msg) }
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback } }
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` }

function walk(dir, rel = '') {
  const out = []
  for (const name of readdirSync(join(dir, rel)).sort()) {
    if (name === '.DS_Store' || (!rel && SKIP_DIRS.has(name))) continue
    const r = rel ? `${rel}/${name}` : name
    const st = statSync(join(dir, r))
    if (st.isDirectory()) out.push(...walk(dir, r))
    else if (st.isFile()) out.push(r)
  }
  return out
}

/** 这个工作台的知识库和数据库在哪（和 server/db.ts 一致：默认 程序/../.. 和 <知识库>/工作台/数据/workbench.db） */
function placesOf(app) {
  const root = resolve(process.env.WORKBENCH_ROOT || join(app, '..', '..'))
  const db = process.env.WORKBENCH_DB || join(root, '工作台', '数据', 'workbench.db')
  return { root, db, backup: join(dirname(db), '备份') }
}

/** 在另一个进程里只读查数据库（这个脚本要在老版本 Node 上也能说清楚错在哪，不在顶上 import node:sqlite） */
function queryDb(db, sql) {
  const code = "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});try{process.stdout.write(JSON.stringify(d.prepare(process.argv[2]).all()))}catch(e){process.stdout.write('null')}"
  const r = spawnSync(process.execPath, ['-e', code, db, sql], { encoding: 'utf8' })
  try { return JSON.parse(r.stdout) } catch { return null }
}

/** 模块目录里“以前自带、现在是模块包”的，这个工作台在不在用：表里有数据，或者模块开关里明写着开它 */
export function movedOutInUse(app, list) {
  const { db } = placesOf(app)
  if (!existsSync(db)) return []
  const stored = queryDb(db, "SELECT value FROM settings WHERE key = 'modules'")?.[0]?.value ?? null
  const listed = stored ? String(stored).split(/[\s,，、]+/) : []
  const out = []
  for (const x of list) {
    if (!x.was) continue
    const rows = (x.was.tables ?? []).reduce((n, t) => n + (queryDb(db, `SELECT COUNT(*) AS n FROM ${t.replace(/[^A-Za-z0-9_]/g, '')}`)?.[0]?.n ?? 0), 0)
    if (rows > 0 || listed.includes(x.was.module)) out.push({ ...x, rows })
  }
  return out
}

/** 新版 Skill 自带的模块包文件夹（和这份模板在同一个 Skill 里） */
const OWN_MODULES = join(SRC, '..', 'modules')

/** 模块目录：新版 Skill 自带的那份在前，再并上这台电脑上别处的（scripts/module.mjs 的 catalog）。测试可以用 o.catalog 换掉 */
function allCatalog(app, o = {}) {
  if (o.catalog) return o.catalog
  const own = readJson(join(OWN_MODULES, 'catalog.json'), null)?.modules ?? []
  return [...own, ...catalog(app).filter((x) => !own.some((y) => y.id === x.id))]
}

export function plan(app, o = {}) {
  const without = new Set(o.without ?? [])
  const pkg = readJson(join(app, 'package.json'), null)
  if (!pkg || pkg.name !== 'boss-workbench' || !existsSync(join(app, 'server', 'cli.ts'))) fail(`${app} 不是老板工作台的程序文件夹（要有 package.json 和 server/cli.ts）。--app 写 <知识库>/工作台/程序`)
  if (resolve(app) === SRC) fail('--app 指的就是这份新模板自己。要升级的是老板知识库里的 工作台/程序')
  const lock = readJson(join(app, 'modules.lock.json'), { modules: {} })
  const owned = new Set(Object.values(lock.modules).flatMap((m) => Object.keys(m.files ?? {})))
  const retired = (readJson(join(SRC, 'scripts', 'retired-files.json'), { files: [] }).files ?? []).filter((f) => existsSync(join(app, f)) && !owned.has(f))
  const need = []
  for (const x of movedOutInUse(app, allCatalog(app, o))) {
    if (lock.modules[x.id]) continue
    let pack = null
    // 找模块包：--modules 指的；没指就按 module.mjs 的找法（老板放的、本机装的），再找新版 Skill 自带的 modules/
    const froms = o.modules ? [o.modules] : [undefined, ...(o.catalog ? [] : [OWN_MODULES])]
    for (const from of froms) {
      if (pack) break
      try { pack = findPack(x.id, from, app) } catch (err) { if (!(err instanceof ModuleError)) throw err }
    }
    need.push({ id: x.id, name: x.name, rows: x.rows, get: x.get ?? '', pack, skip: without.has(x.id) })
  }
  return { app, ...placesOf(app), from: pkg.version, to: readJson(join(SRC, 'package.json'), {}).version, retired, need, installed: Object.entries(lock.modules).map(([id, m]) => `${m.name ?? id} ${m.version ?? ''}`.trim()) }
}

function sh(app, args, what) {
  const r = spawnSync(process.execPath, args, { cwd: app, encoding: 'utf8', env: process.env })
  if (r.status !== 0) fail(`${what}没成功：\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n')}`)
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
}

export function upgrade(app, o = {}) {
  const p = plan(app, o)
  const blocked = p.need.filter((x) => !x.pack && !x.skip)
  if (blocked.length) {
    fail(`这个工作台在用${blocked.map((x) => `“${x.name}”`).join('、')}：新版把它从基础模板里拿出来，做成了模块包，这台电脑上还没找到模块包。现在什么都没改。\n${blocked.map((x) => `- ${x.name}（${x.id}）：${x.get || '模块包应该在老板工作台 Skill 的 modules/ 里，先把 Skill 更新到新版'}`).join('\n')}\n拿到以后把文件夹或压缩包放进 ${join(p.root, '工作台', '模块包')}，再升级一次（或用 --modules 指过去）。\n实在要先升级：加 --without ${blocked.map((x) => x.id).join(',')}，它的页面先没有，数据都留着，以后装上模块包接着用。`)
  }
  if (o.check) return { ...p, done: false }
  const t = stamp()
  mkdirSync(p.backup, { recursive: true })
  // ② 备份数据库（VACUUM INTO：-wal 里还没合进去的改动也在）和程序
  let dbBackup = null
  if (existsSync(p.db)) {
    dbBackup = join(p.backup, `workbench-升级前-${t}.db`)
    const r = spawnSync(process.execPath, ['-e', "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.prepare('VACUUM INTO ?').run(process.argv[2])", p.db, dbBackup], { encoding: 'utf8' })
    if (r.status !== 0 || !existsSync(dbBackup)) fail(`数据库没备份成，先不升级：${`${r.stderr ?? ''}`.trim().split('\n').pop()}`)
  }
  const appBackup = join(p.backup, `程序-${t}`)
  const old = walk(app)
  for (const f of old) { mkdirSync(dirname(join(appBackup, f)), { recursive: true }); cpSync(join(app, f), join(appBackup, f)) }
  // ③ 模板不再带的文件拿掉（备份里有），空了的文件夹跟着拿掉；再盖上新版
  for (const f of p.retired) {
    rmSync(join(app, f))
    for (let d = dirname(join(app, f)); d.startsWith(app) && d !== app; d = dirname(d)) { try { if (readdirSync(d).length) break; rmdirSync(d) } catch { break } }
  }
  const fresh = walk(SRC).filter((f) => !KEEP.has(f) && !f.startsWith('modules/'))
  let changed = 0
  for (const f of fresh) {
    const to = join(app, f)
    if (existsSync(to) && readFileSync(to).equals(readFileSync(join(SRC, f)))) continue
    mkdirSync(dirname(to), { recursive: true })
    cpSync(join(SRC, f), to)
    changed++
  }
  for (const f of KEEP) if (!existsSync(join(app, f)) && existsSync(join(SRC, f))) cpSync(join(SRC, f), join(app, f)) // 很老的程序还没有模块清单
  // ④ 清单按现在装着的模块重新生成；要的模块包装上
  if (!o.noInstall) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: app, encoding: 'utf8', shell: process.platform === 'win32' })
    if (r.status !== 0) fail(`依赖没装成（程序已经换成新版，备份在 ${appBackup}）：\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n')}\n网络好了以后在程序文件夹里运行 node scripts/install.mjs`)
  }
  sh(app, ['scripts/module.mjs', 'gen'], '重新生成模块清单')
  const added = []
  for (const x of p.need.filter((n) => n.pack && !n.skip)) {
    sh(app, ['scripts/module.mjs', 'add', x.id, '--from', x.pack, '--no-build'], `装“${x.name}”`)
    added.push(x.name)
  }
  // ⑤ 数据库迁移（打开一次数据库就会跑）、构建
  if (existsSync(p.db)) sh(app, ['server/cli.ts', 'modules'], '数据库升级')
  if (!o.noBuild) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const r = spawnSync(npm, ['run', 'build'], { cwd: app, encoding: 'utf8', shell: process.platform === 'win32' })
    if (r.status !== 0) fail(`网页没构建成功（程序已经换成新版，数据没动，备份在 ${appBackup}）：\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n')}\n多半是装着的模块或者自己改过的代码和新版对不上：让 Codex 对着报错看`)
  }
  return { ...p, done: true, changed, removed: p.retired.length, added, skipped: p.need.filter((n) => n.skip).map((n) => n.name), dbBackup, appBackup, kept: relative(app, appBackup) }
}

async function main(argv) {
  const flag = (k) => argv.includes(k)
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const app = val('--app')
  if (!app || flag('--help')) {
    console.log('用法：node <老板工作台 Skill>/template/scripts/upgrade.mjs --app <知识库>/工作台/程序 [--check] [--modules 模块包文件夹或.zip] [--without 编号,…] [--no-install] [--no-build]')
    return app ? 0 : 2
  }
  const o = { check: flag('--check'), modules: val('--modules'), without: (val('--without') ?? '').split(/[\s,，、]+/).filter(Boolean), noInstall: flag('--no-install'), noBuild: flag('--no-build') }
  const r = upgrade(resolve(app), o)
  const say = (s) => console.log(s)
  if (!r.done) {
    say(`会把 ${r.app} 的程序从 ${r.from ?? '旧版'} 换成 ${r.to}（这次只是看，什么都没改）：`)
    say(`- 先备份数据库和程序到 ${r.backup}`)
    if (r.retired.length) say(`- 新版不再带的 ${r.retired.length} 个文件从程序里拿掉（备份里有）`)
    for (const x of r.need) say(x.skip ? `- “${x.name}”先不装：页面先没有，${x.rows} 行数据留着` : `- 这个工作台在用“${x.name}”（${x.rows} 行数据）：升级后从 ${x.pack} 装上模块包，数据接着用`)
    if (r.installed.length) say(`- 装着的模块不动：${r.installed.join('、')}`)
    say('确认要升级，去掉 --check 再跑一次。升级前先把工作台关掉（关掉启动窗口）。')
    return 0
  }
  say(`升级好了：${r.from ?? '旧版'} → ${r.to}，换了 ${r.changed} 个文件${r.removed ? `，拿掉新版不再带的 ${r.removed} 个` : ''}。`)
  for (const n of r.added) say(`“${n}”已经按模块包装上，原来的数据接着用。`)
  for (const n of r.skipped) say(`“${n}”这次没装：它的页面先没有，数据都留着；拿到模块包后说“工作台装上${n}”。`)
  say(`备份：${r.dbBackup ? `数据库 ${r.dbBackup}；` : ''}升级前的程序 ${r.appBackup}（让 Codex 改过的地方，对着它合回来）。`)
  say('工作台要关掉再打开一次（关掉启动窗口，再双击“启动工作台”）。')
  return 0
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch((err) => {
    console.error(`没办成：${err.message}`)
    process.exitCode = 1
  })
}
