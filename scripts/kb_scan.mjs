#!/usr/bin/env node
// 读知识库的“地图”和每个文件开头的元信息，输出一份清单（JSON），不读全文。
// 用法：node kb_scan.mjs <知识库根目录> [--max 3000]
// 只读，不改任何文件。Mac、Windows 都能用（输出路径一律用 /；认 Windows 换行和 BOM）。
// 认两种知识库：老板知识库 v2（建库档案写 格式: 老板知识库/2，根目录 AGENTS.md 有维护标记）和旧格式（知识库说明.md）。
//
// 先读建库档案（结构、目录对应、只读 / 不读、示例），再走一遍文件：
// - 不进：工作台/、node_modules、点开头的文件夹，以及登记为“原有·不读”的文件夹（不计数，也不输出里面的文件名）。
// - 只计数、不认成客户 / 达人 / 项目 / 待办 / 作品：“原有·只读”的文件夹、99-原始材料（就地建图按目录对应找）、
//   模板（模板/、Templates/、templates/、_templates/、Obsidian 设置的模板文件夹，文件名或开头元信息里带 {{ 或 <% 的）。
// - 待办只读一份：06-项目/近期要事.md（就地建图按目录对应找；旧格式 生意/近期要事.md），同一件事不会算好几次。
// - 就地建图：客户以客户层说明里的“建库快照”为准（快照还没填时看索引里类型是客户的行），项目以项目层说明的索引为准；
//   对不上的文件列进 unrecognized_files。只读、不读、原始材料、模板这几个文件夹名不分大小写。
// - boss-kb 定期维护写的体检报告（<90 层实际位置>/体检/，类型 体检报告）只计类型，不算待确认、不当收件箱材料或没登记的文件。
// 输出里还有：kb（是不是老板知识库）、editor（建库档案写着“编辑器: Obsidian”是 obsidian，否则 plain；往库里写链接按它选写法）、
// warnings（要老板确认的事，例如双链只写文件名、库里有几份同名）。
// 不是知识库（空文件夹，或没有建库档案、AGENTS.md 维护标记、知识库说明.md）：照样退出 0，只输出 { kb: false, reason, … }，不猜。
import { readdir, open, stat, realpath, readFile } from 'node:fs/promises'
import { statSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve, sep, posix as pathPosix } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const SKIP_DIRS = new Set(['工作台', 'node_modules', '.git', '.obsidian', '.trash', '.claude', '.codex', '.agents'])
const ENTRY_NAMES = ['AGENTS.md', '知识库说明.md', 'CLAUDE.md', 'README.md']
const GUIDE_NAMES = new Set(['README.md', 'README-知识库.md', '说明.md', 'AGENTS.md', '索引.md'])
const HEAD_BYTES = 8192 // 文件开头的元信息一般不到 2KB，留足余量
const FORMAT_V2 = '老板知识库/2'
// 必读文件：v2 一套（就地建图时按目录对应换成实际位置）；旧格式一套，只在格式不是 /2 时读
const V2_PROFILE = ['01-AI协作/建库档案.md', '01-AI协作/协作偏好.md', '02-关于我/基本情况.md', '03-生意/生意总览.md', '06-项目/近期要事.md']
const LEGACY_PROFILE = ['知识库说明.md', '关于我/基本情况.md', '关于我/AI协作偏好.md', '生意/生意总览.md', '生意/近期要事.md']
const TEMPLATE_DIRS = new Set(['模板', 'templates', '_templates']) // 比的时候不分大小写：Templates、_Templates 也算
const TEMPLATE_MARK = /\{\{|<%/ // Obsidian 核心模板 {{title}}、Templater 插件 <% … %>
const CUSTOMER_TYPE = /^(客户|合作方|品牌方|会员)(档案)?$/
const CREATOR_TYPE = /^达人(档案)?$/
const PROJECT_TYPE = /^项目(档案)?$/
const PLACEHOLDER = /^[（(](待填|还没有|暂时没有)[）)]$/
const TEMPLATE_LIKE = /模板|样板|范本|template/i // 按文件名猜客户、项目时，这类名字不猜
const FILE_EXT = /\.(md|pdf|docx?|xlsx?|pptx?|csv|txt|png|jpe?g)$/i
const MARK_START = /<!--\s*老板知识库 v\d+/
const MARK_END = /<!--\s*本段结束\s*-->/
const CLOUD_RE = /Mobile Documents|CloudStorage|iCloud ?Drive|Dropbox|OneDrive|Google ?Drive|坚果云|Nutstore|百度网盘|BaiduNetdisk|BaiduSyncdisk|WPS ?云盘|WPSDrive|阿里云盘|夸克网盘/i

export class ScanError extends Error {}

// ───── 小工具 ─────
// Windows 的路径分隔符是 \，输出统一用 /，和知识库里写的路径一致；Mac 上的中文文件名统一成 NFC，方便和表格里写的比对
const posix = (p) => p.split(sep).join('/').normalize('NFC')
const lines = (text) => text.replace(/^﻿/, '').split(/\r?\n/)
const inFolder = (rel, folder) => rel === folder || rel.startsWith(`${folder}/`)
// 只读 / 不读 / 原始材料 / 模板这几个区，比的时候不分大小写：Mac、Windows 的文件夹名不分大小写，
// 表里写 Private/、实际是 private/ 时照样认出来，宁可多跳过，也不把“不读”的文件夹读进来
const inZone = (rel, folders) => { const r = rel.toLowerCase(); return folders.some((f) => inFolder(r, f.toLowerCase())) }
const unquote = (s) => s.replace(/^["']|["']$/g, '')
const noMd = (name) => name.replace(/\.md$/i, '')

async function head(file, bytes = HEAD_BYTES) {
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return buf.subarray(0, bytesRead).toString('utf8').replace(/^﻿/, '')
  } finally { await fh.close() }
}

async function exists(p) { try { await stat(p); return true } catch { return false } }
function isFileAt(root, rel) { try { return statSync(join(root, rel)).isFile() } catch { return false } }

// 开头元信息：“键: 值”，以及“键:”下一行起的“  - 值”列表；兼容 Windows 换行、BOM、中文冒号
function frontmatter(text) {
  const ls = lines(text)
  if (ls[0].trim() !== '---') return {}
  const meta = {}
  let last = null
  for (let i = 1; i < ls.length; i++) {
    if (ls[i].trim() === '---') return meta
    const item = ls[i].match(/^\s*-\s+(.*?)\s*$/)
    if (item && last) {
      const prev = meta[last]
      meta[last] = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), unquote(item[1])]
      continue
    }
    const m = ls[i].match(/^\s*([^:：#\s-][^:：]*?)\s*[:：]\s*(.*?)\s*$/)
    if (m) { last = m[1].trim(); meta[last] = unquote(m[2]) }
  }
  return {} // 没有结尾的 ---，不当元信息
}

/** 取第一个有值的键；列表用“、”连起来 */
function pick(meta, ...keys) {
  for (const k of keys) {
    const v = meta[k]
    if (Array.isArray(v) ? v.length : v) return Array.isArray(v) ? v.join('、') : v
  }
  return undefined
}

/** 别名：可以是列表，也可以是“老张、张哥”“[老张, 张哥]”这样一格里写几个；括号里的备注去掉 */
function aliases(...values) {
  const parts = values.flat().filter(Boolean)
    .flatMap((v) => String(v).replace(/^\[|\]$/g, '').split(/[、，,/／;；]/))
    .map((s) => unquote(s.replace(/[（(][^（()）]*[）)]/g, '').trim()))
  return [...new Set(parts.filter(Boolean))]
}

// ───── 表格 ─────
/**
 * 拆一行表格：认 \| 转义，也不拆 [[名|显示名]] 里的竖线。
 * 后面真有 ]]（中间没有别的 [[）才把 [[…]] 当一个整体；没闭合的 [[ 当普通字，后面的竖线照常切列（和 boss-kb 体检一样切）
 */
function splitRow(line) {
  const s = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const cells = []
  let cur = ''
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue }
    if (s[k] === '[' && s[k + 1] === '[') {
      const close = s.indexOf(']]', k + 2)
      if (close > 0 && !s.slice(k + 2, close).includes('[[')) { cur += s.slice(k, close + 2).replace(/\\\|/g, '|'); k = close + 1; continue }
    }
    if (s[k] === '|') { cells.push(cur.trim()); cur = ''; continue }
    cur += s[k]
  }
  cells.push(cur.trim())
  return cells
}

const cleanCell = (c) => (c || '').replace(/^`(.*)`$/, '$1').trim()

/** 某个标题（## 到 ####，以 heading 开头）下面的第一张表：{ header, rows }。取列按表头名，不按位置 */
function tableUnder(text, heading) {
  const ls = lines(text)
  const i = ls.findIndex((l) => new RegExp(`^#{2,4}\\s*${heading}`).test(l.trim()))
  if (i < 0) return null
  let header = null
  const rows = []
  for (let j = i + 1; j < ls.length; j++) {
    const l = ls[j].trim()
    if (/^#{1,4}\s/.test(l)) break
    if (!l.startsWith('|')) { if (header) break; continue }
    if (/^\|[\s:|-]+\|?$/.test(l)) continue
    const cells = splitRow(l)
    if (!header) header = cells.map((h) => cleanCell(h).replace(/\s+/g, ''))
    else if (!cells.every((c) => !cleanCell(c) || PLACEHOLDER.test(cleanCell(c)))) rows.push(cells)
  }
  return header ? { header, rows } : null
}

/** 作品索引按每张表的数据行计数；表头、分隔线、空行和全占位行不算作品。 */
function workTableRows(text) {
  const ls = lines(text)
  const separator = (line) => /^\s*\|/.test(line || '') && splitRow(line).every((c) => /^:?-+:?$/.test(c.trim()))
  let inTable = false, count = 0
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i]
    if (!/^\s*\|/.test(line)) { inTable = false; continue }
    const cells = splitRow(line)
    if (separator(ls[i + 1]) && cells.length === splitRow(ls[i + 1]).length) {
      inTable = true
      i++ // 每一张表都单独跳过表头和分隔线
      continue
    }
    if (inTable && !separator(line) && cells.some((c) => cleanCell(c) && !PLACEHOLDER.test(cleanCell(c)))) count++
  }
  return count
}

/** 表头里第一个叫这些名字的列；都没有返回 fallback（按设计的位置取） */
function colOf(header, names, fallback = -1) {
  for (const n of names) { const k = header.indexOf(n); if (k >= 0) return k }
  return fallback
}
const cellAt = (row, k) => (k >= 0 ? cleanCell(row[k]) : '')

/** 表格里的文件夹名：去掉反引号、结尾的 / 和括号备注 */
const stripFolder = (cell) => cell.replace(/[`[\]]/g, '').replace(/\s*[（(][^（()）]*[）)]\s*$/, '').trim()
  .replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()

// ───── 链接 ─────
function safeDecode(s) { try { return decodeURIComponent(s) } catch { return s } }

/**
 * 一个格子里的链接：[[名]]、[[名|显示名]]、[文字](路径)、[文字](<带 空格.md>)、<路径>；都没有就把整格当路径。
 * 路径里可以带一层成对的括号，如 [王总](王总(老客).md)（Obsidian 生成的链接不给括号转义）
 */
function linkTargets(cell) {
  const t = cleanCell(cell)
  const out = []
  for (const m of t.matchAll(/!?\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)) out.push({ wiki: true, target: m[1] })
  for (const m of t.matchAll(/\[[^\]\n]*\]\((?:<([^<>\n]+)>|((?:[^()\s]|\([^()\s]*\))+))(?:\s+"[^"]*")?\)/g)) out.push({ wiki: false, target: m[1] ?? m[2] })
  const rest = t.replace(/!?\[\[[^\]\n]*\]\]/g, '').replace(/\[[^\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '')
  for (const m of rest.matchAll(/<([^<>\n]+)>/g)) out.push({ wiki: false, target: m[1] })
  const plain = rest.replace(/<[^<>\n]+>/g, '').trim()
  if (!out.length && plain && !PLACEHOLDER.test(plain)) out.push({ wiki: false, target: plain })
  return out
    .map((x) => ({ ...x, target: safeDecode(x.target.split('#')[0].trim()).replace(/\\/g, '/') }))
    .filter((x) => x.target && !/^[a-z][a-z0-9+.-]*:/i.test(x.target) && !x.target.startsWith('/'))
}

/**
 * 把链接换成从知识库根目录算的路径。普通链接先按说明所在的文件夹算（./、../ 都认），再按根目录算；
 * [[名]] 先找说明所在的文件夹，再在全库按文件名找。格子里只写“张总”、没写 .md 的，也按 张总.md 找（boss-kb 体检也这样认）。
 * [[名]] 只写文件名、全库有几份同名时：同一个文件夹里有的按那份认，没有就按走文件的先后取第一份，
 * 两种都在 warnings 里写清是哪几份、这次按哪份认（from 是写这条链接的说明文件）。“不读”文件夹不进去，里面的同名文件不算。
 * 指到“不读”文件夹里的，不输出路径。
 */
function resolveTarget(link, baseDir, ctx, from = '') {
  const norm = (p) => pathPosix.normalize(p).replace(/^\.\//, '')
  const cands = []
  let same = []
  if (link.wiki) {
    const name = FILE_EXT.test(link.target) ? link.target : `${link.target}.md`
    if (name.includes('/')) cands.push(norm(name), norm(`${baseDir}/${name}`))
    else {
      same = ctx.byName.get(name.normalize('NFC')) || []
      cands.push(norm(`${baseDir}/${name}`), ...same)
    }
  } else {
    for (const p of [`${baseDir}/${link.target}`, link.target]) cands.push(norm(p), ...(FILE_EXT.test(p) ? [] : [norm(`${p}.md`)]))
  }
  const ok = cands.map((c) => c.normalize('NFC')).filter((c) => c && c !== '.' && !c.startsWith('../'))
  for (const c of ok) {
    if (inZone(c, ctx.zones.noread)) return { file: '', found: false }
    if (isFileAt(ctx.root, c)) {
      if (same.length > 1) warnSameName(link, same, c, from, ctx)
      return { file: c, found: true }
    }
  }
  return { file: ok[0] || '', found: false }
}

/** 同名文件的提醒：同一份说明里的同一条链接只提醒一次 */
function warnSameName(link, same, picked, from, ctx) {
  const key = `同名文件|${from}|${link.target}`
  if (ctx.warned.has(key)) return
  ctx.warned.add(key)
  const files = [...same].sort()
  const where = from ? `${from} 里的` : ''
  ctx.result.warnings.push({
    kind: '同名文件', link: `[[${link.target}]]`, source: from, files, picked,
    message: `${where}双链 [[${link.target}]] 只写了文件名，库里有 ${files.length} 份同名：${files.join('、')}。这次按 ${picked} 认，不一定对：先问老板是哪一份；要一劳永逸，在知识库里把这条链接写成从库根起的路径（如 [[${noMd(picked)}]]），改知识库用 boss-kb。`,
  })
}

// ───── 建库档案、入口 ─────
/** 建库档案：格式、结构、示例；“目录对应”表（层 | 实际位置）；“启用的模块”表 */
async function readArchive(root) {
  const out = { exists: false, format: null, structure: '标准', sample: false, editor: 'plain', layerMap: {}, readonly: [], noread: [], enabled: [], planned: [], workbenchDraft: '' }
  let text
  try { text = await readFile(join(root, '01-AI协作', '建库档案.md'), 'utf8') } catch { return out } // 旧格式或还没建库档案
  const meta = frontmatter(text)
  out.exists = true
  out.format = pick(meta, '格式') || (text.match(/格式\s*[:：]\s*(\S+)/) || [])[1] || null
  out.structure = pick(meta, '结构') || (text.match(/^\s*结构\s*[:：]\s*(\S+)/m) || [])[1] || '标准'
  out.sample = /^(是|yes|true)(?![A-Za-z0-9])/i.test((pick(meta, '示例', 'sample') || '').trim()) // 和 boss-kb 的库外读写一致：开头是“是”就算，例如“是（示例库）”
  // 编辑器：开头写着“编辑器: Obsidian”的库，文件之间的链接用双链 [[从库根写起的路径]]；没写就是普通写法（和 boss-kb 的 find_kb 一样认）
  out.editor = /^["'“]?obsidian(?![A-Za-z0-9])/i.test((pick(meta, '编辑器', 'editor') || '').trim()) ? 'obsidian' : 'plain'
  readFolderMap(text, out)
  readModules(text, out)
  out.workbenchDraft = sectionText(text, '工作台结构草案')
  return out
}

/** 某个 ## 标题下面的正文（到下一个同级或更高的标题为止），最多 3000 字；没有就是空串 */
function sectionText(text, heading) {
  const ls = lines(text)
  const i = ls.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l.trim()))
  if (i < 0) return ''
  const body = []
  for (let j = i + 1; j < ls.length; j++) {
    if (/^#{1,2}\s/.test(ls[j].trim())) break
    body.push(ls[j])
  }
  return body.join('\n').trim().slice(0, 3000)
}

/** 目录对应：层写“原有·只读”“原有·不读”的是老板原有、不对应任何层的文件夹，分开存 */
function readFolderMap(text, out) {
  const t = tableUnder(text, '目录对应')
  if (!t) return
  const kLayer = colOf(t.header, ['层'], 0)
  const kPlace = colOf(t.header, ['实际位置', '位置', '文件夹'], 1)
  for (const row of t.rows) {
    const layer = stripFolder(cellAt(row, kLayer))
    const place = stripFolder(cellAt(row, kPlace))
    if (!layer || !place) continue
    // 标准写法是“原有·只读”“原有·不读”；和 boss-kb 的库外读写一样，层里带“不读”“只读”两个字就算，写法有出入也不会把不读的文件夹读进来
    const tag = /不读/.test(layer) ? '不读' : /只读/.test(layer) ? '只读' : null
    if (tag) (tag === '不读' ? out.noread : out.readonly).push(place.normalize('NFC'))
    else if (layer !== '01-AI协作') out.layerMap[layer] = place.normalize('NFC') // 建库档案永远在 01-AI协作/，和 boss-kb 一样不跟着对应走
  }
}

/** 启用的模块：路径写“（计划）”或空着的，是还没建文件夹的计划模块 */
function readModules(text, out) {
  const t = tableUnder(text, '启用的模块')
  if (!t) return
  const k = { name: colOf(t.header, ['模块'], 0), path: colOf(t.header, ['路径'], 1), why: colOf(t.header, ['为什么启用', '为什么'], 2), proof: colOf(t.header, ['证据'], 3) }
  for (const row of t.rows) {
    const name = cellAt(row, k.name)
    if (!name) continue
    const raw = cellAt(row, k.path).replace(/[\\/]+$/, '')
    const item = { 模块: name, 路径: raw.replace(/（计划）|\(计划\)/, '').replace(/[\\/]+$/, '').trim(), 为什么: cellAt(row, k.why), 证据: cellAt(row, k.proof) }
    if (/计划/.test(raw) || !raw) out.planned.push(item) // 计划启用，还没有文件夹
    else out.enabled.push(item)
  }
}

/** 入口文件。格式是 /2 时不把根目录残留的 知识库说明.md 当入口 */
async function readEntry(root, isV2) {
  for (const name of ENTRY_NAMES) {
    if (isV2 && name === '知识库说明.md') continue
    const p = join(root, name)
    try { if (!(await stat(p)).isFile()) continue } catch { continue }
    return { name, excerpt: entryExcerpt(await head(p, 256 * 1024)) }
  }
  return { name: null, excerpt: '' }
}

/**
 * 入口摘要：有维护标记就截到“本段结束”为止。标记在前 10 行里（前面只有标题、一两句说明）就从第 1 行截；
 * 老板原有的 AGENTS.md 很长、标记段追加在末尾时，只截标记段，截到的才是地图。没有标记就截前 60 行。
 */
function entryExcerpt(text) {
  const ls = lines(text)
  const start = ls.findIndex((l) => MARK_START.test(l))
  if (start < 0) return ls.slice(0, 60).join('\n')
  const from = start <= 10 ? 0 : start
  const end = ls.findIndex((l, i) => i >= start && MARK_END.test(l))
  return ls.slice(from, end < 0 ? from + 100 : Math.min(end + 1, from + 120)).join('\n')
}

/** Obsidian 设置里的模板文件夹（核心模板插件、Templater 插件） */
async function obsidianTemplateFolders(root) {
  const out = []
  for (const [rel, key] of [['.obsidian/templates.json', 'folder'], ['.obsidian/plugins/templater-obsidian/data.json', 'templates_folder']]) {
    let conf
    try { conf = JSON.parse(await readFile(join(root, rel), 'utf8')) } catch { continue } // 没用这个插件：正常
    if (typeof conf?.[key] === 'string') out.push(stripFolder(conf[key].replace(/^\/+/, '')).normalize('NFC'))
  }
  return out.filter(Boolean)
}

// ───── 走一遍文件 ─────
async function walk(root, dir, out, max, skipDir) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  for (const e of entries) {
    if (out.length >= max) return
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !skipDir(posix(relative(root, p)))) await walk(root, p, out, max, skipDir) }
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p)
  }
}

const isTemplatePath = (rel, folders) =>
  rel.split('/').slice(0, -1).some((s) => TEMPLATE_DIRS.has(s.toLowerCase())) || inZone(rel, folders) || TEMPLATE_MARK.test(rel.split('/').pop())

/** 一份文件：先分区（只读 / 模板 / 原始材料 / 正常），再按区决定读不读、认不认对象 */
async function scanFile(f, ctx) {
  const { result, zones } = ctx
  const rel = posix(relative(ctx.root, f))
  const parts = rel.split('/')
  const top = parts.length > 1 ? parts[0] : '（根目录）'
  ctx.layerCount[top] = (ctx.layerCount[top] || 0) + 1
  if (inZone(rel, zones.readonly)) { result.skipped.readonly_files++; return }
  if (isTemplatePath(rel, zones.templates)) { result.skipped.template_files++; return }
  const base = parts[parts.length - 1]
  const meta = frontmatter(await head(f))
  if (Object.values(meta).flat().some((v) => TEMPLATE_MARK.test(v))) { result.skipped.template_files++; return }
  const raw = inZone(rel, zones.raw)
  if (raw) result.skipped.raw_files++
  if (parts.length > 1 && GUIDE_NAMES.has(base)) result.folder_guides.push(rel)
  const type = pick(meta, '类型', 'type')
  if (type) result.by_type[type] = (result.by_type[type] || 0) + 1
  const priv = pick(meta, '隐私', 'privacy')
  if (priv) result.privacy[priv] = (result.privacy[priv] || 0) + 1
  if (isCheckupReport(rel, type, ctx)) return
  const conf = pick(meta, '确认', 'status')
  if (conf && /待确认/.test(conf)) result.unconfirmed++
  if (isInbox(rel, base, ctx)) result.inbox.push(rel)
  if (raw) return
  ctx.normal.push({ rel, type: type || '' })
  await readObjects(f, rel, base, meta, ctx)
}

/**
 * boss-kb 定期维护写的体检报告：在 <90 层实际位置>/体检/（就地建图按目录对应找），开头写着“类型: 体检报告”“确认: 待确认”。
 * 只计类型和隐私，不算待确认（不然每周一份，数字越撑越大），也不当没整理的材料、没登记的文件或客户
 */
const isCheckupReport = (rel, type, ctx) => inFolder(rel, ctx.checkupDir) || type === '体检报告'

/** 还没整理的新材料：v2 在 00-收件箱/（就地建图按目录对应找）；旧格式在 原始材料/（采访记录除外） */
function isInbox(rel, base, ctx) {
  if (GUIDE_NAMES.has(base)) return false
  if (inFolder(rel, ctx.inboxDir) && rel !== ctx.inboxDir) return true
  return !ctx.isV2 && /^原始材料\//.test(rel) && !/采访记录/.test(rel)
}

/** 正常区的文件：按“类型”认客户、达人、项目、作品；作品索引数行；待确认的发现读标题 */
async function readObjects(f, rel, base, meta, ctx) {
  const { result } = ctx
  const type = pick(meta, '类型', 'type')
  const name = pick(meta, '名称', 'name') || noMd(base)
  const conf = pick(meta, '确认', 'status')
  const alias = aliases(meta['别名'], meta.aliases)
  if (type && CUSTOMER_TYPE.test(type)) {
    result.customers.push({ file: rel, 名称: name, 分组: pick(meta, '分组', 'group'), 阶段: pick(meta, '阶段', 'stage'), 联系人: pick(meta, '联系人', 'contact'), 上次联系: pick(meta, '上次联系', 'last_contact'), 下次跟进: pick(meta, '下次跟进', 'next'), 别名: alias, 确认: conf })
  } else if (type && CREATOR_TYPE.test(type)) {
    result.creators.push({ file: rel, 名称: name, 编号: pick(meta, '编号'), 赛道: pick(meta, '赛道'), 合作方式: pick(meta, '合作方式'), 合约到期: pick(meta, '合约到期'), 经纪人: pick(meta, '经纪人'), 状态: pick(meta, '状态'), 别名: alias, 确认: conf })
  } else if (type && PROJECT_TYPE.test(type)) {
    result.projects.push({ file: rel, 名称: name, 状态: pick(meta, '状态', 'status'), 截止: pick(meta, '截止', 'due'), 负责人: pick(meta, '负责人', 'owner') })
  } else if (type && /^(作品|代表作)$/.test(type)) {
    result.works.cards++
  }
  if (/^作品索引\.md$/i.test(base)) { // 表格一行一件（.csv 在后面单独数）
    result.works.index = rel
    result.works.rows += workTableRows(await readFile(f, 'utf8'))
  }
  if (base === '待确认的发现.md') readFindings(lines(await readFile(f, 'utf8')), rel, result)
}

function readFindings(body, rel, result) {
  let cur = null
  for (const l of body) {
    const h = l.match(/^##\s+(发现.*)$/)
    if (h) { cur = { file: rel, title: h[1].trim(), status: '' }; result.findings.push(cur); continue }
    const s = cur && l.match(/状态\s*[:：]\s*(\S+)/)
    if (s && !cur.status) cur.status = s[1]
  }
}

// ───── 客户层、项目层：说明里的建库快照和索引 ─────
/** 层说明：README-知识库.md 优先（老板原有的文件夹里放的是它），没有再读 README.md */
async function layerGuide(root, place) {
  for (const g of ['README-知识库.md', 'README.md']) {
    try { return { rel: `${place}/${g}`, text: await readFile(join(root, place, g), 'utf8') } } catch { /* 没有这份，找下一份 */ }
  }
  return null
}

/** 建库快照、索引的一行：{ 表头: 格子 }，按表头名取，表里多一列、换了列序都不错位；表头里没有名称列时把第一列当名称 */
function tableObjects(text, heading, nameCols) {
  const t = tableUnder(text, heading)
  if (!t) return []
  const k = colOf(t.header, nameCols, 0)
  const header = t.header.map((h, i) => (i === k ? '名称' : h))
  return t.rows.map((row) => Object.fromEntries(header.map((h, i) => [h, h === '文件' ? row[i] || '' : cellAt(row, i)])))
    .filter((r) => r['名称'] || r['文件'])
}

/** 一行登记的文件：解析链接，记进“已登记”；返回第一个找得到的。from 是这张表所在的说明文件（同名提醒里用） */
function claimRow(row, baseDir, ctx, from) {
  const hits = linkTargets(row['文件'] || '').map((l) => resolveTarget(l, baseDir, ctx, from))
  for (const h of hits) if (h.file) ctx.claimed.add(h.file)
  return hits.find((h) => h.found) || hits.find((h) => h.file) || { file: '', found: false }
}

/**
 * 登记行去重：一份 .md 只算一个（同名的两位各有一份，比如两家公司都有“张总”，各算一个）；
 * 一份 CSV 里可以有好几位（boss-kb：“文件”列写 CSV 的链接和那一行的名称），按“文件 + 名称”去重；没登记文件的按名称去重
 */
function isDup(hit, 名称, bucket, ctx) {
  if (!hit.file) return bucket.some((x) => x.名称 === 名称)
  if (/\.md$/i.test(hit.file)) return ctx.known.has(hit.file)
  return bucket.some((x) => x.file === hit.file && x.名称 === 名称)
}
const remember = (hit, ctx) => { if (/\.md$/i.test(hit.file)) ctx.known.add(hit.file) }

/**
 * 就地建图：老板原有的客户文件没有元信息，从客户层说明的“建库快照”读（快照还没填时，用索引里类型是客户 / 达人的行）；
 * “客户分组”是一群人，不当一个客户
 */
function addSnapshot(rows, source, place, ctx, from) {
  const { result } = ctx
  const v = (row, k) => row[k] || undefined
  for (const row of rows) {
    const hit = claimRow(row, place, ctx, from)
    const 名称 = row['名称']
    if (!名称 || /客户分组/.test(row['类型'] || '')) continue
    const creator = CREATOR_TYPE.test(row['类型'] || '')
    const bucket = creator ? result.creators : result.customers
    if (isDup(hit, 名称, bucket, ctx)) continue
    const item = creator
      ? { file: hit.file, 名称, 编号: v(row, '编号'), 赛道: v(row, '赛道'), 合作方式: v(row, '合作方式'), 合约到期: v(row, '合约到期'), 经纪人: v(row, '经纪人'), 状态: v(row, '状态') || v(row, '阶段') }
      : { file: hit.file, 名称, 分组: v(row, '分组'), 阶段: v(row, '阶段'), 联系人: v(row, '联系人'), 上次联系: v(row, '上次联系'), 下次跟进: v(row, '下次跟进') }
    item.别名 = aliases(row['别名'])
    item.来源 = source
    if (hit.file && !hit.found) item.找不到文件 = true
    bucket.push(item)
    remember(hit, ctx)
  }
}

/** 某一层里还没被认出来的文件：没写“类型”、不是说明、说明里也没登记 */
const leftovers = (place, ctx) => ctx.normal
  .filter((x) => inFolder(x.rel, place) && !x.type && !GUIDE_NAMES.has(x.rel.split('/').pop()))
  .filter((x) => !ctx.claimed.has(x.rel) && !ctx.known.has(x.rel) && !ctx.profileRels.has(x.rel))
  .map((x) => x.rel)

/** 没有地图可对时（就地建图、原有文件夹、说明里还没登记），才按文件名猜，标“需确认” */
function guessByName(rest, bucket, why, ctx) {
  for (const rel of rest) {
    const 名称 = noMd(rel.split('/').pop())
    if (TEMPLATE_LIKE.test(名称)) ctx.result.unrecognized_files.push(rel)
    else bucket.push({ file: rel, 名称, 确认: '需确认', 来源: why })
  }
}

async function mapLayers(ctx) {
  const { result, archive } = ctx
  const inPlace = archive.structure === '就地建图'
  const original = (layer) => Boolean(archive.layerMap[layer]) && archive.layerMap[layer] !== layer
  // 客户层
  const custPlace = archive.layerMap['04-客户'] || '04-客户'
  const cust = await layerGuide(ctx.root, custPlace)
  const snapshot = inPlace && cust ? tableObjects(cust.text, '建库快照', ['名称']) : []
  const custIndex = cust ? tableObjects(cust.text, '索引', ['名称', '客户', '达人']) : []
  if (snapshot.length) addSnapshot(snapshot, `${cust.rel} 的建库快照`, custPlace, ctx, cust.rel)
  else if (inPlace && cust) { // 快照还没填：索引里登记成客户 / 达人的，照样认
    const typed = custIndex.filter((r) => CUSTOMER_TYPE.test(r['类型'] || '') || CREATOR_TYPE.test(r['类型'] || ''))
    addSnapshot(typed, `${cust.rel} 的索引（建库快照还没填）`, custPlace, ctx, cust.rel)
  }
  for (const row of custIndex) claimRow(row, custPlace, ctx, cust.rel)
  const custRest = leftovers(custPlace, ctx)
  if (inPlace && original('04-客户') && !snapshot.length) guessByName(custRest, result.customers, '按文件名猜：客户层说明里还没有建库快照', ctx)
  else result.unrecognized_files.push(...custRest)
  // 项目层：就地建图时，说明索引里“类型”是项目的行就是项目
  const projPlace = archive.layerMap['06-项目'] || '06-项目'
  const proj = await layerGuide(ctx.root, projPlace)
  const index = proj ? tableObjects(proj.text, '索引', ['名称', '项目']) : []
  for (const row of index) {
    const hit = claimRow(row, projPlace, ctx, proj.rel)
    if (!inPlace || !PROJECT_TYPE.test(row['类型'] || '') || !row['名称']) continue
    if (isDup(hit, row['名称'], result.projects, ctx)) continue
    result.projects.push({ file: hit.file, 名称: row['名称'], 状态: row['状态'] || undefined, 截止: row['截止'] || undefined, 负责人: row['负责人'] || undefined, 来源: `${proj.rel} 的索引` })
    remember(hit, ctx)
  }
  const projRest = leftovers(projPlace, ctx)
  if (inPlace && original('06-项目') && !index.length) guessByName(projRest, result.projects, '按文件名猜：项目层说明里还没有索引', ctx)
  else result.unrecognized_files.push(...projRest)
  result.unrecognized_files = [...new Set(result.unrecognized_files)].sort()
}

// ───── 待办、必读文件、作品索引 .csv、老板的别名 ─────
/**
 * 近期要事可能在的位置，按先后试，只读找到的第一份：06 层的 近期要事.md（就地建图按目录对应找）；
 * 从旧版升级上来、06 层没新建这份的，用 06 层说明索引里“类型”是待办的那一行（boss-kb 的升级做法是把旧的 生意/近期要事.md 登记在那里）；
 * 旧格式再找 生意/近期要事.md
 */
async function todoPlaces(ctx) {
  const place = ctx.archive.layerMap['06-项目'] || '06-项目'
  const out = [`${place}/近期要事.md`]
  if (!ctx.isV2) return [...out, '生意/近期要事.md']
  const guide = await layerGuide(ctx.root, place)
  for (const row of guide ? tableObjects(guide.text, '索引', ['名称', '项目']) : []) {
    if (!/^待办$/.test(row['类型'] || '')) continue
    for (const l of linkTargets(row['文件'] || '')) { const h = resolveTarget(l, place, ctx, guide.rel); if (h.found) out.push(h.file) }
  }
  return [...new Set(out)]
}

/** 待办只读近期要事一份：[ ] 待办、[/] 进行中都算没做完；[x] 完成、[-] 取消不算 */
async function readTodos(ctx) {
  for (const rel of await todoPlaces(ctx)) {
    if (inZone(rel, [...ctx.zones.noread, ...ctx.zones.readonly])) continue
    let body
    try { body = lines(await head(join(ctx.root, rel), 64000)) } catch { continue } // 没有这份，试下一个位置
    const todo = body.filter((l) => /^\s*[-*]\s*\[\s\]/.test(l))
    const doing = body.filter((l) => /^\s*[-*]\s*\[\/\]/.test(l))
    const t = ctx.result.todos
    t.files.push(rel)
    t.open = todo.length
    t.doing = doing.length
    t.samples = [...todo, ...doing].slice(0, 15).map((l) => l.trim())
    return
  }
}

/** 必读文件的开头。就地建图时 v2 的几份按目录对应换成实际位置；格式是 /2 时旧格式那几份不读 */
async function readProfiles(ctx) {
  const map = ctx.archive.layerMap
  const list = V2_PROFILE.map((rel) => { const [layer, ...rest] = rel.split('/'); return [map[layer] || layer, ...rest].join('/') })
  if (!ctx.isV2) list.push(...LEGACY_PROFILE)
  for (const rel of [...new Set(list)]) {
    if (inZone(rel, ctx.zones.noread)) continue
    try {
      const t = await head(join(ctx.root, rel), 12000)
      ctx.result.profile_files[rel] = lines(t).slice(0, 80).join('\n')
      ctx.profileRels.add(rel)
    } catch { /* 没有就跳过 */ }
  }
}

/** 作品索引超过约 200 件时换成 .csv：在 1x 生长模块和“启用的模块”的路径里找 */
async function readWorkCsv(ctx) {
  const dirs = new Set([...Object.keys(ctx.layerCount).filter((n) => /^1\d-/.test(n)), ...ctx.archive.enabled.map((m) => m.路径).filter(Boolean)])
  for (const d of dirs) {
    const rel = `${d}/作品索引.csv`
    if (inZone(rel, [...ctx.zones.noread, ...ctx.zones.readonly])) continue
    try {
      const t = await readFile(join(ctx.root, rel), 'utf8')
      ctx.result.works.index = rel
      ctx.result.works.rows += Math.max(0, lines(t).filter((l) => l.trim()).length - 1)
    } catch { /* 没有就算了 */ }
  }
}

/** 老板自己的别名：基本情况开头的 别名 / 别的叫法，或正文里“- 别的叫法：…”一行（字段名以 boss-kb 定的为准） */
async function readOwnerAliases(ctx) {
  const v2 = `${ctx.archive.layerMap['02-关于我'] || '02-关于我'}/基本情况.md`
  for (const rel of ctx.isV2 ? [v2] : [v2, '关于我/基本情况.md']) {
    let text
    try { text = await head(join(ctx.root, rel), 12000) } catch { continue }
    const meta = frontmatter(text)
    const inBody = lines(text).map((l) => l.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:别的叫法|别名)(?:\*\*)?\s*[:：]\s*(.+)$/)).filter(Boolean).map((m) => m[1])
    return aliases(meta['别名'], meta['别的叫法'], meta.aliases, inBody)
  }
  return []
}

// ───── 云同步 ─────
// Mac 上开了“iCloud 桌面与文稿”时，~/Desktop 和 ~/Documents 也在同步，路径里看不出来
function macDesktopDocsSynced(absRoot) {
  if (process.platform !== 'darwin') return { synced: false, maybe: false }
  const home = homedir()
  const keys = [['Desktop', 'FXICloudDriveDesktop'], ['Documents', 'FXICloudDriveDocuments']]
  for (const [folder, key] of keys) {
    const base = join(home, folder)
    if (absRoot !== base && !absRoot.startsWith(base + sep)) continue
    try {
      const v = execFileSync('defaults', ['read', 'com.apple.finder', key], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      return { synced: v === '1', maybe: false, folder }
    } catch { return { synced: false, maybe: true, folder } } // 读不到设置：说不准
  }
  return { synced: false, maybe: false }
}

function cloudInfo(root) {
  const desk = macDesktopDocsSynced(root)
  const where = desk.folder === 'Desktop' ? '桌面' : '文稿'
  let note = ''
  if (desk.synced) note = `这台 Mac 开了 iCloud“${where}”同步，知识库在同步目录里`
  else if (desk.maybe) note = `知识库在${where}文件夹里，读不到 iCloud 设置；如果开了“桌面与文稿”同步，就当在云盘里`
  return { cloud_synced: CLOUD_RE.test(root) || desk.synced, cloud_maybe: !CLOUD_RE.test(root) && desk.maybe, cloud_note: note }
}

// ───── 没有知识库 ─────
const SYSTEM_FILES = new Set(['Thumbs.db', 'desktop.ini']) // Windows 自己生成的，不算“里面有东西”

/**
 * 不是老板知识库（没有建库档案、AGENTS.md 里没有“老板知识库”维护标记、也没有旧版的 知识库说明.md）：
 * 不走文件、不猜客户，只说清为什么不是、文件夹空不空、是不是还没接入的 Obsidian 库。工作台可以从空白开始搭。
 * empty：除了点开头的隐藏文件、系统文件和 工作台/，什么都没有。
 */
async function notKnowledgeBase(root) {
  const names = (await readdir(root).catch(() => [])).filter((n) => !n.startsWith('.') && !SYSTEM_FILES.has(n))
  const workbench = names.includes('工作台')
  const empty = names.every((n) => n === '工作台')
  const vault = await exists(join(root, '.obsidian'))
  const agents = names.includes('AGENTS.md')
  let reason
  if (empty) reason = workbench ? '这个文件夹里只有 工作台/，还没有知识库。' : '这个文件夹是空的，还没有知识库。'
  else if (agents) reason = '有 AGENTS.md，但里面没有“老板知识库”的维护标记，也没找到建库档案（01-AI协作/建库档案.md）和旧版的 知识库说明.md：不是老板知识库。'
  else reason = '这里不是老板知识库：没找到建库档案（01-AI协作/建库档案.md）、AGENTS.md 里“老板知识库”的维护标记，也没有旧版的 知识库说明.md。'
  if (vault) reason += '这是一个 Obsidian 库，还没用 boss-kb 建库或接入。'
  const existing = empty ? null : await existingSummary(root)
  if (existing?.suggest === '梳理') reason += '里面已经有老板自己的资料：先用 boss-kb 梳理已有资料（不搬不改，只写地图），再搭工作台。'
  return { kb: false, root, reason, empty, obsidian_vault: vault, existing, workbench_exists: workbench, ...cloudInfo(root) }
}

/** 名字像私人的文件夹：梳理时标“建议先别看”，老板没回答就按不读（和 boss-kb 梳理第 1 步一致） */
const PRIVATE_HINT = /日记|私人|个人|家庭|家人|孩子|健康|体检|病历|财务|账本|工资|税|银行|账号|密码|证件/
/**
 * 已有资料的目录概况（2026-10-15）：顶层每个文件夹里有几份 .md、几份 .csv，最近一次修改是哪天。
 * 只看目录和修改时间，不打开正文、不列文件名；名字像私人的标 private_hint。≥ 3 份 .md 时建议先梳理。
 */
async function existingSummary(root, limit = 5000) {
  const top = (await readdir(root, { withFileTypes: true }).catch(() => [])).filter((e) => !e.name.startsWith('.') && !SYSTEM_FILES.has(e.name) && !SKIP_DIRS.has(e.name))
  const folders = []
  let seen = 0
  const count = async (dir, acc) => {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (seen >= limit || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await count(p, acc) }
      else if (e.isFile()) {
        seen++
        const low = e.name.toLowerCase()
        if (low.endsWith('.md')) acc.md++
        else if (low.endsWith('.csv')) acc.csv++
        else acc.other++
        const m = await stat(p).then((s) => s.mtimeMs).catch(() => 0)
        if (m > acc.mtime) acc.mtime = m
      }
    }
  }
  const rootAcc = { md: 0, csv: 0, other: 0, mtime: 0 }
  for (const e of top) {
    if (e.isDirectory()) {
      const acc = { md: 0, csv: 0, other: 0, mtime: 0 }
      await count(join(root, e.name), acc)
      folders.push({ name: e.name, md: acc.md, csv: acc.csv, other: acc.other, updated: acc.mtime ? new Date(acc.mtime).toISOString().slice(0, 10) : null, private_hint: PRIVATE_HINT.test(e.name) })
    } else if (e.isFile()) {
      const low = e.name.toLowerCase()
      if (low.endsWith('.md')) rootAcc.md++; else if (low.endsWith('.csv')) rootAcc.csv++; else rootAcc.other++
    }
  }
  const md = folders.reduce((a, f) => a + f.md, rootAcc.md)
  return { md_files: md, csv_files: folders.reduce((a, f) => a + f.csv, rootAcc.csv), root_files: { md: rootAcc.md, csv: rootAcc.csv, other: rootAcc.other }, folders, truncated: seen >= limit, suggest: md >= 3 ? '梳理' : '空白起步' }
}

// ───── 主流程 ─────
function emptyResult(root) {
  return {
    kb: true, root, entry: null, entry_excerpt: '', legacy_map: false, legacy_ignored: false, format: null, sample: false, editor: 'plain', warnings: [],
    files: 0, truncated: false, layers: [], growth_modules: [], folder_guides: [], by_type: {},
    customers: [], creators: [], projects: [], todos: { files: [], open: 0, doing: 0, samples: [] },
    works: { index: null, rows: 0, cards: 0 }, inbox: [], findings: [], unconfirmed: 0, privacy: {},
    unrecognized_files: [], skipped: { readonly_files: 0, raw_files: 0, template_files: 0, noread_folders: 0 },
    profile_files: {}, owner_aliases: [], structure: '标准', layer_map: {}, readonly_folders: [], noread_folders: [],
    enabled_modules: [], planned_modules: [], workbench_draft: '', workbench_exists: false, cloud_synced: false, cloud_maybe: false, cloud_note: '',
  }
}

export async function scanKnowledgeBase(rootArg, { max = 3000 } = {}) {
  const absInput = resolve(rootArg)
  const info = await stat(absInput).catch(() => null)
  if (!info || !info.isDirectory()) throw new ScanError(`找不到这个文件夹：${absInput}`)
  const root = await realpath(absInput).catch(() => absInput)
  const result = emptyResult(root)

  // 1. 先读建库档案、认版本：v2 看建库档案的“格式”或 AGENTS.md 里的维护标记；旧格式看 知识库说明.md。三样都没有就不是知识库
  const archive = await readArchive(root)
  const legacyFile = await exists(join(root, '知识库说明.md'))
  const entry = await readEntry(root, archive.format === FORMAT_V2)
  if (!archive.exists && !legacyFile && !(entry.name === 'AGENTS.md' && MARK_START.test(entry.excerpt))) return notKnowledgeBase(root)
  const legacyText = legacyFile && archive.format !== FORMAT_V2 ? await head(join(root, '知识库说明.md'), 12000) : ''
  result.format = archive.format
    || (/老板知识库 v2/.test(entry.name === 'AGENTS.md' ? entry.excerpt : '') ? FORMAT_V2 : null)
    || (legacyText.match(/格式\s*[:：]\s*(\S+)/) || [])[1]
    || (entry.name ? '未标注' : null)
  const isV2 = result.format === FORMAT_V2
  Object.assign(result, { entry: entry.name, entry_excerpt: entry.excerpt, legacy_map: legacyFile && !isV2, legacy_ignored: legacyFile && isV2, sample: archive.sample, editor: archive.editor })
  Object.assign(result, { structure: archive.structure, layer_map: archive.layerMap, readonly_folders: archive.readonly, noread_folders: archive.noread, enabled_modules: archive.enabled, planned_modules: archive.planned, workbench_draft: archive.workbenchDraft })
  result.skipped.noread_folders = archive.noread.length

  // 2. 再走文件：“不读”的文件夹整个不进
  const zones = {
    noread: archive.noread,
    readonly: archive.readonly,
    raw: [archive.layerMap['99-原始材料'] || '99-原始材料', ...(isV2 ? [] : ['原始材料'])],
    templates: await obsidianTemplateFolders(root),
  }
  const files = []
  await walk(root, root, files, max, (rel) => inZone(rel, zones.noread))
  const ctx = {
    root, result, archive, isV2, zones, layerCount: {}, normal: [], known: new Set(), claimed: new Set(), profileRels: new Set(), byName: new Map(), warned: new Set(),
    inboxDir: archive.layerMap['00-收件箱'] || '00-收件箱',
    checkupDir: `${archive.layerMap['90-持续生长'] || '90-持续生长'}/体检`, // boss-kb 定期维护写体检报告的地方
  }
  for (const f of files) {
    const rel = posix(relative(root, f))
    const name = rel.split('/').pop()
    ctx.byName.set(name, [...(ctx.byName.get(name) || []), rel])
  }
  for (const f of files) await scanFile(f, ctx)
  for (const x of [...result.customers, ...result.creators, ...result.projects]) ctx.known.add(x.file)

  // 3. 待办、必读文件、作品索引 .csv、客户层和项目层的对账、老板的别名
  await readProfiles(ctx)
  await readTodos(ctx)
  await readWorkCsv(ctx)
  await mapLayers(ctx)
  result.owner_aliases = await readOwnerAliases(ctx)

  result.files = files.length
  result.truncated = files.length >= max
  result.layers = Object.entries(ctx.layerCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  result.growth_modules = result.layers.map((l) => l.name).filter((n) => /^1\d-/.test(n)).sort()
  result.workbench_exists = await exists(join(root, '工作台'))
  Object.assign(result, cloudInfo(root))
  return result
}

async function main(argv) {
  const rootArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--max')
  const maxIdx = argv.indexOf('--max')
  const max = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 3000
  if (!rootArg) throw new ScanError('用法：node kb_scan.mjs <知识库根目录> [--max 3000]')
  if (!Number.isInteger(max) || max < 1) throw new ScanError('--max 后面要跟一个正整数，例如 --max 3000')
  console.log(JSON.stringify(await scanKnowledgeBase(rootArg, { max }), null, 2))
}

const isMain = (() => { try { return realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (isMain) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof ScanError ? e.message : `读知识库时出错：${e.stack || e.message}`)
    process.exit(1)
  })
}
