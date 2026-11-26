// 小红书账号（2026-11-27，约定 11.14）：以知识库为准，一个账号一份文件，工作台只读它（不在数据库里另存一份）。
// 放哪：知识库档案“位置”表里登记的“小红书账号”；没登记就放在“关于我”下的 小红书账号/。
// 每份开头：类型 账号、平台 小红书、名称、小红书号、定位、写给谁看、人设、风格、不碰（列表）、状态、更新；正文随老板写，工作台不动。
// 选题、稿子、图都挂在账号下（xhs_pieces.account 记账号名）；只有一个账号时不用写。归属：小红书内容模块。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, localDate } from '../../db.ts'
import { now } from '../../clock.ts'
import { BadRequest } from '../../services/common.ts'
import { backupKbFile, canReadKbPath, readKbTextFile, writeKb } from '../../services/kb.ts'
import { splitFrontmatter } from '../../../shared/frontmatter.ts'
import { readPositions } from '../../../scripts/kb-check.mjs'

export type Account = {
  name: string; handle: string; positioning: string; audience: string; persona: string; style: string; avoid: string[]; status: string; updated: string
  /** 知识库里的文件 */
  path: string
}
/** 开头的字段名 ↔ 命令的参数 */
const FIELDS: [keyof Account, string][] = [['handle', '小红书号'], ['positioning', '定位'], ['audience', '写给谁看'], ['persona', '人设'], ['style', '风格']]

const profileText = () => { const f = join(ROOT, '知识库档案.md'); return existsSync(f) && canReadKbPath(f) ? readKbTextFile(f) : '' }
const okFolder = (f: string) => f.split('/').every((s) => s && s !== '..' && !s.startsWith('.'))

/** 账号文件放哪 */
export function accountsFolder(): string {
  const text = profileText()
  const row = text.split(/\r?\n/).find((l) => /^\|\s*小红书账号\s*\|/.test(l))
  const reg = row?.split('|')[2]?.trim().replace(/^\/+|\/+$/g, '')
  if (reg && okFolder(reg)) return reg
  return `${(readPositions(text) as Record<string, string>)['关于我'] ?? '01-关于我'}/小红书账号`
}

const unquote = (v: string) => { const t = v.trim(); if (/^".*"$/.test(t)) { try { return JSON.parse(t) as string } catch { /* 原样 */ } } return t.replace(/^'(.*)'$/, '$1') }

function readAccount(path: string): Account | null {
  const { meta } = splitFrontmatter(readKbTextFile(join(ROOT, path)))
  const get = (k: string) => { const m = meta.find((x) => x.key === k); return m ? unquote(m.value) : '' }
  const list = (k: string) => { const m = meta.find((x) => x.key === k); return m ? (m.list.length ? m.list.map(unquote) : m.value ? unquote(m.value).split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : []) : [] }
  if (get('类型') && get('类型') !== '账号') return null
  const name = get('名称') || path.split('/').pop()!.replace(/\.md$/, '')
  return { name, handle: get('小红书号'), positioning: get('定位'), audience: get('写给谁看'), persona: get('人设'), style: get('风格'), avoid: list('不碰'), status: get('状态') || '在用', updated: get('更新'), path }
}

/** 知识库里登记的账号（停用的不算） */
export function listAccounts(): Account[] {
  const folder = accountsFolder()
  const dir = join(ROOT, folder)
  if (!existsSync(dir) || !canReadKbPath(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort((a, b) => a.localeCompare(b, 'zh'))
    .map((f) => readAccount(`${folder}/${f}`)).filter((a): a is Account => !!a && a.status !== '停用')
}

/** 这一篇挂哪个账号：写了就要是登记过的；没写时只有一个账号就用它；一个都没登记就不挂 */
export function resolveAccount(name: string | undefined): string | null {
  const all = listAccounts()
  const n = name?.trim()
  if (n) {
    if (!all.some((a) => a.name === n)) throw new BadRequest(`没有“${n}”这个账号。登记过的：${all.map((a) => a.name).join('、') || '还没有'}（用 xhs-account-save 登记）`)
    return n
  }
  if (all.length > 1) throw new BadRequest(`有 ${all.length} 个账号（${all.map((a) => a.name).join('、')}），要用 --account 写是哪一个`)
  return all[0]?.name ?? null
}

const yq = (s: string) => JSON.stringify(s.replace(/\s+/g, ' ').trim())
const safeName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/** 登记或改一个账号：只改给了的几项，正文和别的项不动；改之前备份。写知识库前要老板点头（命令说明里写明） */
export function saveAccount(input: Partial<Record<'name' | 'handle' | 'positioning' | 'audience' | 'persona' | 'style' | 'avoid', string>>, by: string) {
  const name = (input.name ?? '').trim().slice(0, 40)
  if (!name) throw new BadRequest('要用 --name 写账号名')
  const old = listAccounts().find((a) => a.name === name)
  const path = old?.path ?? `${accountsFolder()}/${safeName(name)}.md`
  const prev = old ? readKbTextFile(join(ROOT, path)) : ''
  const { meta, body } = splitFrontmatter(prev)
  const keep = meta.filter((m) => !['类型', '平台', '名称', '更新', ...FIELDS.map(([, k]) => k), '不碰'].includes(m.key))
  const val = (key: keyof Account, _label: string) => (input[key as keyof typeof input] ?? (old ? String(old[key] ?? '') : '')).trim()
  const avoid = input.avoid !== undefined ? input.avoid.split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : old?.avoid ?? []
  const lines = ['---', '类型: 账号', '平台: 小红书', `名称: ${yq(name)}`,
    ...FIELDS.map(([k, label]) => { const v = val(k, label); return v ? `${label}: ${yq(v)}` : '' }).filter(Boolean),
    ...(avoid.length ? ['不碰:', ...avoid.map((x) => `  - ${yq(x)}`)] : []),
    ...(old ? keep.map((m) => (m.list.length ? [`${m.key}:`, ...m.list.map((x) => `  - ${x}`)].join('\n') : `${m.key}: ${m.value}`)) : ['状态: 在用', '确认: 待确认', '隐私: 内部']),
    `更新: ${localDate(now())}`, '---', '']
  const text = `${lines.join('\n')}${old ? body.replace(/^\n+/, '\n') : `\n# ${name}\n\n账号的定位、写给谁看、人设、风格和不碰的东西写在开头；想多写的（怎么拍、常用的开头）写在下面。小红书助理写稿前先读这一份。（${by} 登记）\n`}`
  if (old) backupKbFile(path, `${localDate(now())}T${String(Date.now()).slice(-6)}`)
  writeKb(path, text)
  return { ...readAccount(path)!, created: !old }
}
