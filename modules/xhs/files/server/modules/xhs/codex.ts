// 调本机 Codex（codex exec）写稿、出选题、写复盘。归属：小红书内容模块。
// 边界：工作目录 = 知识库根目录（Codex 能读到 AGENTS.md 和 .agents/skills/xhs-creator）；只读沙箱、不批准任何命令、
// 不读用户自己的 Codex 配置；关掉浏览器、电脑操作、插件、联网搜索、生图、多代理这些能力。
// 读文件要用 Codex 自带的命令行（实测 0.159：关掉它就什么文件都读不了），所以它留着，但跑在只读沙箱里：能看、不能改、不能联网。
// Codex 只回文字；稿件由工作台解析后按同一套规则写成新版本，Codex 不直接写数据库。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join, relative } from 'node:path'
import { ROOT } from '../../db.ts'

const DISABLED = ['apps', 'plugins', 'hooks', 'multi_agent', 'multi_agent_v2', 'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser',
  'view_image', 'memories', 'image_generation', 'goals', 'sleep_tool', 'shell_snapshot', 'skill_mcp_dependency_install', 'workspace_dependencies', 'tool_suggest']
const APP_BIN = '/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex'

// 演示时网络慢一点就超过 90 秒（实测一句话写一篇 64—72 秒、再给 3 个标题 29—60 秒），所以默认 180 秒才停；超过 90 秒页面先提示“比平时慢，还在写”
export const TIMEOUT_MS = Number(process.env.XHS_CODEX_TIMEOUT_MS || 180_000)
export const SLOW_MS = 90_000

export function findCodex(): string | null {
  const env = process.env.CODEX_BIN?.trim()
  if (env) return existsSync(env) ? env : null
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of process.platform === 'win32' ? ['codex.cmd', 'codex.exe'] : ['codex']) {
      const p = join(dir, name)
      if (dir && existsSync(p)) return p
    }
  }
  return existsSync(APP_BIN) ? APP_BIN : null
}

let statusCache: { at: number; value: CodexStatus } | null = null
export type CodexStatus = { available: boolean; detail: string; version: string | null; timeout_s: number; slow_s: number }

/** 本机 Codex 能不能用（找没找到、登录没有）。缓存 1 分钟 */
export function codexStatus(): CodexStatus {
  if (statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value
  const bin = findCodex()
  const timeout_s = Math.round(TIMEOUT_MS / 1000), slow_s = Math.round(SLOW_MS / 1000)
  let value: CodexStatus
  if (!bin) value = { available: false, detail: '这台电脑上没找到 Codex（Codex App 或 codex 命令）', version: null, timeout_s, slow_s }
  else {
    const ver = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000 })
    const login = spawnSync(bin, ['login', 'status'], { encoding: 'utf8', timeout: 8000 })
    const version = (ver.stdout || '').trim().replace(/^codex-cli\s*/, '') || null
    const logged = /Logged in/i.test(`${login.stdout}${login.stderr}`)
    value = logged
      ? { available: true, detail: '本机 Codex · 只能看、不能改、不能联网', version, timeout_s, slow_s }
      : { available: false, detail: 'Codex 没登录：在终端运行 codex login 后再试', version, timeout_s, slow_s }
  }
  statusCache = { at: Date.now(), value }
  return value
}

export function codexArgs(cwd: string, effort = process.env.XHS_CODEX_EFFORT || 'low') {
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--cd', cwd, '--json', '--color', 'never']
  for (const f of DISABLED) args.push('--disable', f)
  for (const c of ['approval_policy="never"', 'web_search="disabled"', `model_reasoning_effort="${effort}"`, 'history.persistence="none"']) args.push('-c', c)
  if (process.env.XHS_CODEX_MODEL) args.push('-m', process.env.XHS_CODEX_MODEL)
  args.push('-')
  return args
}

export type RunUpdate = { progress?: string; files?: string[] }
export type RunResult =
  | { ok: true; text: string; files: string[]; ms: number }
  | { ok: false; reason: '超时' | '出错' | '不可用' | '已停止'; error: string; text: string; files: string[]; ms: number }
export type RunHandle = { done: Promise<RunResult>; stop: () => void }

/** 从命令里认出读了哪些知识库文件（cat / sed / rg / head 的参数里的 .md 路径） */
function filesIn(command: string, cwd: string): string[] {
  const out: string[] = []
  for (const m of command.matchAll(/['"]?((?:[^\s'"|;&<>]+\/)*[^\s'"|;&<>]+\.md)['"]?/g)) {
    const raw = m[1].replace(/^\.\//, '')
    const abs = raw.startsWith('/') ? raw : join(cwd, raw)
    const rel = relative(ROOT, abs)
    if (!rel.startsWith('..') && existsSync(abs)) out.push(rel.split('\\').join('/'))
  }
  return out
}

const short = (p: string) => p.split('/').pop()?.replace(/\.md$/, '') ?? p

/** 跑一次 codex exec：提示词从标准输入给；进度（在读哪个文件、说了什么）随时回调；超时就停 */
export function runCodex(prompt: string, onUpdate: (u: RunUpdate) => void, opts: { cwd?: string; timeoutMs?: number; labels?: { writing: string; final: string } } = {}): RunHandle {
  const cwd = opts.cwd ?? ROOT
  const labels = opts.labels ?? { writing: '正在写稿…', final: '正在把稿件写到右侧…' }
  const t0 = Date.now()
  const bin = findCodex()
  let stop = () => {}
  const done = new Promise<RunResult>((resolve) => {
    if (!bin) { resolve({ ok: false, reason: '不可用', error: '这台电脑上没找到 Codex（Codex App 或 codex 命令）。', text: '', files: [], ms: 0 }); return }
    let child: ChildProcess
    try {
      child = spawn(bin, codexArgs(cwd), { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: { ...process.env, NO_COLOR: '1' } })
    } catch (err) {
      resolve({ ok: false, reason: '不可用', error: `Codex 启动不了：${(err as Error).message}`, text: '', files: [], ms: 0 })
      return
    }
    const files: string[] = []
    let last = '', stderr = '', buffer = '', settled = false
    let idle: NodeJS.Timeout | undefined
    const kill = () => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM') } catch { /* 已经退出 */ }
    }
    const finish = (r: RunResult) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(idle); resolve(r) }
    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
    const timer = setTimeout(() => {
      kill()
      finish({ ok: false, reason: '超时', error: `Codex ${Math.round(timeoutMs / 1000)} 秒还没写完，已经停掉。可以再试一次，或者把要求说短一点。`, text: last, files, ms: Date.now() - t0 })
    }, timeoutMs)
    stop = () => { kill(); finish({ ok: false, reason: '已停止', error: '你停掉了这一轮。', text: last, files, ms: Date.now() - t0 }) }

    const onEvent = (line: string) => {
      let ev: { type?: string; item?: { type?: string; text?: string; command?: string }; error?: { message?: string }; message?: string }
      try { ev = JSON.parse(line) } catch { return }
      const item = ev.item
      if (item?.type === 'command_execution' && ev.type === 'item.completed') {
        // 读完一个文件 4 秒内没再读，多半是在写稿了
        clearTimeout(idle)
        idle = setTimeout(() => onUpdate({ progress: `资料读好了（${files.length} 个文件），${labels.writing}` }), 4000)
      }
      if (item?.type === 'command_execution' && item.command && ev.type === 'item.started') {
        clearTimeout(idle)
        const fs = filesIn(item.command, cwd)
        for (const f of fs) if (!files.includes(f)) files.push(f)
        onUpdate({ progress: fs.length ? `正在读 ${fs.map(short).join('、')}…` : '正在找资料…', files: [...files] })
      }
      if (item?.type === 'agent_message' && ev.type === 'item.completed' && item.text) {
        last = item.text.trim()
        const first = last.split('\n')[0].replace(/<[^>]+>/g, '').slice(0, 60)
        if (!/<draft>|<options|<topics>|<review>/.test(last)) onUpdate({ progress: first || labels.writing })
        else onUpdate({ progress: labels.final })
      }
      if (ev.type === 'turn.failed' || ev.type === 'error') stderr = `${stderr} ${ev.error?.message ?? ev.message ?? ''}`.slice(-4000)
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let at: number
      while ((at = buffer.indexOf('\n')) >= 0) { const l = buffer.slice(0, at); buffer = buffer.slice(at + 1); onEvent(l) }
    })
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000) })
    child.stdin?.on('error', () => {})
    child.stdin?.end(prompt)
    child.on('error', (err) => finish({ ok: false, reason: '不可用', error: `Codex 启动不了：${err.message}`, text: '', files, ms: Date.now() - t0 }))
    child.on('close', (code) => {
      if (buffer.trim()) onEvent(buffer)
      const ms = Date.now() - t0
      if (code === 0 && last) finish({ ok: true, text: last, files, ms })
      else finish({
        ok: false, reason: '出错', text: last, files, ms,
        error: /quota|usage limit|rate.?limit|429/i.test(stderr) ? 'Codex 额度或频率到上限了，等一会儿再试。'
          : /auth|login|401|403/i.test(stderr) ? '本机 Codex 没登录或登录过期：在终端运行 codex login。'
          : /network|connect|ENOTFOUND|timed out/i.test(stderr) ? '连不上 Codex 的服务，检查一下网络再试。'
          : 'Codex 中途停了，没有答完，可以再试一次。',
      })
    })
  })
  return { done, stop: () => stop() }
}
