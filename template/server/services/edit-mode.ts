// “只改内容”（2026-11-17 A梦 定，课上第一天用）：搭建时默认写上 edit_mode=content。
// 这时 Codex 只更新工作台里的内容（进展、待办、日程、项目、收件箱、资讯……），不动工作台本身：
// 不装、不换、不拿掉模块，不开关模块，不重选模块（命令行和 scripts/module.mjs 会停下）；改页面、改功能由技能的规矩管。
// 老板说“工作台放开改页面”就运行 settings-set --edit open；说“工作台回到只改内容”就 --edit content。
// 没写过这一项的（以前搭的工作台）算放开，升级不会突然锁住。网页“设置”里老板自己开关模块不受它管。
import { get } from '../db.ts'
import { BadRequest } from './common.ts'

export type EditMode = 'content' | 'open'
export const EDIT_MODES: readonly EditMode[] = ['content', 'open']
/** 老板放开、收回时说的话（文档、提示、Codex 都用这两句） */
export const OPEN_SAY = '工作台放开改页面'
export const LOCK_SAY = '工作台回到只改内容'

export function editMode(): EditMode {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = 'edit_mode'")?.value === 'content' ? 'content' : 'open'
}

export function lockedMessage(what: string): string {
  return `现在是“只改内容”：工作台里的事（进展、待办、日程、项目、资讯……）照常更新，${what}这类改工作台本身的事先不做。`
    + `老板要改，请他说一句“${OPEN_SAY}”（node server/cli.ts settings-set --edit open）；改完想收回，说“${LOCK_SAY}”（--edit content）`
}

/** 要改工作台本身前先调：只改内容时抛错，说清楚怎么放开 */
export function assertCanChangeWorkbench(what: string): void {
  if (editMode() === 'content') throw new BadRequest(lockedMessage(what))
}

/** 给 Codex 看的一句话（workbench_capabilities、命令行） */
export function editModeText(mode: EditMode = editMode()): string {
  return mode === 'content'
    ? `只改内容：只更新工作台里的内容；装模块、开关模块、改页面和功能先不做，老板说“${OPEN_SAY}”才放开`
    : `放开改：可以装模块、开关模块、改页面和功能（照样先跟老板说清楚）；老板说“${LOCK_SAY}”就收回`
}
