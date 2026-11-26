// 装进来的模块和核心之间的约定（2026-10-18）。模块包放在 Skill 的 modules/<编号>/，用 scripts/module.mjs add 装进程序；
// 装的时候生成 server/modules.gen.ts，核心只读那份清单，不写模块的名字。模块代码用到时才加载（动态 import）。
import type { Hono } from 'hono'

/** 每天几点跑一次的事（定时任务，见 server/jobs/）。run 返回一句话写进运行记录，出错就抛 */
export type JobContext = { day: string; trigger: JobTrigger }
/** 单次 = 今天再自动跑一次（job-set --once）：和每天那一次分开记账，互不影响 */
export type JobTrigger = '定时' | '补跑' | '手动' | '单次'
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
  /** Codex 能用的只读命令（workbench_read 白名单） */
  read?: string[]
  /** Codex 能用的写入命令（workbench_write 白名单；module.json 的 server.write）。写之前照样先给老板核对 */
  write?: string[]
  /** 命令是做什么的（一句话），workbench_capabilities 里给 Codex 看 */
  about?: Record<string, string>
  /** 菜单以外能打开的对象或页面（module.json 的 open），workbench_open 用 */
  open?: ModuleOpen[]
  /** 今日页重点卡（module.json 的 home）：卡片 id 和名字；数由 hooks.home 给，卡片长什么样由模块的 home[].file 画 */
  home?: { id: string; name: string }[]
  /** 模块自带的设置项（module.json 的 settings） */
  settings?: { key: string; label: string; hint?: string; placeholder?: string; max: number }[]
  /** 模块往核心登记的接入点（module.json 的 server.hooks）：今日页重点卡的数、今日概况里的几行字、导入目标、示例数据。
   *  服务端和命令行启动时就加载（server/module-hooks.ts），所以这个文件要小，重的代码在函数里再 import */
  hooks?: () => Promise<ModuleHooks>
}

/** 模块登记的一个“能打开的东西”：to 里写 {id} 的是具体对象（哪一期、哪一单），不写的是固定页面 */
export type ModuleOpen = {
  /** 全局唯一，建议写成 模块编号 或 模块编号-名字，比如 news-day */
  key: string
  label: string
  /** 地址，/ 开头；要带编号的写 {id}，比如 /news?day={id} */
  to: string
  /** to 里有 {id} 时，写清 id 是什么（“日期，如 2026-11-12”） */
  id?: string
}

/** 模块在“今日概况”里占的一段（命令行 today、快照、今日页页头那句话共用） */
export type TodaySection = {
  /** 小标题，比如“今天发什么” */
  title: string
  /** 每行一句，不带开头的“- ” */
  lines: string[]
  /** 页头那句话里的一小段；没有要说的就不写 */
  brief?: string | null
}

/** 模块的示例数据（只在演示时写：seed --demo）。tables 是重灌前要清空的表（按删除顺序），只能是这个模块自己的表 */
export type ModuleSeed = { tables: string[]; seed: () => void }

/** 模块运行时给的菜单项（2026-11-24）：页面有几个要看数据才知道的那种，比如“我关注的”有几类出几页。
 *  icon 写 lucide 图标名（网页只认 src/app/nav-icons.ts 里登记的）；section 是 src/app/nav.ts 里的分区名 */
export type ModuleNavItem = { key: string; to: string; label: string; icon?: string; section: string; sub?: string; badge?: number; tone?: 'warn' | 'quiet'
  /** 接管哪个核心入口（src/app/nav.ts 的菜单项 key）：这一页出现时那一项不显示，给 Codex 的页面清单和能打开的对象也不列 */
  replaces?: string }

/** 模块放在今日页重点卡上面的一段话（2026-11-24）：标题、几行字、谁写的、底下一句小字、点了去哪 */
export type TodayNote = { title: string; lines: string[]; by?: string; foot?: string; to?: string }
/** 驾驶舱顶上那一排数里的一个（2026-11-24）：名字、数、单位、底下一句小字、颜色、点了去哪、近几天的走势（从旧到新） */
/** 一格里能切的一个时间段（比如 AI 用量的今日 / 近 7 日 / 近 30 日）：切到哪一段就显示哪一段的数、单位、说明和走势 */
export type HomeStatRange = { key: string; label: string; value: number; display?: string; unit?: string; hint?: string; spark?: number[] }
/** display：数太大时写成人话（比如 1.8，单位写“亿token”）；ranges：有的话格子上出一排小页签，网页记住上次选的 */
export type HomeStat = { label: string; value: number; display?: string; unit?: string; hint?: string; tone?: 'ok' | 'warn'; to?: string; spark?: number[]; ranges?: HomeStatRange[] }

/** server.hooks 导出的东西。每一项都可以不写；模块开关收起来时，核心不调它们 */
export type ModuleHooks = {
  /** 今日页重点卡要的数：键是 module.json 的 home 里登记的卡片 id，值是“某一天”的数。出错只影响这一张卡 */
  home?: Record<string, (day: string) => unknown>
  /** 运行时的菜单项：每次算今日概况时调，要快（读一个小文件、查一次库），出错就当没有 */
  nav?: () => ModuleNavItem[]
  /** 菜单角标：键是菜单项的 key（固定的、运行时的都行），值是“要你处理”的数；0 不显示 */
  badges?: () => Record<string, number>
  /** 今日页重点卡上面的一段话；没有要说的返回 null */
  note?: (day: string) => TodayNote | null
  /** 驾驶舱顶上那一排数：给老板一眼看到自己的进展。每个模块最多 4 个（整排最多 6 个），要快 */
  stats?: (day: string) => HomeStat[]
  /** 今日概况里这个模块的一段 */
  today?: (day: string) => TodaySection | null
  /** 往“数据源与导入”登记的导入目标（要 needs 里写 data）。类型见 server/modules/data/targets.ts */
  importTargets?: import('./modules/data/targets.ts').ImportTarget[]
  /** 示例数据 */
  seed?: ModuleSeed
  /** 页面 AI 助手的常驻对话引擎（内嵌 Codex 这类模块给）。有模块给了，设置里才有“常驻对话”这个开关；没有就一问一答 */
  assistantHost?: (opts: { bin: string; cwd: string; instructions: string }) => Promise<AssistantHost>
  /** 对话栏里能“叫”的助理（个人助理这类模块给）：选了，句首加“叫<名字>，”，并记在这个对话上。要快（读几个小文件） */
  assistantPersonas?: () => AssistantPersona[]
  /** 这个模块里存下的产出（小红书的选题和稿子，以后报价、方案草稿也一样）：助理页按“谁做的”挂到各位助理下面。要快 */
  works?: () => WorkItem[]
}

/** 一份产出。by：谁做的（选题是谁存的、每一版的作者……），助理页按名字认；to：网页上打开它的地址 */
export type WorkItem = { id: string; kind: string; title: string; status: string; by: string[]; at: string; to: string }

/** 对话栏里能叫的一位助理。page：它自己那一页的地址（在那页上打开对话栏时默认选它） */
export type AssistantPersona = { key: string; name: string; avatar: string; duty: string; call: string; page?: string }

/** 常驻对话引擎：开一轮、答“是否允许”、关掉。进度里的步骤、审批的样子和 service.ts 一样 */
export type AssistantApproval = { key: string; kind: '跑命令' | '改文件' | '要权限'; text: string; reason: string }
export type AssistantStep = { tool: string; label: string; state: 'running' | 'ok' | 'failed'; detail?: string; image?: string }
export type AssistantProgress = { text?: string; steps?: AssistantStep[]; approvals?: AssistantApproval[]; status?: 'done' | 'failed' | 'cancelled'; error?: string }
export interface AssistantHost {
  startTurn(threadId: string | null, text: string, onProgress: (p: AssistantProgress) => void, images?: string[]): Promise<{ threadId: string; done: Promise<AssistantProgress>; cancel: () => void }>
  answer(key: string, choice: 'allow' | 'allow-session' | 'deny'): boolean
  close(): void
}
