// 模块开关（服务端）：读设置里的 modules，决定今日页、提醒、全局搜索带不带某个模块。定义在 shared/modules.ts。
import { get, run, logChange } from '../db.ts'
import { MODULES, enabledModules, normalizeModules, neededBy, moduleName } from '../../shared/modules.ts'
import { type Actor, BadRequest } from './common.ts'

const stored = () => get<{ value: string }>("SELECT value FROM settings WHERE key = 'modules'")?.value ?? null

/** 现在打开着的模块 id */
export const enabled = () => enabledModules(stored())
/** 某个模块开没开 */
export const isOn = (id: string) => enabled().includes(id)

/** 每个模块开没开，给命令行和设置页看 */
export function list() {
  const on = enabled()
  return {
    all_on: stored() === null,
    modules: MODULES.map((m) => ({ id: m.id, name: m.name, on: on.includes(m.id), required: !!m.required, needs: m.needs ?? [] })),
  }
}

/** 整组设：ids 写 'all' = 全部打开（清掉设置） */
export function setModules(input: string | string[], actor: Actor) {
  if (input === 'all' || (Array.isArray(input) && input.length === 1 && input[0] === 'all')) {
    run("DELETE FROM settings WHERE key = 'modules'")
    logChange(actor, 'settings', 'modules', '修改', '模块：全部打开')
    return { ...list(), added: [] as string[] }
  }
  const r = normalizeModules(input)
  if (r.unknown.length) {
    throw new BadRequest(`模板里没有这些模块：${r.unknown.join('、')}。先去掉它们再设；要做的话按“加减模块”新做，并在 shared/modules.ts 里登记。现有的模块：${MODULES.map((m) => m.id).join('、')}`)
  }
  run("INSERT INTO settings (key, value) VALUES ('modules', :v) ON CONFLICT(key) DO UPDATE SET value = :v", { v: r.ids.join(',') })
  logChange(actor, 'settings', 'modules', '修改', `模块：打开 ${r.ids.map(moduleName).join('、')}`)
  return { ...list(), added: r.added }
}

/** 在现有基础上打开几个、关掉几个 */
export function toggleModules(turnOn: string[], turnOff: string[], actor: Actor) {
  const on = new Set(enabled())
  for (const id of turnOff) {
    const m = MODULES.find((x) => x.id === id)
    if (!m) throw new BadRequest(`模板里没有“${id}”这个模块。现有的模块：${MODULES.map((x) => x.id).join('、')}`)
    if (m.required) throw new BadRequest(`${m.name}一定要开着，不能关`)
    const users = neededBy(id, [...on].filter((x) => !turnOff.includes(x)))
    if (users.length) throw new BadRequest(`${m.name}还在被${users.map(moduleName).join('、')}用着；要关先关它们`)
    on.delete(id)
  }
  for (const id of turnOn) on.add(id)
  return setModules([...on], actor)
}
