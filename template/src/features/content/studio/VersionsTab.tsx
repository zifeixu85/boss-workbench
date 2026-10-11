// 版本页签：每一版谁写的、怎么来的（AI 写稿 / 手动修改 / 采用候选 / 恢复 / 导入）；可以看、可以恢复（恢复也是另存一版，不覆盖）。归属：小红书内容模块。
import { useState } from 'react'
import { Eye, RotateCcw } from 'lucide-react'
import { useApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useRestore } from '../api'
import { mdhm } from '../lib'
import { ExampleTag } from '../badges'
import { PhonePreview } from '../phone/PhonePreview'
import type { Draft, VersionMeta } from '../types'

const ORIGIN: Record<string, string> = {
  'AI 写稿': 'bg-accent text-accent-foreground', 手动修改: 'bg-info-soft text-info', 采用候选: 'bg-warn-soft text-warn', 恢复: 'bg-muted text-muted-foreground', 导入: 'bg-muted text-muted-foreground',
}

function View({ id, v, onClose }: { id: string; v: number; onClose: () => void }) {
  const { data } = useApi<{ version: number; data: Draft; origin: string; author: string; created_at: string } | null>(`/content/pieces/${id}/versions/${v}`)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">v{v} · {data?.data.title}</DialogTitle>
          <DialogDescription>{data ? `${data.origin} · ${data.author} · ${mdhm(data.created_at)}（只读）` : '读取中…'}</DialogDescription>
        </DialogHeader>
        {data && (
          <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
            <PhonePreview draft={data.data} view="笔记页" />
            <div className="min-w-0 text-sm">
              <div className="text-xs text-muted-foreground">封面大字</div><div className="mb-3">{data.data.cover_text}</div>
              <div className="text-xs text-muted-foreground">正文</div><p className="mb-3 leading-7 whitespace-pre-wrap">{data.data.body}</p>
              <div className="text-xs text-muted-foreground">话题</div><div className="text-info">{data.data.tags.map((t) => `#${t}`).join(' ')}</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function VersionsTab({ id, versions, current, dirty, readOnly, onRestored }: { id: string; versions: VersionMeta[]; current: number; dirty: boolean; readOnly?: boolean; onRestored: () => void }) {
  const [view, setView] = useState<number | null>(null)
  const restore = useRestore()
  if (!versions.length) return <p className="px-5 py-12 text-center text-sm text-muted-foreground">还没有版本。Codex 写好第一版、或者你手动保存以后，每一版都会留在这里。</p>
  return (
    <div className="px-5 py-5">
      <p className="mb-3 text-xs text-muted-foreground">版本只增不改：恢复旧的一版，会另存成新的一版；当前是 v{current}{dirty ? '，你手上还有没保存的修改' : ''}。</p>
      <ol className="relative grid grid-cols-1 gap-2 before:absolute before:top-3 before:bottom-3 before:left-[19px] before:w-px before:bg-border">
        {versions.map((v) => (
          <li key={v.id} className={cn('relative flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2.5', v.version === current && 'border-primary/50 bg-accent/30')}>
            <span className={cn('num relative z-10 grid h-7 min-w-9 place-items-center rounded-md px-1.5 text-xs font-semibold', ORIGIN[v.origin] ?? 'bg-muted')}>v{v.version}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]"><span className="font-medium">{v.origin}</span><span className="text-muted-foreground">{v.author}</span>{v.example && <ExampleTag text={v.origin === 'AI 写稿' ? 'Codex · 示例（预先写好）' : '示例 · 预先写好'} />}{v.version === current && <span className="text-xs text-primary">当前</span>}</div>
              <div className="truncate text-xs text-muted-foreground">{v.note ? `${v.note} · ` : ''}{v.title} · 正文 {v.body_len} 字</div>
            </div>
            <span className="num shrink-0 text-xs text-muted-foreground">{mdhm(v.created_at)}</span>
            <Button size="xs" variant="ghost" onClick={() => setView(v.version)}><Eye />看</Button>
            {v.version !== current && !readOnly && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="xs" variant="outline"><RotateCcw />恢复</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>恢复到 v{v.version}？</AlertDialogTitle><AlertDialogDescription>会把 v{v.version} 另存成新的 v{current + 1}，现在的 v{current} 还留着。{dirty ? '你手上没保存的修改会丢掉。' : ''}</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => restore.mutate({ id, version: v.version }, { onSuccess: onRestored })}>恢复</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </li>
        ))}
      </ol>
      {view != null && <View id={id} v={view} onClose={() => setView(null)} />}
    </div>
  )
}
