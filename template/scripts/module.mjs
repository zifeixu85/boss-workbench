#!/usr/bin/env node
// 往工作台里装模块（2026-10-18）：模块包放在 Skill 的 modules/<编号>/（module.json + files/ + 需求文档），
// 这个脚本把 files/ 里的代码按原来的相对位置拷进程序，登记在 modules.lock.json（每个文件的指纹），
// 再生成四份清单（shared/modules.gen.ts、server/modules.gen.ts、src/app/modules.nav.gen.ts、src/app/modules.routes.gen.tsx），
// 核心只读这四份，不写模块的名字。装完打开模块开关、重新构建网页；工作台开着也不用重开，刷新页面就有。
//
//   node scripts/module.mjs list                       有哪些模块包可以装、装了哪些
//   node scripts/module.mjs add <编号> [--from <包>]    装（--no-build 不重新构建网页）
//   node scripts/module.mjs update <编号> [--from <包>] [--force]   换成包里的新版；老板改过的文件默认不覆盖
//   node scripts/module.mjs remove <编号>               拿掉代码和菜单，数据留着；改过的文件挪进备份
//   node scripts/module.mjs status                     装了哪些、哪些文件改过
//   node scripts/module.mjs gen                        按 modules/*/module.json 重新生成清单（自己写的模块改了 module.json 后用）
//   node scripts/module.mjs check                      体检用：清单和文件对不对得上
//
// 规矩：只往 src/、server/、shared/、public/ 里放文件；已经有、又不是这个模块装的文件一律不碰（列出来停下）；
// 数据库的表由模块自己的迁移建（文件名 m-<编号>-*.sql），拿掉模块时表和数据都留着。
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMain } from './is-main.mjs'

export const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT_OF = (app) => resolve(process.env.WORKBENCH_ROOT || join(app, '..', '..'))
const DB_OF = (app) => process.env.WORKBENCH_DB || join(ROOT_OF(app), '工作台', '数据', 'workbench.db')
const LOCK = 'modules.lock.json'
const MOD_DIR = 'modules'
const ID = /^[a-z][a-z0-9-]{1,30}$/
const ICON = /^[A-Z][A-Za-z0-9]+$/
const SECTIONS = ['今日', '客户', '经营', '内容', '数据', '资料', '系统']
const ROOTS = ['src/', 'server/', 'shared/', 'public/']
const GEN = {
  shared: 'shared/modules.gen.ts',
  server: 'server/modules.gen.ts',
  nav: 'src/app/modules.nav.gen.ts',
  routes: 'src/app/modules.routes.gen.tsx',
}

export class ModuleError extends Error {}
const fail = (msg) => { throw new ModuleError(msg) }

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback } }
const writeJson = (file, v) => writeFileSync(file, `${JSON.stringify(v, null, 2)}\n`)

/** 一个文件夹下的全部文件（相对路径，/ 分隔）；跳过 .DS_Store */
function walk(dir, rel = '') {
  const out = []
  for (const name of readdirSync(join(dir, rel)).sort()) {
    if (name === '.DS_Store') continue
    const r = rel ? `${rel}/${name}` : name
    const st = statSync(join(dir, r))
    if (st.isDirectory()) out.push(...walk(dir, r))
    else if (st.isFile()) out.push(r)
  }
  return out
}

// ───────────────────────────── 模块包

/** 去哪找模块包：--from 指的文件夹；BOSS_WORKBENCH_SKILL；装在 Codex / Claude Code 里的老板工作台 Skill；模板旁边（开发时） */
export function packDirs(app = APP) {
  const skills = [process.env.BOSS_WORKBENCH_SKILL, join(homedir(), '.agents', 'skills', 'boss-workbench'), join(homedir(), '.claude', 'skills', 'boss-workbench'),
    join(homedir(), '.codex', 'skills', 'boss-workbench'), resolve(app, '..')].filter(Boolean)
  return [...new Set(skills.map((s) => join(s, MOD_DIR)))].filter((d) => existsSync(d))
}

export function findPack(id, from, app = APP) {
  if (from) {
    const d = resolve(from)
    if (existsSync(join(d, 'module.json'))) return d
    if (existsSync(join(d, id, 'module.json'))) return join(d, id)
    fail(`${from} 里没有 module.json，不是模块包`)
  }
  for (const base of packDirs(app)) if (existsSync(join(base, id, 'module.json'))) return join(base, id)
  fail(`找不到“${id}”这个模块包。看了：${packDirs(app).join('、') || '（一个模块包文件夹都没找到）'}。用 --from 指定模块包的文件夹`)
}

/** 读 module.json 并检查。coreIds：核心模块的编号（不能和它们重名） */
export function readManifest(dir, coreIds = []) {
  const file = join(dir, 'module.json')
  let m
  try { m = JSON.parse(readFileSync(file, 'utf8')) } catch (err) { fail(`${file} 读不出来：${err.message}`) }
  const where = `模块包 ${m?.id ?? dir} 的 module.json`
  if (!ID.test(m.id ?? '')) fail(`${where}：id 要写小写英文、数字和短横线（2—31 个字），比如 news`)
  if (coreIds.includes(m.id)) fail(`${where}：${m.id} 和核心模块重名`)
  if (!m.name) fail(`${where}：要写 name（中文名，菜单和模块开关里显示）`)
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? '')) fail(`${where}：version 写成 0.1.0 这样`)
  m.needs = m.needs ?? []
  if (!Array.isArray(m.needs)) fail(`${where}：needs 是一个编号列表`)
  m.nav = m.nav ?? []
  for (const n of m.nav) {
    if (!n.key || !n.to?.startsWith('/') || !n.label) fail(`${where}：nav 每一项要写 key、to（/ 开头）、label`)
    if (!SECTIONS.includes(n.section)) fail(`${where}：nav 的 section 只能是 ${SECTIONS.join('、')}`)
    for (const ic of [n.icon, ...(n.children ?? []).map((c) => c.icon).filter(Boolean)]) if (!ICON.test(ic ?? '')) fail(`${where}：icon 写 lucide 图标的名字，比如 Newspaper`)
  }
  m.pages = m.pages ?? []
  for (const p of m.pages) if (!p.path || p.path.startsWith('/') || !/^src\/.+\.tsx$/.test(p.file ?? '')) fail(`${where}：pages 每一项写 path（不带开头的 /）和 file（src/ 下的 .tsx）`)
  const s = m.server ?? {}
  for (const k of ['api', 'jobs']) if (s[k] && !/^server\/.+\.ts#\w+$/.test(s[k])) fail(`${where}：server.${k} 写成 server/…/文件.ts#导出名`)
  if (s.cli && (!/^server\/.+\.ts#\w+$/.test(s.cli.file ?? '') || !Array.isArray(s.cli.commands) || !s.cli.commands.length)) fail(`${where}：server.cli 写 { file: "server/…/cli.ts#导出名", commands: ["命令名"] }`)
  m.server = s
  return m
}

/** 模块包要拷进程序的文件：files/ 下的全部，路径要在允许的位置 */
function packFiles(dir, m) {
  const base = join(dir, 'files')
  if (!existsSync(base)) return []
  const files = walk(base)
  for (const f of files) {
    const norm = posix.normalize(f)
    if (norm !== f || norm.startsWith('..') || !ROOTS.some((r) => norm.startsWith(r))) fail(`模块包 ${m.id} 的 ${f} 不在允许的位置（只能放在 ${ROOTS.join('、')} 下）`)
    if (Object.values(GEN).includes(f)) fail(`模块包 ${m.id} 不能带清单文件 ${f}`)
    if (f.startsWith('server/migrations/') && !f.startsWith(`server/migrations/m-${m.id}-`)) fail(`模块包 ${m.id} 的数据库迁移要叫 m-${m.id}-001-说明.sql 这样（${f}）`)
  }
  return files
}

// ───────────────────────────── 程序里装了什么

const lockOf = (app) => readJson(join(app, LOCK), { modules: {} })
const saveLock = (app, lock) => writeJson(join(app, LOCK), lock)

/** 核心模块的编号（shared/modules.ts 里除掉装进来的） */
async function coreIds(app) {
  const mod = await import(`${pathToFileURL(join(app, 'shared', 'modules.ts')).href}?t=${Date.now()}`)
  const installed = new Set(Object.keys(lockOf(app).modules))
  return mod.MODULES.map((m) => m.id).filter((id) => !installed.has(id))
}

/** 程序里的模块（modules/*\/module.json）：装进来的按安装顺序，自己写的排后面 */
export function programModules(app = APP) {
  const lock = lockOf(app)
  const dir = join(app, MOD_DIR)
  const ids = existsSync(dir) ? readdirSync(dir).filter((d) => !d.startsWith('_') && !d.startsWith('.') && existsSync(join(dir, d, 'module.json'))) : []
  const order = [...Object.keys(lock.modules).filter((id) => ids.includes(id)), ...ids.filter((id) => !lock.modules[id]).sort()]
  return order.map((id) => readManifest(join(dir, id)))
}

// ───────────────────────────── 生成清单

const q = (s) => JSON.stringify(s)
const importPath = (file, fromDir) => { const r = posix.relative(fromDir, file); return r.startsWith('.') ? r : `./${r}` }
const splitRef = (ref) => { const [file, name] = ref.split('#'); return { file, name } }

export function genSources(mods) {
  const head = (what) => `// ${what}（scripts/module.mjs 生成，不要手改；改了模块的 module.json 运行 node scripts/module.mjs gen）\n`
  const shared = `${head('装进来的模块：模块开关用的编号、名字、依赖。网页、服务端、命令行共用')}import type { ModuleDef } from './modules.ts'\n\nexport const INSTALLED_MODULES: ModuleDef[] = [${mods.map((m) => `\n  { id: ${q(m.id)}, name: ${q(m.name)}, needs: ${q(m.needs)} },`).join('')}${mods.length ? '\n' : ''}]\n`

  const icons = [...new Set(mods.flatMap((m) => m.nav.flatMap((n) => [n.icon, ...(n.children ?? []).map((c) => c.icon).filter(Boolean)])))].sort()
  const navItem = (m, n) => {
    const parts = [`key: ${q(n.key)}`, `to: ${q(n.to)}`, `label: ${q(n.label)}`, ...(n.short ? [`short: ${q(n.short)}`] : []), `icon: ${n.icon}`, `section: ${q(n.section)}`,
      ...(n.sub ? [`sub: ${q(n.sub)}`] : []), `module: ${q(m.id)}`,
      ...(n.children?.length ? [`children: [${n.children.map((c) => `{ to: ${q(c.to)}, label: ${q(c.label)}${c.icon ? `, icon: ${c.icon}` : ''}${c.end ? ', end: true' : ''} }`).join(', ')}]`] : [])]
    return `\n  { ${parts.join(', ')} },`
  }
  const nav = `${head('装进来的模块的菜单项')}${icons.length ? `import { ${icons.join(', ')} } from 'lucide-react'\n` : ''}import type { NavItem } from './nav.ts'\n\nexport const MODULE_NAV: NavItem[] = [${mods.flatMap((m) => m.nav.map((n) => navItem(m, n))).join('')}${mods.some((m) => m.nav.length) ? '\n' : ''}]\n`

  const pages = mods.flatMap((m) => m.pages.map((p, i) => ({ m, p, v: `Page_${m.id.replace(/-/g, '_')}_${i}` })))
  const routes = `${head('装进来的模块的页面')}import type { RouteObject } from 'react-router'\n${pages.length ? "import { page, gate } from './pages'\n" : ''}\n${pages.map(({ p, v }) => `const ${v} = page(() => import(${q(`@/${p.file.replace(/^src\//, '').replace(/\.tsx$/, '')}`)}))\n`).join('')}${pages.length ? '\n' : ''}export const MODULE_ROUTES: RouteObject[] = [${pages.map(({ m, p, v }) => `\n  { path: ${q(p.path)}, element: gate(${q(m.id)}, <${v} />) },`).join('')}${pages.length ? '\n' : ''}]\n`

  const lazy = (ref) => { const { file, name } = splitRef(ref); return `() => import(${q(importPath(file, 'server'))}).then((x) => x.${name})` }
  const serverItem = (m) => {
    const s = m.server
    const parts = [`id: ${q(m.id)}`, `name: ${q(m.name)}`, `needs: ${q(m.needs)}`, `version: ${q(m.version)}`,
      ...(s.api ? [`api: ${lazy(s.api)}`] : []), ...(s.jobs ? [`jobs: ${lazy(s.jobs)}`] : []),
      ...(s.cli ? [`commands: ${q(s.cli.commands)}`, `cli: ${lazy(s.cli.file)}`] : []), ...(s.read?.length ? [`read: ${q(s.read)}`] : [])]
    return `\n  {\n    ${parts.join(',\n    ')},\n  },`
  }
  const server = `${head('装进来的模块')}import type { ServerModule } from './module-types.ts'\n\nexport const SERVER_MODULES: ServerModule[] = [${mods.map(serverItem).join('')}${mods.length ? '\n' : ''}]\n`
  return { [GEN.shared]: shared, [GEN.server]: server, [GEN.nav]: nav, [GEN.routes]: routes }
}

/** 按程序里的 modules/ 重新写四份清单；返回改了哪几份 */
export function writeGen(app = APP) {
  const changed = []
  for (const [file, text] of Object.entries(genSources(programModules(app)))) {
    const p = join(app, file)
    if (existsSync(p) && readFileSync(p, 'utf8') === text) continue
    writeFileSync(p, text)
    changed.push(file)
  }
  return changed
}

// ───────────────────────────── 装、升级、拿掉

const backupDir = (app, id) => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return join(dirname(DB_OF(app)), '备份', `模块-${id}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`)
}
const moveTo = (from, to) => { mkdirSync(dirname(to), { recursive: true }); renameSync(from, to) }
/** 把一个文件拷到程序里，返回指纹 */
const put = (src, dst) => { mkdirSync(dirname(dst), { recursive: true }); cpSync(src, dst); return sha(dst) }
/** 拿掉文件后，空了的文件夹也拿掉（不超出程序文件夹） */
function pruneDirs(app, file) {
  let d = dirname(join(app, file))
  while (d.startsWith(app) && d !== app) {
    try { if (readdirSync(d).length) break; rmdirSync(d) } catch { break }
    d = dirname(d)
  }
}
/** 模块包里除了 files/ 和 tests/ 的说明（需求文档、截图、README）拷到 程序/modules/<编号>/，Codex 按它们改 */
function copyDocs(pack, app, id) {
  const to = join(app, MOD_DIR, id)
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(pack)) {
    if (['files', 'tests', 'node_modules', '.DS_Store'].includes(name)) continue
    cpSync(join(pack, name), join(to, name), { recursive: true })
  }
}

function cliRun(app, args) {
  if (!existsSync(DB_OF(app))) return { skipped: true }
  const r = spawnSync(process.execPath, ['server/cli.ts', ...args], { cwd: app, encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

function build(app) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const r = spawnSync(npm, ['run', 'build'], { cwd: app, encoding: 'utf8', shell: process.platform === 'win32' })
  if (r.status !== 0) fail(`网页没构建成功，模块的代码可能和这个工作台对不上：\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n')}`)
}

export async function addModule(id, o = {}) {
  const app = o.app ?? APP
  const lock = lockOf(app)
  if (lock.modules[id]) fail(`“${lock.modules[id].name ?? id}”已经装了。要换成新版用 update ${id}`)
  if (existsSync(join(app, MOD_DIR, id))) fail(`程序里已经有 modules/${id} 了（自己写的模块？）。换一个编号，或者先挪走它`)
  const pack = findPack(id, o.from, app)
  const m = readManifest(pack, await coreIds(app))
  if (m.id !== id) fail(`模块包里写的编号是 ${m.id}，不是 ${id}`)
  const have = new Set([...(await coreIds(app)), ...Object.keys(lock.modules)])
  const missing = m.needs.filter((n) => !have.has(n))
  if (missing.length) fail(`“${m.name}”要先有：${missing.join('、')}。先装它们`)
  const files = packFiles(pack, m)
  const clash = files.filter((f) => existsSync(join(app, f)) && sha(join(app, f)) !== sha(join(pack, 'files', f)))
  if (clash.length) fail(`这些文件程序里已经有了、和模块包里的不一样，为了不弄坏，这次不装：\n${clash.map((f) => `  - ${f}`).join('\n')}\n多半是以前手工装过或者改过：先把它们挪走，或者找 Codex 看看`)
  const fp = {}
  for (const f of files) fp[f] = put(join(pack, 'files', f), join(app, f))
  copyDocs(pack, app, id)
  lock.modules[id] = { name: m.name, version: m.version, from: pack, installed_at: new Date().toISOString(), files: fp }
  saveLock(app, lock)
  writeGen(app)
  const on = cliRun(app, ['modules', '--on', id]) // 打开模块开关；顺带跑模块的数据库迁移
  if (!o.noBuild) build(app)
  return { module: m, files: files.length, switched: on }
}

export async function updateModule(id, o = {}) {
  const app = o.app ?? APP
  const lock = lockOf(app)
  const old = lock.modules[id]
  if (!old) fail(`还没装“${id}”。要装用 add ${id}`)
  const pack = findPack(id, o.from ?? (existsSync(old.from ?? '') ? old.from : undefined), app)
  const m = readManifest(pack, await coreIds(app))
  const files = packFiles(pack, m)
  const changed = Object.keys(old.files).filter((f) => existsSync(join(app, f)) && sha(join(app, f)) !== old.files[f])
  const touched = changed.filter((f) => files.includes(f) ? sha(join(pack, 'files', f)) !== sha(join(app, f)) : true)
  if (touched.length && !o.force) fail(`这些文件装好以后被改过（多半是 Codex 按老板的要求改的），直接换新版会盖掉：\n${touched.map((f) => `  - ${f}`).join('\n')}\n要用新版加 --force（改过的先挪进备份），或者让 Codex 把新版的改动合进去`)
  const clash = files.filter((f) => !old.files[f] && existsSync(join(app, f)) && sha(join(app, f)) !== sha(join(pack, 'files', f)))
  if (clash.length) fail(`新版要放的这些文件程序里已经有了、又不是这个模块装的：\n${clash.map((f) => `  - ${f}`).join('\n')}`)
  const bk = backupDir(app, id)
  for (const f of touched) if (existsSync(join(app, f))) moveTo(join(app, f), join(bk, f))
  for (const f of Object.keys(old.files)) if (!files.includes(f) && existsSync(join(app, f))) { rmSync(join(app, f)); pruneDirs(app, f) }
  const fp = {}
  for (const f of files) fp[f] = put(join(pack, 'files', f), join(app, f))
  copyDocs(pack, app, id)
  lock.modules[id] = { ...old, name: m.name, version: m.version, from: pack, updated_at: new Date().toISOString(), files: fp }
  saveLock(app, lock)
  writeGen(app)
  cliRun(app, ['modules']) // 跑新版的数据库迁移
  if (!o.noBuild) build(app)
  return { module: m, from: old.version, backup: touched.length ? bk : null }
}

export async function removeModule(id, o = {}) {
  const app = o.app ?? APP
  const lock = lockOf(app)
  const cur = lock.modules[id]
  if (!cur) fail(`没装“${id}”这个模块（自己写在程序里的模块不归这个命令管）`)
  const users = programModules(app).filter((m) => m.id !== id && m.needs.includes(id)).map((m) => m.name)
  if (users.length) fail(`${users.join('、')}还要用“${cur.name}”，先拿掉它们`)
  cliRun(app, ['modules', '--off', id])
  const bk = backupDir(app, id)
  const kept = []
  for (const [f, h] of Object.entries(cur.files)) {
    const p = join(app, f)
    if (!existsSync(p)) continue
    if (sha(p) === h) rmSync(p)
    else { moveTo(p, join(bk, f)); kept.push(f) }
    pruneDirs(app, f)
  }
  if (existsSync(join(app, MOD_DIR, id))) moveTo(join(app, MOD_DIR, id), join(bk, MOD_DIR, id)) // 需求文档老板可能改过，留一份
  delete lock.modules[id]
  saveLock(app, lock)
  writeGen(app)
  if (!o.noBuild) build(app)
  return { name: cur.name, kept, backup: bk }
}

/** 装了哪些；每个模块有几个文件装好后被改过、丢了几个 */
export function moduleStatus(app = APP) {
  const lock = lockOf(app)
  return Object.entries(lock.modules).map(([id, x]) => {
    const files = Object.entries(x.files)
    return { id, name: x.name, version: x.version, files: files.length,
      changed: files.filter(([f, h]) => existsSync(join(app, f)) && sha(join(app, f)) !== h).map(([f]) => f),
      missing: files.filter(([f]) => !existsSync(join(app, f))).map(([f]) => f) }
  })
}

/** 体检：返回 { problems, notes }。problems 要修；notes 只是告诉一声（比如老板让 Codex 改过模块的文件） */
export function checkModules(app = APP) {
  const problems = []
  const notes = []
  let mods = []
  try { mods = programModules(app) } catch (err) { problems.push(`模块的 module.json 有问题：${err.message}`) }
  for (const s of moduleStatus(app)) {
    if (!existsSync(join(app, MOD_DIR, s.id, 'module.json'))) problems.push(`装了“${s.name}”，但 modules/${s.id}/module.json 不见了：重新装一次（remove 再 add）`)
    if (s.missing.length) problems.push(`“${s.name}”少了 ${s.missing.length} 个文件（${s.missing.slice(0, 3).join('、')}…）：运行 node scripts/module.mjs update ${s.id} --force`)
    if (s.changed.length) notes.push(`“${s.name}”有 ${s.changed.length} 个文件装好后改过（以后升级会先问）`)
  }
  if (!problems.length) {
    for (const [file, text] of Object.entries(genSources(mods))) {
      const p = join(app, file)
      if (!existsSync(p) || readFileSync(p, 'utf8') !== text) { problems.push(`模块清单 ${file} 和 modules/ 对不上：运行 node scripts/module.mjs gen，再 npm run build`); break }
    }
  }
  return { problems, notes, installed: mods.map((m) => `${m.name} ${m.version}`) }
}

/** 有哪些模块包可以装 */
export function listPacks(app = APP) {
  const out = []
  for (const base of packDirs(app)) {
    for (const id of readdirSync(base)) {
      if (id.startsWith('_') || out.some((x) => x.id === id) || !existsSync(join(base, id, 'module.json'))) continue
      try { const m = readManifest(join(base, id)); out.push({ id, name: m.name, version: m.version, summary: m.summary ?? '', from: join(base, id) }) } catch { /* 坏的包不列 */ }
    }
  }
  return out
}

// ───────────────────────────── 命令行

async function serverUp(port = Number(process.env.PORT || 4517)) {
  try { const r = await fetch(`http://127.0.0.1:${port}/api/settings`, { signal: AbortSignal.timeout(1500) }); return r.ok } catch { return false }
}

async function main(argv) {
  const [cmd, id] = argv.filter((a) => !a.startsWith('--'))
  const flag = (k) => argv.includes(k)
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const o = { from: val('--from'), noBuild: flag('--no-build'), force: flag('--force') }
  const say = (s) => console.log(s)
  switch (cmd) {
    case 'list': {
      const installed = lockOf(APP).modules
      const packs = listPacks()
      say(packs.length ? `可以装的模块包：\n${packs.map((p) => `- ${p.name}（${p.id} ${p.version}）${installed[p.id] ? `：已装 ${installed[p.id].version}` : ''}${p.summary ? `\n    ${p.summary}` : ''}`).join('\n')}` : '没找到模块包（老板工作台 Skill 的 modules/ 文件夹）')
      return 0
    }
    case 'status': {
      const xs = moduleStatus()
      say(xs.length ? xs.map((s) => `- ${s.name}（${s.id} ${s.version}）：${s.files} 个文件${s.changed.length ? `，${s.changed.length} 个装好后改过` : ''}${s.missing.length ? `，少了 ${s.missing.length} 个` : ''}`).join('\n') : '还没装模块')
      return 0
    }
    case 'add': {
      if (!id) fail('add 后面写模块编号，比如 add news。有哪些：node scripts/module.mjs list')
      const up = await serverUp()
      const r = await addModule(id, o)
      say(`装好了：${r.module.name} ${r.module.version}（${r.files} 个文件）。`)
      if (r.switched.skipped) say('数据库还没建：装好工作台以后模块会一起出现')
      else if (!r.switched.ok) say(`打开模块开关没成功：${r.switched.out}`)
      if (o.noBuild) say('还没重新构建网页：运行 npm run build')
      say(up ? '工作台开着：不用重开，网页刷新一下就能看到。' : '下次打开工作台就能看到。')
      return 0
    }
    case 'update': {
      if (!id) fail('update 后面写模块编号')
      const r = await updateModule(id, o)
      say(`已换成新版：${r.module.name} ${r.from} → ${r.module.version}${r.backup ? `（改过的文件挪进了 ${r.backup}）` : ''}。`)
      if (await serverUp()) say('工作台开着：要关掉再打开一次才换成新代码（关掉启动窗口，再双击“启动工作台”）。')
      return 0
    }
    case 'remove': {
      if (!id) fail('remove 后面写模块编号')
      const r = await removeModule(id, o)
      say(`已拿掉“${r.name}”：菜单和代码都拿掉了，数据还在数据库里，以后再装回来就能接着用。${r.kept.length ? `\n装好后改过的 ${r.kept.length} 个文件挪进了 ${r.backup}` : ''}`)
      return 0
    }
    case 'gen': {
      const changed = writeGen()
      say(changed.length ? `已更新：${changed.join('、')}。再 npm run build` : '清单已经是最新的')
      return 0
    }
    case 'check': {
      const r = checkModules()
      for (const p of r.problems) say(`✗ ${p}`)
      for (const n of r.notes) say(`· ${n}`)
      if (!r.problems.length) say(r.installed.length ? `✓ 装进来的模块：${r.installed.join('、')}` : '✓ 没有装进来的模块')
      return r.problems.length ? 1 : 0
    }
    default:
      say('用法：node scripts/module.mjs list | add <编号> [--from 包] [--no-build] | update <编号> [--force] | remove <编号> | status | gen | check')
      return cmd ? 2 : 0
  }
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch((err) => {
    console.error(`没办成：${err.message}`)
    process.exitCode = 1
  })
}
