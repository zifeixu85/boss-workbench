// 行业资讯模块的接口：核心挂在 /api/m/news/ 下（server/modules.gen.ts）
import { moduleApp, ok, body } from '../../module-kit.ts'
import { fetchNews, overview, saveNewsSettings } from './service.ts'

export const newsRoutes = moduleApp()
newsRoutes.get('/', (c) => c.json(ok(overview(c.req.query('day') || undefined))))
newsRoutes.post('/fetch', async (c) => c.json(ok(await fetchNews())))
newsRoutes.patch('/settings', async (c) => c.json(ok(saveNewsSettings(await body(c), '网页'))))
