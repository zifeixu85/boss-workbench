// 知识库检测（约定 v0.6 第 9.6 节）：这个知识库现在能撑起个人助理的哪几页，对不上的缺什么、下一步说哪一句。
// 检测本身在模板的 scripts/kb-check.mjs（搭工作台之前也用它，对老板说的那个文件夹跑）；这里只是接到工作台的知识库上。
// 工作台不替用户改知识库的结构，补齐是知识库工具“升级检查”的事。归属：个人助理模块。
import { ROOT } from '../../db.ts'
import { checkKb, checkText, type KbCheck } from '../../../scripts/kb-check.mjs'

export const kbCheck = (): KbCheck => checkKb(ROOT)
export const kbCheckText = (r: KbCheck = kbCheck()): string => checkText(r)
/** 要不要在驾驶舱提一句：我关注的、助理、报告里有一页撑不起来才提。只差收件箱、只是某一类对不上，不占“总助的话”的位置，检测页里照样看得到 */
const BIG = ['focus', 'roles', 'reports']
export const needsUpgrade = (r: KbCheck): boolean => r.exists && r.pages.some((p) => BIG.includes(p.id) && p.status !== '能用')
