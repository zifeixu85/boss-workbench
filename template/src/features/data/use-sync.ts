// “立即同步”：调接口，按结果弹不同的提示（导进来了 / 没有新文件 / 失败 / 要手动）。归属：数据源与导入模块
import { toast } from 'sonner'
import { api, useWrite } from '@/lib/api'

type SyncResult = { kind: '导入了' | '没有新文件' | '失败' | '要手动' | '检查了'; message: string }

export function useSync() {
  return useWrite((id: string) => api.post<SyncResult>(`/data/sources/${id}/sync`, {}).then((r) => {
    if (r.kind === '导入了' || r.kind === '检查了') toast.success(r.message)
    else if (r.kind === '失败') toast.error(r.message, { duration: 8000 })
    else toast(r.kind === '没有新文件' ? '没有新文件' : '现在同步不了', { description: r.message, duration: 9000 })
    return r
  }))
}
