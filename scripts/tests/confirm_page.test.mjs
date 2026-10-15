// 确认页（scripts/confirm_ui/page/）的测试。在仓库根目录（boss-workbench 文件夹）运行：node --test scripts/tests/confirm_page.test.mjs
// 不开浏览器、不起服务：用 node:vm 加一个极简的假页面，把 previews.js 和 app.js 原样跑一遍，看它们往页面里写了什么。
// 安装 Skill 时不带 tests/。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const UI = join(HERE, '..', 'confirm_ui')
const PAGE = join(UI, 'page')
const read = (f) => readFileSync(f, 'utf8')
const EXAMPLE = JSON.parse(read(join(UI, 'example', 'recommendations.json')))
const copy = (x) => JSON.parse(JSON.stringify(x))

function fakeElement(id) {
  const handlers = {}
  return {
    handlers,
    id, hidden: false, innerHTML: '', textContent: '', value: '', disabled: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { handlers[type] = fn }, focus() {}, querySelector: () => null, querySelectorAll: () => [],
  }
}

/** 按 rec 把确认页跑起来；search 是地址栏的 ?step=… 这类参数。返回 el(id) 取页面上的元素。 */
async function openPage(rec, search = '') {
  const els = new Map()
  const timers = []
  const posted = []
  const document = {
    getElementById: (id) => { if (!els.has(id)) els.set(id, fakeElement(id)); return els.get(id) },
    querySelectorAll: () => [], querySelector: () => null,
  }
  const ctx = {
    document, console, URLSearchParams, navigator: {},
    location: { protocol: 'http:', search },
    fetch: (url, opts) => { if (opts?.method === 'POST') posted.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve(copy(rec)) }) },
    setInterval: (fn) => { timers.push(fn); return timers.length }, clearInterval() {},
    setTimeout: () => 0, clearTimeout() {}, scrollTo() {},
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(read(join(PAGE, 'previews.js')), ctx, { filename: 'previews.js' })
  vm.runInContext(read(join(PAGE, 'app.js')), ctx, { filename: 'app.js' })
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)) // 等 fetch → init
  timers.forEach((fn) => fn()) // 地址栏带 ?step= 时，等推荐读完再跳到那一步
  const el = (id) => document.getElementById(id)
  const click = async (id, dataset = {}) => {
    const target = { dataset, closest: (sel) => sel.startsWith('[data-') ? target : null }
    el(id).handlers.click({ target })
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
  }
  return { el, ctx, click, posted }
}

/** 空白起步写的 recommendations.json：没有 kb、没有 wants，复述只有两块 */
function blankRec() {
  const r = copy(EXAMPLE)
  delete r.kb
  delete r.wants
  r.profile = [
    { id: 'who', title: '你是谁、做什么', text: '王姐，开一家社区烘焙店，3 个人。', sources: ['这次对话'] },
    { id: 'cares', title: '你每天最在意的', text: '早上先看今天要交的订单。', sources: ['这次对话'] },
  ]
  r.notes = [{ id: 'nokb', level: 'info', text: '还没有知识库：先用起来，以后说“工作台接上我的知识库”。', sources: ['这次对话'] }]
  return r
}

test('有知识库：第一步那句开场白不动（还是“从你的知识库里读到的”），第二步显示“最想先看到”', async () => {
  const html = read(join(PAGE, 'index.html'))
  assert.match(html, /<p class="lead" id="lead0">下面是我从你的知识库里读到的/)
  assert.match(html, /<div class="wants" id="wantsBox">/)
  const { el } = await openPage(EXAMPLE)
  assert.equal(el('lead0').textContent, '', '有知识库时不改这句')
  assert.match(el('readSide').innerHTML, /资料概览/)
  assert.match(el('readSide').innerHTML, /个文件/)
  assert.doesNotMatch(el('readSide').innerHTML, /分钟/)
  assert.doesNotMatch(el('readSide').innerHTML, /我读了什么|分钟/)
  assert.equal(el('wantsBox').hidden, false)
  assert.match(el('wants').innerHTML, /data-want="follow"/)
})

test('空白起步（没有 kb）：开场白改成“你刚才在对话里说的”；没有 wants 时不显示“最想先看到”那一行', async () => {
  const { el } = await openPage(blankRec())
  assert.match(el('lead0').textContent, /^下面是你刚才在对话里说的/)
  assert.ok(!/知识库里读到/.test(el('lead0').textContent))
  assert.match(el('readSide').innerHTML, /还没有知识库/)
  assert.equal(el('wantsBox').hidden, true)
  assert.equal(el('wants').innerHTML, '')
})

test('空白起步但写了 wants（用四句话的第 3 句生成）：照样显示', async () => {
  const r = blankRec()
  r.wants = [{ id: 'orders', label: '今天要交的订单', selected: true, module: 'tasks' }]
  const { el } = await openPage(r)
  assert.equal(el('wantsBox').hidden, false)
  assert.match(el('wants').innerHTML, /今天要交的订单/)
})

test('要接数据的模块标“稍后接数据”，不按课程节奏写“明天”', async () => {
  // 示例里的经营看板、内容中心 2026-10-13 起不在搭建时选（以后走立项对焦加），这里自己造一个要接数据的模块
  const r = copy(EXAMPLE)
  Object.assign(r.modules.find((m) => m.id === 'projects'), { status: 'later', needs: '项目表格' })
  const { el } = await openPage(r, '?step=1&active=projects')
  assert.match(el('modList').innerHTML, /稍后接数据/)
  assert.ok(!/明天接数据/.test(el('modList').innerHTML))
  assert.match(el('modDetail').innerHTML, /稍后接数据/)
})

test('旧推荐的时间和自动开关不能授权：新确认默认手动，无需回答时间', async () => {
  const r = copy(EXAMPLE)
  r.schedule.boot = { question: '你的电脑一般几点开着？', options: [{ id: 'random', label: '不一定' }], default: 'random' } // 旧推荐里有这一问
  r.schedule.mode = 'reminders'
  r.schedule.autostart_enabled = true
  r.auto.push({ label: '提醒', value: '浏览器和系统通知都开' }, { label: '开机自动启动', value: '自动启动' })
  const { el, click, posted } = await openPage(r)
  assert.equal(el('qView').hidden, true)
  assert.equal(el('qAutostart').hidden, true)
  assert.ok(!/系统通知都开|自动启动/.test(el('auto').innerHTML))
  for (let i = 0; i < 4; i++) await click('next')
  assert.equal(posted.length, 1)
  assert.equal(posted[0].schema, 'boss-workbench-confirm/2')
  assert.deepEqual(posted[0].schedule, { mode: 'manual', notifications_enabled: false, autostart_enabled: false, boot: null, view: null, prepare_at: null, notify_at: null, plan: '手动打开、不提醒、不自启' })
  assert.deepEqual(posted[0].modules.map(m => m.id), r.modules.filter(m => m.selected || m.locked).map(m => m.id))
  assert.equal(posted[0].theme, r.themes.find(t => t.recommended).id)
  assert.match(el('doneOpen').textContent, /不需要允许通知/)
})

test('实际选择开启提醒保留自启关闭，并保留模块、配色和补充', async () => {
  const { el, click, posted } = await openPage(EXAMPLE)
  el('extra').value = '周末先不导入数据'
  await click('modList', { toggle: 'clients' })   // 业务模块能取消
  await click('modList', { toggle: 'projects' })  // 基础版点了也不取消
  await click('themes', { theme: 'wood' })
  for (let i = 0; i < 3; i++) await click('next')
  await click('qMode', { mode: 'reminders' })
  await click('qView', { view: '0900' })
  assert.equal(el('qView').hidden, false)
  assert.equal(el('qAutostart').hidden, false)
  assert.match(el('plan').innerHTML, /工作台服务正在运行/)
  assert.ok(!/开机后会自动补|每天.*整理好/.test(el('plan').innerHTML))
  await click('next')
  assert.equal(posted[0].schedule.notifications_enabled, true)
  assert.equal(posted[0].schedule.autostart_enabled, false)
  assert.equal(posted[0].schedule.notify_at, '09:00')
  assert.equal(posted[0].schedule.prepare_at, null)
  assert.equal(posted[0].theme, 'wood')
  assert.equal(posted[0].extra, '周末先不导入数据')
  assert.ok(!posted[0].modules.some(m => m.id === 'clients'))
  assert.ok(posted[0].modules.some(m => m.id === 'projects'), '基础版（项目）一定在')
})

test('只有单独点击才开自启；改回手动后再次开启提醒不会恢复旧自启', async () => {
  const { click, posted } = await openPage(EXAMPLE, '?step=3')
  await click('qMode', { mode: 'reminders' })
  await click('qAutostart', { autostart: 'on' })
  await click('next')
  assert.equal(posted[0].schedule.autostart_enabled, true)
  const second = await openPage(EXAMPLE, '?step=3')
  await second.click('qMode', { mode: 'reminders' })
  await second.click('qAutostart', { autostart: 'on' })
  await second.click('qMode', { mode: 'manual' })
  await second.click('qMode', { mode: 'reminders' })
  await second.click('qView', { view: 'boot' })
  await second.click('next')
  assert.equal(second.posted[0].schedule.autostart_enabled, false)
  assert.equal(second.posted[0].schedule.notify_at, null)
  assert.equal(second.posted[0].schedule.notifications_enabled, true, '空时间是服务启动后提醒，不能作为关闭')
})

test('内容模块预览：创作对话那两句是通用的，不带示例店的茶', () => {
  const ctx = { console }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(read(join(PAGE, 'previews.js')), ctx)
  const mod = { id: 'content', name: '内容', preview: { kind: 'content', topics: ['今天做什么面包'], phone: { cover: '早上 7 点', title: '出炉', text: '…', tags: '#面包' } } }
  const html = ctx.Previews.render(mod, [mod], { palette: {} }, { boss: '王姐' })
  assert.match(html, /今天做什么面包/)
  assert.ok(!/岩茶|白茶|泡茶/.test(html), '固定的对话示例里不该有示例店的茶')
})

test('页面源码里没有课程说法', () => {
  for (const f of ['app.js', 'previews.js', 'index.html']) {
    const src = read(join(PAGE, f))
    for (const w of ['课程', '课上', '课后', '讲师', '学员', '明天讲', '明天接数据']) assert.ok(!src.includes(w), `${f} 里还有“${w}”`)
  }
})

test('示例 recommendations.json：kb 一节一个数都不变（示例库对账要比），确认页需要的几块都在', () => {
  assert.deepEqual(EXAMPLE.kb, {
    files: 98, minutes: 2, entry: 'AGENTS.md',
    layers: [
      { name: '02-关于我', count: 5 }, { name: '03-生意', count: 12 }, { name: '04-客户（10 位）', count: 13 },
      { name: '05-方法与判断', count: 14 }, { name: '06-项目（3 个）', count: 5 }, { name: '10-渠道与经营', count: 8 },
      { name: '11-内容与作品', count: 17 }, { name: '00-收件箱（待整理）', count: 4 },
    ],
  })
  for (const k of ['boss', 'profile', 'modules', 'themes', 'schedule']) assert.ok(EXAMPLE[k], `缺 ${k}`)
  assert.equal(EXAMPLE.themes.length, 5, '五套配色只在这份例子里有，不能少')
  assert.ok(!JSON.stringify(EXAMPLE).includes('课程'), '例子里不该有“课程”')
})
