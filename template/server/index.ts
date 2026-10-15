// 本地服务：只监听本机，提供 /api 和网页；数据库或知识库文件变了就推送刷新
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { ZodError } from 'zod'
import { existsSync, watch, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { open, dataVersion, APP_DIR, ROOT, DB_PATH } from './db.ts'
import { routes } from './routes.ts'
import { demoDate } from './clock.ts'
import { startReminders, type PushPayload } from './reminders/service.ts'
import { markInterrupted } from './assistant/service.ts'

const PORT = Number(process.env.PORT || 4517) // 默认 4517；被占用时启动加 PORT=4527 这样换一个
const HOST = '127.0.0.1'
// 只认本机主机名（端口不限，方便开发时 Vite 代理）；挡住 DNS 重绑定和别的网站跨站写入
const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/
const isLocal = (hostPort: string) => LOCAL.test(hostPort)

open()
markInterrupted() // AI 助手：上次没答完的标成中断
const app = new Hono()

// 防 DNS 重绑定和跨站写入：只认本机地址；写操作必须同源、JSON
app.use('/api/*', async (c, next) => {
  const host = c.req.header('host') ?? ''
  if (!isLocal(host)) return c.json({ ok: false, error: '只允许本机访问' }, 403)
  if (c.req.method !== 'GET') {
    const origin = c.req.header('origin')
    if (origin && !isLocal(origin.replace(/^https?:\/\//, ''))) return c.json({ ok: false, error: '来源不被允许' }, 403)
    if (!(c.req.header('content-type') ?? '').includes('application/json')) return c.json({ ok: false, error: '请用 JSON 提交' }, 415)
  }
  await next()
  if (c.req.method !== 'GET' && c.res.status < 300) broadcast({ reason: 'web', path: c.req.path })
})

app.onError((err, c: Context) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return c.json({ ok: false, error: issues[0]?.message ?? '填写有误', issues }, 400)
  }
  const status = (err as { status?: number }).status ?? 500
  if (status >= 500) console.error(err)
  return c.json({ ok: false, error: status >= 500 ? `服务出错：${err.message}` : err.message }, status as 400)
})

// 实时推送。页面连上时带 ?notify=on 表示“这个浏览器点过开启提醒、也允许了通知”：有这样的页面开着，提醒走浏览器通知；
// 一个都没有（页面关了、切到后台超过半分钟会断开、没允许通知），提醒走电脑系统通知（见 reminders/service.ts）
type Sink = (data: string, event?: string) => Promise<void>
const sinks = new Set<Sink>()
const notifySinks = new Set<Sink>()
const drop = (s: Sink) => { sinks.delete(s); notifySinks.delete(s) }
function broadcast(payload: Record<string, unknown>, event = 'change') {
  const data = JSON.stringify({ ...payload, at: Date.now() })
  for (const s of sinks) s(data, event).catch(() => drop(s))
}
app.get('/api/live', (c) => streamSSE(c, async (stream) => {
  const sink: Sink = (data, event = 'change') => stream.writeSSE({ data, event })
  sinks.add(sink)
  // 只认工作台自己的页面：别的网站也能连这个地址，不能让它“占个名额”把系统通知都改成浏览器通知
  const origin = c.req.header('origin')
  const site = c.req.header('sec-fetch-site')
  const own = (!origin || isLocal(origin.replace(/^https?:\/\//, ''))) && (!site || site === 'same-origin')
  // notify=on：页面里点过“开启提醒”（老版本页面发的 notify=1 不算：那时只看有没有权限，打开页面就会弹）
  if (c.req.query('notify') === 'on' && own) notifySinks.add(sink)
  stream.onAbort(() => { drop(sink) })
  await stream.writeSSE({ data: JSON.stringify({ reason: 'hello' }), event: 'change' })
  while (!stream.aborted) await stream.sleep(25000).then(() => stream.writeSSE({ data: '{}', event: 'ping' }))
}))

app.route('/api', routes)
// 底座审查 #10：没有的接口回 404 JSON，不要落到下面的网页兜底（原来回 200 的 index.html）
app.all('/api/*', (c) => c.json({ ok: false, error: `没有这个接口：${c.req.method} ${c.req.path}` }, 404))

// Codex 命令行在另一个进程里写库：轮询 data_version 发现后推送
let lastVersion = dataVersion()
setInterval(() => {
  const v = dataVersion()
  if (v !== lastVersion) { lastVersion = v; broadcast({ reason: 'external' }) }
}, 1000)

// 知识库 Markdown 被改（Codex、编辑器）也推送
let kbTimer: NodeJS.Timeout | null = null
try {
  watch(ROOT, { recursive: true }, (_e, file) => {
    const f = String(file ?? '')
    if (!f.endsWith('.md') || f.includes('程序') || f.includes('node_modules')) return
    if (kbTimer) clearTimeout(kbTimer)
    kbTimer = setTimeout(() => broadcast({ reason: 'kb', file: f }), 200)
  })
} catch { console.warn('这台电脑不支持监听子文件夹，知识库改动需要手动刷新') }

// 网页（npm run build 之后的 dist）
const DIST = join(APP_DIR, 'dist')
if (existsSync(DIST)) {
  const rel = relative(process.cwd(), DIST) || '.'
  // 演示日期写进页面，网页第一次渲染就用同一个“今天”（见 clock.ts、src/lib/clock.ts）
  const indexHtml = () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8')
    const d = demoDate()
    return d ? html.replace('<head>', `<head><script>window.__WB_TODAY__=${JSON.stringify(d)}</script>`) : html
  }
  app.get('/', (c) => c.html(indexHtml()))
  app.get('/index.html', (c) => c.html(indexHtml()))
  app.use('/*', serveStatic({ root: rel }))
  app.get('*', (c) => c.html(indexHtml()))
} else {
  app.get('/', (c) => c.text('网页还没构建：请先运行 npm run build，或开发时用 npm run dev'))
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`工作台已启动：http://${HOST}:${PORT}`)
  console.log(`知识库：${ROOT}`)
  console.log(`数据库：${DB_PATH}`)
  const d = demoDate()
  if (d) console.log(`演示日期：${d}（DEMO_TODAY=off 可以换回真实日期）`)
  // 提醒：每 30 秒算一遍（不靠页面开着），见 reminders/
  startReminders({
    browsers: () => notifySinks.size,
    push: (p: PushPayload) => broadcast({ ...p }, 'reminder'),
    base: `http://${HOST}:${PORT}`,
  })
})
// 端口被占了（多半是工作台已经开着一个）：说清楚，正常退出。开机自启（Mac 登录项服务）按“出错才重启”配置，这样不会反复重启
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err
  console.error(`端口 ${PORT} 已经被占用：多半是工作台已经在运行，直接打开 http://${HOST}:${PORT} 就行；不是的话换一个端口启动（PORT=${PORT + 10}）。`)
  process.exit(0)
})
