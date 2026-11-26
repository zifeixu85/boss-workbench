#!/usr/bin/env node
// 知识库检测（约定第 9.6 节“检测怎么说”）：按档案看这个知识库现在能撑起工作台的哪些页面。
// 对得上的照常用；对不上的一屏说清：现在就能用的页面；缺的是知识库这一半（客户、项目、报告放在哪）的，下一步说“检查一下我的知识库”
// （知识库工具的升级检查）；缺的是助理的，下一步说“认识一下我的总助”（建助理的引导工具）。两种都缺就两句都给，先知识库后助理。
// 知识库和助理是分开的（2026-11-26 A梦 定）：没有助理不算知识库有问题。
// 工作台不替用户改知识库的结构：这里只看、只说，不写任何文件。
//
// 用法（搭工作台之前，对老板说的那个知识库文件夹跑；不在电脑上到处找）：
//   node scripts/kb-check.mjs "<知识库文件夹>" [--json]
// 搭好以后个人助理模块的页面、命令 pa-check 用的也是这一份（checkKb）；认对象文件（objectFiles）也共用。故意写成普通 JS，零依赖。
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NEXT_SAY = '检查一下我的知识库'
export const ASSISTANT_SAY = '认识一下我的总助'

/** 档案按顺序找：根目录 知识库档案.md；老板知识库工具建的 01-AI协作/建库档案.md（约定 9.1） */
// 叫法中性（2026-11-26）：知识库工具新建的库也用 知识库档案.md，不是个人助理才有
const PROFILES = [{ path: '知识库档案.md', kind: '知识库档案' }, { path: '01-AI协作/建库档案.md', kind: '旧结构的建库档案' }]
/** 建库还没做完：知识库档案开头“建库方式”的这几个值（知识库工具 b577aec） */
export const BUILDING = /^(梳理进行中|快速版进行中|完整版进行中)$/
export const CONTINUE_SAY = '继续建库'
const LOG_KEY = '往来记录（写不进原文件时放这）'
/** “位置”小节的七个名字和没填时的默认位置（约定 9.2） */
export const DEFAULT_POSITIONS = { 关于我: '01-关于我', 你是谁这一页: '01-关于我/USER.md', 助理: '01-关于我/助理', 报告: '90-日志与报告', 原件: '99-原始材料', 收件箱: '00-收件箱', [LOG_KEY]: '90-日志与报告/往来记录' }
/** 类型库里出页面的几类（和个人助理模块的 type-library.ts、知识库工具的 mapping.mjs 一致；那边改了这里跟着改） */
const PAGE_TYPES = ['项目', '客户', '产品', '案例', '作品', '渠道', '门店', '伙伴', '主题']
const ALL_TYPES = [...PAGE_TYPES, '渠道', '门店', '伙伴', '主题']
/** 用户自己的“类型”值（英文的）当成哪一类 */
const TYPE_ALIAS = { project: '项目', client: '客户', customer: '客户', product: '产品', case: '案例' }
/** 没写“文件怎么认”时的默认（约定 9.3）：<名称>.md 或 <名称>/README.md */
export const DEFAULT_PATTERNS = ['*.md', '*/README.md']
// 用 * 认到的这些不算对象；最后一段写明了文件名（比如 README.md）才算
const NOT_OBJECT = /^(readme|readme-知识库|index|索引|agents|claude)\.md$/i
const SKIP_DIRS = new Set(['工作台', 'node_modules'])
/**
 * 一份写着很多个对象的汇总（客户原话集、成交反馈、价格表、商机总表……）不算一个对象（约定 9.7）。
 * 只看文件名的结尾；“文件怎么认”里写明了文件名的照认。和知识库工具 scripts/mapping.mjs 的 SUMMARY_NAME 是同一份词表，改要两边一起改。
 */
export const SUMMARY_NAME = /(总表|汇总|清单|列表|价格表|价目表|报价单|原话集|合集|集锦|反馈|模板|索引|目录)\.md$/i
export const isSummaryName = (name) => SUMMARY_NAME.test(name)

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

/** “文件怎么认”一格：几种放法用分号隔开（中文、英文分号都认） */
export const splitPatterns = (cell) => String(cell ?? '').split(/[;；]/).map((s) => s.trim().replace(/^\/+/, '')).filter(Boolean)

/** 文件开头属性里的“类型”（只读开头一小段） */
function typeOf(abs) {
  let head = ''
  try { const fd = openSync(abs, 'r'); try { const buf = Buffer.alloc(4096); head = buf.subarray(0, readSync(fd, buf, 0, 4096, 0)).toString('utf8') } finally { closeSync(fd) } } catch { return '' }
  const m = head.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return (m?.[1].match(/^类型\s*:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1] ?? '').trim()
}

/**
 * 一类对象的文件（约定 9.3）：按“文件怎么认”找，* 代表任意一段名字、一段一层；没写就是 <名称>.md 或 <名称>/README.md。
 * 用 * 认到的 README、索引、汇总（原话集、价格表……）这类不算，写明了文件名的才算；开头写了“类型”、又不是这一类的不算（项目层里“类型: 待办”的近期要事）。
 * 返回从知识库根目录起的路径，排好序。
 */
export function objectFiles(root, folder, patterns, type) {
  const pats = patterns && patterns.length ? patterns : DEFAULT_PATTERNS
  const found = new Set()
  const toRe = (seg) => new RegExp(`^${seg.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i')
  for (const pat of pats) {
    const segs = pat.split('/').filter(Boolean)
    const literal = !segs.at(-1)?.includes('*')
    const walk = (dirRel, rest) => {
      let entries = []
      try { entries = readdirSync(join(root, dirRel), { withFileTypes: true }) } catch { return }
      const re = toRe(rest[0])
      for (const e of entries) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || !re.test(e.name)) continue
        const rel = `${dirRel}/${e.name}`
        if (rest.length > 1) { if (e.isDirectory()) walk(rel, rest.slice(1)); continue }
        if (!e.isFile() || !/\.md$/i.test(e.name) || (!literal && (NOT_OBJECT.test(e.name) || isSummaryName(e.name)))) continue
        const t = type ? typeOf(join(root, rel)) : ''
        if (t && t !== type && TYPE_ALIAS[t.toLowerCase()] !== type) continue
        found.add(rel)
      }
    }
    if (segs.length) walk(clean(folder), segs)
  }
  return [...found].sort((a, b) => a.localeCompare(b, 'zh'))
}

/** 旧结构（老板知识库工具建的）里客户、项目在哪一层，和各自的放法（客户有的在分组文件夹里）；和知识库工具 mapping.mjs 的 OLD_CLASS 一致 */
const LAYERS = [{ name: '客户', layer: '04-客户', patterns: ['*.md', '*/*.md'] }, { name: '项目', layer: '06-项目', patterns: ['*.md', '*/README.md'] }]

/**
 * 档案里没有“我关注的”表时，按“目录对应”推出客户、项目在哪（约定 9.1，2026-11-25 A梦 定）。probe(folder, patterns, type) 看那个文件夹：
 * true / 'ok' 有对象文件；'empty' 文件夹在但认不出对象文件；false / 'missing' 没有这个文件夹。推出来的都要用户确认（待确认）。
 */
export function deriveClasses(text, probe) {
  const map = {}
  const t = table(text, '目录对应')
  if (t) {
    const iLayer = Math.max(0, t.head.indexOf('层'))
    const iPlace = (() => { const i = t.head.findIndex((h) => ['实际位置', '位置', '文件夹'].includes(h)); return i < 0 ? 1 : i })()
    for (const row of t.rows) { const layer = clean(row[iLayer]); const place = clean(row[iPlace]); if (layer && place && !place.includes('..')) map[layer] = place }
  }
  return LAYERS.map(({ name, layer, patterns }) => {
    const folder = map[layer] ?? layer
    const p = probe(folder, patterns, name)
    return { name, layer, folder, patterns, state: p === true ? 'ok' : p === false ? 'missing' : p }
  })
}

/** “位置”小节：登记的优先，没登记的用默认（“往来记录”一行左边带不带括号里的说明都认） */
export function readPositions(text) {
  const out = { ...DEFAULT_POSITIONS }
  for (const [what, where] of table(text, '位置')?.rows ?? []) {
    const key = what === '往来记录' ? LOG_KEY : what
    if (key in out && clean(where) && !clean(where).includes('..')) out[key] = clean(where)
  }
  return out
}

/** 档案：按顺序找到的第一份（根目录的优先）和它的全文 */
export function readProfile(root) {
  const found = PROFILES.find((p) => isFile(join(root, p.path)))
  return found ? { ...found, text: readFileSync(join(root, found.path), 'utf8') } : null
}

/**
 * 看一个知识库。返回：exists、profile（找到的档案和是哪种）、positions（七个位置，登记的优先）、
 * pages（每页：能用 / 要升级检查 / 还没建助理，缺什么、在哪）、ready（全都对得上）、kbReady（知识库这一半对得上）、
 * says（下一步说的话：先知识库后助理）、next（第一句，旧的调用方用）。
 */
export function checkKb(rootIn) {
  const root = resolve(String(rootIn ?? ''))
  if (!isDir(root)) return { root, exists: false, profile: { path: null, kind: null }, positions: { ...DEFAULT_POSITIONS }, pages: [], ready: false, kbReady: false, says: [{ say: NEXT_SAY, for: '知识库' }], next: NEXT_SAY }
  const found = readProfile(root)
  const text = found?.text ?? ''
  const positions = readPositions(text)
  const at = (rel) => join(root, rel)

  // 我关注的：档案里的表（文件怎么认那一列按表头找），每一类的文件夹在不在、认得出几份、是不是类型库里有页面的类
  const focusTable = table(text, '我关注的')
  const iPat = focusTable?.head.indexOf('文件怎么认') ?? -1
  const classes = (focusTable?.rows ?? []).filter((r) => r[0]).map((row) => {
    const [name, folder] = row
    const f = clean(folder)
    // 类型库里没有的是老板自己登记的一类（约定 11.8，比如“学员”）：用通用的列表和详情，照样算对得上
    const custom = !ALL_TYPES.includes(name)
    const why = !custom && !PAGE_TYPES.includes(name) ? `“${name}”这一类还没做页面` : !f || f.includes('..') ? '没写文件夹' : !isDir(at(f)) ? `登记的文件夹 ${f} 没有` : ''
    return { name, folder: f, ok: !why, ...(custom ? { custom: true } : {}), ...(why ? { why } : { count: objectFiles(root, f, iPat >= 0 ? splitPatterns(row[iPat]) : [], name).length }) }
  })
  // 老结构没有“我关注的”表：按目录对应推出客户、项目（推出来的标待确认）；推不出来的说清是没有还是认不出文件
  const derived = found?.kind === '旧结构的建库档案' && !focusTable
    ? deriveClasses(text, (f, pats, type) => (!isDir(at(f)) ? 'missing' : objectFiles(root, f, pats, type).length ? 'ok' : 'empty')) : []
  for (const d of derived.filter((x) => x.state === 'ok')) classes.push({ name: d.name, folder: d.folder, ok: true, derived: true, count: objectFiles(root, d.folder, d.patterns, d.name).length })
  const okClasses = classes.filter((c) => c.ok)
  const lost = (d) => (d.state === 'missing' ? `${d.folder} 没有` : `${d.folder} 里没有文件`)
  const focusNeed = !found ? '还没有知识库档案（知识库档案.md），不知道项目、客户这些放在哪'
    : derived.length && !okClasses.length ? `档案里没有“我关注的”表，按目录对应也推不出来：${derived.map(lost).join('；')}。客户、项目要是放在别处或散在几个地方，先做一次升级检查`
    : !focusTable && !derived.length ? '档案里没有“我关注的”表，不知道项目、客户这些放在哪'
    : !okClasses.length ? `“我关注的”表里登记的类都对不上：${classes.map((c) => c.why).join('；') || '表是空的'}`
    : ''

  const folderPage = (id, label, what, does, missing) => {
    const where = positions[what]
    const ok = isDir(at(where))
    return { id, label, status: ok ? '能用' : missing.status, where, does, ...(ok ? {} : { need: missing.need(where) }) }
  }
  const pages = [
    { id: 'progress', label: '进展', status: '能用', does: '所有 AI 对话做到哪了', kb: false },
    { id: 'outputs', label: '产出', status: '能用', does: 'AI 生成的图和写出来的文件', kb: false },
    { id: 'focus', label: '我关注的', status: focusNeed ? '要升级检查' : '能用', does: '项目、客户这些对象的列表和详情', classes, ...(focusNeed ? { need: focusNeed } : {}),
      ...(!focusNeed && derived.length ? { note: `按建库档案的“目录对应”推出来的（${okClasses.map((c) => `${c.name}：${c.folder}`).join('，')}），待确认${derived.filter((d) => d.state !== 'ok').map((d) => `；${d.name}没推出来（${lost(d)}）`).join('')}` } : {}) },
    // 助理和知识库分开：还没建助理不是知识库的问题，下一步是建总助，不是升级检查
    folderPage('roles', '助理', '助理', '总助、内容助理、分身的文件齐不齐', { status: '还没建助理', need: (w) => `还没有助理（助理放在 ${w}）。建第一个总助时会自动建好` }),
    folderPage('reports', '报告', '报告', '日报、周报', { status: '要升级检查', need: (w) => `还没有报告文件夹（${w}）` }),
    folderPage('confirm', '驾驶舱里“要你确认的资料”', '收件箱', '收件箱里等你看的材料', { status: '要升级检查', need: (w) => `还没有收件箱文件夹（${w}）` }),
  ]
  const kbReady = pages.every((p) => p.status !== '要升级检查') && classes.every((c) => c.ok && !c.derived)
  const assistantMissing = pages.some((p) => p.status === '还没建助理')
  // 建库还没做完（梳理、采访做到一半）：先说“继续建库”做完，再谈升级检查和助理
  const way = (text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(/^建库方式\s*[:：]\s*(.+?)\s*$/m)?.[1] ?? '').trim()
  const building = BUILDING.test(way) ? way : null
  const says = [...(building ? [{ say: CONTINUE_SAY, for: '知识库' }] : []), ...(kbReady || building ? [] : [{ say: NEXT_SAY, for: '知识库' }]), ...(assistantMissing ? [{ say: ASSISTANT_SAY, for: '助理' }] : [])]
  return { root, exists: true, profile: { path: found?.path ?? null, kind: found?.kind ?? null }, positions, pages, building, ready: kbReady && !assistantMissing && !building, kbReady, says, next: says[0]?.say ?? NEXT_SAY }
}

/** 一屏说清：现在就能用的、要先做升级检查才能用的（各缺什么）、还没建的助理、下一步说哪一句 */
export function checkText(r) {
  if (!r.exists) return `找不到这个文件夹：${r.root}\n请老板确认知识库放在哪个文件夹，再检测一次。`
  if (r.ready) return `知识库：${r.root}\n档案：${r.profile.path}\n结构对得上，个人助理的页面都能用。`
  const ok = r.pages.filter((p) => p.status === '能用')
  const need = r.pages.filter((p) => p.status === '要升级检查')
  const helper = r.pages.filter((p) => p.status === '还没建助理')
  const focus = r.pages.find((p) => p.id === 'focus')
  const bad = (focus?.classes ?? []).filter((c) => !c.ok)
  const sayLine = (s) => (s.say === CONTINUE_SAY ? `先对 AI 说“${s.say}”，把建库做完。`
    : s.for === '知识库'
    ? `想把知识库这一半也用起来，对 AI 说“${s.say}”（知识库工具会读你的结构、列出差异，你确认了才改）。`
    : `想用助理，对 AI 说“${s.say}”（会问你几件事，建好第一个总助）。`)
  return [
    `知识库：${r.root}`,
    `档案：${r.profile.path ? `${r.profile.path}${r.profile.kind && r.profile.kind !== '知识库档案' ? `（${r.profile.kind}）` : ''}` : '还没有'}${r.kbReady ? '；知识库对得上' : ''}`,
    '',
    ...(r.building ? [`建库还没做完（${r.building}）：资料还在整理，整理完客户、项目这些才齐。`, ''] : []),
    `现在就能用：${ok.map((p) => p.label).join('、') || '（没有）'}；待办、日程、收件箱这些不靠知识库，也都能用。`,
    ...(need.length ? ['', '要先做升级检查才能用：', ...need.map((p) => `- ${p.label}：${p.need}`)] : []),
    ...(bad.length && !need.some((p) => p.id === 'focus') ? ['', '我关注的里有几类对不上：', ...bad.map((c) => `- ${c.name}：${c.why}`)] : []),
    ...(focus?.note ? ['', `我关注的：${focus.note}；做一次升级检查就能登记下来`] : []),
    ...(helper.length ? ['', ...helper.map((p) => `${p.label}：${p.need}`)] : []),
    '',
    `下一步：可以先搭能用的部分。${r.says.map(sayLine).join('')}`,
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const dir = args.find((a) => !a.startsWith('--'))
  if (!dir) { console.error('用法：node scripts/kb-check.mjs "<知识库文件夹>" [--json]'); process.exit(2) }
  const r = checkKb(dir)
  console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : checkText(r))
}
