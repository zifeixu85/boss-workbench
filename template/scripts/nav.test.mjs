// 菜单（src/app/nav.ts）的测试：分区怎么分、当前在哪一页、模块拿掉 / 关掉以后分区自动不显示、角标合计、手机底栏（按分区补位）、外壳。
// 运行：npm test（或 node --test scripts/nav.test.mjs）。nav.ts 是纯数据和纯函数，Node 直接读 .ts。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { NAV, SECTIONS, TOP_SECTIONS, activeTab, mobileTabs, navWithModules, pageTrail, resolveNav, sectionCount, sectionsOf } from '../src/app/nav.ts'

const here = (path) => {
  const r = resolveNav(path)
  return [r.section?.key, r.page ? pageTrail(r.page) : undefined]
}

test('五个分区按顺序排，系统不占顶栏', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['今日', '客户', '经营', '内容', '数据', '资料', '系统'])
  assert.deepEqual(TOP_SECTIONS.map((s) => s.key), ['今日', '客户', '经营', '内容', '数据', '资料'])
  assert.deepEqual(SECTIONS.find((s) => s.key === '经营').groups.map((g) => g.label), [null, '渠道'])
  // 数据源与导入单独一个分区（2026-10-13 A梦 定）：数据源不分组，导入的子页面以「导入」为组名
  assert.deepEqual(SECTIONS.find((s) => s.key === '数据').groups.map((g) => g.label), [null, '导入'])
  assert.deepEqual(SECTIONS.find((s) => s.key === '客户').groups.map((g) => g.label), ['客户与跟进'])
  // 分区入口 = 第一页
  assert.deepEqual(TOP_SECTIONS.map((s) => s.to), ['/', '/clients', '/biz', '/content', '/sources', '/kb'])
})

test('每个地址只亮一页：子页面、详情页、老地址都落对', () => {
  assert.deepEqual(here('/'), ['今日', '今日'])
  assert.deepEqual(here('/todos'), ['今日', '今日 › 待办'])
  assert.deepEqual(here('/clients'), ['客户', '客户 › 客户列表'])
  assert.deepEqual(here('/clients/pipeline'), ['客户', '客户 › 跟进看板'])
  assert.deepEqual(here('/clients/c_lantuo'), ['客户', '客户 › 客户列表'])
  assert.deepEqual(here('/clients/key'), ['客户', '客户 › 客户列表'])
  assert.deepEqual(here('/channel/tmall'), ['经营', '经营 › 天猫'])
  assert.deepEqual(here('/channel/nope'), ['经营', undefined])
  assert.deepEqual(here('/imports'), ['数据', '数据 › 导入文件'])
  assert.deepEqual(here('/imports/rules'), ['数据', '数据 › 导入规则'])
  assert.deepEqual(here('/content'), ['内容', '内容 › 今天'])
  assert.deepEqual(here('/content/studio/p_1'), ['内容', '内容 › 创作'])
  assert.deepEqual(here('/settings'), ['系统', '系统 › 设置'])
  assert.deepEqual(here('/nope'), [undefined, undefined])
})

test('菜单里的每一页都在 router.tsx 登记过', () => {
  const router = readFileSync(new URL('../src/app/router.tsx', import.meta.url), 'utf8')
  // 'channel/:id' 这样带参数的登记，参数那一段算通配；'*'（找不到页面）不算
  const routes = [...router.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '*' && p !== '/')
    .map((p) => new RegExp(`^/${p.replace(/:[^/]+/g, '[^/]+')}$`))
  const registered = (to) => to === '/' || routes.some((re) => re.test(to.split('?')[0]))
  const missing = SECTIONS.flatMap((s) => s.pages).map((p) => p.to).filter((to) => !registered(to))
  assert.deepEqual(missing, [])
})

test('模块拿掉以后，空了的分区自动不显示（基础版：只有今日和资料）', () => {
  const basic = NAV.filter((n) => ['今日', '资料'].includes(n.section) || n.key === 'settings')
  const sections = sectionsOf(basic)
  assert.deepEqual(sections.map((s) => s.key), ['今日', '资料', '系统'])
  assert.equal(resolveNav('/channel/tmall', sections).section, undefined)
  // 底栏补满 4 个：先给每个还没有入口的分区一个（资料 → 知识库），再按菜单顺序补；按分区排
  assert.deepEqual(mobileTabs(basic).map((n) => n.key), ['today', 'calendar', 'todos', 'kb'])
})

test('手机底栏补位按分区：拿掉客户与跟进，空出的位置给还没有入口的分区（按分区顺序，这里是数据），每个分区最多先占一个', () => {
  const noClients = NAV.filter((n) => n.key !== 'clients')
  const tabs = mobileTabs(noClients)
  assert.deepEqual(tabs.map((n) => n.key), ['today', 'biz', 'content', 'sources'])
  assert.deepEqual(tabs.map((n) => n.section), ['今日', '经营', '内容', '数据'])
  // 只开今日：今日分区的页面按菜单顺序补满
  assert.deepEqual(mobileTabs(NAV.filter((n) => n.section === '今日')).map((n) => n.key), ['today', 'calendar', 'todos', 'projects'])
})

test('手机底栏的名字：今日 / 客户 / 经营 / 内容（和设置页、组件规范页写的一样）', () => {
  assert.deepEqual(mobileTabs().map((n) => n.short ?? n.label), ['今日', '客户', '经营', '内容'])
})

test('模块开关：关掉的模块从菜单里收起，分区空了就不显示（菜单项的 module 指向模块 id）', () => {
  // 每一项都写了 module（今日、设置一定开着）
  assert.deepEqual(NAV.filter((n) => !n.module).map((n) => n.key), [])
  const off = new Set(['biz', 'data'])
  const nav = navWithModules((id) => !off.has(id))
  const sections = sectionsOf(nav)
  assert.deepEqual(sections.map((s) => s.key), ['今日', '客户', '内容', '资料', '系统'])
  assert.equal(resolveNav('/channel/tmall', sections).section, undefined)
  assert.deepEqual(mobileTabs(nav).map((n) => n.key), ['today', 'clients', 'content', 'kb'])
  // 全开 = 原样
  assert.equal(navWithModules(() => true).length, NAV.length)
})

test('菜单项的 module 都是模块开关里登记过的 id（有 shared/modules.ts 时）', async () => {
  const file = new URL('../shared/modules.ts', import.meta.url)
  if (!existsSync(file)) return
  const { MODULE_IDS } = await import(file.href)
  assert.deepEqual(NAV.filter((n) => !MODULE_IDS.includes(n.module)).map((n) => n.key), [])
})

test('分区角标：渠道的异常已算进经营汇总，不重复加', () => {
  const o = {
    events: [], todos: { today: [] }, risks: [{}, {}], follow: { dueCount: 10 }, reminders_unread: 3,
    alerts: [{ module: 'biz', channel_id: 'douyin' }, { module: 'biz', channel_id: 'tmall' }, { module: 'biz', channel_id: null }, { module: 'data', channel_id: null }],
  }
  const count = (key) => sectionCount(SECTIONS.find((s) => s.key === key).items, o)
  assert.equal(count('经营'), 3)
  assert.equal(count('数据'), 1)
  assert.equal(count('客户'), 10)
  assert.equal(count('今日'), 2) // 只有项目风险是 warn；待办、提醒、日程是安静的数
})

test('手机底栏按分区亮：在分区里任何一页都亮这个分区的入口', () => {
  const tabs = mobileTabs()
  assert.deepEqual(tabs.map((n) => n.key), ['today', 'clients', 'biz', 'content'])
  assert.equal(activeTab(tabs, resolveNav('/todos'))?.key, 'today')
  assert.equal(activeTab(tabs, resolveNav('/channel/tmall'))?.key, 'biz')
  // 数据源单独成了「数据」分区（2026-10-13），底栏没有它的入口，和资料一样亮「更多」
  assert.equal(activeTab(tabs, resolveNav('/sources')), undefined)
  assert.equal(activeTab(tabs, resolveNav('/clients/follow'))?.key, 'clients')
  assert.equal(activeTab(tabs, resolveNav('/kb')), undefined)
})

test('外壳：菜单都从 useNav 取（关掉的模块不出现）；复杂导航的铃铛不算“当前页”；图标栏每页一个图标，不靠悬停才看到子页面', () => {
  const read = (name) => readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8')
  for (const name of ['ComplexShell.tsx', 'TopShell.tsx', 'SimpleShell.tsx', 'shell-parts.tsx']) {
    const code = read(name)
    assert.match(code, /useNav\(\)/, name)
    assert.doesNotMatch(code, /\b(TOP_SECTIONS|SECTIONS)\b/, name)
    assert.doesNotMatch(code, /resolveNav\(pathname\)/, name)
  }
  const complex = read('ComplexShell.tsx')
  assert.doesNotMatch(complex, /NavLink/)
  assert.doesNotMatch(complex, /HoverCard/)
  assert.match(complex, /g\.pages\.map/)
})
