// 列出、找到某一篇（2026-11-27，约定 11.13：小红书助理要能找回自己写过的那篇接着改）；也给助理页的“产出”用（接入点 works）。
// 一篇从选题到发布是同一条：选题（灵感池、已选）→ 草稿（写稿中）→ 定稿（待发布）→ 已发布。谁做的：选题是谁存的，加上每一版的作者。归属：小红书内容模块。
import { all } from '../../db.ts'

export type PieceBrief = {
  id: string; title: string; status: string
  /** 给人看的阶段：选题、草稿、定稿、已发布、已放弃 */
  stage: string
  version: number | null
  /** 选题是谁存的 */
  by: string
  /** 每一版的作者（去重，先来的在前） */
  authors: string[]
  updated_at: string
  /** 网页上这一篇的地址（创作页） */
  path: string
}

const STAGE: Record<string, string> = { 灵感池: '选题', 已选: '选题', 写稿中: '草稿', 待发布: '定稿', 已发布: '已发布', 已放弃: '已放弃' }

type Row = { id: string; title: string; status: string; created_by: string; updated_at: string; version: number | null; authors: string | null }

/** q：标题、角度、说明里有这几个字；status：内容页的状态或阶段（选题、草稿、定稿……）；by：选题或哪一版是他做的（名字包含就算） */
export function findPieces(o: { q?: string; status?: string; by?: string; limit?: number } = {}): PieceBrief[] {
  const rows = all<Row>(`SELECT p.id, p.title, p.status, p.created_by, p.updated_at,
      (SELECT MAX(v.version) FROM xhs_versions v WHERE v.piece_id = p.id) AS version,
      (SELECT GROUP_CONCAT(author, char(31)) FROM (SELECT v.author FROM xhs_versions v WHERE v.piece_id = p.id ORDER BY v.version)) AS authors
    FROM xhs_pieces p
    WHERE (:q IS NULL OR p.title LIKE :like OR COALESCE(p.angle, '') LIKE :like OR COALESCE(p.reason, '') LIKE :like)
    ORDER BY p.updated_at DESC LIMIT 500`, { q: o.q?.trim() || null, like: `%${o.q?.trim() ?? ''}%` })
  const list = rows.map((r): PieceBrief => ({
    id: r.id, title: r.title, status: r.status, stage: STAGE[r.status] ?? r.status, version: r.version, by: r.created_by,
    authors: [...new Set((r.authors ?? '').split('\u001f').filter(Boolean))], updated_at: r.updated_at, path: `/content/studio/${r.id}`,
  }))
  const who = o.by?.trim()
  return list
    .filter((p) => !o.status || p.status === o.status || p.stage === o.status)
    .filter((p) => !who || [p.by, ...p.authors].some((x) => x.includes(who)))
    .slice(0, Math.min(Math.max(o.limit ?? 30, 1), 200))
}
