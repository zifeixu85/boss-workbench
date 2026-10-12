// 菜单的唯一来源：简单导航、复杂导航、顶部导航、手机底栏、全局搜索都从这里生成。
// 加一个模块 = 在这里加一项 + 在 router.tsx 登记页面。
// 注意：两个菜单项的地址不要一个是另一个的前缀（比如 /data 和 /data/imports），否则两项会同时亮；
// 有子页面的模块用 children（客户与跟进、小红书），或者像“经营”那样换一个前缀（/biz 和 /channel/…）。
import {
  BookHeart, BookOpen, CalendarDays, ChartNoAxesCombined, Clapperboard, Database, FileUp, FolderKanban, Inbox, LayoutDashboard,
  ListChecks, NotebookPen, Palette, Settings, ShoppingBag, Store, Users, Video, type LucideIcon,
} from 'lucide-react'
import type { Overview } from '@/lib/types'

export type NavChild = { to: string; label: string; end?: boolean }
export type NavItem = {
  key: string; to: string; label: string; short?: string; icon: LucideIcon; group: NavGroup
  children?: NavChild[]
  badge?: (o: Overview) => number | undefined
  tone?: 'warn' | 'quiet'
}
export type NavGroup = 'main' | '日常' | '客户' | '经营' | '内容' | '数据' | '资料' | '系统'

export const GROUP_LABEL: Record<NavGroup, string | null> = { main: null, 日常: '日常', 客户: '客户', 经营: '经营', 内容: '内容', 数据: '数据', 资料: '资料', 系统: '系统' }

/** 某个渠道的经营异常条数（菜单角标用） */
const channelAlerts = (id: string) => (o: Overview) => o.alerts?.filter((a) => a.module === 'biz' && a.channel_id === id).length || undefined

export const NAV: NavItem[] = [
  { key: 'today', to: '/', label: '今日', icon: LayoutDashboard, group: 'main' },

  { key: 'calendar', to: '/calendar', label: '日程', icon: CalendarDays, group: '日常', badge: (o) => o.events.length || undefined, tone: 'quiet' },
  { key: 'todos', to: '/todos', label: '待办', icon: ListChecks, group: '日常', badge: (o) => o.todos.today.length || undefined },
  { key: 'projects', to: '/projects', label: '项目', icon: FolderKanban, group: '日常', badge: (o) => o.risks.length || undefined, tone: 'warn' },
  { key: 'inbox', to: '/inbox', label: '收件箱', icon: Inbox, group: '日常' },

  {
    key: 'clients', to: '/clients', label: '客户与跟进', short: '客户', icon: Users, group: '客户',
    children: [
      { to: '/clients', label: '客户列表', end: true }, { to: '/clients/pipeline', label: '跟进看板' }, { to: '/clients/care', label: '关怀与回访' },
      { to: '/clients/extract', label: '新材料提取' }, { to: '/clients/follow', label: '跟进清单' }, { to: '/clients/receivables', label: '应收款' },
    ],
    badge: (o) => o.follow.dueCount || undefined, tone: 'warn',
  },

  { key: 'biz', to: '/biz', label: '经营汇总', short: '经营', icon: ChartNoAxesCombined, group: '经营', badge: (o) => o.alerts?.filter((a) => a.module === 'biz').length || undefined, tone: 'warn' },
  { key: 'ch-douyin', to: '/channel/douyin', label: '抖店', icon: Clapperboard, group: '经营', badge: channelAlerts('douyin'), tone: 'warn' },
  { key: 'ch-tmall', to: '/channel/tmall', label: '天猫', icon: ShoppingBag, group: '经营', badge: channelAlerts('tmall'), tone: 'warn' },
  { key: 'ch-xhs', to: '/channel/xhs', label: '小红书店', icon: BookHeart, group: '经营', badge: channelAlerts('xhs'), tone: 'warn' },
  { key: 'ch-wechat', to: '/channel/wechat', label: '视频号小店', icon: Video, group: '经营', badge: channelAlerts('wechat'), tone: 'warn' },
  { key: 'ch-store', to: '/channel/store', label: '门店', icon: Store, group: '经营', badge: channelAlerts('store'), tone: 'warn' },

  {
    key: 'content', to: '/content', label: '小红书', icon: NotebookPen, group: '内容',
    children: [
      { to: '/content', label: '今天', end: true }, { to: '/content/pieces', label: '内容' }, { to: '/content/studio', label: '创作' },
      { to: '/content/data', label: '数据' }, { to: '/content/review', label: '复盘' },
    ],
  },

  { key: 'sources', to: '/sources', label: '数据源', icon: Database, group: '数据', badge: (o) => o.alerts?.filter((a) => a.module === 'data').length || undefined, tone: 'warn' },
  {
    key: 'imports', to: '/imports', label: '导入', icon: FileUp, group: '数据',
    children: [{ to: '/imports', label: '导入文件', end: true }, { to: '/imports/history', label: '导入记录' }, { to: '/imports/rules', label: '导入规则' }],
  },

  { key: 'kb', to: '/kb', label: '知识库', icon: BookOpen, group: '资料' },

  { key: 'settings', to: '/settings', label: '设置', icon: Settings, group: '系统' },
  { key: 'design', to: '/design', label: '组件规范', icon: Palette, group: '系统' },
]

/** 手机底栏的 4 个：老板每天最常看的 */
export const MOBILE_TABS = ['today', 'biz', 'clients', 'content']

export function navFor(pathname: string) {
  return NAV.slice().sort((a, b) => b.to.length - a.to.length).find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))
}

/** 当前地址是否落在某个菜单项上（不用 NavLink 的函数 className，因为套在 Tooltip 里会被当成字符串） */
export function isActivePath(pathname: string, to: string, end?: boolean) {
  if (to === '/') return pathname === '/'
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}
