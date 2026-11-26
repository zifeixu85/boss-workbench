// 内容助理写完一篇：存成内容页里的一篇草稿（xhs_pieces + 一个稿件版本），同时在知识库里存一份“作品”对象。
// 课程约定（骨架与对象格式 v0.5 第 5 节、my-assistant 的 内容助理.md）：每篇存成一个作品，状态是草稿；对话里只给标题、一句说明和位置，
// 正文和多张图不贴在对话里，在工作台右侧打开预览看。改稿用 --id：同一篇存新版本，作品文件跟着换。
// 作品放哪：知识库档案.md 的“我关注的”表登记的作品文件夹；没登记放 13-作品/。写知识库之前先备份原文件。归属：小红书内容模块。
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, localDate } from '../../db.ts'
import { now } from '../../clock.ts'
import { BadRequest, type Actor } from '../../services/common.ts'
import { backupKbFile, canReadKbPath, readKbTextFile, writeKb } from '../../services/kb.ts'
import { normalizeDraft, type Draft } from './draft.ts'
import { createPiece, latestDraft, pieceRow, saveVersion } from './pieces.ts'

const DEFAULT_FOLDER = '13-作品'
const SUMMARY_MAX = 80

export type SavedWork = { id: string; title: string; summary: string; status: '草稿'; version: number; kb: string; backup?: string; where: string; open: { kind: 'xhs-piece'; id: string } }

/** 知识库档案“我关注的”表里作品那一行的文件夹 */
export function worksFolder(): string {
  const file = join(ROOT, '知识库档案.md')
  if (!existsSync(file) || !canReadKbPath(file)) return DEFAULT_FOLDER
  const row = readKbTextFile(file).split(/\r?\n/).find((l) => /^\|\s*作品\s*\|/.test(l))
  const folder = row?.split('|')[2]?.trim().replace(/^\/+|\/+$/g, '')
  return folder && okFolder(folder) ? folder : DEFAULT_FOLDER
}

/** 作品文件夹的名字：不出知识库、不是隐藏文件夹、不是工作台自己的（程序、数据、备份） */
const okFolder = (f: string) => f.split('/').every((s) => s && s !== '..' && !s.startsWith('.') && !['程序', '数据', '备份', '工作台', 'node_modules'].includes(s))

const safeName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/** 这一篇已经有的作品文件（开头写着 工作台: xhs-piece:<id>） */
function findWorkFile(folder: string, id: string): string | null {
  const dir = join(ROOT, folder)
  if (!existsSync(dir) || !canReadKbPath(dir)) return null
  const mark = `工作台: xhs-piece:${id}`
  const hit = readdirSync(dir).filter((f) => f.endsWith('.md')).find((f) => readKbTextFile(join(dir, f)).includes(mark))
  return hit ? `${folder}/${hit}` : null
}

/** 作品文件：开头属性 + 现在、正文（几张图的顺序、正文、话题）、往来记录、来源 */
/** YAML 的双引号字符串（JSON 的写法 YAML 也认） */
const yamlString = (s: string) => JSON.stringify(s.replace(/\s+/g, ' ').trim())

export function workText(d: Draft, o: { id: string; summary: string; day: string; by: string; created: string; sources: string[] }): string {
  const pages = d.pages.map((p, i) => `${i + 1}. ${p.text.replace(/\n/g, ' ')}${p.role === '封面' ? '（封面）' : ''}`)
  const tags = d.tags.map((t) => `#${t}`).join(' ')
  return [
    // Obsidian 认的写法（约定 11.9）：名称按 YAML 加引号（标题里有冒号、#、引号也不坏）；来源永远是列表（同一个属性名在库里类型一致）
    '---', '类型: 作品', `名称: ${yamlString(d.title)}`, '状态: 草稿', '平台: 小红书', `日期: ${o.created}`, `更新: ${o.day}`, '确认: 待确认', '隐私: 内部',
    '来源:', ...(o.sources.length ? o.sources.map((x) => `  - "[[${x}]]"`) : [`  - 和${o.by}的对话`]),
    `写的人: ${o.by}`, `工作台: xhs-piece:${o.id}`, '---', '',
    '## 现在', o.summary, '',
    '## 正文', `标题：${d.title}`, '', '图片顺序：', ...pages, '', d.body.trim(), '', ...(tags ? [tags, ''] : []),
    '## 往来记录', `- ${o.day}｜对话｜${o.by}写了第一版草稿（AI 记录，待确认）`, '',
    '## 来源', ...(o.sources.length ? o.sources.map((x) => `- [[${x}]]`) : [`- 和${o.by}的对话`]), '',
  ].join('\n')
}

/**
 * 存一篇。input：标题、summary（一句说明）、cover_text、pages（字符串或 {text}）、body、tags，
 * sources（这篇用到的知识库文件路径，比如 11-产品/白茶饼.md；事实和数字都要能在这里找到出处）。
 * id：改哪一篇（不给就新建一篇，放在“写稿中”）。by：谁写的（比如“内容助理 小红”）。
 */
export function saveWork(input: unknown, opts: { id?: string; by?: string; actor?: Actor } = {}): SavedWork {
  const raw = { ...(input && typeof input === 'object' ? input : {}) } as Record<string, unknown>
  const by = (opts.by ?? '').trim().slice(0, 30) || '内容助理'
  // 助理存稿没给封面图、这一篇也还没有稿子：封面用占位（约定 11.13：没有实拍图就空着，不拿插画充数）
  const hasPad = !!(raw.cover && typeof raw.cover === 'object' && (raw.cover as Record<string, unknown>).pad)
  if (!hasPad && !(opts.id && latestDraft(opts.id))) raw.cover = { ...(raw.cover && typeof raw.cover === 'object' ? raw.cover as object : {}), pad: 'a_pad0' }
  const draft = normalizeDraft(raw)
  if (!draft.title.trim()) throw new BadRequest('稿件要有标题（title）')
  if (!draft.body.trim()) throw new BadRequest('稿件要有正文（body）')
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).map((x) => String(x).trim().replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '')).filter((x) => x && !x.includes('..')).slice(0, 12)
  const summary = String(raw.summary ?? '').trim().replace(/\s+/g, ' ').slice(0, SUMMARY_MAX) || draft.title
  const id = opts.id ? pieceRow(opts.id).id : createPiece({ title: draft.title, source: '自己想的', status: '写稿中', reason: summary }, opts.actor ?? 'Codex', { created_by: by }).id
  const { version, draft: saved } = saveVersion(id, draft, { origin: 'AI 写稿', author: by, note: summary })
  const folder = worksFolder()
  const d = now()
  const day = localDate(d)
  const existing = findWorkFile(folder, id)
  const created = existing ? (readKbTextFile(join(ROOT, existing)).match(/^日期: (\d{4}-\d{2}-\d{2})$/m)?.[1] ?? day) : day
  const kb = existing ?? `${folder}/${day} ${safeName(saved.title) || id}.md`
  const stamp = `${day}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  const backup = existing ? backupKbFile(existing, stamp) ?? undefined : undefined
  // 工作台只往已有的顶层文件夹里写；作品文件夹是骨架里定好的，第一次写时建出来
  mkdirSync(join(ROOT, folder), { recursive: true })
  writeKb(kb, workText(saved, { id, summary, day, by, created, sources }))
  return { id, title: saved.title, summary, status: '草稿', version, kb, ...(backup ? { backup } : {}), where: `工作台内容页（小红书 → 内容，状态是写稿中）；知识库 ${kb}`, open: { kind: 'xhs-piece', id } }
}
