// 模块开关：哪些模块在导航、今日页、提醒和全局搜索里出现。服务端和网页共用这一份。
// id 和搭建确认页的模块 id 一致（Skill 的 references/模块目录.md）；导航里每一项用 module 字段指向这里的 id。
// 关掉只是“收起来”：代码和数据都留着，随时能打开。
// 设置里存成一个 settings 键 modules（逗号隔开的 id）；没存过 = 全部打开（老数据库、演示模式照旧）。
// 加一个新模块：在 MODULES 里加一项，再在 src/app/nav.ts 的菜单项上写 module。

export type ModuleDef = {
  id: string
  name: string
  /** 一定打开，不能关 */
  required?: boolean
  /** 打开它时自动带上的模块 */
  needs?: string[]
}

export const MODULES: ModuleDef[] = [
  { id: 'today', name: '今日', required: true },
  { id: 'tasks', name: '待办与日程' },
  { id: 'projects', name: '项目' },
  { id: 'inbox', name: '收件箱' },
  { id: 'reminders', name: '提醒' },
  { id: 'clients', name: '客户与跟进' },
  { id: 'biz', name: '经营', needs: ['data'] },
  { id: 'content', name: '小红书内容中心', needs: ['data'] },
  { id: 'data', name: '数据源与导入' },
  { id: 'kb', name: '知识库' },
  { id: 'settings', name: '设置', required: true },
  { id: 'design', name: '组件规范' },
]

export const MODULE_IDS = MODULES.map((m) => m.id)
export const moduleName = (id: string) => MODULES.find((m) => m.id === id)?.name ?? id

/** 把“today, tasks、kb”这类写法拆成 id 列表（逗号、顿号、空格都行） */
export function splitIds(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[\s,，、]+/)
  return [...new Set(parts.map((s) => s.trim()).filter(Boolean))]
}

/**
 * 整理一组要打开的模块：去重，补上必选的和依赖的，按 MODULES 的顺序排。
 * unknown 是模板里没有的 id（比如确认页里“搭好后加”的 money、team），由调用方决定怎么提示。
 */
export function normalizeModules(input: string | string[]) {
  const asked = splitIds(input)
  const unknown = asked.filter((id) => !MODULE_IDS.includes(id))
  const on = new Set(asked.filter((id) => MODULE_IDS.includes(id)))
  const added: string[] = []
  for (const m of MODULES) if (m.required && !on.has(m.id)) { on.add(m.id); added.push(m.id) }
  for (const m of MODULES) for (const dep of (on.has(m.id) ? m.needs ?? [] : [])) if (!on.has(dep)) { on.add(dep); added.push(dep) }
  return { ids: MODULE_IDS.filter((id) => on.has(id)), unknown, added }
}

/** 设置里存的值 → 打开着的模块。没存过（null、空）= 全部打开 */
export function enabledModules(stored: string | null | undefined): string[] {
  if (!stored || !stored.trim()) return [...MODULE_IDS]
  return normalizeModules(stored).ids
}

/** 关掉一个模块时，哪些打开着的模块还需要它（比如经营、内容都要“数据源与导入”） */
export function neededBy(id: string, on: string[]): string[] {
  return MODULES.filter((m) => on.includes(m.id) && m.needs?.includes(id)).map((m) => m.id)
}
