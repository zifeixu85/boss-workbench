import { isMain } from './is-main.mjs'
// 找本机 Codex（2026-10-15）：把工作台接进 Codex（scripts/codex-plugin.mjs）和页面里的 AI 助手都要靠它。体检、搭建、工作台服务都用这一份。
// 先找命令行 codex，再找 Codex 桌面版自带的那一个；找到了再看有没有登录。只读，不改任何东西。
// 普通 JS：老版本 Node 也能跑（install.mjs 要用）。
import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const isWin = process.platform === 'win32'

/** 找不到时怎么说：不断言“没装”（2026-11-26 Mac mini 上明明装着桌面版，旧写法照样说没找到） */
export const NOT_FOUND = '工作台没认出这台电脑上的 Codex 在哪（找过 Codex 桌面版和 codex 命令）。装着的话，在 Codex 里说一句“把工作台接进 Codex”，工作台会记下它的位置；还没装就先装好 Codex 桌面版'

/** 系统级的位置（不在家目录里的）；测试里可以去掉 */
const SYSTEM_PREFIX = /^\/(Applications|opt|usr)\//

/**
 * 可能的位置：环境变量指定的 → PATH 里的 codex → Codex 桌面版自带的（/Applications、~/Applications；
 * 自带的 bin/codex 只是转到 CodexCLI.app 的小脚本，CodexCLI.app 里那个也直接认）→ 命令行装的常见位置（Homebrew、npm、~/.local）。
 * Windows 的路径还没在真机上核对过。
 */
export function codexCandidates(env = process.env) {
  const names = isWin ? ['codex.exe', 'codex.cmd', 'codex'] : ['codex']
  const fromPath = (env.PATH || '').split(delimiter).filter(Boolean).flatMap((d) => names.map((n) => join(d, n)))
  const home = env.HOME || env.USERPROFILE || os.homedir()
  const bundle = (apps) => [join(apps, 'Codex.app', 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'), join(apps, 'Codex.app', 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex')]
  const app = isWin
    ? [join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Programs', 'Codex', 'resources', 'codex-cli', 'bin', 'codex.exe')]
    : [...bundle('/Applications'), ...bundle(join(home, 'Applications'))]
  const cli = isWin ? [join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'npm', 'codex.cmd')]
    : ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', join(home, '.local', 'bin', 'codex'), join(home, '.npm-global', 'bin', 'codex'), join(home, '.bun', 'bin', 'codex'), join(home, '.volta', 'bin', 'codex')]
  return [...new Set([env.WORKBENCH_CODEX_BIN, env.CODEX_BIN?.trim(), ...fromPath, ...app, ...cli].filter(Boolean))]
}

/** 找到过的位置记在工作台的数据文件夹里（程序文件夹旁边的“数据”；搭建、接进 Codex 时在对话里找到的，工作台服务以后照着用） */
export const REMEMBER_FILE = process.env.WORKBENCH_DB ? join(dirname(process.env.WORKBENCH_DB), 'codex-bin.txt') : fileURLToPath(new URL('../../数据/codex-bin.txt', import.meta.url))
const remembered = (file) => { try { const p = readFileSync(file, 'utf8').trim(); return p || null } catch { return null } }
/** 记下 Codex 的位置（接进 Codex 时找到的也记，工作台服务照着用） */
export function rememberCodex(bin, file = REMEMBER_FILE) { remember(file, bin) }
function remember(file, bin) {
  if (!file || remembered(file) === bin) return
  // 只写进已经有的数据文件夹（在模板仓库里直接跑时不凭空建文件夹）
  try { if (existsSync(dirname(file))) writeFileSync(file, `${bin}\n`) } catch { /* 记不下不影响这一次 */ }
}
/** Mac 上桌面版不在常见位置（比如挪到了别的文件夹）：按桌面版的编号问一次聚焦搜索 */
function spotlightApps() {
  if (process.platform !== 'darwin') return []
  const r = spawnSync('mdfind', ["kMDItemCFBundleIdentifier == 'com.openai.codex'"], { encoding: 'utf8', timeout: 3000 })
  return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.app')).flatMap((a) => [join(a, 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'), join(a, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex')]) : []
}

/**
 * 同步找 codex 程序（工作台服务里各模块调 codex exec 用这一个）：候选里第一个能跑的 → 记下的位置 → 聚焦搜索。找到了就记下来。
 * 找不到返回 null，跟老板说 NOT_FOUND。
 */
export function findCodexBin(env = process.env, opts = {}) {
  const file = opts.remember === undefined ? REMEMBER_FILE : opts.remember
  const list = codexCandidates(env).filter((p) => opts.system !== false || !SYSTEM_PREFIX.test(p))
  const saved = file ? remembered(file) : null
  const bin = list.find(runnable) ?? (saved && runnable(saved) ? saved : null) ?? (opts.spotlight === false ? null : spotlightApps().find(runnable) ?? null)
  if (bin) remember(file, bin)
  return bin
}

function runnable(p) {
  try { accessSync(p, isWin ? constants.F_OK : constants.X_OK); return existsSync(p) } catch { return false }
}

/** 跑一个小命令，最多等 8 秒 */
export function small(bin, args, ms = 8000) {
  return new Promise((done) => {
    let out = ''
    let child
    try { child = spawn(bin, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }) } catch { done({ ok: false, text: '' }); return }
    const timer = setTimeout(() => { try { child.kill() } catch { /* 已退出 */ } done({ ok: false, text: out }) }, ms)
    child.stdout.on('data', (b) => { out = (out + b).slice(-20000) })
    child.stderr.on('data', (b) => { out = (out + b).slice(-20000) })
    child.on('error', () => { clearTimeout(timer); done({ ok: false, text: out }) })
    child.on('close', (code) => { clearTimeout(timer); done({ ok: code === 0, text: out }) })
  })
}

/**
 * 结果：ready 能用；bin 在哪；version；loggedIn；detail 一句人话；fix 怎么办。
 * 三种情况跟老板怎么说，见 Skill 的 references/接进Codex.md
 */
export async function findCodex(env = process.env, opts = {}) {
  const bin = findCodexBin(env, opts)
  if (!bin) return { ready: false, bin: null, version: null, loggedIn: false, detail: '工作台没认出这台电脑上的 Codex 在哪（找过 Codex 桌面版和 codex 命令）：还不能把工作台接进 Codex，工作台网页照常能用', fix: '装好 Codex 桌面版并登录，再跟 AI 说“把工作台接进 Codex”' }
  let real = bin
  try { real = realpathSync(bin) } catch { /* 用原路径 */ }
  const [ver, login] = await Promise.all([small(real, ['--version']), small(real, ['login', 'status'])])
  const version = ver.ok ? ver.text.trim().split('\n').pop() : null
  if (!ver.ok) return { ready: false, bin: real, version: null, loggedIn: false, detail: `找到了 Codex（${real}），但它没能正常运行`, fix: '打开 Codex 桌面版看看能不能用；不行就重装或更新 Codex' }
  const loggedIn = login.ok && /logged in/i.test(login.text)
  if (!loggedIn) return { ready: false, bin: real, version, loggedIn: false, detail: 'Codex 装好了，但还没登录', fix: '打开 Codex 登录你的 ChatGPT 账号（或在终端运行 codex login），再刷新这一页' }
  return { ready: true, bin: real, version, loggedIn: true, detail: `本机 Codex（${version}）已登录`, fix: null }
}

// 直接运行：node scripts/codex-check.mjs
if (isMain(import.meta.url)) {
  findCodex().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ready ? 0 : 1 })
}
