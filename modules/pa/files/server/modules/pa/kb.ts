// 读知识库这一半：知识库档案里的“我关注的”、各类对象文件、角色文件、收件箱。只读，都走核心的知识库范围检查（不读 / 只读照样生效）。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'
import { canReadKbPath, readKbTextFile } from '../../services/kb.ts'
import { DEFAULT_REPORTS, parseProfile, type ReportSwitch } from './profile.ts'
import { parseObject } from './object-parse.ts'
import { front, sections, str } from './text.ts'
import type { FocusClass, KbObject } from './types.ts'
import { typeDef } from './type-library.ts'
import { deriveClasses } from '../../../scripts/kb-check.mjs'

export const PROFILE_FILE = '知识库档案.md'
const readable = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) }
export const readRel = (rel: string) => readKbTextFile(join(ROOT, rel))

export type Profile = ReturnType<typeof parseProfile> & { hasProfile: boolean }
/** 知识库档案：“我关注的”有哪几类、候选类型、报告开关。没有档案、表头不对都写进 problems，页面上告诉用户怎么补 */
export function profile(): Profile {
  if (!readable(PROFILE_FILE) && readable(OLD_PROFILE)) return oldProfile()
  if (!readable(PROFILE_FILE)) return { classes: [], problems: [`知识库根目录没有 ${PROFILE_FILE}（“我关注的”有哪几类、开哪几种报告写在这份文件里）`], candidates: [], reports: { ...DEFAULT_REPORTS }, reportsSet: false, hasProfile: false }
  try { return { ...parseProfile(readRel(PROFILE_FILE)), hasProfile: true } } catch (err) { return { classes: [], problems: [`读不了 ${PROFILE_FILE}：${(err as Error).message}`], candidates: [], reports: { ...DEFAULT_REPORTS }, reportsSet: false, hasProfile: true } }
}
/** 老板知识库工具建的旧结构：档案是 01-AI协作/建库档案.md，没有“我关注的”表 */
export const OLD_PROFILE = '01-AI协作/建库档案.md'

/** 旧结构按“目录对应”推出客户、项目在哪（约定 9.1，2026-11-25 A梦 定）。推出来的都是待确认；推不出来的说清，请用户做一次升级检查 */
function oldProfile(): Profile {
  let text = ''
  try { text = readRel(OLD_PROFILE) } catch (err) { return { classes: [], problems: [`读不了 ${OLD_PROFILE}：${(err as Error).message}`], candidates: [], reports: { ...DEFAULT_REPORTS }, reportsSet: false, hasProfile: true } }
  const derived = deriveClasses(text, (f) => readable(f))
  const classes: FocusClass[] = derived.filter((d) => d.state === 'ok').flatMap((d) => {
    const def = typeDef(d.name)
    return def ? [{ name: d.name, folder: d.folder, statuses: def.statuses, fields: def.fields, links: def.links, icon: def.icon, rename: {}, confirmed: false }] : []
  })
  const problems = classes.length
    ? [`旧结构的档案里没有“我关注的”表：${classes.map((c) => `${c.name}按目录对应推的是 ${c.folder}`).join('，')}，待确认。对 AI 说“检查一下我的知识库”就能登记下来`]
    : [`旧结构的档案里没有“我关注的”表，按目录对应也找不到客户、项目的文件夹（${derived.map((d) => d.folder).join('、')}）。对 AI 说“检查一下我的知识库”`]
  return { classes, problems, candidates: [], reports: { ...DEFAULT_REPORTS }, reportsSet: false, hasProfile: true }
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

/** 所有类的所有对象（归类对话、解析“关联”用）。同一次请求里会用好几回，所以缓存；
 *  缓存认的是知识库档案和每份对象文件的修改时间：文件一改（对话里 pa-update、或在 Obsidian 里改）下一次读就是新的。
 *  不能按时间缓存：网页收到“知识库变了”马上来读，几百毫秒内读到旧的，详情就不刷新了 */
let cache: { sig: string; all: { cls: FocusClass; object: KbObject }[] } | null = null
function signature(): string {
  const parts: string[] = []
  const stamp = (rel: string) => { try { parts.push(`${rel}:${statSync(join(ROOT, rel)).mtimeMs}`) } catch { parts.push(`${rel}:-`) } }
  stamp(PROFILE_FILE)
  for (const cls of focusClasses().classes) {
    const dir = join(ROOT, cls.folder)
    if (!existsSync(dir)) continue
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) stamp(`${cls.folder}/${e.name}/README.md`)
      else if (e.isFile() && e.name.endsWith('.md')) stamp(`${cls.folder}/${e.name}`)
    }
  }
  return parts.join('|')
}
export function allObjects(): { cls: FocusClass; object: KbObject }[] {
  const sig = signature()
  if (cache && cache.sig === sig) return cache.all
  const all = focusClasses().classes.flatMap((cls) => objectsOf(cls).objects.map((object) => ({ cls, object })))
  cache = { sig, all }
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

// 角色文件在 roles.ts（约定 v0.5：IDENTITY、SOUL、MEMORY，USER.md 共用；旧的中文名还认）
export { roles, ROLE_KINDS, type Role, type RoleKind, type RoleFile, type Roles } from './roles.ts'
