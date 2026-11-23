// 读知识库这一半：知识库档案里的“我关注的”、各类对象文件、角色文件、收件箱。只读，都走核心的知识库范围检查（不读 / 只读照样生效）。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'
import { canReadKbPath, readKbTextFile } from '../../services/kb.ts'
import { parseFocusTable } from './profile.ts'
import { parseObject } from './object-parse.ts'
import { front } from './text.ts'
import type { FocusClass, KbObject } from './types.ts'

export const PROFILE_FILE = '知识库档案.md'
const readable = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) }
export const readRel = (rel: string) => readKbTextFile(join(ROOT, rel))

/** “我关注的”有哪几类。没有知识库档案、表头不对都写进 problems，页面上告诉用户怎么补 */
export function focusClasses(): { classes: FocusClass[]; problems: string[]; hasProfile: boolean } {
  if (!readable(PROFILE_FILE)) return { classes: [], problems: [`知识库根目录没有 ${PROFILE_FILE}（“我关注的”有哪几类写在这份文件里）`], hasProfile: false }
  try { return { ...parseFocusTable(readRel(PROFILE_FILE)), hasProfile: true } } catch (err) { return { classes: [], problems: [`读不了 ${PROFILE_FILE}：${(err as Error).message}`], hasProfile: true } }
}

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

// ───────────────────────────── 角色文件（约定第 5 节）

const ROLE_FILES = ['身份', '性格', '记忆']
export type RoleFile = { name: string; path: string; exists: boolean; updated: string; confirm: string; problems: string[] }
export type Role = { role: '总助' | '分身' | '合伙人'; name: string; folder: string; exists: boolean; files: RoleFile[]; complete: boolean; updated: string }

function roleAt(role: Role['role'], name: string, folder: string): Role {
  const exists = existsSync(join(ROOT, folder))
  const files = ROLE_FILES.map((f): RoleFile => {
    const path = `${folder}/${f}.md`
    if (!readable(path)) return { name: f, path, exists: false, updated: '', confirm: '', problems: [] }
    const { meta } = front(readRel(path))
    const problems = [
      ...(meta['类型'] === '角色文件' ? [] : ['开头的“类型”要写“角色文件”']),
      ...(meta['角色'] && meta['角色'] !== role ? [`开头的“角色”写的是“${meta['角色']}”`] : []),
      ...(meta['更新'] ? [] : ['没写“更新”日期']),
    ]
    return { name: f, path, exists: true, updated: meta['更新'] || statSync(join(ROOT, path)).mtime.toISOString().slice(0, 10), confirm: meta['确认'] ?? '', problems }
  })
  return { role, name, folder, exists, files, complete: files.every((f) => f.exists), updated: files.map((f) => f.updated).filter(Boolean).sort().pop() ?? '' }
}

/** 总助、分身各一个；合伙人有几个算几个（合伙人-<名称>/） */
export function roles(): { base: string; exists: boolean; roles: Role[] } {
  const base = '01-关于我/助理'
  const dir = join(ROOT, base)
  const exists = existsSync(dir) && canReadKbPath(dir)
  const partners = exists ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^合伙人/.test(e.name)).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'zh')) : []
  return { base, exists, roles: [roleAt('总助', '总助', `${base}/总助`), roleAt('分身', '分身', `${base}/分身`), ...partners.map((p) => roleAt('合伙人', p.replace(/^合伙人[-－—·\s]*/, '') || p, `${base}/${p}`))] }
}
