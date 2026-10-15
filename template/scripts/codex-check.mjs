// 找本机 Codex（2026-10-15）：工作台的 AI 助手要靠它。体检、搭建、工作台服务都用这一份。
// 先找命令行 codex，再找 Codex 桌面版自带的那一个；找到了再看有没有登录。只读，不改任何东西。
// 普通 JS：老版本 Node 也能跑（install.mjs 要用）。
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, realpathSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import os from 'node:os'

const isWin = process.platform === 'win32'

/** 可能的位置：环境变量指定的 → PATH 里的 codex → Codex 桌面版自带的（Windows 的路径还没在真机上核对过） */
export function codexCandidates(env = process.env) {
  const names = isWin ? ['codex.exe', 'codex.cmd', 'codex'] : ['codex']
  const fromPath = (env.PATH || '').split(delimiter).filter(Boolean).flatMap((d) => names.map((n) => join(d, n)))
  const home = os.homedir()
  const app = isWin
    ? [join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Programs', 'Codex', 'resources', 'codex-cli', 'bin', 'codex.exe')]
    : ['/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex', join(home, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex-cli', 'bin', 'codex')]
  return [env.WORKBENCH_CODEX_BIN, ...fromPath, ...app].filter(Boolean)
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
 * 三种情况跟老板怎么说，见 Skill 的 references/AI助手.md
 */
export async function findCodex(env = process.env) {
  const bin = codexCandidates(env).find(runnable)
  if (!bin) return { ready: false, bin: null, version: null, loggedIn: false, detail: '这台电脑上没找到 Codex：页面里的 AI 助手先用不了，其他功能照常', fix: '装好 Codex 桌面版（或命令行版）并登录，再跟 AI 说“打开 AI 助手”' }
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
if (import.meta.url === `file://${process.argv[1]}`) {
  findCodex().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ready ? 0 : 1 })
}
