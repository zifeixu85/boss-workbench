// 知识库目录的小工具：按名字筛选、找上级文件夹、数文件
import type { KbNode } from '@/lib/types'
import { ago, daysFromToday, NBSP, shortDate } from '@/lib/format'

export type KbFile = { path: string; body: string; updated: string }

/** 文件名或文件夹名里带关键字就留下；文件夹名命中时整个文件夹都留下 */
export function filterTree(nodes: KbNode[], query: string): KbNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  return nodes.flatMap((n): KbNode[] => {
    if (n.name.toLowerCase().includes(q)) return [n]
    if (n.type === 'file') return []
    const children = filterTree(n.children ?? [], query)
    return children.length ? [{ ...n, children }] : []
  })
}

/** 04-客户/企业客户/澜拓科技.md → [04-客户, 04-客户/企业客户] */
export function ancestorsOf(path: string) {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}

export function countFiles(n: KbNode): number {
  return n.type === 'file' ? 1 : (n.children ?? []).reduce((s, c) => s + countFiles(c), 0)
}

export const fileName = (path: string) => (path.split('/').pop() ?? path).replace(/\.md$/, '')
export const folderOf = (path: string) => path.split('/').slice(0, -1).join(' / ')

/** 顶层文件夹放什么：按名字里的关键词认（知识库会按新范式重建，文件夹可能带编号，如“04-客户”） */
export const FOLDER_HINTS: [keyword: string, desc: string][] = [
  ['AI协作', '建库档案、和 AI 的配合方式、工具与账号、常做任务的步骤。Codex 做不熟的事之前先看这里。'],
  ['方法与判断', '报价、接单、售后、关怀、出价、写小红书这些要拿主意的事，怎么做、怎么判断。'],
  ['渠道与经营', '四个平台和门店的档案、数据口径、经营复盘的结论。每天的数在工作台，这里只放口径和结论。'],
  ['持续生长', 'AI 的发现、等你确认的问题、每周复盘。'],
  ['收件箱', '还没整理的新材料：聊天截图、电话纪要、会议记录。整理进客户、项目之前，先放这里。'],
  ['关于我', '你是谁、怎么做事、和 AI 合作的习惯和边界。Codex 每次干活前先看这里。'],
  ['生意', '卖什么、在哪卖、钱从哪来、品牌和口吻、团队分工。'],
  ['客户', '每位客户的长期背景：在意什么、怎么打交道、送礼对象和忌讳。'],
  ['项目', '正在推进的几件大事：想达到什么、关键日期、卡在哪。'],
  ['内容', '小红书账号定位、发过的作品、写作素材。'],
  ['资料', '做法和判断、SOP、话术和常见问题、复盘。'],
  ['原始材料', '原样保存的聊天、纪要、采访记录，只当来源，不直接当结论用。'],
  ['工作台', '工作台自动导出的快照（今日概况、客户现状），给 Codex 和别的对话读，不要在这里改。'],
]
export const hintOf = (name: string) => FOLDER_HINTS.find(([k]) => name.includes(k))?.[1] ?? null

/** 文档“更新于”：知识库文件开头写的是日期（2026-10-25），按天说；没写的用文件修改时间 */
export function updatedText(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return ago(v)
  const n = daysFromToday(v)
  if (n === 0) return '今天'
  if (n === -1) return '昨天'
  if (n < -1 && n > -7) return `${-n}${NBSP}天前`
  return shortDate(v)
}

/** 知识库的地图：旧版是根目录的《知识库说明》，新版是 AGENTS.md（给 AI 的入口，人也能看） */
export const isMapFile = (n: KbNode) => n.type === 'file' && !n.path.includes('/') && (n.name.includes('知识库说明') || n.name === 'AGENTS')
export const displayName = (n: KbNode) => (isMapFile(n) && n.name === 'AGENTS' ? '知识库地图（AGENTS）' : n.name)
