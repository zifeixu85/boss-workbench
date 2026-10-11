// 给工作台各页面截图（无头 Chrome，DevTools 协议，不需要额外安装）。
// 用法：node scripts/截图.mjs [网址] [输出文件夹]   例：node scripts/截图.mjs http://127.0.0.1:4517 ../../截图
// 只拍名字里带某几个字的：ONLY=今日 node scripts/截图.mjs …；换桌面宽度：W=1280 node scripts/截图.mjs …
// 结尾会提示哪些页面在手机宽度下有横向溢出。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [base = 'http://127.0.0.1:4517', out = '../../截图'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const CHROME = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome'
const port = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--hide-scrollbars', `--user-data-dir=${join(process.env.TMPDIR || '/tmp', `wb-shot-${port}`)}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets = []
for (let i = 0; i < 40 && !targets.length; i++) { await sleep(300); try { targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page') } catch { /* 还没起来 */ } }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })

const D = 'desktop', M = 'mobile'
const SHOTS = [
  ['01-今日', '/', D], ['02-客户列表', '/clients', D], ['03-客户详情-澜拓科技', '/clients?client=c_lantuo', D], ['03-客户详情-衡言律所', '/clients?client=c_hengyan', D],
  ['04-日程-月', '/calendar?view=month', D], ['04-日程-周', '/calendar?view=week', D],
  ['05-客户列表-方案报价', '/clients?status=deal', D], ['05-客户卡片', '/clients?view=cards', D], ['05-客户整页-许国平', '/clients/c_xuguoping', D],
  ['06-待办', '/todos', D], ['06-项目', '/projects', D], ['06-项目抽屉-春节预售', '/projects?project=p_spring', D],
  ['07-跟进清单', '/clients/follow', D], ['07-商机看板', '/clients/pipeline', D], ['07-应收款', '/clients/receivables', D],
  ['08-占位-经营汇总', '/biz', D], ['08-占位-抖店', '/channel/douyin', D], ['08-占位-小红书选题', '/content', D], ['08-占位-数据源', '/sources', D], ['08-占位-导入', '/imports', D], ['08-占位-大客户档案', '/clients/key', D],
  ['09-收件箱', '/inbox', D], ['09-知识库', '/kb', D], ['09-设置', '/settings', D], ['09-组件规范-风格', '/design', D], ['09-组件规范-Tab', '/design?s=tabs', D],
  ['10-嵌入页-澜拓科技', '/embed/clients/c_lantuo', 'narrow'],
  ['11-手机-今日', '/', M], ['11-手机-客户卡片', '/clients?view=cards', M], ['11-手机-日程', '/calendar', M], ['11-手机-项目', '/projects', M],
]
const SIZES = { desktop: [Number(process.env.W || 1440), 900, 1, false], narrow: [480, 900, 2, false], mobile: [390, 844, 3, true] }
const only = process.env.ONLY
await send('Page.enable')
for (const [name, path, size] of SHOTS.filter((s) => !only || s[0].includes(only))) {
  const [w, h, dpr, mobile] = SIZES[size]
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile })
  await send('Page.navigate', { url: base + path })
  await sleep(3500)
  const overlay = /[?&](client|event|todo|new|project)=/.test(path) || size === 'mobile'
  if (!overlay) {
    const { result } = await send('Runtime.evaluate', { expression: 'Math.max(document.documentElement.scrollHeight, (document.querySelector("main")?.scrollHeight || 0) + 56)', returnByValue: true })
    const need = Math.min(Number(result?.result?.value) || h, 4200)
    if (need > h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: need, deviceScaleFactor: dpr, mobile }); await sleep(900) }
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(out, `${name}.png`), Buffer.from(shot.result.data, 'base64'))
  const { result: ov } = await send('Runtime.evaluate', { expression: '(document.documentElement.scrollWidth > innerWidth + 1) || [...document.querySelectorAll("main")].some((m) => m.scrollWidth > m.clientWidth + 1)', returnByValue: true })
  console.log(`${name}${ov.result.value ? '  ⚠ 横向溢出' : ''}`)
}
ws.close()
chrome.kill()
