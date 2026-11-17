// 装进来的模块的页面和今日页重点卡（scripts/module.mjs 生成，不要手改；改了模块的 module.json 运行 node scripts/module.mjs gen）
import type { RouteObject } from 'react-router'
import type { HomeCardComponent } from './pages'

export const MODULE_ROUTES: RouteObject[] = []

/** 今日页重点卡：卡片 id → 组件（收 data：模块的 server.hooks 给的数） */
export const MODULE_HOME_CARDS: Record<string, HomeCardComponent> = {}
