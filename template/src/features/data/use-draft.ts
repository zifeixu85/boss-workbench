// 导入四步共用：读文件（UTF-8 / GBK）、新建草稿、改对照、让 Codex 看看、导入、撤销。归属：数据源与导入模块
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, useApi, useWrite } from '@/lib/api'
import type { Choices, DraftView, ImportResult } from './types'

/** 浏览器里读文件：先按 UTF-8，读出乱码再按 GBK（国内平台导出的 CSV 常是 GBK） */
export async function readFile(file: File): Promise<{ text: string; encoding: string }> {
  const buf = await file.arrayBuffer()
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' } }
  catch { return { text: new TextDecoder('gbk').decode(buf), encoding: 'GBK' } }
}

export const EXCEL = /\.(xlsx|xls|xlsm|numbers|et)$/i

export function useCreateDraft(onDone: (id: string) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { file?: File; sample?: string }) => {
      if (input.sample) {
        const res = await fetch(`/api/data/sample-files/${encodeURIComponent(input.sample)}`)
        if (!res.ok) throw new Error('样例表没取到，刷新一下再试')
        const text = await res.text()
        return api.post<DraftView>('/data/drafts', { file_name: input.sample, size: text.length, encoding: 'UTF-8', content: text })
      }
      const f = input.file!
      if (EXCEL.test(f.name)) throw new Error('这台工作台还读不了 Excel 文件：在 Excel 里点“另存为 → CSV UTF-8（逗号分隔）”，再把 .csv 拖进来')
      if (f.size > 3 * 1024 * 1024) throw new Error('文件太大了（超过 3 MB）：一次导一个月的日数据就够，先在平台上缩小日期范围')
      const { text, encoding } = await readFile(f)
      return api.post<DraftView>('/data/drafts', { file_name: f.name, size: f.size, encoding, content: text })
    },
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ['/data/drafts'] }); onDone(v.draft.id) },
    onError: (e) => toast.error(e.message, { duration: 8000 }),
  })
}

export function useDraft(id: string | null) {
  return useApi<DraftView>(id ? `/data/drafts/${id}` : null)
}

/** 改对照、渠道、日期格式、单位、缺列：写回草稿，页面直接用返回的新结果（不等整体刷新） */
export function usePatchDraft(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Choices & { reset?: boolean }) => api.patch<DraftView>(`/data/drafts/${id}`, patch),
    onSuccess: (v) => qc.setQueryData([`/data/drafts/${id}`], v),
    onError: (e) => toast.error(e.message),
  })
}

export function useCodex(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<DraftView>(`/data/drafts/${id}/codex`, {}),
    onSuccess: (v) => {
      qc.setQueryData([`/data/drafts/${id}`], v)
      if (v.codex?.ok) toast.success(`Codex 看完了（用了 ${v.codex.seconds} 秒）`, { description: '它怎么看写在每一列里，点了才算数' })
      else toast.error('Codex 这次没帮上', { description: v.codex?.reason, duration: 9000 })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useCommit(id: string) {
  return useWrite((b: { save_rule: boolean }) => api.post<ImportResult>(`/data/drafts/${id}/commit`, b), (r) => (r.all_same ? `核对了 ${r.rows} 行，都和工作台一样，没改数` : `导入了 ${r.rows} 行`))
}

export function useUndo() {
  return useWrite((batchId: string) => api.post<{ restored: number; removed: number; kept: number }>(`/data/batches/${batchId}/undo`, {}),
    (r) => `已撤销：恢复 ${r.restored} 行${r.removed ? `、删掉新增的 ${r.removed} 行` : ''}${r.kept ? `；${r.kept} 行后来又被改过，没动` : ''}`)
}

export function useDiscard(onDone: () => void) {
  return useWrite((id: string) => api.post(`/data/drafts/${id}/discard`, {}).then((x) => { onDone(); return x }), '已放弃这份文件')
}
