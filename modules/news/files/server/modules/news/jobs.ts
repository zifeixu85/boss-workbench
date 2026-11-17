// 行业资讯模块的定时任务：每天 08:30 去取“工作台自己取”的来源（RSS / Atom；0.2 的老用户 AI HOT 是这种，日报北京时间 08:00 出）。
// 默认的来源都由 Codex 去取，没有这种来源时什么都不做。
// 有来源没取到，或者每天出的日报今天那期还没出，算失败：公共调度隔 15 分钟再试，一天最多 3 次（server/jobs/service.ts）；
// 再试时只取今天还没取成的来源。一直取不到的来源，老板关掉或改地址。
import type { Job } from '../../module-types.ts'
import { get } from '../../db.ts'
import { fetchNews } from './fetch.ts'

export const newsJobs: Job[] = [
  {
    id: 'news.daily',
    name: '取今天的行业资讯',
    at: '08:30',
    run: async ({ day, trigger }) => {
      const retry = !!get("SELECT 1 AS x FROM job_runs WHERE job_id = 'news.daily' AND day = :day AND trigger = :trigger AND status = '失败' LIMIT 1", { day, trigger })
      const r = await fetchNews({ pending: retry })
      const note = r.note.replace(/\n/g, '；')
      if (!r.ok || r.stale) throw new Error(note)
      return note
    },
  },
]
