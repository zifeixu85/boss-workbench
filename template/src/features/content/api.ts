// 内容中心取数和写入。Codex 在后台跑的时候（写稿、出选题、复盘），对应的数据每 1.2 秒刷新一次，跑完就停。归属：小红书内容模块。
import { useQuery } from '@tanstack/react-query'
import { api, useApi, useWrite } from '@/lib/api'
import type { CenterToday, Draft, Piece, PieceDetail, ReviewDetail, StudioData } from './types'

const POLL = 1200

export const usePieces = () => useApi<Piece[]>('/content/pieces')
export const usePiece = (id: string | null) => useApi<PieceDetail>(id ? `/content/pieces/${id}` : null)

export function useCenter() {
  return useQuery<CenterToday>({ queryKey: ['/content/center'], queryFn: () => api.get('/content/center'), refetchInterval: (q) => (q.state.data?.topics.running ? POLL : false) })
}
export function useStudio(id: string | undefined) {
  return useQuery<StudioData>({ queryKey: [`/content/pieces/${id}/studio`], queryFn: () => api.get(`/content/pieces/${id}/studio`), enabled: !!id, retry: (n, e) => !/找不到/.test((e as Error).message) && n < 2, refetchInterval: (q) => (q.state.data?.running ? POLL : false) })
}
export function useReviewDetail(week: string | null) {
  return useQuery<ReviewDetail>({ queryKey: [`/content/reviews/${week}`], queryFn: () => api.get(`/content/reviews/${week}`), enabled: !!week, refetchInterval: (q) => (q.state.data?.running ? POLL : false) })
}

export const usePatchPiece = (msg?: string) => useWrite(({ id, ...b }: { id: string } & Record<string, unknown>) => api.patch<Piece>(`/content/pieces/${id}`, b), msg ?? ((p) => `「${(p as Piece).title}」已更新`))
export const useCreatePiece = () => useWrite((b: Record<string, unknown>) => api.post<Piece>('/content/pieces', b))
export const usePublish = () => useWrite(({ id, ...b }: { id: string; published_at?: string; publish_url?: string | null }) => api.post<Piece>(`/content/pieces/${id}/publish`, b), '已标记为已发布，数据导进来后自动对上')
export const useSaveVersion = () => useWrite(({ id, data, note }: { id: string; data: Draft; note?: string }) => api.post<{ version: number }>(`/content/pieces/${id}/versions`, { data, note }), (r) => `已保存 · v${(r as { version: number }).version}`)
export const useRestore = () => useWrite(({ id, version }: { id: string; version: number }) => api.post<{ version: number }>(`/content/pieces/${id}/restore`, { version }), (r) => `已恢复，存为 v${(r as { version: number }).version}`)
export const useSend = () => useWrite(({ id, text, pin }: { id: string; text: string; pin?: string | null }) => api.post<{ ai_id: string }>(`/content/pieces/${id}/messages`, { text, pin }))
export const useGenerateTopics = () => useWrite((b: { direction?: string; count?: number }) => api.post<{ job_id: string }>('/content/topics/generate', b), '已经让本机 Codex 出选题了，写好会出现在灵感池')
