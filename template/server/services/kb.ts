// 知识库：只读浏览知识库根目录下的 Markdown（关于我 / 生意 / 资料 / 原始材料 / 工作台快照，以及根目录的“知识库说明”）。
// ABC茶社示例的改动：顶层文件夹不再写死，有什么读什么（知识库会按新范式重建，文件夹名可能变）；
// 根目录的 知识库说明.md、AGENTS.md 也能看；客户背景笔记找不到时，按客户名字在知识库里找（findClientNote）。
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, resolve, sep, dirname, basename } from 'node:path'
import { ROOT } from '../db.ts'
import { BadRequest, NotFound } from './common.ts'

/** 新建文件时允许的顶层文件夹（已经存在的顶层文件夹都可以读） */
export const KB_TOP = ['关于我', '生意', '资料', '原始材料', '工作台']
const SKIP = new Set(['程序', '数据', '备份', 'node_modules', '.git', '截图'])
/** 根目录下这些 .md 不算知识库内容（README 是给开发者的说明；CLAUDE.md 只有一行“@AGENTS.md”） */
const ROOT_SKIP = new Set(['README.md', 'CLAUDE.md'])

function tops(): string[] {
  const found = readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)).map((e) => e.name)
  // 工作台/ 是程序导出的快照，不是知识，排最后；其余按名字（新范式带编号：00-收件箱、01-AI协作……）
  const order = (n: string) => { if (n === '工作台') return 999; const i = KB_TOP.indexOf(n); return i === -1 ? 99 : i }
  return found.sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'zh'))
}

/** 文档的“更新”日期：优先读文件开头的“更新: 2026-10-25”（知识库约定，演示时和演示日期对得上）；没写才用文件修改时间 */
function updatedOf(abs: string): string {
  try {
    const head = readFileSync(abs, 'utf8').slice(0, 600)
    const m = head.startsWith('---') ? head.match(/^更新[:：]\s*(\d{4}-\d{2}-\d{2})\s*$/m) : null
    if (m) return m[1]
  } catch { /* 读不了就用修改时间 */ }
  return statSync(abs).mtime.toISOString()
}

const rootFiles = () => readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md') && !ROOT_SKIP.has(e.name) && !e.name.startsWith('.')).map((e) => e.name)

/** 只允许知识库里的 .md 文件，拒绝 ../ 越界。
 *  底座审查 #9：按规范化以后的路径段判断（“关于我/../README.md”规范化后就是根目录的 README.md，要拦住）；隐藏文件夹也不让读 */
export function kbPath(rel: string) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const abs = resolve(ROOT, clean)
  const parts = relative(ROOT, abs).split(sep)
  const top = parts[0]
  const inRoot = parts.length === 1 && top.endsWith('.md') && !ROOT_SKIP.has(top)
  const okTop = parts.length > 1 && (KB_TOP.includes(top) || tops().includes(top))
  const bad = parts.some((s) => SKIP.has(s) || s === '..' || s.startsWith('.'))
  if (!abs.startsWith(ROOT + sep) || !abs.endsWith('.md') || !(inRoot || okTop) || bad) {
    throw new BadRequest('这个位置不允许读写')
  }
  return abs
}

type Node = { name: string; path: string; type: 'dir' | 'file'; children?: Node[]; updated?: string }

function walk(dir: string): Node[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && !SKIP.has(e.name))
    .map((e): Node | null => {
      const abs = join(dir, e.name)
      const path = relative(ROOT, abs).split(sep).join('/')
      if (e.isDirectory()) {
        const children = walk(abs)
        return children.length ? { name: e.name, path, type: 'dir', children } : null
      }
      if (!e.name.endsWith('.md')) return null
      return { name: e.name.replace(/\.md$/, ''), path, type: 'file', updated: updatedOf(abs) }
    })
    .filter((n): n is Node => n !== null)
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'zh') : a.type === 'dir' ? -1 : 1))
}

export function kbTree(): Node[] {
  const dirs = tops().map((t) => ({ name: t, path: t, type: 'dir' as const, children: walk(join(ROOT, t)) })).filter((d) => d.children.length)
  const files = rootFiles().map((f): Node => ({ name: f.replace(/\.md$/, ''), path: f, type: 'file', updated: updatedOf(join(ROOT, f)) }))
  return [...files, ...dirs]
}

export function readKb(rel: string) {
  const abs = kbPath(rel)
  if (!existsSync(abs)) throw new NotFound(`知识库里没有这个文件：${rel}`)
  return { path: rel, body: readFileSync(abs, 'utf8'), updated: updatedOf(abs) }
}

export function writeKb(rel: string, body: string) {
  const abs = kbPath(rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body, 'utf8')
  return { path: rel }
}

function allFiles(): Node[] {
  const out: Node[] = []
  const visit = (nodes: Node[]) => nodes.forEach((n) => (n.type === 'file' ? out.push(n) : visit(n.children ?? [])))
  visit(kbTree())
  return out
}

/** 最近更新：不算 工作台/ 里自动导出的快照；同一天的按文件修改时间排 */
export function recentKb(limit = 8) {
  const mtime = (p: string) => statSync(join(ROOT, p)).mtimeMs
  return allFiles().filter((f) => !f.path.startsWith('工作台/'))
    .sort((a, b) => String(b.updated).slice(0, 10).localeCompare(String(a.updated).slice(0, 10)) || mtime(b.path) - mtime(a.path))
    .slice(0, limit)
}

/** 客户的背景笔记在哪：先看客户档案里记的位置；没有或文件不在，就在知识库里按“工作台ID”、文件名、开头的“名称:”找 */
export function findClientNote(client: { id: string; name: string; kb_path?: string | null }): { path: string | null; expected: string | null } {
  const expected = client.kb_path ?? null
  if (expected) {
    try { if (existsSync(kbPath(expected))) return { path: expected, expected } } catch { /* 位置不合法就当没写 */ }
  }
  const files = allFiles().filter((f) => f.path.includes('/'))
  const key = client.name.replace(/（.*?）|\(.*?\)/g, '')
  const short = key.length > 4 ? key.slice(0, 2) : key // 公司名取前两个字（“衡言律师事务所”→“衡言”），人名用全名
  for (const f of files) {
    const head = readFileSync(join(ROOT, f.path), 'utf8').slice(0, 600)
    if (head.includes(`工作台ID: ${client.id}`) || head.includes(`工作台ID：${client.id}`)) return { path: f.path, expected }
  }
  const byName = files.find((f) => basename(f.path, '.md') === key)
    ?? files.find((f) => /客户/.test(f.path) && (basename(f.path, '.md').includes(short) || readFileSync(join(ROOT, f.path), 'utf8').slice(0, 400).includes(`名称: ${key}`)))
  return { path: byName?.path ?? null, expected }
}

/** 通用：某个文档（项目说明、账号定位……）在哪。先看记下的位置，不在就按名字找（忽略引号和标点） */
export function findDoc(expected: string | null | undefined, name: string): { path: string | null; expected: string | null } {
  if (expected) {
    try { if (existsSync(kbPath(expected))) return { path: expected, expected } } catch { /* 位置不合法就当没写 */ }
  }
  const norm = (x: string) => x.replace(/[“”"'‘’《》（）()\s·、，,。.-]/g, '')
  const key = norm(name)
  const hit = allFiles().find((f) => norm(basename(f.path, '.md')) === key) ?? allFiles().find((f) => key.length >= 4 && norm(basename(f.path, '.md')).includes(key))
  return { path: hit?.path ?? null, expected: expected ?? null }
}
