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

/** 顶层文件夹放什么：按名字里的关键词认（文件夹可能带编号，如“04-客户”）。
 *  前面是每个老板都有的那几个文件夹（照老板知识库的固定层），后面是按生意长出来的常见模块；每个一句大白话，不写某位老板的具体内容 */
export const FOLDER_HINTS: [keyword: string, desc: string][] = [
  ['收件箱', '刚丢进来、还没整理的材料：聊天记录、通话和会议纪要、随手记。'],
  ['AI协作', '建库档案、和 AI 配合的习惯、常做任务的步骤。'],
  ['关于我', '你是谁、怎么做事和拿主意、说话方式和边界。'],
  ['方法与判断', '要拿主意的事怎么做、怎么判断：做法、判断规则和真事样本。'],
  ['持续生长', 'AI 的发现、等你确认的问题、复盘和体检报告。'],
  ['原始材料', '原样存着的采访、聊天、纪要，只用来核对原话和数字。'],
  ['渠道与经营', '各个平台或店的档案、数据口径、经营复盘的结论。'],
  ['门店与会员', '门店档案、会员怎么分层、活动和口碑。'],
  ['内容', '账号定位、发过的作品、写作的规律。'],
  ['达人', '合作的达人、主播或讲师，每人一份档案。'],
  ['案例', '做过的案例：背景、做法、结果、能不能对外讲。'],
  ['专业知识', '工作要用的法规、标准和行业知识，写明出处和有效期。'],
  ['供应', '供应商档案、采购规矩、质检标准。'],
  ['生意', '卖什么、怎么卖、品牌和口吻、团队和伙伴。'],
  ['客户', '每位客户的档案：在意什么、答应过的事、往来记录。'],
  ['项目', '正在推进的事：目标、关键日期、卡在哪。'],
  ['资料', '做法和判断、话术和常见问题。'],
  ['工作台', '工作台自动导出的快照，给 AI 读的，不要在这里改。'],
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
