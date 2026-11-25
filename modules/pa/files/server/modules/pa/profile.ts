// 知识库档案.md（约定 v0.2 第 2.2、6 节）：“我关注的”表（启用了类型库里的哪几类）、“叫法”（状态换个叫法）、“候选类型”、“报告”开关。
import { PAGE_TYPES, typeDef } from './type-library.ts'
import { bullets } from './text.ts'
import type { FocusClass } from './types.ts'

export const FOCUS_HEAD = ['类型', '文件夹', '确认']
export const REPORT_HEAD = ['报告', '开关', '什么时候出']
export type ReportSwitch = { 日报: boolean; 周报: boolean; 月报: boolean }
/** 没写“报告”表：默认只开周报 */
export const DEFAULT_REPORTS: ReportSwitch = { 日报: false, 周报: true, 月报: false }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/^`|`$/g, ''))
/** 某个标题下面的内容（到下一个同级或更高的标题为止） */
function section(md: string, title: string, level = 2): string | undefined {
  const hashes = '#'.repeat(level)
  const re = new RegExp(`^${hashes}\\s*${title}\\s*\\r?\\n([\\s\\S]*?)(?=^#{1,${level}}\\s|$(?![\\s\\S]))`, 'm')
  return md.match(re)?.[1]
}
/** 一节里的表：表头 + 数据行（跳过分隔行） */
function table(sec: string) {
  const rows = sec.split(/\r?\n/).filter((l) => l.trim().startsWith('|')).map(cells)
  return { head: rows[0] ?? [], rows: rows.slice(1).filter((r) => !r.every((x) => /^:?-+:?$/.test(x) || x === '')) }
}

/** “叫法”：每行“类型：原来的状态 → 新叫法”（→、->、=、改叫 都认） */
function renames(md: string): Record<string, Record<string, string>> {
  const sec = section(md, '叫法', 3) ?? section(md, '叫法', 2) ?? ''
  const out: Record<string, Record<string, string>> = {}
  for (const l of bullets(sec)) {
    const m = l.match(/^(.+?)[:：]\s*(.+?)\s*(?:→|->|=|改叫|叫)\s*(.+)$/)
    if (m) (out[m[1].trim()] ??= {})[m[2].trim()] = m[3].trim()
  }
  return out
}

export function parseProfile(raw: string): { classes: FocusClass[]; problems: string[]; candidates: { what: string; count: number; at: string }[]; reports: ReportSwitch; reportsSet: boolean } {
  const md = raw.replace(/^﻿/, '')
  const problems: string[] = []
  const classes: FocusClass[] = []
  const names = renames(md)
  const focus = section(md, '我关注的')
  if (focus === undefined) problems.push('知识库档案.md 里没有“我关注的”这一节')
  else {
    const t = table(focus)
    if (!t.head.length) problems.push('“我关注的”这一节里没有表')
    else if (FOCUS_HEAD.some((h, i) => t.head[i] !== h)) problems.push(`“我关注的”的表头要一字不改：${FOCUS_HEAD.join(' | ')}（现在是：${t.head.join(' | ')}）`)
    else for (const row of t.rows) {
      const [name, rawFolder, confirm] = row
      // “文件怎么认”（约定 9.3）：按表头找这一列，几种放法用分号隔开（中文、英文分号都认）
      const iPat = t.head.indexOf('文件怎么认')
      const match = iPat >= 0 ? (row[iPat] ?? '').split(/[;；]/).map((x) => x.trim().replace(/^\/+/, '')).filter(Boolean) : []
      const folder = (rawFolder ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
      const def = typeDef(name)
      if (!name || !folder) { problems.push(`有一行没写类型或文件夹：${name ?? ''}`); continue }
      if (!def) { problems.push(`“${name}”不在类型库里，不出页面（类型库只有：项目、客户、产品、案例、作品、渠道、门店、伙伴、主题；类型库没有的东西记进“候选类型”）`); continue }
      if (!def.page) { problems.push(`“${name}”在类型库里，但工作台这一版还没做它的页面（现在有页面的：${PAGE_TYPES.join('、')}）`); continue }
      if (folder.startsWith('/') || folder.split('/').includes('..')) { problems.push(`“${name}”的文件夹要写知识库里面的（现在是 ${rawFolder}）`); continue }
      if (classes.some((x) => x.name === name)) { problems.push(`“${name}”写了两次，只认第一次`); continue }
      const rename = names[name] ?? {}
      for (const k of Object.keys(rename)) if (!def.statuses.includes(k)) problems.push(`“叫法”里给${name}的“${k}”换了叫法，但类型库里${name}没有这个状态`)
      classes.push({ name, folder, statuses: def.statuses.map((s) => rename[s] ?? s), fields: def.fields, links: def.links, icon: def.icon, rename, confirmed: (confirm ?? '').trim() === '已确认', ...(match.length ? { match } : {}) })
    }
  }
  const cand = section(md, '候选类型')
  const candidates = cand ? table(cand).rows.filter((r) => r[0]).map(([what, n, at]) => ({ what, count: Number(n) || 0, at: at ?? '' })) : []
  const rep = section(md, '报告')
  const reports: ReportSwitch = { ...DEFAULT_REPORTS }
  let reportsSet = false
  if (rep !== undefined) {
    const t = table(rep)
    if (REPORT_HEAD.some((h, i) => t.head[i] !== h)) problems.push(`“报告”的表头要一字不改：${REPORT_HEAD.join(' | ')}；先按默认（只开周报）`)
    else {
      reportsSet = true
      for (const [k, sw] of t.rows) if (k === '日报' || k === '周报' || k === '月报') reports[k] = /^(开|开着|是|on)$/i.test((sw ?? '').trim())
    }
  }
  return { classes, problems, candidates, reports, reportsSet }
}
