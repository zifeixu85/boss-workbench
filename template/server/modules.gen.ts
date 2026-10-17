// 装进来的模块（scripts/module.mjs 生成，不要手改；改了模块的 module.json 运行 node scripts/module.mjs gen）
import type { ServerModule } from './module-types.ts'

export const SERVER_MODULES: ServerModule[] = []
