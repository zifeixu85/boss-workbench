// 工作台在不在运行、没在运行就拉起来（2026-11-12，Codex 插件的 workbench_open 用）。
// 认的是“这一个工作台”：问 /api/instance 拿数据库位置，和自己的对得上才算；端口上是别的程序（或另一个工作台）就说清楚，不乱开。
// 拉起 = 后台跑 node server/index.ts（和双击“启动工作台”、开机自启跑的是同一个入口），日志写进 程序/日志/，不等它结束。
// 工作台启动时把实际端口记在 数据/服务.json（server/index.ts），所以老板换过端口也找得到。
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { APP_DIR, DB_PATH } from '../db.ts'

export const DEFAULT_PORT = 4517
const HOST = '127.0.0.1'
export const SERVICE_FILE = join(dirname(DB_PATH), '服务.json')

const real = (p: string) => { try { return realpathSync(p) } catch { return p } }
const validPort = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 65536 ? n : null }

/** 插件 / 命令行这边想用的端口：环境变量 PORT，没有就 4517 */
export const wantedPort = (env: NodeJS.ProcessEnv = process.env): number => validPort(env.PORT) ?? DEFAULT_PORT

/** 工作台启动后记一下自己在哪个端口（index.ts 调）；退出时拿掉 */
export function recordService(port: number): void {
  try {
    mkdirSync(dirname(SERVICE_FILE), { recursive: true })
    writeFileSync(SERVICE_FILE, `${JSON.stringify({ port, pid: process.pid, started_at: new Date().toISOString() })}\n`)
    process.once('exit', () => { try { if (recordedPort() === port) rmSync(SERVICE_FILE, { force: true }) } catch { /* 留着也不要紧：用之前会再核对 */ } })
  } catch (err) { console.warn(`没能记下工作台的端口（${SERVICE_FILE}）：${(err as Error).message}`) }
}
export function recordedPort(): number | null {
  try { return validPort((JSON.parse(readFileSync(SERVICE_FILE, 'utf8')) as { port?: unknown }).port) } catch { return null }
}

export type Probe = 'ours' | 'other' | 'down'
/** 这个端口上是谁：ours = 这个工作台；other = 别的程序或另一个工作台；down = 没人 */
export async function probe(port: number, ms = 1500): Promise<Probe> {
  let res: Response
  // 连不上（没人听、连接断了）= 没人；连上了但迟迟不答 = 别的程序
  try { res = await fetch(`http://${HOST}:${port}/api/instance`, { signal: AbortSignal.timeout(ms) }) } catch (err) { return (err as Error).name === 'TimeoutError' ? 'other' : 'down' }
  if (!res.ok) return 'other'
  // 答了但不是工作台的样子（回的是网页、别的 JSON）= 别的程序：不能再往这个端口上拉一个
  try {
    const body = (await res.json()) as { data?: { db?: string } }
    return body.data?.db && real(body.data.db) === real(DB_PATH) ? 'ours' : 'other'
  } catch { return 'other' }
}

export type Running = { url: string; port: number; started: boolean }
export type LaunchOptions = {
  env?: NodeJS.ProcessEnv
  /** 最多等多久（毫秒），默认 25 秒：第一次启动要建表、接日历 */
  waitMs?: number
  /** 测试时换掉：怎么看端口、怎么启动、网页构建了没有 */
  probe?: (port: number) => Promise<Probe>
  start?: (port: number) => void
  built?: () => boolean
}

/** 后台启动工作台，不等它结束。输出接到 程序/日志/服务.log（和开机自启用的是同一份） */
function startDetached(port: number, env: NodeJS.ProcessEnv): void {
  const logs = join(APP_DIR, '日志')
  mkdirSync(logs, { recursive: true })
  const out = openSync(join(logs, '服务.log'), 'a')
  const err = openSync(join(logs, '服务-错误.log'), 'a')
  const child = spawn(process.execPath, ['server/index.ts'], { cwd: APP_DIR, env: { ...env, PORT: String(port) }, detached: true, stdio: ['ignore', out, err], windowsHide: true })
  child.on('error', () => { /* 起不来的话，下面等不到就会报错 */ })
  child.unref()
  closeSync(out) // 子进程已经拿到了自己的那一份，这边的可以关了
  closeSync(err)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 保证工作台在运行，返回它的地址。先看记下的端口，再看想用的端口；都没有就在想用的端口上拉起来 */
export async function ensureRunning(o: LaunchOptions = {}): Promise<Running> {
  const env = o.env ?? process.env
  const look = o.probe ?? probe
  const want = wantedPort(env)
  const candidates = [...new Set([recordedPort(), want].filter((p): p is number => p !== null))]
  const seen = new Map<number, Probe>()
  for (const port of candidates) {
    const state = await look(port)
    seen.set(port, state)
    if (state === 'ours') return { url: `http://${HOST}:${port}`, port, started: false }
  }
  if (seen.get(want) === 'other') throw new Error(`端口 ${want} 上开着的不是这个工作台：可能是别的程序、另一个工作台，或者是更新前就开着的旧版工作台。是旧版就关掉重开一次（关掉启动窗口，再双击“启动工作台”）；是别的程序就让这个工作台换一个端口：在程序文件夹里运行 node scripts/codex-plugin.mjs install --port ${want + 10}`)
  if (!(o.built ?? (() => existsSync(join(APP_DIR, 'dist', 'index.html'))))()) throw new Error(`工作台的网页还没构建，拉不起来。在程序文件夹（${APP_DIR}）里运行 node scripts/install.mjs`)
  ;(o.start ?? ((port: number) => startDetached(port, env)))(want)
  const until = Date.now() + (o.waitMs ?? 25000)
  while (Date.now() < until) {
    await sleep(300)
    if (await look(want) === 'ours') return { url: `http://${HOST}:${want}`, port: want, started: true }
  }
  throw new Error(`工作台没能在 ${Math.round((o.waitMs ?? 25000) / 1000)} 秒内启动起来。看看日志：${join(APP_DIR, '日志', '服务-错误.log')}；或者在程序文件夹里运行 node scripts/install.mjs --check 体检`)
}
