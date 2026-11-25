#!/usr/bin/env node
// 知识库检测（约定 v0.6 第 9.6 节“检测怎么说”）：按档案看这个知识库现在能撑起工作台的哪些页面。
// 对得上的照常用；对不上的一屏说清三件事：现在就能用的页面、要先做升级检查才能用的页面（各缺什么）、下一步对 AI 说哪一句。
// 工作台不替用户改知识库的结构：补齐、登记对照表是知识库工具“升级检查”的事。这里只看、只说，不写任何文件。
//
// 用法（搭工作台之前，对老板说的那个知识库文件夹跑；不在电脑上到处找）：
//   node scripts/kb-check.mjs "<知识库文件夹>" [--json]
// 搭好以后个人助理模块的页面、命令 pa-check 用的也是这一份（checkKb）。故意写成普通 JS，零依赖。
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NEXT_SAY = '检查一下我的知识库'

/** 档案按顺序找：根目录 知识库档案.md；老板知识库工具建的旧结构 01-AI协作/建库档案.md（约定 9.1） */
const PROFILES = [{ path: '知识库档案.md', kind: '个人助理版' }, { path: '01-AI协作/建库档案.md', kind: '旧结构' }]
/** “位置”小节的六个名字和没填时的默认位置（约定 9.2） */
export const DEFAULT_POSITIONS = { 关于我: '01-关于我', 你是谁这一页: '01-关于我/USER.md', 助理: '01-关于我/助理', 报告: '90-日志与报告', 原件: '99-原始材料', 收件箱: '00-收件箱' }
/** 类型库里出页面的几类（和个人助理模块的 type-library.ts 一致；那边改了这里跟着改） */
const PAGE_TYPES = ['项目', '客户', '产品', '案例', '作品']
const ALL_TYPES = [...PAGE_TYPES, '渠道', '门店', '伙伴', '主题']

const isDir = (p) => { try { return statSync(p).isDirectory() } catch { return false } }
const isFile = (p) => { try { return statSync(p).isFile() } catch { return false } }
const clean = (s) => String(s ?? '').trim().replace(/^\/+|\/+$/g, '')

/** “## 标题”下的那张表：返回表头和每一行（单元格去掉空格） */
function table(text, heading) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const at = lines.findIndex((l) => new RegExp(`^##\\s*${heading}\\s*$`).test(l.trim()))
  if (at < 0) return null
  const rows = []
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const l = lines[i].trim()
    if (!l.startsWith('|') || /^\|[\s:|-]+\|$/.test(l)) continue
    rows.push(l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
  }
  return rows.length ? { head: rows[0], rows: rows.slice(1) } : { head: [], rows: [] }
}

/**
 * 看一个知识库。返回：exists、profile（找到的档案和是哪种）、positions（六个位置，登记的优先）、
 * pages（每页：能用 / 要升级检查 / 不用知识库照样能用，缺什么、在哪）、ready（全都对得上）、next（下一步说的话）。
 */
export function checkKb(rootIn) {
  const root = resolve(String(rootIn ?? ''))
  if (!isDir(root)) return { root, exists: false, profile: { path: null, kind: null }, positions: { ...DEFAULT_POSITIONS }, pages: [], ready: false, next: NEXT_SAY }
  const found = PROFILES.find((p) => isFile(join(root, p.path)))
  const text = found ? readFileSync(join(root, found.path), 'utf8') : ''
  const positions = { ...DEFAULT_POSITIONS }
  for (const [what, where] of table(text, '位置')?.rows ?? []) if (what in positions && clean(where) && !clean(where).includes('..')) positions[what] = clean(where)
  const at = (rel) => join(root, rel)

  // 我关注的：档案里的表，每一类的文件夹在不在、是不是类型库里有页面的类
  const focusTable = table(text, '我关注的')
  const classes = (focusTable?.rows ?? []).filter((r) => r[0]).map(([name, folder]) => {
    const f = clean(folder)
    const why = !ALL_TYPES.includes(name) ? `“${name}”不在类型库里，没有页面` : !PAGE_TYPES.includes(name) ? `“${name}”这一类还没做页面` : !f || f.includes('..') ? '没写文件夹' : !isDir(at(f)) ? `登记的文件夹 ${f} 没有` : ''
    return { name, folder: f, ok: !why, ...(why ? { why } : {}) }
  })
  const okClasses = classes.filter((c) => c.ok)
  const focusNeed = !found ? '还没有知识库档案（知识库档案.md），不知道项目、客户这些放在哪'
    : !focusTable ? `${found.kind === '旧结构' ? '旧结构的' : ''}档案里没有“我关注的”表，不知道项目、客户这些放在哪`
    : !okClasses.length ? `“我关注的”表里登记的类都对不上：${classes.map((c) => c.why).join('；') || '表是空的'}`
    : ''

  const folderPage = (id, label, what, does) => {
    const where = positions[what]
    const ok = isDir(at(where))
    return { id, label, status: ok ? '能用' : '要升级检查', where, does, ...(ok ? {} : { need: `还没有${what}文件夹（${where}）` }) }
  }
  const pages = [
    { id: 'progress', label: '进展', status: '能用', does: '所有 AI 对话做到哪了', kb: false },
    { id: 'outputs', label: '产出', status: '能用', does: 'AI 生成的图和写出来的文件', kb: false },
    { id: 'focus', label: '我关注的', status: focusNeed ? '要升级检查' : '能用', does: '项目、客户这些对象的列表和详情', classes, ...(focusNeed ? { need: focusNeed } : {}) },
    folderPage('roles', '助理', '助理', '总助、内容助理、分身的文件齐不齐'),
    folderPage('reports', '报告', '报告', '日报、周报'),
    folderPage('confirm', '驾驶舱里“要你确认的资料”', '收件箱', '收件箱里等你看的材料'),
  ]
  const ready = pages.every((p) => p.status === '能用') && classes.every((c) => c.ok)
  return { root, exists: true, profile: { path: found?.path ?? null, kind: found?.kind ?? null }, positions, pages, ready, next: NEXT_SAY }
}

/** 一屏说清：现在就能用的、要先做升级检查才能用的（各缺什么）、下一步说哪一句 */
export function checkText(r) {
  if (!r.exists) return `找不到这个文件夹：${r.root}\n请老板确认知识库放在哪个文件夹，再检测一次。`
  const ok = r.pages.filter((p) => p.status === '能用')
  const need = r.pages.filter((p) => p.status !== '能用')
  const bad = (r.pages.find((p) => p.id === 'focus')?.classes ?? []).filter((c) => !c.ok)
  if (r.ready) return `知识库：${r.root}\n档案：${r.profile.path}\n结构对得上，个人助理的页面都能用。`
  return [
    `知识库：${r.root}`,
    `档案：${r.profile.path ? `${r.profile.path}（${r.profile.kind}）` : '还没有'}`,
    '',
    `现在就能用：${ok.map((p) => p.label).join('、') || '（没有）'}；待办、日程、收件箱这些不靠知识库，也都能用。`,
    ...(need.length ? ['', '要先做升级检查才能用：', ...need.map((p) => `- ${p.label}：${p.need}`)] : []),
    ...(bad.length && !need.some((p) => p.id === 'focus') ? ['', '我关注的里有几类对不上：', ...bad.map((c) => `- ${c.name}：${c.why}`)] : []),
    '',
    `下一步：可以先搭能用的部分；想把上面这些也用起来，对 AI 说“${r.next}”（知识库工具会读你的结构、列出差异，你确认了才改）。`,
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const dir = args.find((a) => !a.startsWith('--'))
  if (!dir) { console.error('用法：node scripts/kb-check.mjs "<知识库文件夹>" [--json]'); process.exit(2) }
  const r = checkKb(dir)
  console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : checkText(r))
}
