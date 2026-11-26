// 把 AI 对话里生成的图放进当前稿子（2026-11-26）：复制一份到数据库旁边的 小红书素材/，记成一张“垫图”素材，
// 再把这篇的封面垫图换成它、存成新的一版（旧版留着，能恢复）。原图不动。归属：小红书内容模块。
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { DB_PATH, get, run, uid, nowIso } from '../../db.ts'
import { NotFound } from '../../services/common.ts'
import { identity } from '../../services/identity.ts'
import { latestDraft, pieceRow, saveVersion } from './pieces.ts'

export const ASSET_DIR = () => join(dirname(DB_PATH), '小红书素材')
const IMAGE = /^\.(png|jpe?g|webp|gif)$/i

/** 对话里第几步生成的图 → 这篇的封面垫图 */
export async function putChatImage(pieceId: string, input: { message?: unknown; step?: unknown }) {
  const p = pieceRow(pieceId)
  const message = String(input.message ?? '')
  const step = Number(input.step)
  // 工作台本体的对话（老版本本体没有这个函数，就说清楚）
  const core = await import('../../assistant/service.ts') as { assistantImage?: (m: string, s: number) => string }
  if (!core.assistantImage) throw new NotFound('这个工作台的对话还不能取图，先更新工作台')
  const src = core.assistantImage(message, step)
  const ext = extname(src).toLowerCase()
  if (!IMAGE.test(ext)) throw new NotFound('这不是一张图')
  const id = `a_img_${uid('x').slice(-8).toLowerCase().replace(/[^0-9a-z]/g, '0')}`
  mkdirSync(ASSET_DIR(), { recursive: true })
  const file = join(ASSET_DIR(), `${id}${ext}`)
  copyFileSync(src, file)
  run(`INSERT INTO xhs_assets (id, kind, name, description, usage, file, created_at) VALUES (:id, '垫图', :name, :desc, :usage, :file, :at)`, {
    id, name: `对话里生成的图（${p.title}）`, desc: 'AI 对话里生成的图，放进稿子时存的一份', usage: `「${p.title}」的封面`, file, at: nowIso(),
  })
  const cur = latestDraft(pieceId)?.draft
  const saved = saveVersion(pieceId, { ...(cur ?? {}), cover: { ...(cur?.cover ?? {}), pad: id } }, { origin: '手动修改', author: identity().owner, note: '封面垫图换成对话里生成的图' })
  return { asset: id, version: saved.version }
}

/** 素材的图片文件（只认 小红书素材/ 里的） */
export function assetFile(id: string): string {
  const r = get<{ file: string | null }>('SELECT file FROM xhs_assets WHERE id = :id', { id })
  const f = r?.file
  if (!f || dirname(f) !== ASSET_DIR() || !IMAGE.test(extname(f)) || !existsSync(f)) throw new NotFound('这张图找不到了')
  return f
}
