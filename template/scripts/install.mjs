#!/usr/bin/env node
// 工作台安装 / 体检脚本。故意写成普通 JS：老版本 Node 也能跑起来，告诉你该升级什么。
//
//   node 工作台/程序/scripts/install.mjs            安装（检测环境 → 装依赖 → 构建网页 → 建数据库）
//   node 工作台/程序/scripts/install.mjs --demo     安装并写入示例数据（虚构的茶社，演示日期 2026-10-27）
//   node 工作台/程序/scripts/install.mjs --check    只体检，不改任何东西
//   可选：--registry=<地址>  指定 npm 源；--mirror  直接用国内镜像；--skip-build  不重新构建
//   node 工作台/程序/scripts/install.mjs --autostart on|off|status [--name 短名]
//                                                  开机自启：打开 / 关掉（后台服务一起停）/ 看现在是开是关、日志在哪（做法见 autostart.mjs）
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { autostart } from './autostart.mjs'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 知识库根目录和数据库位置：默认 程序/../.. 和 <知识库>/工作台/数据/workbench.db；
// 程序放在知识库外面时，用环境变量 WORKBENCH_ROOT、WORKBENCH_DB 指过去（和 server/db.ts 一致）
const ROOT = resolve(process.env.WORKBENCH_ROOT || join(APP, '..', '..'))
const DB = process.env.WORKBENCH_DB || join(ROOT, '工作台', '数据', 'workbench.db')
const LOG = join(APP, 'install.log')
const argv = process.argv.slice(2)
const valueOf = (k) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null }
const args = new Set(argv.filter((a) => !a.includes('=')))
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.replace(/^--/, '').split('=')))
const CHECK = args.has('--check')
const NEED = { major: 22, minor: 18 } // node:sqlite 免开关（22.13）+ 直接运行 .ts（22.18）
const REGISTRIES = [
  { name: '官方源', url: 'https://registry.npmjs.org' },
  { name: '国内镜像（npmmirror）', url: 'https://registry.npmmirror.com' },
]
const PORT = Number(process.env.PORT || 4517)
const isWin = process.platform === 'win32'
const npm = isWin ? 'npm.cmd' : 'npm'

const C = { ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m', warn: '\x1b[33m!\x1b[0m', dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` }
const problems = []
const log = (s) => { try { appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`) } catch { /* 日志写不了不影响安装 */ } }
const say = (s) => { console.log(s); log(s.replace(/\x1b\[[0-9;]*m/g, '')) }
const ok = (s) => say(`  ${C.ok} ${s}`)
const bad = (s, fix) => { say(`  ${C.no} ${s}`); if (fix) say(`     ${C.dim('怎么办：')}${fix}`); problems.push(s) }
const warn = (s, fix) => { say(`  ${C.warn} ${s}`); if (fix) say(`     ${C.dim('建议：')}${fix}`) }

function run(cmd, argv, extra = {}) {
  log(`$ ${cmd} ${argv.join(' ')}`)
  const r = spawnSync(cmd, argv, { cwd: APP, encoding: 'utf8', shell: isWin, ...extra, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...(extra.env || {}) } })
  log((r.stdout || '') + (r.stderr || ''))
  return r
}

async function ping(url, ms = 6000) {
  const t0 = Date.now()
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), ms)
    const res = await fetch(`${url}/react`, { method: 'HEAD', signal: ctl.signal })
    clearTimeout(timer)
    return res.ok ? Date.now() - t0 : null
  } catch { return null }
}

function portFree(port) {
  return new Promise((done) => {
    const s = createServer().once('error', () => done(false)).once('listening', () => s.close(() => done(true)))
    s.listen(port, '127.0.0.1')
  })
}

async function checkEnv() {
  say(C.b('\n① 检查电脑环境'))
  say(C.dim(`  系统：${os.type()} ${os.release()}（${process.arch}）  工作台位置：${ROOT}`))
  const [maj, min] = process.versions.node.split('.').map(Number)
  if (maj > NEED.major || (maj === NEED.major && min >= NEED.minor)) ok(`Node ${process.versions.node}`)
  else bad(`Node 版本太旧（现在 ${process.versions.node}，需要 ${NEED.major}.${NEED.minor} 以上）`, '到 https://nodejs.org/zh-cn/download 下载 LTS 版；国内下载慢可用 https://npmmirror.com/mirrors/node/ 。装好后重新双击“安装工作台”。')
  const v = run(npm, ['-v'])
  if (v.status === 0) ok(`npm ${v.stdout.trim()}`)
  else bad('找不到 npm', '重新安装 Node（npm 会一起装上）')
  const kbDirs = readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !['工作台', '截图'].includes(e.name)).map((e) => e.name)
  if (existsSync(join(ROOT, 'AGENTS.md'))) ok('AGENTS.md（知识库地图）在')
  else if (existsSync(join(ROOT, '知识库说明.md'))) ok('知识库说明.md 在')
  if (kbDirs.length) ok(`知识库文件夹：${kbDirs.join('、')}`)
  else warn('没找到知识库文件夹', '可以先用“老板知识库”Skill 建库；工作台没有知识库也能用，只是“知识库”页是空的')
  if (await portFree(PORT)) ok(`端口 ${PORT} 空闲`)
  else warn(`端口 ${PORT} 被占用（可能工作台已经在运行）`, `关掉旧窗口，或用 PORT=4527 换一个端口启动`)
}

async function chooseRegistry() {
  if (opt.registry) return { name: '指定源', url: opt.registry }
  say(C.b('\n② 检测下载源'))
  const list = args.has('--mirror') ? [REGISTRIES[1]] : REGISTRIES
  const timed = await Promise.all(list.map(async (r) => ({ ...r, ms: await ping(r.url) })))
  for (const r of timed) r.ms === null ? warn(`${r.name} 连不上`) : ok(`${r.name} ${r.ms} ms`)
  const usable = timed.filter((r) => r.ms !== null).sort((a, b) => a.ms - b.ms)
  if (!usable.length) { bad('两个下载源都连不上', '检查网络或代理；公司网络可让管理员放行 registry.npmmirror.com'); return null }
  // 官方源明显慢（>1.5 秒）时优先镜像
  return usable[0]
}

function installDeps(first) {
  say(C.b('\n③ 安装依赖（第一次需要几分钟）'))
  const order = [first, ...REGISTRIES.filter((r) => r.url !== first.url)]
  const hasLock = existsSync(join(APP, 'package-lock.json'))
  for (const r of order) {
    say(`  使用${r.name}：${C.dim(r.url)}`)
    const res = run(npm, [hasLock ? 'ci' : 'install', '--no-audit', '--no-fund', '--loglevel=error', `--registry=${r.url}`], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, npm_config_fetch_retries: '3' } })
    if (res.status === 0) { ok('依赖装好了'); return true }
    warn(`用${r.name}没装成功，换一个源再试`, `详细原因在 ${LOG}`)
  }
  bad('依赖安装失败', `把 ${LOG} 发给帮你装工作台的人，或在 Codex 里说“帮我看看工作台安装日志”`)
  return false
}

function build() {
  say(C.b('\n④ 构建网页'))
  const dist = join(APP, 'dist', 'index.html')
  if (args.has('--skip-build') && existsSync(dist)) { ok('跳过构建（已有网页）'); return true }
  const res = run(npm, ['run', 'build', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (res.status === 0 && existsSync(dist)) { ok('网页构建完成'); return true }
  bad('网页构建失败', `详细原因在 ${LOG}`)
  return false
}

function initDb() {
  say(C.b('\n⑤ 准备数据库'))
  const db = DB
  if (existsSync(db) && !args.has('--demo')) { ok(`已有数据库，保留原数据：${C.dim(db)}`); return true }
  if (existsSync(db) && args.has('--demo')) {
    // 已有的不是示例库（老板自己的真数据）就不覆盖：--demo 会整库换成示例数据
    const probe = "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});const r=d.prepare(\"SELECT value FROM settings WHERE key='demo_today'\").get();console.log(r&&r.value?'demo':'real')"
    const kind = run(process.execPath, ['-e', probe, db], { stdio: ['ignore', 'pipe', 'pipe'] }).stdout?.trim()
    if (kind !== 'demo') { bad('现有数据库不是示例库，--demo 会把它整个换成示例数据', `确实要看示例：先把 ${db} 挪到别处备份，再运行 --demo`); return false }
  }
  const script = args.has('--demo') ? ['server/seed/index.ts', '--demo', '--reset'] : ['-e', "import('./server/db.ts').then(m=>{m.open();console.log('ok')})"]
  const res = run(process.execPath, script, { stdio: ['ignore', 'pipe', 'pipe'] })
  if (res.status === 0) { ok(args.has('--demo') ? '已写入示例数据（全部虚构）' : '已建好空数据库'); return true }
  bad('数据库初始化失败', `详细原因在 ${LOG}`)
  return false
}

async function checkInstalled() {
  say(C.b('\n② 检查安装结果'))
  existsSync(join(APP, 'node_modules')) ? ok('依赖已安装') : bad('还没装依赖', '双击“安装工作台”')
  const dist = join(APP, 'dist', 'index.html')
  if (existsSync(dist)) {
    const newest = Math.max(...readdirSync(join(APP, 'src'), { recursive: true }).map((f) => { try { return statSync(join(APP, 'src', String(f))).mtimeMs } catch { return 0 } }))
    statSync(dist).mtimeMs >= newest ? ok('网页已构建，是最新的') : warn('源码比网页新：有人改过模块但还没重新构建', '运行 npm run build，或重新双击“安装工作台”')
  } else bad('网页还没构建', '运行 npm run build')
  const db = DB
  if (!existsSync(db)) { bad('还没有数据库', '双击“安装工作台”'); return }
  const res = run(process.execPath, ['server/cli.ts', 'todos', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] })
  res.status === 0 ? ok(`数据库能正常读取（${JSON.parse(res.stdout || '[]').length} 条未完成待办）`) : bad('数据库读不出来', `详细原因在 ${LOG}`)
  say(C.dim('  开机自启（只报告，不算问题）：'))
  await autostart('status', { app: APP, root: ROOT, db: DB, port: PORT, say: (x) => say(C.dim(`    ${x}`)) })
}

async function main() {
  // 开机自启：单独的一件事，不跑安装、不覆盖 install.log
  const auto = opt.autostart ?? valueOf('--autostart') ?? (args.has('--autostart') ? '' : null)
  if (auto !== null) {
    try { process.exitCode = await autostart(auto, { app: APP, root: ROOT, db: DB, port: PORT, name: opt.name ?? valueOf('--name') ?? undefined }) }
    catch (err) { console.error(`没办成：${err.message}`); process.exitCode = 1 }
    return
  }
  writeFileSync(LOG, `# 工作台${CHECK ? '体检' : '安装'}日志 ${new Date().toLocaleString('zh-CN')}\n`)
  say(C.b(CHECK ? '工作台体检' : '安装老板工作台'))
  await checkEnv()
  if (problems.length) return finish()
  if (CHECK) { await checkInstalled(); return finish() }
  const reg = await chooseRegistry()
  if (!reg) return finish()
  if (!installDeps(reg)) return finish()
  if (!build()) return finish()
  initDb()
  finish()
}

function finish() {
  say('')
  if (problems.length) {
    say(`${C.no} ${C.b(`有 ${problems.length} 个问题要先解决`)}：`)
    problems.forEach((p) => say(`   - ${p}`))
    say(C.dim(`完整日志：${LOG}`))
    process.exitCode = 1
  } else if (CHECK) {
    say(`${C.ok} ${C.b('体检通过')}`)
  } else {
    say(`${C.ok} ${C.b('安装完成')}`)
    const launcher = ['启动工作台.command', '启动工作台.bat'].find((f) => existsSync(join(ROOT, f)))
    say(launcher ? `   启动：双击知识库文件夹里的“启动工作台”，或在程序文件夹里运行 ${C.dim('node server/index.ts')}` : `   启动：在程序文件夹（${APP}）里运行 ${C.dim('node server/index.ts')}`)
    say(`   打开：http://127.0.0.1:${PORT}`)
  }
}

main()
