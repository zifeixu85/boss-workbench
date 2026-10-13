// 知识库目录树：文件夹可以折叠，顶上可以按名字筛选，当前打开的文件高亮
import { useMemo, useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen, Search, X } from 'lucide-react'
import type { KbNode } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ancestorsOf, countFiles, filterTree, displayName } from './kb-utils'

type TreeProps = { tree: KbNode[]; active: string | null; onOpen: (path: string) => void }

export function KbTree({ tree, active, onOpen }: TreeProps) {
  const [query, setQuery] = useState('')
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const shown = useMemo(() => filterTree(tree, query), [tree, query])
  const ancestors = useMemo(() => new Set(active ? ancestorsOf(active) : []), [active])
  const filtering = query.trim() !== ''

  const ctx: NodeCtx = {
    active,
    onOpen,
    isOpen: (n, depth) => filtering || (toggled[n.path] ?? (depth === 0 || ancestors.has(n.path))),
    setOpen: (path, open) => setToggled((t) => ({ ...t, [path]: open })),
  }

  return (
    <div className="min-w-0">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="按名字筛选，如 澜拓" aria-label="按名字筛选文件" className="pr-8 pl-8" />
        {filtering && (
          <Button variant="ghost" size="icon-xs" className="absolute top-1/2 right-1.5 -translate-y-1/2" aria-label="清空筛选" onClick={() => setQuery('')}><X /></Button>
        )}
      </div>
      <nav aria-label="知识库目录" className="mt-3">
        {shown.length ? <NodeList nodes={shown} depth={0} ctx={ctx} /> : <p className="px-2 py-4 text-[13px] text-muted-foreground">没有名字里带“{query.trim()}”的文件</p>}
      </nav>
    </div>
  )
}

type NodeCtx = {
  active: string | null
  onOpen: (path: string) => void
  isOpen: (n: KbNode, depth: number) => boolean
  setOpen: (path: string, open: boolean) => void
}

function NodeList({ nodes, depth, ctx }: { nodes: KbNode[]; depth: number; ctx: NodeCtx }) {
  return (
    <ul className={cn('grid gap-px', depth > 0 && 'ml-[15px] border-l pl-1.5')}>
      {nodes.map((n) => (
        <li key={n.path}>{n.type === 'dir' ? <DirNode n={n} depth={depth} ctx={ctx} /> : <FileNode n={n} ctx={ctx} />}</li>
      ))}
    </ul>
  )
}

const ROW = 'flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13.5px] outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'

function DirNode({ n, depth, ctx }: { n: KbNode; depth: number; ctx: NodeCtx }) {
  const open = ctx.isOpen(n, depth)
  const Icon = open ? FolderOpen : Folder
  return (
    <Collapsible open={open} onOpenChange={(o) => ctx.setOpen(n.path, o)}>
      <CollapsibleTrigger asChild>
        <button type="button" className={cn(ROW, depth === 0 && 'font-medium')}>
          <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
          <Icon className="size-4 shrink-0 text-primary/80" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          <span className="num shrink-0 text-[12px] text-muted-foreground">{countFiles(n)}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <NodeList nodes={n.children ?? []} depth={depth + 1} ctx={ctx} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function FileNode({ n, ctx }: { n: KbNode; ctx: NodeCtx }) {
  const active = ctx.active === n.path
  return (
    <button
      type="button"
      onClick={() => ctx.onOpen(n.path)}
      aria-current={active ? 'page' : undefined}
      className={cn(ROW, 'pl-7', active && 'bg-accent font-medium text-accent-foreground hover:bg-accent')}
    >
      <FileText className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={displayName(n)}>{displayName(n)}</span>
    </button>
  )
}
