// 行业资讯模块的定时任务：每天 08:30 去取（AIHOT 日报北京时间 08:00 出）。
// 取不到、或者 AIHOT 今天的还没出，算失败：公共调度隔 15 分钟再试，一天最多 3 次（server/jobs/service.ts）
import type { Job } from '../../module-types.ts'
import { AIHOT_DAILY, fetchNews, sourceOf } from './service.ts'

export const newsJobs: Job[] = [
  {
    id: 'news.daily',
    name: '取今天的行业资讯',
    at: '08:30',
    run: async ({ day }) => {
      const r = await fetchNews()
      if (!r.ok) throw new Error(r.note)
      if (sourceOf() === AIHOT_DAILY && r.latest !== day) throw new Error(`今天（${day}）的还没出，最新一期是 ${r.latest ?? '没有'}`)
      return r.note
    },
  },
]
