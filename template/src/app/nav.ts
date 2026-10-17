// 菜单的唯一来源：简单 / 复杂 / 双层 / 顶部四种导航、手机底栏和“更多”、汉堡菜单、全局搜索都从这里生成。
// 加一个模块 = 在这里加一项（写上 section：放进哪个分区；module：归哪个模块开关）+ 在 router.tsx 登记页面。
// 外壳不直接用 NAV / SECTIONS：用 useNav()（nav-sections.ts），模块开关关掉的项不出现，空了的分区跟着不显示。
//
// 2026-10-13 改成“分区 + 二级分组”。三层各管一件事，不嵌第四层：
//   分区（section）今日 / 客户 / 经营 / 内容 / 数据 / 资料。复杂导航顶栏的页签、顶部导航的下拉、简单导航的分段都是它。
//                  设置、组件规范在“系统”分区，不占顶栏，从头像菜单进。一个分区的模块都拿掉了，这个分区自动不显示。
//   页面           左栏只列当前分区的页面。页面可以再分组，组名是不可点的小标题：写 sub（比如经营里的“渠道”）；
//                  有子页面（children）的模块，模块名就是组名，子页面直接列在组里（不写 sub 时）。
//   页内 Tab       只切换当前页的看法（表格 / 看板、月 / 周），不跳到别的页面。
// 当前在哪一页由 resolveNav 统一算（地址最长的那项优先，全站只亮一项），外壳不要自己比地址。
import {
  BellRing, BookHeart, BookOpen, CalendarDays, ChartLine, ChartNoAxesCombined, Clapperboard, Database, FileCog, FileUp, FolderKanban,
  HandCoins, HeartHandshake, History, Inbox, LayoutDashboard, LayoutGrid, ListChecks, ListTodo, NotebookPen, NotebookText, Palette, PenLine,
  ScanText, Settings, ShoppingBag, SquareKanban, Store, Sun, Users, Video, type LucideIcon,
} from 'lucide-react'
import type { Overview } from '@/lib/types'

/** 一级分区。系统不占顶栏，从头像菜单进 */
export type NavSectionKey = '今日' | '客户' | '经营' | '内容' | '数据' | '资料' | '系统'
/** 模块的一个子页面。icon 不写就用模块的图标 */
export type NavChild = { to: string; label: string; icon?: LucideIcon; end?: boolean }
export type NavItem = {
  key: string; to: string; label: string; short?: string; icon: LucideIcon
  /** 放进哪个分区 */
  section: NavSectionKey
  /** 二级分组（不可点的小标题）；同一分区里挨着的同名项并成一组。不写 = 不分组；有 children 的模块不写时，模块名就是组名 */
  sub?: string
  /** 模块的子页面：左栏、下拉、“更多”里每个子页面各占一行；简单导航只列模块，子页面用页内的 SubTabs */
  children?: NavChild[]
  badge?: (o: Overview) => number | undefined
  tone?: 'warn' | 'quiet'
  /** 角标已经算在哪一项里（渠道的异常已算进经营汇总），分区合计时不重复加 */
  countedIn?: string
  /** 归哪个模块开关（id 见 shared/modules.ts；程序里没有模块开关时不起作用）。关掉的模块，它的菜单项不出现 */
  module?: string
}

/** 某个渠道的经营异常条数（菜单角标用） */
const channelAlerts = (id: string) => (o: Overview) => o.alerts?.filter((a) => a.module === 'biz' && a.channel_id === id).length || undefined

export const NAV: NavItem[] = [
  // 今日：首页 + 每天用的几页，平铺不分组
  { key: 'today', to: '/', label: '今日', icon: LayoutDashboard, section: '今日', module: 'today' },
  { key: 'calendar', to: '/calendar', label: '日程', icon: CalendarDays, section: '今日', module: 'tasks', badge: (o) => o.events.length || undefined, tone: 'quiet' },
  { key: 'todos', to: '/todos', label: '待办', icon: ListChecks, section: '今日', module: 'tasks', badge: (o) => o.todos.today.length || undefined },
  { key: 'projects', to: '/projects', label: '项目', icon: FolderKanban, section: '今日', module: 'projects', badge: (o) => o.risks.length || undefined, tone: 'warn' },
  { key: 'inbox', to: '/inbox', label: '收件箱', icon: Inbox, section: '今日', module: 'inbox' },
  // 提醒（10-12 加）：服务端按规则算出来的提醒，角标是没读的条数
  { key: 'reminders', to: '/reminders', label: '提醒', icon: BellRing, section: '今日', module: 'reminders', badge: (o) => o.reminders_unread || undefined },

  {
    key: 'clients', to: '/clients', label: '客户与跟进', short: '客户', icon: Users, section: '客户', module: 'clients',
    children: [
      { to: '/clients', label: '客户列表', icon: Users, end: true }, { to: '/clients/pipeline', label: '跟进看板', icon: SquareKanban },
      { to: '/clients/care', label: '关怀与回访', icon: HeartHandshake }, { to: '/clients/extract', label: '新材料提取', icon: ScanText },
      { to: '/clients/follow', label: '跟进清单', icon: ListTodo }, { to: '/clients/receivables', label: '应收款', icon: HandCoins },
    ],
    badge: (o) => o.follow.dueCount || undefined, tone: 'warn',
  },

  { key: 'biz', to: '/biz', label: '经营汇总', short: '经营', icon: ChartNoAxesCombined, section: '经营', module: 'biz', badge: (o) => o.alerts?.filter((a) => a.module === 'biz').length || undefined, tone: 'warn' },
  { key: 'ch-douyin', to: '/channel/douyin', label: '抖店', icon: Clapperboard, section: '经营', module: 'biz', sub: '渠道', badge: channelAlerts('douyin'), tone: 'warn', countedIn: 'biz' },
  { key: 'ch-tmall', to: '/channel/tmall', label: '天猫', icon: ShoppingBag, section: '经营', module: 'biz', sub: '渠道', badge: channelAlerts('tmall'), tone: 'warn', countedIn: 'biz' },
  { key: 'ch-xhs', to: '/channel/xhs', label: '小红书店', icon: BookHeart, section: '经营', module: 'biz', sub: '渠道', badge: channelAlerts('xhs'), tone: 'warn', countedIn: 'biz' },
  { key: 'ch-wechat', to: '/channel/wechat', label: '视频号小店', icon: Video, section: '经营', module: 'biz', sub: '渠道', badge: channelAlerts('wechat'), tone: 'warn', countedIn: 'biz' },
  { key: 'ch-store', to: '/channel/store', label: '门店', icon: Store, section: '经营', module: 'biz', sub: '渠道', badge: channelAlerts('store'), tone: 'warn', countedIn: 'biz' },

  {
    key: 'content', to: '/content', label: '小红书', short: '内容', icon: NotebookPen, section: '内容', module: 'content',
    children: [
      { to: '/content', label: '今天', icon: Sun, end: true }, { to: '/content/pieces', label: '内容', icon: LayoutGrid }, { to: '/content/studio', label: '创作', icon: PenLine },
      { to: '/content/data', label: '数据', icon: ChartLine }, { to: '/content/review', label: '复盘', icon: NotebookText },
    ],
  },

  // 数据源与导入：经营和小红书的数都从这里进来，单独一个“数据”分区（2026-10-13 定，不再挂在经营下面）
  { key: 'sources', to: '/sources', label: '数据源', icon: Database, section: '数据', module: 'data', badge: (o) => o.alerts?.filter((a) => a.module === 'data').length || undefined, tone: 'warn' },
  {
    key: 'imports', to: '/imports', label: '导入', icon: FileUp, section: '数据', module: 'data',
    children: [{ to: '/imports', label: '导入文件', icon: FileUp, end: true }, { to: '/imports/history', label: '导入记录', icon: History }, { to: '/imports/rules', label: '导入规则', icon: FileCog }],
  },

  { key: 'kb', to: '/kb', label: '知识库', icon: BookOpen, section: '资料', module: 'kb' },

  { key: 'settings', to: '/settings', label: '设置', icon: Settings, section: '系统', module: 'settings' },
  { key: 'design', to: '/design', label: '组件规范', icon: Palette, section: '系统', module: 'design' },
]

/** 手机底栏的 4 个：每个分区一个入口（今日 / 客户 / 经营 / 内容）。拿掉了的模块自动跳过，空位先给还没有入口的分区（见 mobileTabs） */
export const MOBILE_TABS = ['today', 'clients', 'biz', 'content']

/** 模块开关打开着的菜单项：没写 module 的照常显示（shared/modules.ts 定义模块；网页里用 nav-sections.ts 的 useNav） */
export const navWithModules = (on: (id: string) => boolean, nav: NavItem[] = NAV): NavItem[] => nav.filter((n) => !n.module || on(n.module))

// ───────────────────────────── 分区、二级分组、页面

/** 分区的顺序、图标；hidden = 不占顶栏（系统） */
const SECTION_META: { key: NavSectionKey; icon: LucideIcon; hidden?: boolean }[] = [
  { key: '今日', icon: LayoutDashboard }, { key: '客户', icon: Users }, { key: '经营', icon: ChartNoAxesCombined },
  { key: '内容', icon: NotebookPen }, { key: '数据', icon: Database }, { key: '资料', icon: BookOpen }, { key: '系统', icon: Settings, hidden: true },
]

/** 一个页面：没有子页面的模块就是它自己；有子页面的模块，每个子页面一个 */
export type NavPage = { id: string; to: string; label: string; icon: LucideIcon; end?: boolean; item: NavItem }
/** 分区里的一个二级分组；label 为 null 的组没有小标题 */
export type NavGroup = { label: string | null; items: NavItem[]; pages: NavPage[] }
export type NavSection = { key: NavSectionKey; label: string; icon: LucideIcon; to: string; items: NavItem[]; groups: NavGroup[]; pages: NavPage[]; hidden?: boolean }

export function pagesOf(item: NavItem): NavPage[] {
  if (!item.children?.length) return [{ id: item.key, to: item.to, label: item.label, icon: item.icon, end: item.to === '/', item }]
  return item.children.map((c) => ({ id: `${item.key}:${c.to}`, to: c.to, label: c.label, icon: c.icon ?? item.icon, end: c.end, item }))
}

const groupLabel = (n: NavItem) => n.sub ?? (n.children?.length ? n.label : null)

/** 按菜单顺序把挨着的同组项并成二级分组 */
function groupsOf(items: NavItem[]): NavGroup[] {
  const out: NavGroup[] = []
  for (const n of items) {
    const label = groupLabel(n)
    const last = out[out.length - 1]
    if (last && last.label === label) { last.items.push(n); last.pages.push(...pagesOf(n)) }
    else out.push({ label, items: [n], pages: pagesOf(n) })
  }
  return out
}

/** 由菜单表算出分区：没有模块的分区不出现 */
export function sectionsOf(nav: NavItem[]): NavSection[] {
  return SECTION_META.map(({ key, icon, hidden }) => {
    const items = nav.filter((n) => n.section === key)
    const groups = groupsOf(items)
    const pages = groups.flatMap((g) => g.pages)
    return { key, label: key, icon, to: pages[0]?.to ?? '/', items, groups, pages, ...(hidden ? { hidden: true } : {}) }
  }).filter((s) => s.items.length > 0)
}

export const SECTIONS = sectionsOf(NAV)
/** 顶栏、顶部导航、简单导航的分段：不含系统 */
export const TOP_SECTIONS = SECTIONS.filter((s) => !s.hidden)

// ───────────────────────────── 当前位置

export type NavResolution = { section?: NavSection; page?: NavPage }

/** 匹配得分：-1 = 不匹配；地址完全相同多 1 分；'/' 只认首页本身；end = 只认自己，不认下一层 */
function score(pathname: string, to: string, end?: boolean) {
  if (to === '/') return pathname === '/' ? 1 : -1
  if (pathname === to) return to.length + 1
  return !end && pathname.startsWith(`${to}/`) ? to.length : -1
}

/** 当前地址落在哪个分区、哪一页。全站只选一页（得分最高的，同分取菜单里靠前的）；
 *  详情页、老地址不在任何页面上时，落在所属模块的首页（客户详情 /clients/xxx → 客户列表）；再找不到就按第一段地址归到分区 */
export function resolveNav(pathname: string, sections: NavSection[] = SECTIONS): NavResolution {
  const pages = sections.flatMap((s) => s.pages)
  let page: NavPage | undefined
  let best = -1
  for (const p of pages) {
    const s = score(pathname, p.to, p.end)
    if (s > best) { best = s; page = p }
  }
  if (!page) {
    let item: NavItem | undefined
    let b = -1
    for (const s of sections) for (const n of s.items) {
      const v = score(pathname, n.to)
      if (v > b) { b = v; item = n }
    }
    const home = item
    page = home && pages.find((p) => p.item === home && p.to === home.to)
  }
  const hit = page
  const first = pathname.split('/').filter(Boolean)[0]
  const section = hit ? sections.find((s) => s.key === hit.item.section)
    : first ? sections.find((s) => s.items.some((n) => n.to.split('/').filter(Boolean)[0] === first)) : undefined
  return { section, page: hit }
}

/** 分区里“要你处理”（warn）的数加起来；已经算在别的项里的（countedIn）不重复加 */
export function sectionCount(items: NavItem[], o?: Overview) {
  if (!o) return 0
  const keys = new Set(items.map((n) => n.key))
  return items.reduce((sum, n) => sum + (n.tone === 'warn' && !(n.countedIn && keys.has(n.countedIn)) ? n.badge?.(o) ?? 0 : 0), 0)
}

/** 组就是一个有子页面的模块（客户与跟进、小红书）时返回这个模块：它的角标挂在组名上 */
export const groupModule = (g: NavGroup) => (g.items.length === 1 && g.items[0].children?.length ? g.items[0] : undefined)
/** 页面那一行的角标：有子页面的模块，角标挂在组名上（groupModule），子页面不重复 */
export const pageBadge = (p: NavPage, o?: Overview) => (o && !p.item.children?.length ? p.item.badge?.(o) : undefined)

/** 搜索、提示里的位置名：“客户 › 跟进看板”；分区名和页面名相同（今日）只写一次 */
export function pageTrail(p: NavPage) {
  return p.item.section === p.label ? p.label : `${p.item.section} › ${p.label}`
}

/**
 * 手机底栏：MOBILE_TABS 里还在的项；不够 4 个时先给还没有入口的分区（按分区顺序，取分区的第一项），
 * 还不够再按菜单顺序补（系统除外）；最后按分区顺序排。这样拿掉一个模块，空位不会都落到今日分区里。
 */
export function mobileTabs(nav: NavItem[] = NAV, keys: string[] = MOBILE_TABS): NavItem[] {
  const picked = keys.map((k) => nav.find((n) => n.key === k)).filter((n): n is NavItem => !!n).slice(0, 4)
  for (const s of sectionsOf(nav)) {
    if (picked.length >= 4) break
    if (!s.hidden && !picked.some((n) => n.section === s.key)) picked.push(s.items[0])
  }
  for (const n of nav) {
    if (picked.length >= 4) break
    if (n.section !== '系统' && !picked.includes(n)) picked.push(n)
  }
  const order = (n: NavItem) => SECTION_META.findIndex((m) => m.key === n.section) * 1000 + nav.indexOf(n)
  return picked.sort((a, b) => order(a) - order(b))
}

/** 底栏哪个亮：当前页所在的模块在底栏就亮它；不在，就亮同一分区的第一个（在“渠道 · 天猫”时亮“经营”）；都不是返回 undefined（亮“更多”） */
export function activeTab(tabs: NavItem[], r: NavResolution): NavItem | undefined {
  return tabs.find((n) => n === r.page?.item) ?? tabs.find((n) => n.section === r.section?.key)
}
