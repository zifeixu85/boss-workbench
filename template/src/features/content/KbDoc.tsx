// 在内容中心里就地读知识库原文（AI 手上有什么、参考了哪些文件、检查的词表从哪来）：?doc=<路径>，不离开当前页。归属：小红书内容模块。
import { useCallback } from 'react'
import { useSearchParams, Link } from 'react-router'
import { ExternalLink, FileText } from 'lucide-react'
import { useApi } from '@/lib/api'
import { Markdown } from '@/components/markdown'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { kbName } from './lib'

const SKILL = '.agents/skills/xhs-creator/SKILL.md'

export function useDocParam() {
  const [sp, setSp] = useSearchParams()
  const open = useCallback((path: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('doc', path); return n }), [setSp])
  const close = useCallback(() => setSp((p) => { const n = new URLSearchParams(p); n.delete('doc'); return n }), [setSp])
  return { path: sp.get('doc'), open, close }
}

/** 文件名小标签：点开读原文 */
export function DocChip({ path, label }: { path: string; label?: string }) {
  const doc = useDocParam()
  return (
    <button type="button" onClick={() => doc.open(path)} title={path}
      className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
      <FileText className="size-3 shrink-0" /><span className="truncate">{label ?? kbName(path)}</span>
    </button>
  )
}

export function KbDocDialog() {
  const doc = useDocParam()
  const path = doc.path
  const isSkill = path === SKILL
  const { data, isLoading, error } = useApi<{ path: string; body: string }>(path ? (isSkill ? '/content/skill' : `/kb/file?path=${encodeURIComponent(path)}`) : null)
  return (
    <Dialog open={!!path} onOpenChange={(o) => !o && doc.close()}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{path ? (isSkill ? '小红书写法（给 AI 的做事说明）' : kbName(path)) : ''}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            <span>{isSkill ? '写小红书时 AI 照着做的步骤和格式' : `知识库 · ${path?.split('/').slice(0, -1).map((x) => x.replace(/^\d+-/, '')).join(' / ') || '根目录'}`}</span>
            {!isSkill && path && <Button asChild size="xs" variant="ghost"><Link to={`/kb?path=${encodeURIComponent(path)}`}><ExternalLink />在知识库里打开</Link></Button>}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <div className="grid gap-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
        {error && <p className="text-sm text-danger">没读到这份文件：{(error as Error).message}</p>}
        {data && <Markdown source={data.body} basePath={isSkill ? undefined : data.path} />}
      </DialogContent>
    </Dialog>
  )
}
