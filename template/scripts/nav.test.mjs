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

test('五个分区按顺序排，系统不占顶栏（“内容”分区留给装进来的模块，没装就不显示）', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['今日', '客户', '经营', '数据', '资料', '系统'])
  assert.deepEqual(TOP_SECTIONS.map((s) => s.key), ['今日', '客户', '经营', '数据', '资料'])
  assert.deepEqual(SECTIONS.find((s) => s.key === '经营').groups.map((g) => g.label), [null, '渠道'])
  // 数据源与导入单独一个分区（2026-10-13 定）：数据源不分组，导入的子页面以「导入」为组名
  assert.deepEqual(SECTIONS.find((s) => s.key === '数据').groups.map((g) => g.label), [null, '导入'])
  assert.deepEqual(SECTIONS.find((s) => s.key === '客户').groups.map((g) => g.label), ['客户与跟进'])
  // 分区入口 = 第一页
  assert.deepEqual(TOP_SECTIONS.map((s) => s.to), ['/', '/clients', '/biz', '/sources', '/kb'])
})

test('每个地址只亮一页：子页面、详情页、老地址都落对', () => {
  assert.deepEqual(here('/'), ['今日', '驾驶舱'], '分区编号还是今日，显示成驾驶舱')
  assert.deepEqual(here('/todos'), ['今日', '驾驶舱 › 待办'])
  assert.deepEqual(here('/clients'), ['客户', '客户 › 客户列表'])
  assert.deepEqual(here('/clients/pipeline'), ['客户', '客户 › 跟进看板'])
  assert.deepEqual(here('/clients/c_lantuo'), ['客户', '客户 › 客户列表'])
  assert.deepEqual(here('/clients/key'), ['客户', '客户 › 客户列表'])
  assert.deepEqual(here('/channel/tmall'), ['经营', '经营 › 天猫'])
  assert.deepEqual(here('/channel/nope'), ['经营', undefined])
  assert.deepEqual(here('/imports'), ['数据', '数据 › 导入文件'])
  assert.deepEqual(here('/imports/rules'), ['数据', '数据 › 导入规则'])
  // 基础版不带小红书内容中心（进阶模块，装了才有 /content）
  assert.deepEqual(here('/content'), [undefined, undefined])
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
  assert.deepEqual(mobileTabs(basic).map((n) => n.key), ['today', 'projects', 'inbox', 'kb'])
})

test('手机底栏补位按分区：拿掉客户与跟进，空出的位置给还没有入口的分区（按分区顺序，这里是数据、资料），每个分区最多先占一个', () => {
  const noClients = NAV.filter((n) => n.key !== 'clients')
  const tabs = mobileTabs(noClients)
  assert.deepEqual(tabs.map((n) => n.key), ['today', 'biz', 'sources', 'kb'])
  assert.deepEqual(tabs.map((n) => n.section), ['今日', '经营', '数据', '资料'])
  // 只开今日：今日分区的页面按菜单顺序补满
  assert.deepEqual(mobileTabs(NAV.filter((n) => n.section === '今日')).map((n) => n.key), ['today', 'projects', 'inbox', 'todos'])
})

test('手机底栏的名字：今日 / 客户 / 经营，第四个按分区顺序补（基础版是数据源；装了放在“内容”分区的模块就是它）', () => {
  assert.deepEqual(mobileTabs().map((n) => n.short ?? n.label), ['驾驶舱', '客户', '经营', '数据源'])
  const withContent = [...NAV.slice(0, NAV.findIndex((n) => n.key === 'sources')), { key: 'content', to: '/content', label: '小红书', short: '内容', icon: NAV[0].icon, section: '内容', module: 'xhs' }, ...NAV.slice(NAV.findIndex((n) => n.key === 'sources'))]
  assert.deepEqual(mobileTabs(withContent).map((n) => n.short ?? n.label), ['驾驶舱', '客户', '经营', '内容'])
})

test('模块开关：关掉的模块从菜单里收起，分区空了就不显示（菜单项的 module 指向模块 id）', () => {
  // 每一项都写了 module（今日、设置一定开着）
  assert.deepEqual(NAV.filter((n) => !n.module).map((n) => n.key), [])
  const off = new Set(['biz', 'data'])
  const nav = navWithModules((id) => !off.has(id))
  const sections = sectionsOf(nav)
  assert.deepEqual(sections.map((s) => s.key), ['今日', '客户', '资料', '系统'])
  assert.equal(resolveNav('/channel/tmall', sections).section, undefined)
  assert.deepEqual(mobileTabs(nav).map((n) => n.key), ['today', 'projects', 'clients', 'kb'])
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
  assert.deepEqual(tabs.map((n) => n.key), ['today', 'clients', 'biz', 'sources'])
  assert.equal(activeTab(tabs, resolveNav('/todos'))?.key, 'today')
  assert.equal(activeTab(tabs, resolveNav('/channel/tmall'))?.key, 'biz')
  // 基础版第四个入口是数据源；资料没有入口，亮「更多」
  assert.equal(activeTab(tabs, resolveNav('/sources'))?.key, 'sources')
  assert.equal(activeTab(tabs, resolveNav('/clients/follow'))?.key, 'clients')
  assert.equal(activeTab(tabs, resolveNav('/kb')), undefined)
})

test('外壳：菜单都从 useNav 取（关掉的模块不出现）；复杂导航收起后只放一级菜单，分组悬停弹出子页面；双层导航的图标栏每页一个图标', () => {
  const read = (name) => readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8')
  for (const name of ['ComplexShell.tsx', 'DualShell.tsx', 'TopShell.tsx', 'SimpleShell.tsx', 'shell-parts.tsx']) {
    const code = read(name)
    assert.match(code, /useNav\(\)/, name)
    assert.doesNotMatch(code, /\b(TOP_SECTIONS|SECTIONS)\b/, name)
    assert.doesNotMatch(code, /resolveNav\(pathname\)/, name)
  }
  const complex = read('ComplexShell.tsx')
  assert.doesNotMatch(complex, /NavLink/)
  // A梦 2026-10-17：复杂导航收起后只显示一级菜单（不分组的页面、每个分组各一个图标），分组悬停弹出浮层选子页面，点图标进组里第一页
  assert.match(complex, /HoverCard/)
  assert.match(complex, /to=\{g\.pages\[0\]\.to\}/)
  const dual = read('DualShell.tsx')
  assert.doesNotMatch(dual, /HoverCard/)
  assert.match(dual, /g\.pages\.map/)
})

test('模块运行时给的菜单项（我关注的有几类出几页）：并进对应分区、排在同一模块的固定项后面、key 重复不加；角标只加给没写过的', async () => {
  const { withDynamicNav, withBadges } = await import('../src/app/nav.ts')
  const icon = () => 'I'
  const base = [...NAV.filter((n) => n.section !== '经营'), { key: 'pa-progress', to: '/progress', label: '进展', icon: 'I', section: '我的助理', module: 'pa' }]
  const extra = [
    { key: 'focus-项目', to: '/focus/项目', label: '项目', icon: 'FolderKanban', section: '我关注的', module: 'pa' },
    { key: 'focus-客户', to: '/focus/客户', label: '客户', section: '我关注的', module: 'pa' },
    { key: 'focus-客户', to: '/focus/客户2', label: '重复', section: '我关注的', module: 'pa' },
    { key: 'bad', to: '/x', label: '没有这个分区', section: '乱写', module: 'pa' },
  ]
  const nav = withDynamicNav(base, extra, icon)
  const secs = sectionsOf(nav)
  assert.deepEqual(secs.map((s) => s.key).slice(0, 2), ['今日', '我关注的'], '“我关注的”紧跟在今日后面')
  assert.deepEqual(secs.find((s) => s.key === '我关注的').pages.map((p) => p.label), ['项目', '客户'])
  assert.ok(secs.some((s) => s.key === '我的助理'))
  assert.equal(nav.filter((n) => n.key === 'focus-客户').length, 1)
  assert.equal(nav.some((n) => n.key === 'bad'), false)
  const r = resolveNav('/focus/客户', secs)
  assert.deepEqual([r.section?.key, r.page?.label], ['我关注的', '客户'])
  const withB = withBadges(nav, { 'pa-progress': 3, todos: 9 })
  assert.equal(withB.find((n) => n.key === 'pa-progress').badge({}), 3)
  const todos = withB.find((n) => n.key === 'todos')
  assert.equal(todos.badge, NAV.find((n) => n.key === 'todos').badge, '自己有角标的不被盖掉')
})

test('驾驶舱：待办、日程、提醒收进一组“任务与日程”，首页、项目、收件箱平铺', () => {
  const s = SECTIONS.find((x) => x.key === '今日')
  assert.equal(s.label, '驾驶舱')
  assert.deepEqual(s.groups.map((g) => [g.label, g.items.map((n) => n.label)]), [[null, ['驾驶舱', '项目', '收件箱']], ['任务与日程', ['待办', '日程', '提醒']]])
})
