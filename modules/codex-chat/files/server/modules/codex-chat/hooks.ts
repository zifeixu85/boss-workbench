// 内嵌 Codex 模块往核心登记的接入点：页面 AI 助手的常驻对话引擎。核心只认“assistantHost”这个接入点，不写模块的名字。
// 这个文件服务端一启动就加载，要小：引擎（host.ts）在第一次用的时候才 import。归属：内嵌 Codex 模块。
import type { AssistantHost, ModuleHooks } from '../../module-types.ts'

export const hooks: ModuleHooks = {
  assistantHost: async (opts) => {
    const { CodexHost } = await import('./host.ts')
    return new CodexHost(opts) satisfies AssistantHost
  },
}
