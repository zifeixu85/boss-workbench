// 这个模块往核心登记的接入点（module.json 的 server.hooks）：服务端和命令行启动时就加载，所以这里只放轻的。
// 今日页重点卡“小红书今天发什么”的数、今日概况里的一段、往“数据源与导入”登记的笔记数据导入目标、示例数据。归属：小红书内容模块。
import type { ModuleHooks } from '../../module-types.ts'
import { todayPlan } from './service.ts'
import { notesTarget } from './notes-import.ts'
import { xhsSeed } from './seed/content.ts'
import { findPieces } from './finder.ts'

export const xhsHooks: ModuleHooks = {
  home: { xhs: (day) => todayPlan(day) },
  today: (day) => {
    const plan = todayPlan(day)
    const post = plan.posts[0]
    return {
      title: '小红书今天发什么',
      lines: [
        ...plan.posts.map((p) => `${p.time ?? ''} ${p.title}（${p.status}${p.draft_status ? `，草稿${p.draft_status}` : ''}）`),
        ...(plan.topics_total ? [`今天的选题 ${plan.topics_total} 个，前三：${plan.topics.map((x) => x.title).join('；')}`] : []),
      ],
      brief: post ? `小红书 ${post.time ?? '今天'} 发《${post.title}》` : null,
    }
  },
  importTargets: [notesTarget],
  // 助理页的“产出”（约定 11.13）：选题和稿子，谁存的、每一版是谁写的
  works: () => findPieces({ limit: 200 }).filter((p) => p.status !== '已放弃').map((p) => ({ id: `xhs:${p.id}`, kind: p.account ? `小红书 · ${p.account}` : '小红书', title: p.title, status: p.stage, by: [p.by, ...p.authors], at: p.updated_at, to: p.path })),
  seed: xhsSeed,
}
