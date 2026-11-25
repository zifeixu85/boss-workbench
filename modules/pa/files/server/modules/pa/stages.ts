// 状态的三个阶段（约定 v0.8 第 10.2 节，2026-11-26 A梦 定）：状态的叫法是用户自己的，想加就加，每个叫法归到一个阶段。
// 三个阶段的名字是知识库工具先用的，A梦 还没定叫法：改名只改这一处（知识库工具那边的同名常量跟着改）。
export const STAGES = ['未开始', '进行中', '已结束'] as const
export type Stage = (typeof STAGES)[number]
/** 有状态、但对不上任何阶段的 */
export const UNMATCHED = '未归类'
/** 没写状态的 */
export const UNSET = '没标'
export const isStage = (s: string): s is Stage => (STAGES as readonly string[]).includes(s)
