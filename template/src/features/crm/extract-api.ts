// 新材料提取的两个写接口：新建一次提取、换成事先跑好的结果。归属：大客户模块
import { api } from '@/lib/api'
import type { Extraction } from './types'

/** 新建一次提取（材料或粘贴的文字） */
export function startRun(body: { source_path?: string | null; text?: string | null; client_id?: string | null }) {
  return api.post<Extraction>('/crm/extractions', body)
}
/** Codex 用不了时：换成事先在同一份材料上真跑过的那一次（如实标注） */
export function startPrepared(path: string) {
  return api.post<Extraction>('/crm/extractions/prepared', { source_path: path })
}
