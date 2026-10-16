// 知识库：只读浏览知识库根目录下的 Markdown（关于我 / 生意 / 资料 / 原始材料 / 工作台快照，以及根目录的“知识库说明”）。
// 顶层文件夹不写死，有什么读什么（不同老板的知识库文件夹名可能不一样）；
// 根目录的 知识库说明.md、AGENTS.md 也能看；客户背景笔记找不到时，按客户名字在知识库里找（findClientNote）。
// 工作台改知识库文件之前，原文件先备份到数据库旁边的 备份/知识库/（backupKbFile）。
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync, copyFileSync, lstatSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep, dirname, basename, isAbsolute } from 'node:path'
import { ROOT, BACKUP_DIR } from '../db.ts'
import { BadRequest, NotFound } from './common.ts'

/** 新建文件时允许的顶层文件夹（已经存在的顶层文件夹都可以读） */
export const KB_TOP = ['关于我', '生意', '资料', '原始材料', '工作台']
const SKIP = new Set(['程序', '数据', '备份', 'node_modules', '.git', '截图'])
/** 根目录下这些 .md 不算知识库内容（README 是给开发者的说明；CLAUDE.md 只有一行“@AGENTS.md”） */
const ROOT_SKIP = new Set(['README.md', 'CLAUDE.md'])

/** 从建库档案读取老板选的“不读 / 只读”，每次读取都生效，不缓存旧范围。 */
function accessRules(): { path: string; readonly: boolean }[] {
  const profile = join(ROOT, '01-AI协作', '建库档案.md')
  if (!existsSync(profile)) return []
  assertRealPathInsideRoot(profile)
  const section = readFileSync(profile, 'utf8').match(/^## 目录对应[^\n]*\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/m)?.[1] ?? ''
  return section.split('\n').flatMap(line => {
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim())
    const tag = cells[0] ?? ''
    if (!/不读|只读/.test(tag)) return []
    const place = (cells[1] ?? '').replace(/`/g, '').replace(/\\/g, '/').replace(/\/+$/, '').trim()
    if (!place) return []
    const path = resolve(ROOT, place)
    if (path !== ROOT && !path.startsWith(ROOT + sep)) return []
    return [{ path, readonly: !/不读/.test(tag) }]
  })
}

function assertAccess(abs: string, write = false): void {
  const paths = [abs]
  // 同一文件的符号链接也遵守范围；新文件按最近的现有父目录判断。
  let ancestor = abs
  while (!existsSync(ancestor) && ancestor !== ROOT) ancestor = dirname(ancestor)
  try { paths.push(resolve(realpathSync(ancestor), relative(ancestor, abs))) } catch { /* 原有路径检查会处理 */ }
  for (const rule of accessRules()) {
    if (rule.readonly && !write) continue
    const targets = [rule.path]
    try { targets.push(realpathSync(rule.path)) } catch { /* 未创建的位置仍按路径保护 */ }
    if (paths.some(p => targets.some(t => p === t || p.startsWith(t + sep)))) {
      throw new BadRequest(rule.readonly ? '这份原有资料只读，请把新内容另存' : '这份资料已设为不读')
    }
  }
}


/** 原件清单只用于识别不能覆盖的旧文件，不复核哈希，也不阻止搭台。 */
function isOriginal(abs: string): boolean {
  const manifest = join(ROOT, '01-AI协作', '原件清单.md')
  if (!existsSync(manifest)) return false
  assertRealPathInsideRoot(manifest)
  const actual = (p: string) => { try { return realpathSync(p) } catch { return resolve(p) } }
  return readFileSync(manifest, 'utf8').split('\n').some(line => {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(?:原长度\s*)?\d+\s*\|\s*[a-fA-F0-9]{64}\s*\|$/)
    const path = m?.[1]?.replace(/\\\|/g, '|').replace(/^`|`$/g, '')
    return !!path && actual(resolve(ROOT, path)) === actual(abs)
  })
}

/** 业务模块与知识库页面共用范围检查，不能直接绕过“只读 / 不读”。 */
export function assertKbAccess(path: string, write = false): string {
  const abs = resolve(path)
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) throw new BadRequest('这个位置不允许读写')
  assertRealPathInsideRoot(abs)
  assertAccess(abs, write)
  if (write && isOriginal(abs)) throw new BadRequest('这是原有资料，原文不改；新进展请另存，或记在工作台')
  return abs
}
export function readKbTextFile(path: string, _encoding: 'utf8' = 'utf8'): string {
  return readFileSync(assertKbAccess(path), 'utf8')
}
export function readKbBufferFile(path: string): Buffer {
  return readFileSync(assertKbAccess(path))
}
export function writeKbTextFile(path: string, body: string, _encoding: 'utf8' = 'utf8'): void {
  const abs = assertKbAccess(path, true)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body, 'utf8')
}

export function canReadKbPath(abs: string): boolean {
  try { assertRealPathInsideRoot(abs); assertAccess(abs); return true } catch (error) {
    if (error instanceof BadRequest) return false
    throw error
  }
}

function tops(): string[] {
  const found = readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name) && canReadKbPath(join(ROOT, e.name))).map((e) => e.name)
  // 工作台/ 是程序导出的快照，不是知识，排最后；其余按名字（新范式带编号：00-收件箱、01-AI协作……）
  const order = (n: string) => { if (n === '工作台') return 999; const i = KB_TOP.indexOf(n); return i === -1 ? 99 : i }
  return found.sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'zh'))
}

/** 文档的“更新”日期：优先读文件开头的“更新: 2026-10-25”（知识库约定，演示时和演示日期对得上）；没写才用文件修改时间 */
function updatedOf(abs: string): string {
  assertRealPathInsideRoot(abs)
  try {
    const head = readFileSync(abs, 'utf8').slice(0, 600)
    const m = head.startsWith('---') ? head.match(/^更新[:：]\s*(\d{4}-\d{2}-\d{2})\s*$/m) : null
    if (m) return m[1]
  } catch { /* 读不了就用修改时间 */ }
  return statSync(abs).mtime.toISOString()
}

const rootFiles = () => readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md') && !ROOT_SKIP.has(e.name) && !e.name.startsWith('.') && canReadKbPath(join(ROOT, e.name))).map((e) => e.name)

/** 新建文件尚不存在时检查最近的已有祖先；悬空链接不能当成普通缺失路径。 */
function assertRealPathInsideRoot(abs: string): void {
  let existing = abs
  try {
    while (true) {
      try { lstatSync(existing); break } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || existing === ROOT) throw error
        existing = dirname(existing)
      }
    }
    const root = realpathSync(ROOT)
    const target = realpathSync(existing)
    if (target !== root && !target.startsWith(root + sep)) throw new Error('outside root')
  } catch { throw new BadRequest('这个位置不允许读写') }
}

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
  assertRealPathInsideRoot(abs)
  assertAccess(abs)
  return abs
}

type Node = { name: string; path: string; type: 'dir' | 'file'; children?: Node[]; updated?: string }

function walk(dir: string): Node[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && !SKIP.has(e.name) && canReadKbPath(join(dir, e.name)))
    .map((e): Node | null => {
      const abs = join(dir, e.name)
      const path = relative(ROOT, abs).split(sep).join('/')
      if (e.isDirectory()) {
        const children = walk(abs)
        return children.length ? { name: e.name, path, type: 'dir', children } : null
      }
      if (!e.name.endsWith('.md')) return null
      try {
        return { name: e.name.replace(/\.md$/, ''), path, type: 'file', updated: updatedOf(abs) }
      } catch (error) {
        if (error instanceof BadRequest) return null
        throw error
      }
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

/** 改知识库文件之前先备份原文件：备份/知识库/<时间>-<文件名>（备份/ 在数据库旁边，见 db.ts 的 BACKUP_DIR）。
 *  返回备份位置：在知识库里面就写相对知识库根目录的路径，在库外写完整路径。原文件不存在时返回 null */
export function backupKbFile(rel: string, stamp: string): string | null {
  const abs = kbPath(rel)
  assertKbAccess(abs, true)
  if (!existsSync(abs)) return null
  const dir = join(BACKUP_DIR, '知识库')
  mkdirSync(dir, { recursive: true })
  const to = join(dir, `${stamp}-${basename(rel)}`)
  copyFileSync(abs, to)
  const r = relative(ROOT, to)
  return r.startsWith('..') || isAbsolute(r) ? to : r.split(sep).join('/')
}

export function writeKb(rel: string, body: string) {
  const abs = kbPath(rel)
  assertKbAccess(abs, true)
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
  const mtime = (p: string) => statSync(kbPath(p)).mtimeMs
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
    const head = readFileSync(kbPath(f.path), 'utf8').slice(0, 600)
    if (head.includes(`工作台ID: ${client.id}`) || head.includes(`工作台ID：${client.id}`)) return { path: f.path, expected }
  }
  const byName = files.find((f) => basename(f.path, '.md') === key)
    ?? files.find((f) => /客户/.test(f.path) && (basename(f.path, '.md').includes(short) || readFileSync(kbPath(f.path), 'utf8').slice(0, 400).includes(`名称: ${key}`)))
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

/** 设置页“我的资料”（2026-10-15）：知识库里讲“你是谁、怎么跟你说话”的几份，只读。
 *  先按标准位置找，就地建图的库按文件名找（findDoc）；没有的标出来，提示用 boss-kb 补 */
const PROFILE_DOCS = [
  { title: '基本情况', path: '02-关于我/基本情况.md', name: '基本情况' },
  { title: '生意总览', path: '03-生意/生意总览.md', name: '生意总览' },
  { title: '和 AI 协作的习惯', path: '01-AI协作/协作偏好.md', name: '协作偏好' },
  { title: '说话方式', path: '02-关于我/说话方式.md', name: '说话方式' },
  { title: '边界：哪些不放、哪些先问', path: '02-关于我/边界.md', name: '边界' },
]
/** 去掉开头的元信息和标题，取正文前几行当摘要 */
function excerptOf(body: string, max = 140): string {
  const text = body.replace(/^---[\s\S]*?\n---\s*\n/, '').split('\n').filter((l) => l.trim() && !/^#/.test(l.trim()) && !/^>/.test(l.trim()) && !/^\|?\s*-{3,}/.test(l.trim()))
    .map((l) => l.trim().replace(/^[-*+]\s+|^\d+\.\s+/, '')).join('；')
  const flat = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`|]/g, '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
export function profileDocs() {
  return PROFILE_DOCS.map((d) => {
    let path: string | null = null
    try { path = findDoc(d.path, d.name).path } catch { path = null }
    if (!path) return { title: d.title, path: null, excerpt: '', updated: null }
    const f = readKb(path)
    return { title: d.title, path, excerpt: excerptOf(f.body), updated: f.updated }
  })
}
