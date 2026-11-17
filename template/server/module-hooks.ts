// 模块的接入点（2026-11-12）：装进来的模块在 module.json 的 server.hooks 里指一个文件，导出 ModuleHooks（server/module-types.ts）。
// 核心只认接入点，不写模块的名字：今日页重点卡的数、今日概况里的一段、导入目标、示例数据。
// 服务端启动、命令行每次运行、装了新模块（modules-live.ts 发现清单变了）时各加载一遍；加载出错的模块跳过并记下来，不拖累别的。
import { SERVER_MODULES } from './modules.gen.ts'
import type { ModuleHooks, ServerModule } from './module-types.ts'
import { setImportTargets } from './modules/data/targets.ts'

export type LoadedHooks = { module: string; name: string; hooks: ModuleHooks }
let loaded: LoadedHooks[] = []
let errors: { module: string; error: string }[] = []

/** 加载装进来的模块的接入点。mods 不传 = 构建时的清单 */
export async function loadHooks(mods: ServerModule[] = SERVER_MODULES): Promise<LoadedHooks[]> {
  const next: LoadedHooks[] = []
  errors = []
  for (const m of mods) {
    if (!m.hooks) continue
    try { next.push({ module: m.id, name: m.name, hooks: (await m.hooks()) ?? {} }) } catch (err) {
      console.error(`模块“${m.name}”的接入点加载出错：${(err as Error).message}`)
      errors.push({ module: m.name, error: (err as Error).message })
    }
  }
  loaded = next
  setImportTargets(next.flatMap((x) => (x.hooks.importTargets ?? []).map((t) => ({ ...t, module: x.module }))))
  return loaded
}

/** 已经加载的接入点（没调过 loadHooks 就是空的：核心照常工作，只是没有模块的那几块） */
export const moduleHooks = (): LoadedHooks[] => loaded
export const hookErrors = () => errors
