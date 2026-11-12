// 行业资讯模块的接口：核心挂在 /api/m/news/ 下（server/modules.gen.ts）。
// 网页能做的：看、改关注词、开关来源、看一条的正文、（有工作台自己取的来源时）现在去取。
// 加来源、写入资讯和总结只走命令行：老板回到 Codex 说一句，Codex 用 news-source-add、news-add、news-digest-set。
import { moduleApp, ok, body } from '../../module-kit.ts'
import { fetchNews, overview, saveNewsSettings } from './service.ts'
import { getEntry } from './entries.ts'
import { setSource } from './sources.ts'

export const newsRoutes = moduleApp()
newsRoutes.get('/', (c) => c.json(ok(overview(c.req.query('day') || undefined, { range: Number(c.req.query('range')) || 1 }))))
newsRoutes.post('/fetch', async (c) => c.json(ok(await fetchNews())))
newsRoutes.patch('/settings', async (c) => c.json(ok(saveNewsSettings(await body(c), '网页'))))
newsRoutes.get('/items/:id', (c) => c.json(ok(getEntry(c.req.param('id')))))
newsRoutes.patch('/sources/:id', async (c) => c.json(ok(setSource(c.req.param('id'), await body(c), '网页'))))
