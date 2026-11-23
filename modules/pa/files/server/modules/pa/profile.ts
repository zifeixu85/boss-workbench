// 知识库档案.md 里的“我关注的”表：工作台靠它决定出哪几页（约定见 骨架与对象格式 第 2 节）。
import { splitList } from './text.ts'
import type { FocusClass } from './types.ts'

export const FOCUS_HEAD = ['类名', '文件夹', '状态可选值', '列表上显示', '确认']
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/^`|`$/g, ''))

/** 读出“我关注的”有哪几类；哪里不对写进 problems（页面上原样告诉用户），不抛错 */
export function parseFocusTable(md: string): { classes: FocusClass[]; problems: string[] } {
  const problems: string[] = []
  const sec = md.replace(/^﻿/, '').match(/^##\s*我关注的\s*\r?\n([\s\S]*?)(?=^#{1,2}\s|$(?![\s\S]))/m)?.[1]
  if (sec === undefined) return { classes: [], problems: ['知识库档案.md 里没有“我关注的”这一节'] }
  const rows = sec.split(/\r?\n/).filter((l) => l.trim().startsWith('|'))
  if (!rows.length) return { classes: [], problems: ['“我关注的”这一节里没有表'] }
  const head = cells(rows[0])
  if (FOCUS_HEAD.some((h, i) => head[i] !== h)) return { classes: [], problems: [`“我关注的”的表头要一字不改：${FOCUS_HEAD.join(' | ')}（现在是：${head.join(' | ')}）`] }
  const classes: FocusClass[] = []
  for (const row of rows.slice(1)) {
    const c = cells(row)
    if (c.every((x) => /^:?-+:?$/.test(x) || x === '')) continue
    const [name, rawFolder, statuses, fields, confirm] = c
    const folder = (rawFolder ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    if (!name || !folder) { problems.push(`有一行没写类名或文件夹：${row.trim()}`); continue }
    if (folder.startsWith('/') || folder.split('/').includes('..')) { problems.push(`“${name}”的文件夹要写知识库里面的（现在是 ${rawFolder}）`); continue }
    if (classes.some((x) => x.name === name)) { problems.push(`“${name}”写了两次，只认第一次`); continue }
    const all = splitList(fields)
    if (all.length > 2) problems.push(`“${name}”的“列表上显示”最多两个，只用前两个：${all.slice(0, 2).join('、')}`)
    classes.push({ name, folder, statuses: splitList(statuses), fields: all.slice(0, 2), confirmed: (confirm ?? '').trim() === '已确认' })
  }
  return { classes, problems }
}
