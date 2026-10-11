// 数据源与导入模块的字典和时间写法（不放组件，方便页面热更新）。归属：数据源与导入模块
import {
  BookHeart, BookOpen, CalendarClock, Clapperboard, FileSpreadsheet, NotebookPen, Rss, ShoppingBag, Sparkles, Store, Table2, Video, type LucideIcon,
} from 'lucide-react'
import { NAV } from '@/app/nav'
import { todayStr, addDays, shortDate } from '@/lib/format'
import type { FieldKey } from './types'

/** 导入的三个子页面（简单导航时显示在页头） */
export const IMPORT_TABS = NAV.find((n) => n.key === 'imports')?.children ?? []

export const FIELD_LABEL: Record<FieldKey, string> = {
  date: '日期', channel: '渠道', gmv: '成交额', orders: '订单数', visitors: '访客数', refund_amount: '退款金额', refund_orders: '退款单数',
  ad_spend: '推广花费', ad_gmv: '推广成交额', new_buyers: '新客数', old_buyers: '老客数',
}
export const CHANNEL_NAME: Record<string, string> = { douyin: '抖店', tmall: '天猫', xhs: '小红书店', wechat: '视频号小店', store: '门店' }
export const MONEY: FieldKey[] = ['gmv', 'refund_amount', 'ad_spend', 'ad_gmv']

/** 渠道图标：和侧栏“经营”下面那一组一样（app/nav.ts） */
const navIcon = (key: string) => NAV.find((n) => n.key === key)?.icon
export const CHANNEL_ICON: Record<string, LucideIcon> = {
  douyin: navIcon('ch-douyin') ?? Clapperboard, tmall: navIcon('ch-tmall') ?? ShoppingBag, xhs: navIcon('ch-xhs') ?? BookHeart,
  wechat: navIcon('ch-wechat') ?? Video, store: navIcon('ch-store') ?? Store,
}
/** 数据源、规则用哪个图标：经营渠道用渠道图标，小红书笔记用内容图标，其余按方式 */
export function iconOf(x: { channel_id?: string | null; source_id?: string | null; id?: string; way?: string; platform?: string }): LucideIcon {
  if (x.channel_id && CHANNEL_ICON[x.channel_id]) return CHANNEL_ICON[x.channel_id]
  if (x.source_id === 'src_xhs_notes' || x.id === 'src_xhs_notes' || x.platform === '小红书') return navIcon('content') ?? NotebookPen
  if (x.platform === '飞书多维表格') return Table2
  return (x.way && WAY_ICON[x.way]) || FileSpreadsheet
}

/** 2026-10-27T07:20 → “今天 07:20”“昨天 22:00”“10/22 08:35”（表格单元格这类窄地方用） */
export function when(stamp?: string | null) {
  if (!stamp) return '—'
  const d = stamp.slice(0, 10)
  const t = stamp.slice(11, 16)
  const day = d === todayStr() ? '今天' : d === addDays(todayStr(), -1) ? '昨天' : d === addDays(todayStr(), 1) ? '明天' : `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  return t ? `${day} ${t}` : day
}
/** 指标卡、注释、抽屉标题行用“10月26日”；表格里用 10/26 */
export const mdOf = (d?: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—')
export const spanOf = (a?: string | null, b?: string | null) => (a && b && a !== b ? `${mdOf(a)}—${mdOf(b)}` : mdOf(b ?? a))
export const fullOf = (d?: string | null) => (d ? shortDate(d) : '—')
export const fullSpan = (a?: string | null, b?: string | null) => (a && b && a !== b ? `${shortDate(a)}—${shortDate(b)}` : fullOf(b ?? a))
/** 今天 / 昨天 / 10月25日（按天分组的标题） */
export function dayTitle(d: string) {
  if (d === todayStr()) return '今天'
  if (d === addDays(todayStr(), -1)) return '昨天'
  return shortDate(d)
}

export const WAY_ICON: Record<string, LucideIcon> = { 导入文件: FileSpreadsheet, 飞书多维表格: Table2, 飞书日历: CalendarClock, 本地文件: BookOpen, 'RSS 订阅': Rss, 定时任务: Sparkles }

/** 人点过头的列：“你确认的 · 10月27日”“阿杰确认的 · 9月20日” */
export const confirmedBy = (by?: string, at?: string) => (by ? `${by}确认的${at ? ` · ${shortDate(at)}` : ''}` : null)

/** 规则文件的路径给人看：不写 .json */
export const rulePath = (p?: string | null) => (p ? p.replace(/\.json$/, '') : '—')

/** 谁导的：网页上点的写“你” */
export const actorText = (a?: string | null) => (a === '网页' ? '你' : a ?? '')
