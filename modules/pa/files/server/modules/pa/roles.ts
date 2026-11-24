// 角色文件（约定 v0.5 第 5 节，2026-11-24 傍晚 A梦 定）。只看齐不齐、更新日期、行数和条数，不改。
// 一个助理一个文件夹“类型-名字”：总助（一个）、内容助理（文件夹名 内容-<名字>）、分身、合伙人（都可以多个）。
// 每个助理三份：IDENTITY.md（它是谁）、SOUL.md（怎么想、怎么做事，上限 60 行）、MEMORY.md（一行一条带日期）；
// 深版分身多一份 底稿.md（不限行数）。USER.md（你是谁）在 01-关于我/ 下所有助理共用一份。
// 旧格式还认得出来，标“旧格式”并说清怎么改：v0.4 的中文三份（角色.md、规矩.md、记忆.md），v0.1 的“身份.md + 性格.md”。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'
import { canReadKbPath, readKbTextFile } from '../../services/kb.ts'
import { front, sections, str, type MetaValue } from './text.ts'
import { CARD_MAX_LINES, MEMORY_MAX_LINES, SOUL_MAX_LINES, cardLines, memoryStats } from './role-parse.ts'

export const ROLE_KINDS = ['总助', '内容', '分身', '合伙人'] as const
export type RoleKind = (typeof ROLE_KINDS)[number]
export type RoleFileName = 'IDENTITY' | 'SOUL' | 'MEMORY' | '底稿' | '角色' | '规矩' | '记忆'
/** lines：正文里不空的行（SOUL、旧的角色.md）。记忆另有条数、没带日期的条数、最早和最近一条的日期。optional：不算在“三份”里（底稿） */
export type RoleFile = { name: RoleFileName; path: string; exists: boolean; optional?: boolean; updated: string; confirm: string; lines?: number; entries?: number; undated?: number; first?: string; last?: string; problems: string[] }
export type Role = { kind: RoleKind; name: string; display: string; folder: string; files: RoleFile[]; complete: boolean; updated: string; legacy: boolean; problems: string[] }
export type UserFile = { path: string; exists: boolean; updated: string; confirm: string; problems: string[] }
export type Roles = { base: string; exists: boolean; roles: Role[]; problems: string[]; user: UserFile }

const BASE = '01-关于我/助理'
const USER_PATH = '01-关于我/USER.md'
const IDENTITY_SECTIONS = ['我是谁', '我怎么称呼你', '我管什么，不管什么']
const SOUL_SECTIONS = ['我怎么想', '我怎么说话', '我会说的，和我绝不说的', '什么时候我会反对你', '每次开始先读什么', '我能自己做的', '要先问你的', '我不做的', '定期要做的']
const PARTNER_SECTIONS = ['专业或思路来源', '边界']
const USER_SECTIONS = ['我是谁，做什么生意', '现在最看重的两三件事', '我的边界：不做什么、哪些不要碰', '我的说话习惯', '详细资料在哪']
// v0.4 的中文三份
const OLD_CARD = ['我是谁', '我管什么，不管什么', '我怎么想', '我怎么说话', '我会说的，和我绝不说的', '什么时候我会反对你']
const OLD_RULES = ['每次开始先读什么', '我能自己做的', '要先问你的', '我不做的', '定期要做的']
/** 开头“角色”这一项的写法：内容助理写“内容助理”“内容”都认 */
const KIND_WORDS: Record<RoleKind, string[]> = { 总助: ['总助'], 内容: ['内容', '内容助理'], 分身: ['分身'], 合伙人: ['合伙人'] }

const readable = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) }
const readRel = (rel: string) => readKbTextFile(join(ROOT, rel))
const missingOf = (body: string, want: string[]) => { const have = sections(body).map((x) => x.title); return want.filter((t) => !have.includes(t)) }
const updatedOf = (meta: Record<string, MetaValue>, path: string) => str(meta['更新']) || statSync(join(ROOT, path)).mtime.toISOString().slice(0, 10)

function checkFile(kind: RoleKind, name: RoleFileName, body: string, meta: Record<string, MetaValue>): Partial<RoleFile> & { problems: string[] } {
  const problems: string[] = []
  const needAgainst = kind === '分身' || kind === '合伙人'
  const against = () => (sections(body).find((x) => x.title === '什么时候我会反对你')?.text ?? '').trim()
  const lacking = (want: string[]) => { const m = missingOf(body, want); if (m.length) problems.push(`缺小节：${m.join('、')}`) }
  if (name === 'IDENTITY' || name === '角色') {
    if (str(meta['类型']) !== '角色') problems.push('开头的“类型”要写“角色”')
    const said = str(meta['角色'])
    if (said && !KIND_WORDS[kind].includes(said)) problems.push(`开头的“角色”写的是“${said}”，文件夹是${kind === '内容' ? '内容助理' : kind}`)
  }
  if (name === 'IDENTITY') { lacking(IDENTITY_SECTIONS); return { problems } }
  if (name === 'SOUL' || name === '角色') {
    const n = cardLines(body)
    const max = name === 'SOUL' ? SOUL_MAX_LINES : CARD_MAX_LINES
    if (n > max) problems.push(`太长了（正文 ${n} 行，约定不超过 ${max} 行），后面的它可能读不到`)
    lacking([...(name === 'SOUL' ? SOUL_SECTIONS : OLD_CARD), ...(kind === '合伙人' ? PARTNER_SECTIONS : [])])
    if (needAgainst && sections(body).some((x) => x.title === '什么时候我会反对你') && !against()) problems.push('“什么时候我会反对你”分身和合伙人要写')
    return { lines: n, problems }
  }
  if (name === '规矩') { lacking(OLD_RULES); return { problems } }
  if (name === '底稿') return { lines: cardLines(body), problems }
  const m = memoryStats(body)
  if (m.undated) problems.push(`${m.undated} 条没带日期（要写成“- 2026-11-24｜规矩；原因”）`)
  if (m.lines > MEMORY_MAX_LINES) problems.push(`已经 ${m.lines} 行，超过 ${MEMORY_MAX_LINES} 行了，该让总助提议归并`)
  return { ...m, problems }
}

function roleFile(kind: RoleKind, folder: string, name: RoleFileName, optional = false): RoleFile {
  const path = `${folder}/${name}.md`
  const base = { name, path, ...(optional ? { optional } : {}) }
  if (!readable(path)) return { ...base, exists: false, updated: '', confirm: '', problems: [] }
  const { meta, body } = front(readRel(path))
  return { ...base, exists: true, updated: updatedOf(meta, path), confirm: str(meta['确认']), ...checkFile(kind, name, body, meta) }
}

const NEW_FILES = ['IDENTITY', 'SOUL', 'MEMORY'] as const
const OLD_FILES = ['角色', '规矩', '记忆'] as const

function roleAt(dir: string): Role | null {
  const m = dir.match(/^(总助|内容|分身|合伙人)(?:[-－—·\s]+(.+))?$/)
  if (!m) return null
  const kind = m[1] as RoleKind
  const folder = `${BASE}/${dir}`
  const has = (n: string) => readable(`${folder}/${n}.md`)
  const hasNew = NEW_FILES.some(has)
  const v01 = !hasNew && (has('身份') || has('性格'))
  const chinese = !hasNew && !v01 && OLD_FILES.some(has)
  const files = chinese
    ? OLD_FILES.map((n) => roleFile(kind, folder, n))
    : [...NEW_FILES.map((n) => roleFile(kind, folder, n)), ...(kind === '分身' && has('底稿') ? [roleFile(kind, folder, '底稿', true)] : [])]
  const problems = [
    ...(!m[2] ? [`文件夹名要写成“${kind}-名字”`] : []),
    ...(chinese ? ['还是旧格式（角色.md、规矩.md、记忆.md）：要改成 IDENTITY.md、SOUL.md、MEMORY.md（角色.md 的前两节进 IDENTITY，后四节加整份规矩.md 进 SOUL，记忆.md 改名 MEMORY.md）'] : []),
    ...(v01 ? ['还是最早的“身份.md + 性格.md”：要改成 IDENTITY.md、SOUL.md、MEMORY.md'] : []),
  ]
  const head = files.find((f) => f.exists && (f.name === 'IDENTITY' || f.name === '角色'))
  const display = head ? str(front(readRel(head.path)).meta['名称']) : ''
  const required = files.filter((f) => !f.optional)
  return {
    kind, name: m[2]?.trim() || kind, display, folder, files,
    complete: required.every((f) => f.exists),
    updated: files.map((f) => f.updated).filter(Boolean).sort().pop() ?? '',
    legacy: !m[2] || chinese || v01, problems,
  }
}

function userFile(): UserFile {
  if (!readable(USER_PATH)) return { path: USER_PATH, exists: false, updated: '', confirm: '', problems: [] }
  const { meta, body } = front(readRel(USER_PATH))
  const missing = missingOf(body, USER_SECTIONS)
  return { path: USER_PATH, exists: true, updated: updatedOf(meta, USER_PATH), confirm: str(meta['确认']), problems: missing.length ? [`缺小节：${missing.join('、')}`] : [] }
}

/** 按文件夹列出全部角色：总助、内容助理、分身、合伙人，同类里旧格式排后面、再按名字排。不认识的文件夹写进 problems */
export function roles(): Roles {
  const dir = join(ROOT, BASE)
  const exists = existsSync(dir) && canReadKbPath(dir)
  const user = userFile()
  if (!exists) return { base: BASE, exists, roles: [], problems: [], user }
  const dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  const list = dirs.map(roleAt).filter((r): r is Role => !!r)
    .sort((a, b) => ROLE_KINDS.indexOf(a.kind) - ROLE_KINDS.indexOf(b.kind) || Number(a.legacy) - Number(b.legacy) || a.name.localeCompare(b.name, 'zh'))
  const chiefs = list.filter((r) => r.kind === '总助')
  const problems = [
    ...dirs.filter((d) => !roleAt(d)).map((d) => `“${d}”认不出是哪种助理（文件夹名要以 总助-、内容-、分身-、合伙人- 开头）`),
    ...(chiefs.length > 1 ? [`总助只能有一个，现在有 ${chiefs.length} 个：${chiefs.map((r) => r.folder.split('/').pop()).join('、')}`] : []),
  ]
  return { base: BASE, exists, roles: list, problems, user }
}
