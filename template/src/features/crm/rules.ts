// 前端用到的几条口径（和 server/modules/crm/service.ts 一致）。归属：大客户模块

/** 多久没联系算“久”：大客户 30 天，其他客户 60 天 */
export const quietDays = (key: boolean) => (key ? 30 : 60)

/** 跟进看板的列：按阶段归成 5 组（看板列不超过 6 个）。拖到某一列时，组里有几个阶段就让你选具体是哪个 */
export const BOARD_COLUMNS = [
  { key: 'lead', label: '新线索', stages: ['新线索', '需求确认'], hint: '新线索 · 需求确认' },
  { key: 'deal', label: '方案报价', stages: ['方案中', '报价中', '待签约'], hint: '方案中 · 报价中 · 待签约' },
  { key: 'after', label: '交付售后', stages: ['交付中', '售后'], hint: '交付中 · 售后' },
  { key: 'repeat', label: '待复购', stages: ['待复购'], hint: '买过，等下一个节日' },
  { key: 'keep', label: '长期合作', stages: ['合作中', '维护中'], hint: '渠道合作中 · 老茶客维护中' },
] as const
export const PARKED = ['暂停', '流失'] as const
/** 看板列最小宽：5 列 × 220 + 4 × 12 间距，侧栏展开时 1440 宽刚好放下（第三轮修产品评审 #2） */
export const BOARD_MIN_COL = 220

/** 等级口径（悬停提示）；owner 是设置里的称呼 */
export const levelRule = (owner: string) => `工作台按金额算的，${owner}没定过：A 级＝近 12 个月买了 3 万以上，或报价中、待签约的单 2 万以上；B 级＝5000 元以上，或报价中、待签约 0.5 万以上；其余 C 级。方案里的金额、按去年估的复购不算`

/** “35 天”“今天” */
export const silentText = (n: number | null) => (n === null ? '—' : n <= 0 ? '今天' : `${n}\u00a0天`)
/** “多久没联系”那一行：当天联系过写“今天联系过”（10-12 修：原来写成“今天没联系”） */
export const silentLine = (n: number | null) => (n === null ? '' : n <= 0 ? '今天联系过' : `${silentText(n)}没联系`)

/** ISO 时间转本地日期（不能直接 slice：凌晨 0—8 点会差一天） */
export function toLocal(iso: string) {
  const x = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

/** 状态页签（客户列表）：最多 6 类（规范“导航与Tab”）；渠道合作和老茶客合成“长期合作”，和看板的列一致 */
export const STATUS_GROUPS = [
  { value: 'all', label: '全部', stages: null },
  { value: 'lead', label: '新线索', stages: ['新线索', '需求确认'] },
  { value: 'deal', label: '方案报价', stages: ['方案中', '报价中', '待签约'] },
  { value: 'after', label: '交付售后', stages: ['交付中', '售后'] },
  { value: 'repeat', label: '待复购', stages: ['待复购'] },
  { value: 'keep', label: '长期合作', stages: ['合作中', '维护中'] },
] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]['value']

/** 卡片上的日期只说一次：答应的话开头已经写了“10/28 前”，右上角又有“10/28 前 · 明天”，正文就不再写（第四轮修产品评审 #10） */
export const withoutDue = (p: { text: string; due: string | null }) => {
  if (!p.due) return p.text
  const m = Number(p.due.slice(5, 7)), d = Number(p.due.slice(8, 10))
  const t = p.text.replace(new RegExp(`^(${m}\\s*/\\s*${d}|${m}\\s*月\\s*${d}\\s*[日号]?)\\s*前\\s*[，,]?\\s*`), '')
  return t || p.text
}
