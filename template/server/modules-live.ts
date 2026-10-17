// 装进来的模块（server/modules.gen.ts）：工作台开着的时候装了新模块，不用重开。清单文件一变就重新读一遍，
// 模块开关（shared/modules.ts）、接口（/api/m/<模块>/）、定时任务跟着换。模块代码只在第一次用到时加载；
// 已经加载过的模块再升级（module update），要重开工作台才换成新代码。
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Hono } from 'hono'
import { APP_DIR } from './db.ts'
import { setInstalledModules } from '../shared/modules.ts'
import { SERVER_MODULES } from './modules.gen.ts'
import type { ServerModule } from './module-types.ts'

const GEN = join(APP_DIR, 'server', 'modules.gen.ts')
const stampOf = () => { try { return statSync(GEN).mtimeMs } catch { return 0 } }

let current: ServerModule[] = SERVER_MODULES
let stamp = stampOf()

/** 现在装着的模块。清单变了返回 true（index.ts 据此推送刷新） */
export async function refreshModules(): Promise<boolean> {
  const t = stampOf()
  if (t === stamp) return false
  stamp = t
  try {
    const m = (await import(`${pathToFileURL(GEN).href}?t=${t}`)) as { SERVER_MODULES: ServerModule[] }
    current = m.SERVER_MODULES
    setInstalledModules(current.map(({ id, name, needs }) => ({ id, name, needs })))
    apis.clear()
    return true
  } catch (err) {
    console.error(`读装进来的模块清单出错（${GEN}）：${(err as Error).message}`)
    return false
  }
}

export async function liveModules(): Promise<ServerModule[]> {
  await refreshModules()
  return current
}

const apis = new Map<string, Promise<Hono>>()
/** 某个模块的接口；没装、或者这个模块没有接口，返回 null */
export async function moduleApi(id: string): Promise<Hono | null> {
  const m = (await liveModules()).find((x) => x.id === id)
  if (!m?.api) return null
  if (!apis.has(id)) apis.set(id, m.api())
  return apis.get(id)!
}
