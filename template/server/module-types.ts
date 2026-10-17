// 装进来的模块和核心之间的约定（2026-10-18）。模块包放在 Skill 的 modules/<编号>/，用 scripts/module.mjs add 装进程序；
// 装的时候生成 server/modules.gen.ts，核心只读那份清单，不写模块的名字。模块代码用到时才加载（动态 import）。
import type { Hono } from 'hono'

/** 每天几点跑一次的事（定时任务，见 server/jobs/）。run 返回一句话写进运行记录，出错就抛 */
export type JobContext = { day: string; trigger: JobTrigger }
export type JobTrigger = '定时' | '补跑' | '手动'
export type Job = {
  /** 全局唯一，写成 模块编号.名字，比如 news.daily */
  id: string
  name: string
  /** 每天几点（24 小时制 HH:MM）；老板可以用 job-set 改 */
  at: string
  /** 归哪个模块开关：模块收起来时不跑 */
  module?: string
  run: (ctx: JobContext) => Promise<string | void> | string | void
}

/** 模块自己的命令行：argv[0] 是命令名（news、news-fetch……） */
export type ModuleCli = { help: string; run: (argv: string[]) => Promise<number> | number }

/** server/modules.gen.ts 里的一项 */
export type ServerModule = {
  id: string
  name: string
  needs: string[]
  version: string
  /** 接口：挂在 /api/m/<id>/ 下 */
  api?: () => Promise<Hono>
  jobs?: () => Promise<Job[]>
  /** 命令名：写 news 就认 news 和 news- 开头的 */
  commands?: string[]
  cli?: () => Promise<ModuleCli>
  /** AI 助手能用的只读命令（workbench_read 白名单） */
  read?: string[]
}
