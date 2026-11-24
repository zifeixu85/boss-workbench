// 读知识库这一半：知识库档案里的“我关注的”、各类对象文件、角色文件、收件箱。只读，都走核心的知识库范围检查（不读 / 只读照样生效）。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'
import { canReadKbPath, readKbTextFile } from '../../services/kb.ts'
import { DEFAULT_REPORTS, parseProfile, type ReportSwitch } from './profile.ts'
import { parseObject } from './object-parse.ts'
import { front, sections, str } from './text.ts'
import { CARD_MAX_LINES, MEMORY_MAX_LINES, cardLines, memoryStats } from './role-parse.ts'
import type { FocusClass, KbObject } from './types.ts'

export const PROFILE_FILE = '知识库档案.md'
const readable = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) }
export const readRel = (rel: string) => readKbTextFile(join(ROOT, rel))

export type Profile = ReturnType<typeof parseProfile> & { hasProfile: boolean }
/** 知识库档案：“我关注的”有哪几类、候选类型、报告开关。没有档案、表头不对都写进 problems，页面上告诉用户怎么补 */
export function profile(): Profile {
  if (!readable(PROFILE_FILE)) return { classes: [], problems: [`知识库根目录没有 ${PROFILE_FILE}（“我关注的”有哪几类、开哪几种报告写在这份文件里）`], candidates: [], reports: { ...DEFAULT_REPORTS }, reportsSet: false, hasProfile: false }
  try { return { ...parseProfile(readRel(PROFILE_FILE)), hasProfile: true } } catch (err) { return { classes: [], problems: [`读不了 ${PROFILE_FILE}：${(err as Error).message}`], candidates: [], reports: { ...DEFAULT_REPORTS }, reportsSet: false, hasProfile: true } }
}
export const focusClasses = () => profile()
export const reportSwitch = (): ReportSwitch => profile().reports

const SKIP_FILES = /^(readme|index|agents|claude)\.md$/i

/** 一类对象：<文件夹>/<名称>.md，或 <文件夹>/<名称>/README.md。读不了的文件跳过并记下来 */
export function objectsOf(cls: FocusClass): { objects: KbObject[]; problems: string[] } {
  const dir = join(ROOT, cls.folder)
  if (!existsSync(dir)) return { objects: [], problems: [`知识库里还没有“${cls.folder}”这个文件夹`] }
  if (!canReadKbPath(dir)) return { objects: [], problems: [`“${cls.folder}”设成了不读`] }
  const objects: KbObject[] = []
  const problems: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'zh'))) {
    if (e.name.startsWith('.')) continue
    const rel = e.isDirectory() ? `${cls.folder}/${e.name}/README.md` : e.isFile() && e.name.endsWith('.md') && !SKIP_FILES.test(e.name) ? `${cls.folder}/${e.name}` : null
    if (!rel || !readable(rel)) continue
    try { objects.push(parseObject(readRel(rel), rel)) } catch (err) { problems.push(`${rel} 读不了：${(err as Error).message}`) }
  }
  return { objects, problems }
}

/** 所有类的所有对象（归类对话、解析“关联”用）。同一次请求里会用好几回，按知识库档案和文件夹的修改时间缓存 2 秒 */
let cache: { at: number; all: { cls: FocusClass; object: KbObject }[] } | null = null
export function allObjects(): { cls: FocusClass; object: KbObject }[] {
  if (cache && Date.now() - cache.at < 2000) return cache.all
  const all = focusClasses().classes.flatMap((cls) => objectsOf(cls).objects.map((object) => ({ cls, object })))
  cache = { at: Date.now(), all }
  return all
}
export const clearKbCache = () => { cache = null }

/** “关联”里写的路径 → 对象（写不写 .md、指到文件夹都认） */
export function findObject(path: string): { cls: FocusClass; object: KbObject } | undefined {
  const key = path.replace(/\.md$/i, '').replace(/\/README$/i, '').replace(/\/+$/, '')
  return allObjects().find(({ object }) => object.path.replace(/\.md$/i, '').replace(/\/README$/i, '') === key)
}

/** 00-收件箱 里等确认的文件 */
export function inboxFiles(): { path: string; name: string; updated: string }[] {
  const dir = join(ROOT, '00-收件箱')
  if (!existsSync(dir) || !canReadKbPath(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md') && !SKIP_FILES.test(e.name) && !e.name.startsWith('.'))
    .map((e) => ({ path: `00-收件箱/${e.name}`, name: e.name.replace(/\.md$/, ''), updated: statSync(join(dir, e.name)).mtime.toISOString() }))
    .sort((a, b) => b.updated.localeCompare(a.updated))
}

// ───────────────────────────── 角色文件（约定 v0.3 第 5 节）
// 一个角色一个文件夹，名字是“类型-名字”（总助-小茶、分身-<名字>、合伙人-法务）；总助只有一个，分身和合伙人可以有多个。
// 每个角色三份：角色.md（人设）、规矩.md（这个角色怎么做事）、记忆.md。这一页只看齐不齐、更新日期、记忆几条，不改。

export const ROLE_KINDS = ['总助', '分身', '合伙人'] as const
export type RoleKind = (typeof ROLE_KINDS)[number]
const CARD_SECTIONS = ['我是谁', '我管什么，不管什么', '我怎么想', '我怎么说话', '我会说的，和我绝不说的', '什么时候我会反对你']
const PARTNER_SECTIONS = ['专业或思路来源', '边界']
const RULE_SECTIONS = ['每次开始先读什么', '我能自己做的', '要先问你的', '我不做的', '定期要做的']
/** 角色、记忆的行数：正文里不空的行。记忆另有条数、没带日期的条数、最早和最近一条的日期（约定 v0.4） */
export type RoleFile = { name: '角色' | '规矩' | '记忆'; path: string; exists: boolean; updated: string; confirm: string; lines?: number; entries?: number; undated?: number; first?: string; last?: string; problems: string[] }
export type Role = { kind: RoleKind; name: string; display: string; folder: string; files: RoleFile[]; complete: boolean; updated: string; legacy: boolean; problems: string[] }

function roleFile(kind: RoleKind, folder: string, name: RoleFile['name']): RoleFile {
  const path = `${folder}/${name}.md`
  if (!readable(path)) return { name, path, exists: false, updated: '', confirm: '', problems: [] }
  const { meta, body } = front(readRel(path))
  const have = sections(body).map((x) => x.title)
  const problems: string[] = []
  let extra: Partial<RoleFile> = {}
  if (name === '角色') {
    const n = cardLines(body)
    extra = { lines: n }
    if (n > CARD_MAX_LINES) problems.push(`人设太长（正文 ${n} 行，约定不超过 ${CARD_MAX_LINES} 行），后面的它可能读不到`)
    const missing = [...CARD_SECTIONS, ...(kind === '合伙人' ? PARTNER_SECTIONS : [])].filter((t) => !have.includes(t))
    if (str(meta['类型']) !== '角色') problems.push('开头的“类型”要写“角色”')
    if (str(meta['角色']) && str(meta['角色']) !== kind) problems.push(`开头的“角色”写的是“${str(meta['角色'])}”，文件夹是${kind}`)
    if (missing.length) problems.push(`缺小节：${missing.join('、')}`)
    const against = sections(body).find((x) => x.title === '什么时候我会反对你')?.text ?? ''
    if (kind !== '总助' && have.includes('什么时候我会反对你') && !against.trim()) problems.push('“什么时候我会反对你”分身和合伙人要写')
  } else if (name === '规矩') {
    const missing = RULE_SECTIONS.filter((t) => !have.includes(t))
    if (missing.length) problems.push(`缺小节：${missing.join('、')}`)
  } else {
    const m = memoryStats(body)
    extra = m
    if (m.undated) problems.push(`${m.undated} 条没带日期（要写成“- 2026-11-24｜规矩；原因”）`)
    if (m.lines > MEMORY_MAX_LINES) problems.push(`已经 ${m.lines} 行，超过 ${MEMORY_MAX_LINES} 行了，该让总助提议归并`)
  }
  return { name, path, exists: true, updated: str(meta['更新']) || statSync(join(ROOT, path)).mtime.toISOString().slice(0, 10), confirm: str(meta['确认']), ...extra, problems }
}

function roleAt(dir: string, base: string): Role | null {
  const m = dir.match(/^(总助|分身|合伙人)(?:[-－—·\s]+(.+))?$/)
  if (!m) return null
  const kind = m[1] as RoleKind
  const folder = `${base}/${dir}`
  const files = (['角色', '规矩', '记忆'] as const).map((n) => roleFile(kind, folder, n))
  // 旧格式（v0.1 的“身份 + 性格”、文件夹不带名字）：还认得出来，提示要改
  const legacy = !m[2] || (!files[0].exists && (readable(`${folder}/身份.md`) || readable(`${folder}/性格.md`)))
  const problems = [
    ...(!m[2] ? [`文件夹名要写成“${kind}-名字”`] : []),
    ...(!files[0].exists && (readable(`${folder}/身份.md`) || readable(`${folder}/性格.md`)) ? ['还是旧的“身份.md + 性格.md”，要合成“角色.md”，再加一份“规矩.md”'] : []),
  ]
  const display = files[0].exists ? str(front(readRel(files[0].path)).meta['名称']) : ''
  return { kind, name: m[2]?.trim() || kind, display, folder, files, complete: files.every((f) => f.exists), updated: files.map((f) => f.updated).filter(Boolean).sort().pop() ?? '', legacy, problems }
}

/** 按文件夹列出全部角色：总助在前，再分身、合伙人，同类按名字排。不认识的文件夹写进 problems */
export function roles(): { base: string; exists: boolean; roles: Role[]; problems: string[] } {
  const base = '01-关于我/助理'
  const dir = join(ROOT, base)
  const exists = existsSync(dir) && canReadKbPath(dir)
  if (!exists) return { base, exists, roles: [], problems: [] }
  const dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  const list = dirs.map((d) => roleAt(d, base)).filter((r): r is Role => !!r)
    .sort((a, b) => ROLE_KINDS.indexOf(a.kind) - ROLE_KINDS.indexOf(b.kind) || Number(a.legacy) - Number(b.legacy) || a.name.localeCompare(b.name, 'zh'))
  const problems = [
    ...dirs.filter((d) => !roleAt(d, base)).map((d) => `“${d}”认不出是哪种角色（文件夹名要以 总助-、分身-、合伙人- 开头）`),
    ...(list.filter((r) => r.kind === '总助').length > 1 ? [`总助只能有一个，现在有 ${list.filter((r) => r.kind === '总助').length} 个：${list.filter((r) => r.kind === '总助').map((r) => r.folder.split('/').pop()).join('、')}`] : []),
  ]
  return { base, exists, roles: list, problems }
}
