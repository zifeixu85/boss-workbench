// 导入目标（2026-11-12）：数据源与导入自己只会把表导成“经营每天的数”（channel_daily）。
// 别的模块要用这套导入（数据源、字段对照、导入规则、导入记录、整批撤销）往自己的表里写，就登记一个导入目标：
// 在模块的 server.hooks 里导出 importTargets（见 server/module-types.ts），module.json 的 needs 写上 data。
// 这里只管登记和查，不写任何一个模块的名字；没有模块登记时，下面这些都返回空。归属：数据源与导入模块。
import type { Profile } from './fields.ts'

/** 能整批写、整批撤销的一张表：主键列 + 值列 */
export type TableSpec = {
  keys: string[]
  cols: string[]
  /** 主键里是数字的列（row_key 里存成文本，写回去时转成数） */
  numeric?: string[]
  /** “附带”写的行（比如每天的累计）：不算进这一批的行数 */
  side?: boolean
}
export type TargetFile = { rel: string; name: string; data_date: string | null; imported_at: string | null }
/** 数据源抽屉里“按对照导入”那一块要的状态 */
export type TargetState = { pending: number; pending_cols: string[]; file: TargetFile | null; can_import: boolean }

export type ImportTarget = {
  /** 导入规则、批次里的 target，比如 xhs_note_stats。全局唯一，不能叫 channel_daily */
  id: string
  /** 哪个模块登记的（加载时自动填上） */
  module?: string
  /** 对应的数据源（data_sources.id） */
  source: string
  /** 短名字：提醒、命令行、提示里用 */
  name: string
  /** 导入规则“写进”哪里 */
  writes: string
  /** 导完去哪一页看 */
  page?: { to: string; label: string }
  /** 用哪个菜单项的图标（菜单项的 key） */
  nav?: string
  /** 对字段时能选的工作台字段（value 写成 表.列） */
  fields: { value: string; label: string }[]
  /** 认表的特征：拖进“导入文件”页时认出来，提示去数据源里导 */
  profile?: Profile
  /** 这种表从哪导出、放哪：导入文件夹里没有文件时提示用 */
  how: string
  tables: Record<string, TableSpec>
  /** 示例数据里种子放进导入文件夹的文件（彩排复原时不算“多出来的”） */
  seeded_files?: string[]
  state: () => TargetState
  /** 按确认过的对照把导入文件夹里最新的一份导进去（自己负责写批次和导入记录），返回一句话 */
  run: (actor: string) => { message: string } & Record<string, unknown>
  /** 这个目标的一批数据撤销之后：数据源的“数据截至”、状态跟着改 */
  afterUndo?: (sourceId?: string) => void
  /** 示例数据里这个目标在数据源几张表里的行（数据源、对照、规则、导入记录）：只在示例库里调，import-reset 重灌后也调 */
  seed?: () => void
}

let targets: ImportTarget[] = []
/** 由 server/module-hooks.ts 在加载模块接入点时调用 */
export function setImportTargets(list: ImportTarget[]) {
  for (const t of list) {
    if (t.id === 'channel_daily' || 'channel_daily' in t.tables) throw new Error(`导入目标 ${t.id} 不能占用 channel_daily`)
  }
  targets = list
}
export const importTargets = (): ImportTarget[] => targets
export const targetById = (id: string | null | undefined) => targets.find((t) => t.id === id) ?? null
export const targetOfSource = (sourceId: string | null | undefined) => targets.find((t) => t.source === sourceId) ?? null
export const targetOfProfile = (profileId: string | null | undefined) => targets.find((t) => t.profile && t.profile.id === profileId) ?? null
export const targetOfTable = (tbl: string) => targets.find((t) => tbl in t.tables) ?? null
/** 登记的表（不含 channel_daily） */
export const targetTable = (tbl: string): TableSpec | null => targetOfTable(tbl)?.tables[tbl] ?? null
export const targetField = (value: string | null | undefined) => targets.flatMap((t) => t.fields).find((f) => f.value === value) ?? null
