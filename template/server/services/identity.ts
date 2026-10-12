// 老板怎么称呼、店名（品牌名）、小红书账号名：都从设置读（settings 表的 owner、business、xhs_name）。
// 搭建时用命令 settings-set --owner --business --xhs 按知识库写入，网页“设置”页也能改。
// 网页文案、命令行输出、给 Codex 的提示词、写回知识库的话都用这里的值；没设置时用中性说法。
import { all } from '../db.ts'

export type Identity = {
  /** 称呼，如“张总”；没设置时“老板” */
  owner: string
  /** 店名或品牌名；没设置时“我的店” */
  shop: string
  /** 小红书账号名；没设置时用店名，再没有就“我的账号” */
  xhs: string
  /** 设置里真写了的店名（没写是 null）：提示词里要不要带店名看它 */
  brand: string | null
}

export const DEFAULT_IDENTITY: Identity = { owner: '老板', shop: '我的店', xhs: '我的账号', brand: null }

export function identity(): Identity {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key IN ('owner', 'business', 'xhs_name')")
  const s: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, String(r.value ?? '').trim()]))
  return {
    owner: s.owner || DEFAULT_IDENTITY.owner,
    shop: s.business || DEFAULT_IDENTITY.shop,
    xhs: s.xhs_name || s.business || DEFAULT_IDENTITY.xhs,
    brand: s.business || null,
  }
}

/** 给 Codex 的提示词开头：“你是张总（某某花店）的助理”；没设店名就只写称呼 */
export function assistantOf(id = identity()) {
  return `你是${id.owner}${id.brand ? `（${id.brand}）` : ''}的助理`
}

/** 正则里用的称呼（转义） */
export const ownerRe = () => identity().owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
