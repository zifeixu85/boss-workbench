// AI 助手的附件（2026-11-26，照 A梦 自用工作台）：粘贴截图、拖进来、点回形针选图片或文件，跟着这一句发给 Codex。
// 存在数据库旁边的“对话附件/”里（文件名是编号），这一句里只认编号找文件，不认网页传来的路径。
// 图片作为图片输入发给 Codex；别的文件（PDF、表格、文档）在这一句里写上位置，Codex 自己去读。
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { DB_PATH, uid } from '../db.ts'
import { BadRequest } from '../services/common.ts'

export const ATTACH_DIR = () => join(dirname(DB_PATH), '对话附件')
const MAX_BYTES = 15 * 1024 * 1024
const IMAGE = /^\.(png|jpe?g|gif|webp|heic)$/i
const FILE = /^\.(pdf|txt|md|csv|xlsx?|docx?|pptx?|json)$/i
export type Attachment = { id: string; name: string; kind: 'image' | 'file'; size: number }

/** 存一个附件：网页传来的是名字、类型和 base64 内容 */
export function saveAttachment(input: { name?: unknown; data?: unknown }): Attachment {
  const name = String(input.name ?? '').replace(/[\\/]/g, '_').trim().slice(0, 120) || '附件'
  const ext = (extname(name) || '.png').toLowerCase()
  if (!IMAGE.test(ext) && !FILE.test(ext)) throw new BadRequest(`这种文件放不进来（${ext}）：能放图片、PDF、表格、文档、文本`)
  const raw = String(input.data ?? '').replace(/^data:[^;]+;base64,/, '')
  const buf = Buffer.from(raw, 'base64')
  if (!buf.length) throw new BadRequest('文件是空的')
  if (buf.length > MAX_BYTES) throw new BadRequest('文件太大了（最多 15MB）')
  const id = uid('af')
  mkdirSync(ATTACH_DIR(), { recursive: true })
  writeFileSync(join(ATTACH_DIR(), `${id}${ext}`), buf)
  return { id, name, kind: IMAGE.test(ext) ? 'image' : 'file', size: buf.length }
}

/** 按编号找附件文件（编号只认 af_ 加字母数字，找不到返回 null） */
export function attachmentPath(id: string): string | null {
  if (!/^af_[0-9a-f]{8}$/i.test(id) || !existsSync(ATTACH_DIR())) return null
  const f = readdirSync(ATTACH_DIR()).find((n) => n.startsWith(`${id}.`))
  return f ? join(ATTACH_DIR(), f) : null
}

/** 这一句带的附件：只收存过的编号；图片给路径作为图片输入，所有附件在文字里列出位置 */
export function resolveAttachments(list: unknown): { items: (Attachment & { path: string })[]; images: string[]; note: string } {
  const arr = Array.isArray(list) ? list.slice(0, 10) : []
  const items = arr.flatMap((a) => {
    const o = (a ?? {}) as { id?: unknown; name?: unknown }
    const path = attachmentPath(String(o.id ?? ''))
    if (!path) return []
    const ext = extname(path)
    return [{ id: String(o.id), name: String(o.name ?? '').slice(0, 120) || `附件${ext}`, kind: IMAGE.test(ext) ? 'image' as const : 'file' as const, size: statSync(path).size, path }]
  })
  const note = items.length ? `【他这一句带了附件】\n${items.map((a) => `- ${a.name}：${a.path}${a.kind === 'image' ? '（图片，已经作为图片发给你）' : '（需要的话自己打开读）'}`).join('\n')}` : ''
  return { items, images: items.filter((a) => a.kind === 'image').map((a) => a.path), note }
}
