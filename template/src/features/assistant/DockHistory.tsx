// 对话栏的历史（2026-11-26 照 A梦 自用工作台）：按今天 / 昨天 / 这 7 天 / 更早分组；能搜标题和最后一句、改名、归档和找回。
// 头部左边是“回到对话”。
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, ArrowLeft, Loader2, Pencil, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { ago } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DockHeader, Tip } from './DockFrame'
import { groupByDay } from './dock-layout'

export type Thread = { id: string; title: string; archived: boolean; created_at: string; updated_at: string; last: string; running: boolean; codex: boolean }

export function HistoryView({ onPick, onBack }: { onPick: (t: Thread) => void; onBack: () => void }) {
  const [archived, setArchived] = useState(false)
  const [query, setQuery] = useState('')
  const list = useQuery<Thread[]>({ queryKey: ['assistant-threads', archived], queryFn: () => api.get<Thread[]>(`/assistant/threads${archived ? '?archived=1' : ''}`) })
  const rows = useMemo(() => { const q = query.trim(); return (list.data ?? []).filter((t) => !q || t.title.includes(q) || t.last.includes(q)) }, [list.data, query])
  const groups = useMemo(() => (query.trim() ? [{ label: '', items: rows }] : groupByDay(rows)), [rows, query])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DockHeader title="历史对话" left={<Tip label="回到对话"><Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="回到对话"><ArrowLeft /></Button></Tip>} />
      <div className="grid gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label="范围">
          <Seg on={!archived} onClick={() => setArchived(false)}>全部</Seg>
          <Seg on={archived} onClick={() => setArchived(true)} className="ml-auto"><Archive className="size-3" />已归档</Seg>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜标题和最后一句" aria-label="搜对话" className="h-8 pl-8 text-[13px]" />
        </label>
      </div>
      {list.isLoading ? <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />读历史…</p>
        : !rows.length ? <p className="p-6 text-center text-sm text-muted-foreground">{query ? '没找到。' : archived ? '没有归档的对话。' : '还没有对话。'}</p>
          : (
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {groups.map((g) => (
                <section key={g.label || 'all'} aria-label={g.label || '搜到的对话'}>
                  {g.label && <h3 className="sticky top-0 z-[1] bg-card/95 px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground backdrop-blur">{g.label}</h3>}
                  <ul className="m-0 list-none p-0">{g.items.map((t) => <HistoryRow key={t.id} t={t} onPick={onPick} />)}</ul>
                </section>
              ))}
            </div>
          )}
    </div>
  )
}

function Seg({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs', on ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted', className)}>{children}</button>
}

function HistoryRow({ t, onPick }: { t: Thread; onPick: (t: Thread) => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(t.title)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['assistant-threads'] })
  const save = async () => {
    const title = name.trim()
    setEditing(false)
    if (!title || title === t.title) { setName(t.title); return }
    try { await api.patch(`/assistant/threads/${t.id}`, { title }); refresh() } catch (e) { setName(t.title); toast.error((e as Error).message) }
  }
  const archive = async (archived: boolean) => {
    try { await api.patch(`/assistant/threads/${t.id}`, { archived }); refresh(); toast.success(archived ? '已归档，在“已归档”里能找回' : '已找回') } catch (e) { toast.error((e as Error).message) }
  }
  const open = async () => { if (t.archived) await archive(false); onPick({ ...t, archived: false }) }
  return (
    <li className="group mx-1.5 flex items-start gap-1 rounded-lg px-1.5 py-2 hover:bg-muted/60">
      {editing ? (
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} aria-label="新的对话名" maxLength={60}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save() }
            if (e.key === 'Escape') { e.preventDefault(); setName(t.title); setEditing(false) }
          }} className="h-8 flex-1 text-[13px]" />
      ) : (
        <button className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40" onClick={() => void open()}>
          <div className="flex items-center gap-2"><span className="truncate text-[13.5px] font-medium">{t.title}</span>{t.running && <Loader2 className="size-3 shrink-0 animate-spin text-primary" aria-label="正在回答" />}<span className="ml-auto shrink-0 text-xs text-muted-foreground">{ago(t.updated_at)}</span></div>
          {t.last && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.last}</p>}
        </button>
      )}
      {!editing && (
        <div className="flex shrink-0 opacity-60 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <Button variant="ghost" size="icon-xs" aria-label={`改名：${t.title}`} onClick={() => setEditing(true)}><Pencil /></Button>
          {t.archived
            ? <Button variant="ghost" size="icon-xs" aria-label={`找回：${t.title}`} onClick={() => void archive(false)}><ArchiveRestore /></Button>
            : <Button variant="ghost" size="icon-xs" aria-label={`归档：${t.title}`} disabled={t.running} onClick={() => void archive(true)}><Archive /></Button>}
        </div>
      )}
    </li>
  )
}
