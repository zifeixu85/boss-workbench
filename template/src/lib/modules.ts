// 模块开关（网页这边）：从设置里读打开着的模块。定义在 shared/modules.ts；导航、今日页、路由都用它。
import { MODULE_IDS, MODULES, moduleName } from '@shared/modules'
import { useApi } from './api'
import type { Settings } from './types'

export { MODULES, moduleName }

export function useModules() {
  const { data } = useApi<Settings>('/settings')
  const list = data?.modules ?? MODULE_IDS
  return { ready: !!data, list, on: (id: string) => list.includes(id) }
}
