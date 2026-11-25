// 这个模块里来回传的数据形状。对话记录只取这些元信息，不取正文。

/** “我关注的”里启用的一类：类型库里的定义 + 这份库的文件夹、叫法、确认 */
export type FocusClass = { name: string; folder: string; statuses: string[]; fields: string[]; links: string[]; icon: string; rename: Record<string, string>; confirmed: boolean
  /** “文件怎么认”：几种放法（* 一段一层）；没写就是 <名称>.md 或 <名称>/README.md */
  match?: string[] }

export type KbObject = {
  type: string; name: string
  /** 从知识库根目录起的路径（文件夹式的指到 README.md） */
  path: string
  status: string; updated: string; confirm: string; privacy: string
  source: string[]; aliases: string[]; links: string[]; workdirs: string[]
  /** 开头里其余的字段（“列表上显示”点到的从这里取） */
  fields: Record<string, string>
  now: string
  next: { text: string; done: boolean }[]
  log: { date: string; channel: string; text: string; pending: boolean }[]
  sources: string[]
  /** 缺的必填字段 */
  missing: string[]
  /** 写法上要改的（旧写法、不在类型库的类型……），照样能读 */
  warnings: string[]
}

export type Tool = 'codex' | 'claude'
export type SessionWrite = { path: string; action: '新建' | '修改'; at: string }
export type SessionMeta = {
  tool: Tool; sid: string; cwd: string
  title: string; titleFrom: '索引' | '文件' | '桌面版' | '第一句' | ''
  /** 第一句用户消息的摘要（遮过密钥、限长） */
  first: string
  /** 哪个程序开的：Codex Desktop、codex_exec、claude…… */
  origin: string
  /** 对话 = 人开的；子任务 = AI 自己派的；脚本 = 命令行一次性调用 */
  kind: '对话' | '子任务' | '脚本'
  startedAt: string; lastAt: string
  lastRole: 'user' | 'assistant' | ''
  /** 最后一轮开了还没结束（AI 还在做，或者做到一半断了） */
  turnOpen: boolean
  /** 最后一段话像在问人 */
  asks: boolean
  /** 最后一轮是被打断的 */
  aborted: boolean
  /** 人说了几轮 */
  turns: number
  writes: SessionWrite[]
}

export type Status = '进行中' | '在等我' | '做完未读' | '做完了' | '没做完'
export const STATUSES: Status[] = ['进行中', '在等我', '做完未读', '做完了', '没做完']
