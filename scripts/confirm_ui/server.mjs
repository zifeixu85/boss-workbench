#!/usr/bin/env node
// 老板工作台 Skill 的本地确认页服务。不依赖任何第三方包，Node 18 以上即可运行；Mac、Windows 都能用。
//
// 用法（<工作目录> 里要先有 recommendations.json，由 Skill 写好）：
//   node server.mjs <工作目录> --daemon            后台启动并打开浏览器，打印网址后立即返回
//   node server.mjs <工作目录> --wait [--wait-timeout 590]
//        等老板在页面上点“确认”。返回 0：result.json 写好了；返回 2：还没确认（页面还开着，可以再等）；
//        返回 1：确认页没在运行，也没有结果（先 --daemon）
//   node server.mjs <工作目录> --shutdown           关掉这个工作目录的确认页
//   node server.mjs <工作目录> [--port 5062] [--no-open]   前台运行（调试用）
//
// 页面读 GET /api/recommendations，确认时 POST /api/result 写 result.json，然后服务自动退出。
// 每次新启动时，上一次留下的 result.json 会改名成 result-上次-<时间>.json，免得把旧结果当成新确认。
import { createServer, request } from 'node:http'
import { readFile, writeFile, stat, rm, rename } from 'node:fs/promises'
import { existsSync, readFileSync, openSync, closeSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, extname, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PAGE_DIR = join(HERE, 'page')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }
const IDLE_MS = 30 * 60 * 1000 // 页面关了 30 分钟没动静就自动退出；页面开着时每分钟会打一次招呼
const PORT_TRIES = 20
const START_WAIT_MS = 10_000 // Windows 杀毒软件、慢电脑上启动可能要好几秒
// 浏览器（Chrome、Edge、Safari、Firefox）一律拒绝打开的端口，1024 以上的这些。开在上面老板会看到“无法访问”，所以找端口时跳过
const BROWSER_BLOCKED_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080])

function parseArgs(argv) {
  const opts = { dir: null, port: 5062, open: true, daemon: false, wait: false, waitTimeout: 590, shutdown: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') opts.port = Number(argv[++i])
    else if (a === '--no-open') opts.open = false
    else if (a === '--daemon') opts.daemon = true
    else if (a === '--wait') opts.wait = true
    else if (a === '--wait-timeout') opts.waitTimeout = Number(argv[++i])
    else if (a === '--shutdown') opts.shutdown = true
    else if (!a.startsWith('--') && !opts.dir) opts.dir = resolve(a)
  }
  if (!opts.dir) fail('缺少工作目录。用法：node server.mjs <工作目录> --daemon')
  if (!Number.isInteger(opts.port) || opts.port < 1024 || opts.port > 65535) fail('--port 要是 1024—65535 之间的数字')
  if (!(opts.waitTimeout > 0)) fail('--wait-timeout 要是大于 0 的秒数')
  return opts
}

// 本机请求不用 fetch：装了代理的电脑上，Node 的 fetch 可能把 127.0.0.1 也交给代理，导致连不上
function localRequest(url, method = 'GET') {
  return new Promise((ok) => {
    const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : {}
    const req = request(url, { method, headers, timeout: 2000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => ok({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', () => ok({ status: 0, body: '' }))
    req.on('timeout', () => { req.destroy(); ok({ status: 0, body: '' }) })
    req.end()
  })
}

function fail(msg, code = 1) { console.error(msg); process.exit(code) }
const lockPath = (dir) => join(dir, '.confirm_ui.lock')
const logPath = (dir) => join(dir, '.confirm_ui.log')
const readLock = (dir) => { try { return JSON.parse(readFileSync(lockPath(dir), 'utf8')) } catch { return null } }
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

// 锁文件里的进程还活着、而且端口上确实是这个工作目录的确认页，才算“在运行”。
// 返回 { state: 'yes' | 'no' | 'unknown', lock }；unknown = 进程在，但这条命令连不上它（多半是在 Codex 沙箱里）
async function runningPage(dir) {
  const lock = readLock(dir)
  if (!lock || !alive(lock.pid)) return { state: 'no', lock }
  const r = await localRequest(lock.url + 'api/health')
  if (r.status === 0) return { state: 'unknown', lock }
  try { if (r.status === 200 && JSON.parse(r.body).dir === dir) return { state: 'yes', lock } } catch { /* 不是我们的服务 */ }
  return { state: 'no', lock }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
      : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' })
    child.on('error', () => console.log(`没能自动打开浏览器，请手动打开：${url}`))
    child.unref()
  } catch { console.log(`没能自动打开浏览器，请手动打开：${url}`) }
}

// recommendations.json 写错了，在启动时就说清楚错在哪，不让老板看到一个空白页
async function checkRecommendations(dir) {
  const recPath = join(dir, 'recommendations.json')
  if (!existsSync(recPath)) fail(`没找到 ${recPath}。先按 references/确认页数据格式.md 写好推荐，再启动确认页。`)
  let rec
  try { rec = JSON.parse(await readFile(recPath, 'utf8')) } catch (e) { fail(`recommendations.json 不是合格的 JSON：${e.message}`) }
  const missing = ['boss', 'profile', 'modules', 'themes', 'schedule'].filter((k) => !rec[k])
  if (missing.length) fail(`recommendations.json 缺少：${missing.join('、')}。格式见 references/确认页数据格式.md`)
  if (!rec.schedule.view) fail('recommendations.json 的 schedule 里要有 view（开了提醒以后几点看汇总）')
  return recPath
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

// 第四步“使用方式”的回执要前后一致（默认手动打开、不提醒、不自启）；旧回执不在这里改
function scheduleError(body) {
  const s = body.schedule
  if (body.schema !== 'boss-workbench-confirm/2' || !s) return '请在确认页第四步选使用方式'
  if (!['manual', 'reminders'].includes(s.mode) || typeof s.notifications_enabled !== 'boolean' || typeof s.autostart_enabled !== 'boolean') return '使用方式、提醒、自启没选全'
  if (s.prepare_at !== null || s.boot !== null) return '确认页不建 AI 定时任务，也不问开机时间'
  if (s.mode === 'manual') {
    if (s.notifications_enabled || s.autostart_enabled || s.view !== null || s.notify_at !== null) return '手动打开时提醒和自启都要关'
  } else {
    const times = { boot: null, '0830': '08:30', '0900': '09:00', '1130': '11:30' }
    if (!s.notifications_enabled || !Object.hasOwn(times, s.view) || s.notify_at !== times[s.view]) return '提醒时间对不上'
  }
  return null
}

async function readBody(req, limit = 1_000_000) {
  let size = 0
  const chunks = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new Error('内容太大')
    chunks.push(c)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function serve(opts) {
  const recPath = await checkRecommendations(opts.dir)
  const resultPath = join(opts.dir, 'result.json')
  if (existsSync(resultPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await rename(resultPath, join(opts.dir, `result-上次-${stamp}.json`))
  }
  let idleTimer = null
  let closing = false
  const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => shutdown('长时间没有操作，确认页已自动关闭'), IDLE_MS) }
  // 只接受本机地址访问，挡住别的网页借浏览器偷偷提交（DNS 重绑定、跨站请求）
  const okHosts = () => new Set([`127.0.0.1:${opts.port}`, `localhost:${opts.port}`])
  const okOrigin = (o) => !o || okHosts().has(o.replace(/^http:\/\//, ''))

  const server = createServer(async (req, res) => {
    touch()
    if (!okHosts().has(req.headers.host || '')) return sendJson(res, 403, { error: '只接受本机访问' })
    const url = new URL(req.url, 'http://127.0.0.1')
    try {
      if (req.method === 'POST' && (!okOrigin(req.headers.origin) || !/application\/json/.test(req.headers['content-type'] || ''))) {
        return sendJson(res, 403, { error: '只接受确认页自己的提交' })
      }
      if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, dir: opts.dir })
      if (url.pathname === '/api/recommendations') {
        const text = await readFile(recPath, 'utf8')
        return sendJson(res, 200, JSON.parse(text))
      }
      if (url.pathname === '/api/result' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        if (!body || body.status !== 'confirmed') return sendJson(res, 400, { error: '结果格式不对：缺少 status: confirmed' })
        if (!Array.isArray(body.modules) || typeof body.theme !== 'string') return sendJson(res, 400, { error: '结果格式不对：缺少 modules 或 theme' })
        const scheduleProblem = scheduleError(body)
        if (scheduleProblem) return sendJson(res, 400, { error: scheduleProblem })
        const out = { ...body, saved_at: new Date().toISOString() }
        const tmp = resultPath + '.tmp'
        await writeFile(tmp, JSON.stringify(out, null, 2) + '\n', 'utf8')
        await rename(tmp, resultPath) // 先写临时文件再改名，--wait 不会读到写了一半的结果
        sendJson(res, 200, { ok: true })
        setTimeout(() => shutdown('老板已确认，结果写入 result.json'), 800)
        return
      }
      if (url.pathname === '/api/shutdown' && req.method === 'POST') {
        sendJson(res, 200, { ok: true })
        setTimeout(() => shutdown('收到关闭请求'), 100)
        return
      }
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: '没有这个接口' })
      // 静态页面
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
      const file = resolve(PAGE_DIR, rel)
      if (!file.startsWith(PAGE_DIR + sep)) return sendJson(res, 403, { error: '不允许的路径' })
      const info = await stat(file).catch(() => null)
      if (!info || !info.isFile()) return sendJson(res, 404, { error: '没有这个文件' })
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(await readFile(file))
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '出错了' })
    }
  })

  async function shutdown(reason) {
    if (closing) return
    closing = true
    console.log(reason)
    await rm(lockPath(opts.dir), { force: true })
    server.close(() => process.exit(0))
    server.closeAllConnections?.()
    setTimeout(() => process.exit(0), 1500).unref()
  }

  await new Promise((ok, bad) => {
    const tryPort = (p, left) => {
      if (BROWSER_BLOCKED_PORTS.has(p)) return left > 0 ? tryPort(p + 1, left - 1) : bad(new Error('附近的端口浏览器都打不开，换一个 --port 试试'))
      server.once('error', (e) => {
        // EADDRINUSE：端口被占；EACCES：Windows 上有些端口被系统保留。都换下一个
        if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && left > 0) tryPort(p + 1, left - 1)
        else bad(e)
      })
      server.listen(p, '127.0.0.1', () => { opts.port = p; ok() })
    }
    tryPort(opts.port, PORT_TRIES)
  }).catch((e) => {
    const hint = e.code === 'EPERM' ? '（没有权限开本机端口：如果是在 Codex 里运行，被沙箱拦住了，请允许这条命令用网络/本机端口后再试）' : ''
    fail(`确认页没能开端口：${e.code || e.message}${hint}`)
  })
  const url = `http://127.0.0.1:${opts.port}/`
  await writeFile(lockPath(opts.dir), JSON.stringify({ pid: process.pid, port: opts.port, url, dir: opts.dir, started_at: new Date().toISOString() }), 'utf8')
  console.log(`确认页已打开：${url}`)
  if (opts.open) openBrowser(url)
  touch()
  process.on('SIGINT', () => shutdown('已停止'))
  process.on('SIGTERM', () => shutdown('已停止'))
}

function logTail(dir) {
  try { return readFileSync(logPath(dir), 'utf8').trim().split(/\r?\n/).slice(-8).join('\n') } catch { return '' }
}

async function daemon(opts) {
  await checkRecommendations(opts.dir)
  const old = await runningPage(opts.dir)
  if (old.state === 'yes') { console.log(`确认页已经在运行：${old.lock.url}`); if (opts.open) openBrowser(old.lock.url); return }
  if (old.state === 'unknown') {
    console.log(`确认页好像已经在运行：${old.lock.url}（这条命令连不上本机端口，没法核实；浏览器里打不开的话，先 --shutdown 再重开）`)
    return
  }
  await rm(lockPath(opts.dir), { force: true }) // 清掉上次没收拾的锁
  const args = [fileURLToPath(import.meta.url), opts.dir, '--port', String(opts.port), '--no-open']
  const log = openSync(logPath(opts.dir), 'w')
  // detached：Codex 这条命令结束后服务还在；windowsHide：Windows 上不弹黑色命令行窗口
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', log, log], windowsHide: true })
  child.on('error', () => { /* 下面按超时处理 */ })
  child.unref()
  closeSync(log)
  for (let waited = 0; waited < START_WAIT_MS; waited += 150) {
    await new Promise((r) => setTimeout(r, 150))
    const lock = readLock(opts.dir)
    if (lock && lock.pid === child.pid && (await localRequest(lock.url + 'api/health')).status === 200) {
      console.log(`确认页已打开：${lock.url}`)
      if (opts.open) openBrowser(lock.url)
      return
    }
    if (child.exitCode !== null) break
  }
  const tail = logTail(opts.dir)
  fail(`确认页没能启动。${tail ? '\n' + tail + '\n' : ''}可以改用对话里的四步确认（见 SKILL.md 第 3 步）。`)
}

async function waitForResult(opts) {
  const resultPath = join(opts.dir, 'result.json')
  const started = Date.now()
  let missing = 0
  while (Date.now() - started < opts.waitTimeout * 1000) {
    if (existsSync(resultPath)) { console.log(`老板已确认：${resultPath}`); return process.exit(0) }
    const lock = readLock(opts.dir)
    missing = lock && alive(lock.pid) ? 0 : missing + 1
    if (missing >= 3) {
      console.log('确认页没有在运行，也没有 result.json。先运行 --daemon 打开确认页。')
      return process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.log('还没等到确认。页面仍然开着，可以再运行一次 --wait。')
  process.exit(2)
}

async function shutdownRemote(opts) {
  const lock = readLock(opts.dir)
  if (!lock) return console.log('确认页没有在运行')
  if (!alive(lock.pid)) {
    await rm(lockPath(opts.dir), { force: true })
    return console.log('确认页没有在运行（清掉了上次留下的记录）')
  }
  let stopped = (await localRequest(lock.url + 'api/shutdown', 'POST')).status === 200
  if (!stopped) {
    try { process.kill(lock.pid); stopped = true } catch (e) { stopped = e.code === 'ESRCH' } // ESRCH：刚好已经退出
  }
  if (!stopped) {
    // 多半是在 Codex 沙箱里：既连不上本机端口，也没权限结束进程。锁留着，换有权限的方式再关
    fail(`没能关掉确认页（进程 ${lock.pid}）：这条命令没有权限。请允许它访问本机端口后再运行一次 --shutdown；不管它也行，页面关了 30 分钟后会自己退出。`)
  }
  await rm(lockPath(opts.dir), { force: true })
  console.log('确认页已关闭')
}

const opts = parseArgs(process.argv.slice(2))
if (opts.shutdown) await shutdownRemote(opts)
else if (opts.daemon) await daemon(opts)
else if (opts.wait) await waitForResult(opts)
else await serve(opts)
