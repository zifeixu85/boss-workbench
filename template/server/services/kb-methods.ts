// 按知识库自己的“方法选择表”找做某类事要读的文件（报价规则、标价表、关怀做法），不写死示例库的文件名。
// 找法（照 boss-kb 的结构与规矩）：
//   1. 方法层的位置：建库档案“## 目录对应”里写了 05-方法与判断 的实际位置就用它；没写用 05-方法与判断/（旧格式按名字带“方法”的顶层文件夹）。
//   2. 读这一层的 README-知识库.md（就地建图）或 README.md 里的“## 方法选择表”（| 要做的事 | 先读 | 再看 |），按“要做的事”认是哪类事，取那一行里的链接。
//   3. 表里没有，就按方法层里的文件夹、文件名认（如“报价与接单/判断规则.md”“关怀.md”）。
// 找不到就返回 null，调用方跳过那一项核对，不报错。所有读取都过“不读 / 只读”范围检查。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, posix } from 'node:path'
import { ROOT } from '../db.ts'
import { canReadKbPath, readKbTextFile } from './kb.ts'

export type MethodFiles = { rules: string | null; price: string | null; care: string | null }
type Row = { task: string; links: string[] }

const QUOTE = /报价|询价|接单|接不接|定价|收费|价格/
const CARE = /关怀|生日|节日|回访|久没联系|久未联系|问候/

const fileOk = (rel: string) => {
  const abs = join(ROOT, rel)
  try { return existsSync(abs) && statSync(abs).isFile() && canReadKbPath(abs) } catch { return false }
}
const dirOk = (rel: string) => {
  const abs = join(ROOT, rel)
  try { return existsSync(abs) && statSync(abs).isDirectory() && canReadKbPath(abs) } catch { return false }
}
const read = (rel: string) => { try { return fileOk(rel) ? readKbTextFile(join(ROOT, rel)) : '' } catch { return '' } }

/** 表格一行切成格子：不切 [[路径|名字]] 里的 |，也不切转义的 \| */
export function cellsOf(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('[[', i)) { depth++; cur += '[['; i++; continue }
    if (s.startsWith(']]', i) && depth) { depth--; cur += ']]'; i++; continue }
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue }
    if (s[i] === '|' && !depth) { out.push(cur.trim()); cur = ''; continue }
    cur += s[i]
  }
  out.push(cur.trim())
  return out
}

/** 一格里的链接，换成从知识库根目录起的路径：普通链接按 README 所在文件夹算，双链从库根算 */
export function linksIn(cell: string, baseDir: string): string[] {
  const out: string[] = []
  for (const m of cell.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]|\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (m[1]) {
      const p = m[1].trim()
      out.push(p.endsWith('.md') ? p : `${p}.md`)
    } else if (m[2] && !/^[a-z]+:/i.test(m[2])) {
      let href = m[2].split('#')[0]
      try { href = decodeURIComponent(href) } catch { /* 原样用 */ }
      if (href) out.push(posix.normalize(posix.join(baseDir, href)))
    }
  }
  return out.filter((p) => !p.startsWith('..'))
}

/** 读“## 方法选择表”的每一行 */
export function methodTable(md: string, baseDir: string): Row[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const at = lines.findIndex((l) => /^##\s*方法选择表/.test(l.trim()))
  if (at < 0) return []
  const rows: Row[] = []
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(l.trim())) break
    if (!l.trim().startsWith('|') || /^\|?\s*:?-{3,}/.test(l.trim())) continue
    const cells = cellsOf(l)
    if (cells[0] === '要做的事') continue
    rows.push({ task: cells[0] ?? '', links: cells.slice(1).flatMap((c) => linksIn(c, baseDir)) })
  }
  return rows
}

/** 某一层在知识库里的实际位置（就地建图时按“目录对应”表） */
export function layerDir(layer: string, fallback: RegExp): string | null {
  const profile = read('01-AI协作/建库档案.md')
  const section = profile.match(/^## 目录对应[^\n]*\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/m)?.[1] ?? ''
  const short = layer.replace(/^\d+-/, '')
  for (const line of section.split('\n')) {
    const cells = cellsOf(line)
    if (!cells[0] || !cells[0].includes(short)) continue
    const place = (cells[1] ?? '').replace(/`/g, '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
    if (place && dirOk(place)) return place
  }
  if (dirOk(layer)) return layer
  try {
    const hit = readdirSync(ROOT, { withFileTypes: true }).find((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '工作台' && fallback.test(e.name))
    return hit && dirOk(hit.name) ? hit.name : null
  } catch { return null }
}

const isReadme = (p: string) => /^README(-知识库)?\.md$/.test(basename(p))
/** 一类工作的文件夹里，按名字找某份（判断规则.md、做法.md） */
const inFolder = (link: string, name: string) => { const p = posix.join(dirname(link), name); return fileOk(p) ? p : null }

/** 方法层里按名字认：文件夹 → 里面的 want；单个文件 → 它本身 */
function byName(dir: string, re: RegExp, want: string[]): string | null {
  let entries: { name: string; dir: boolean }[] = []
  try { entries = readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((e) => !e.name.startsWith('.')).map((e) => ({ name: e.name, dir: e.isDirectory() })) } catch { return null }
  for (const e of entries.filter((x) => re.test(x.name)).sort((a, b) => a.name.localeCompare(b.name, 'zh'))) {
    const rel = `${dir}/${e.name}`
    if (e.dir) { for (const w of want) if (fileOk(`${rel}/${w}`)) return `${rel}/${w}` }
    else if (e.name.endsWith('.md') && fileOk(rel)) return rel
  }
  return null
}

/** 做某类事的那份方法文件：先认表里直接点名的 want（如 判断规则.md），再认 README 所在文件夹里的 want，最后用第一份不是 README 的方法文件 */
function pickMethod(links: string[], methods: string, want: string[]): string | null {
  const ok = links.filter(fileOk)
  for (const w of want) { const hit = ok.find((p) => basename(p) === w); if (hit) return hit }
  for (const p of ok.filter(isReadme)) for (const w of want) { const hit = inFolder(p, w); if (hit) return hit }
  return ok.find((p) => !isReadme(p) && p.startsWith(`${methods}/`)) ?? null
}

/** 报价规则、标价表、关怀做法各在哪；找不到的是 null */
export function methodFiles(): MethodFiles {
  const methods = layerDir('05-方法与判断', /方法/)
  const biz = layerDir('03-生意', /^(\d+-)?生意$/)
  if (!methods) return { rules: null, price: null, care: null }
  const readme = [`${methods}/README-知识库.md`, `${methods}/README.md`].find((p) => read(p).includes('方法选择表')) ?? null
  const rows = readme ? methodTable(read(readme), methods) : []
  const quoteLinks = rows.filter((r) => QUOTE.test(r.task)).flatMap((r) => r.links)
  const careLinks = rows.filter((r) => CARE.test(r.task)).flatMap((r) => r.links)
  const rules = pickMethod(quoteLinks, methods, ['判断规则.md']) ?? byName(methods, QUOTE, ['判断规则.md'])
  const care = pickMethod(careLinks, methods, ['做法.md', '判断规则.md']) ?? byName(methods, CARE, ['做法.md', '判断规则.md'])
  // 标价表：报价那一行里指到生意层（产品与服务）的文件；表里没有，而产品与服务里只有一份，就用那一份
  let price = quoteLinks.filter(fileOk).find((p) => !isReadme(p) && ((biz && p.startsWith(`${biz}/`)) || p.includes('产品与服务'))) ?? null
  if (!price && biz && dirOk(`${biz}/产品与服务`)) {
    try {
      const files = readdirSync(join(ROOT, biz, '产品与服务')).filter((n) => n.endsWith('.md') && !isReadme(n)).map((n) => `${biz}/产品与服务/${n}`).filter(fileOk)
      if (files.length === 1) price = files[0]
    } catch { /* 读不了就当没有 */ }
  }
  return { rules, price, care }
}

/** 读一份方法文件（路径从 methodFiles 来）；没有就是空字符串 */
export const readMethod = (rel: string | null) => (rel ? read(rel) : '')
