// 状态是推断出来的：看最后一轮结束没有、最后是谁说的、多久没动。会有不准，所以每个状态都带一句“为什么”，页面上能手动改。
import type { Status } from './types.ts'

/** 这一轮开着、又在这么多分钟内动过：算还在跑 */
export const RUNNING_MIN = 15
/** 超过这么多天没动：不管当时怎样，都按做完了算（多半是事办完了；不出“停了”这种让人别扭的说法） */
export const STALE_DAYS = 7
/** 做完了、又不知道你看没看（Claude Code 没有已读记录），超过这么多小时没动：按看过、做完了算 */
export const DONE_HOURS = 48

export type StatusInput = {
  lastAt: string; turnOpen: boolean; lastRole: string; asks: boolean; aborted: boolean
  /** Codex 桌面版自己记的看没看（本机 state 数据库的已读记录）：true 看过、false 没看、不知道就不写 */
  seen?: boolean | null
  /** 在 Codex 里归档了 */
  archived?: boolean
  /** Claude 桌面版自己给这一轮的判断是“在等你处理”（会话信息里的 status_category = blocked） */
  appWaiting?: boolean
}
/** 用户在工作台上点过的：标已看的时间；手动改的状态和改的时候对话的最后活动时间 */
export type Mark = { readAt?: string | null; status?: string | null; statusAt?: string | null }
export type Inferred = { status: Status; why: string; inferred: boolean }

const span = (ms: number) => (ms < 36e5 ? `${Math.max(1, Math.round(ms / 6e4))} 分钟` : ms < 864e5 ? `${Math.round(ms / 36e5)} 小时` : `${Math.round(ms / 864e5)} 天`)

/** 以前的版本手动标过的“已看”“停了”，现在都当“做完了” */
const LEGACY: Record<string, Status> = { 已看: '做完了', 停了: '做完了' }

export function inferStatus(s: StatusInput, now: number, mark: Mark = {}): Inferred {
  // 手动改的：对话之后没再动过才算数
  if (mark.status && mark.statusAt && mark.statusAt >= s.lastAt) return { status: LEGACY[mark.status] ?? (mark.status as Status), why: '你手动改的', inferred: false }
  const idle = Math.max(0, now - Date.parse(s.lastAt))
  const quiet = `${span(idle)}没动`
  if (s.turnOpen && idle <= RUNNING_MIN * 6e4) return { status: '进行中', why: s.lastRole === 'user' ? '你刚说完，AI 还没回完' : 'AI 这一轮还没结束，刚刚还在动', inferred: true }
  if (s.archived) return { status: '做完了', why: '你在 Codex 或 Claude 里归档了', inferred: false }
  if (idle > STALE_DAYS * 864e5) return { status: '做完了', why: `${quiet}，按做完了算`, inferred: true }
  if (s.turnOpen) return { status: '没做完', why: `这一轮没跑完就断了，${quiet}`, inferred: true }
  if (s.aborted) return { status: '没做完', why: `最后一轮被打断了，${quiet}`, inferred: true }
  if (s.appWaiting) return { status: '在等我', why: `Claude 桌面版标着这个对话在等你处理${s.seen ? '（你看过了，还没回）' : ''}`, inferred: false }
  if (s.asks && s.appWaiting === undefined) return { status: '在等我', why: `AI 最后一段话像在问你，之后没人回${s.seen ? '（Codex 里显示你看过了）' : ''}`, inferred: true }
  if (mark.readAt && mark.readAt >= s.lastAt) return { status: '做完了', why: '你在工作台标过已看，之后没有新动静', inferred: false }
  if (s.seen === true) return { status: '做完了', why: `${s.appWaiting === undefined ? 'Codex' : 'Claude 桌面版'}里显示你看过了`, inferred: false }
  if (s.seen === false) return { status: '做完未读', why: `AI 这一轮做完了，${s.appWaiting === undefined ? 'Codex' : 'Claude 桌面版'}里显示你还没看`, inferred: false }
  if (idle > DONE_HOURS * 36e5) return { status: '做完了', why: `AI 做完以后两天多没动（${quiet}），不知道看没看，按看过算`, inferred: true }
  return { status: '做完未读', why: 'AI 这一轮做完了，之后你没说话，也没标已看', inferred: true }
}
