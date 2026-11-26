// 把图放进某一篇（2026-11-26 对话里生成的图“放进当前稿子”；2026-11-27 加命令 xhs-image-add，助理能把图放进封面或某张内页）：复制一份到数据库旁边的 小红书素材/，记成一张“垫图”素材，
// 再把这篇的封面垫图换成它、存成新的一版（旧版留着，能恢复）。原图不动。归属：小红书内容模块。
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { DB_PATH, get, run, uid, nowIso } from '../../db.ts'
import { BadRequest, NotFound } from '../../services/common.ts'
import { identity } from '../../services/identity.ts'
import { latestDraft, pieceRow, saveVersion } from './pieces.ts'

export const ASSET_DIR = () => join(dirname(DB_PATH), '小红书素材')
const IMAGE = /^\.(png|jpe?g|webp|gif)$/i

/** 一张图放进某一篇：复制进 小红书素材/、记一张素材，page 0 = 封面，1、2…… = 第几张内页；存成新的一版（旧版留着）。原图不动 */
export function addImage(pieceId: string, src: string, opts: { page?: number; by: string; what: string; origin: '生成' | '实拍' }) {
  const p = pieceRow(pieceId)
  const ext = extname(src).toLowerCase()
  if (!IMAGE.test(ext)) throw new BadRequest('只收图片：png、jpg、webp、gif')
  if (!existsSync(src) || !statSync(src).isFile()) throw new NotFound(`找不到这张图：${src}`)
  if (statSync(src).size > 20 * 1024 * 1024) throw new BadRequest('图太大了（最多 20MB）')
  const page = Math.max(0, Math.floor(Number(opts.page ?? 0)) || 0)
  const cur = latestDraft(pieceId)?.draft
  const pages = cur?.pages ?? []
  if (page > 0 && page > pages.length - 1) throw new BadRequest(`这篇只有 ${Math.max(0, pages.length - 1)} 张内页（第 1 张是封面，用 --page 0）`)
  // 图的来源（2026-11-27，约定 11.14）：生成的编号是 a_gen_…，页面上标“AI 生成”；实拍的是 a_img_…。不拿生成的图冒充实拍
  const id = `${opts.origin === '生成' ? 'a_gen' : 'a_img'}_${uid('x').slice(-8).toLowerCase().replace(/[^0-9a-z]/g, '0')}`
  mkdirSync(ASSET_DIR(), { recursive: true })
  const file = join(ASSET_DIR(), `${id}${ext}`)
  copyFileSync(src, file)
  const where = page === 0 ? '封面' : `第 ${page} 张内页`
  run(`INSERT INTO xhs_assets (id, kind, name, description, usage, file, created_at) VALUES (:id, '垫图', :name, :desc, :usage, :file, :at)`, {
    id, name: `${opts.what}（${p.title}）`, desc: `${opts.what}（来源：${opts.origin}），放进稿子时存的一份`, usage: `「${p.title}」的${where}`, file, at: nowIso(),
  })
  const next = page === 0
    ? { ...(cur ?? {}), cover: { ...(cur?.cover ?? {}), pad: id } }
    : { ...(cur ?? {}), pages: pages.map((x, i) => (i === page ? { ...x, pad: id } : x)) }
  const saved = saveVersion(pieceId, next, { origin: '手动修改', author: opts.by, note: `${where}换成${opts.what}` })
  return { id: pieceId, title: p.title, asset: id, origin: opts.origin, where, version: saved.version, open: { kind: 'xhs-piece', id: pieceId }, path: `/content/studio/${pieceId}` }
}

/** 对话里第几步生成的图 → 这篇的封面垫图 */
export async function putChatImage(pieceId: string, input: { message?: unknown; step?: unknown }) {
  pieceRow(pieceId)
  // 工作台本体的对话（老版本本体没有这个函数，就说清楚）
  const core = await import('../../assistant/service.ts') as { assistantImage?: (m: string, s: number) => string }
  if (!core.assistantImage) throw new NotFound('这个工作台的对话还不能取图，先更新工作台')
  const src = core.assistantImage(String(input.message ?? ''), Number(input.step))
  if (!IMAGE.test(extname(src).toLowerCase())) throw new NotFound('这不是一张图')
  const r = addImage(pieceId, src, { page: 0, by: identity().owner, what: '对话里生成的图', origin: '生成' })
  return { asset: r.asset, version: r.version }
}

/** 素材的图片文件（只认 小红书素材/ 里的） */
export function assetFile(id: string): string {
  const r = get<{ file: string | null }>('SELECT file FROM xhs_assets WHERE id = :id', { id })
  const f = r?.file
  if (!f || dirname(f) !== ASSET_DIR() || !IMAGE.test(extname(f)) || !existsSync(f)) throw new NotFound('这张图找不到了')
  return f
}
