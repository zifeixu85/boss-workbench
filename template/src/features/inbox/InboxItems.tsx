// 收件箱的零件：快速记一条、一条待整理的随手记、已处理的列表
import { useState } from 'react'
import { CalendarPlus, Check, ChevronRight, ListPlus, MessageSquarePlus, type LucideIcon } from 'lucide-react'
import type { InboxItem } from '@/lib/types'
import { api, useWrite } from '@/lib/api'
import { ago } from '@/lib/format'
import { useOverlay, type NewKind } from '@/app/overlay'
import { StatusBadge } from '@/components/status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const MAX_TEXT = 2000

export function QuickAdd() {
  const [text, setText] = useState('')
  const add = useWrite((t: string) => api.post('/inbox', { text: t }), '记下了')
  const submit = () => {
    const t = text.trim()
    if (!t || add.isPending) return
    add.mutate(t, { onSuccess: () => setText('') })
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="rounded-xl border bg-card p-2 shadow-paper transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
        rows={3}
        maxLength={MAX_TEXT}
        aria-label="随手记内容"
        placeholder="想到什么写什么，比如：宋姐问停业那几天会员卡要不要顺延"
        className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-end gap-2 px-1.5 pt-1">
        <span className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><Kbd>⌘</Kbd>+<Kbd>回车</Kbd><span className="ml-0.5">快速记下</span></span>
        <Button type="submit" disabled={!text.trim() || add.isPending}>{add.isPending ? '记录中…' : '记下'}</Button>
      </div>
    </form>
  )
}

type Convert = { kind: NewKind; result: string; label: string; icon: LucideIcon }
const CONVERTS: Convert[] = [
  { kind: 'todo', result: '转成待办', label: '转成待办', icon: ListPlus },
  { kind: 'log', result: '记成跟进', label: '记成跟进', icon: MessageSquarePlus },
  { kind: 'event', result: '放进日程', label: '放进日程', icon: CalendarPlus },
]

export function InboxCard({ item }: { item: InboxItem }) {
  const ov = useOverlay()
  const mark = useWrite(
    async ({ result }: { result: string }) => {
      await api.post(`/inbox/${encodeURIComponent(item.id)}/done`, { result })
      return { result }
    },
    (o) => (o.result === '已处理' ? '已处理' : '已移出收件箱，内容已填进弹窗'),
  )
  const convert = (c: Convert) => {
    ov.openNew(c.kind, { text: item.text })
    mark.mutate({ result: c.result })
  }
  return (
    <article className="rounded-xl border bg-card px-4 py-3.5 shadow-paper">
      <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap">{item.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString('zh-CN', { hour12: false })}>{ago(item.created_at)}</time>
        <Badge variant="outline" className="font-normal text-muted-foreground">来自{item.source}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
        {CONVERTS.map((c) => (
          <Button key={c.kind} size="sm" variant="outline" disabled={mark.isPending} onClick={() => convert(c)}><c.icon />{c.label}</Button>
        ))}
        <Button size="sm" variant="ghost" disabled={mark.isPending} onClick={() => mark.mutate({ result: '已处理' })} className="sm:ml-auto"><Check />已处理</Button>
      </div>
    </article>
  )
}

export function DoneList({ items }: { items: InboxItem[] }) {
  if (!items.length) return null
  return (
    <Collapsible className="mt-8">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <ChevronRight className="transition-transform group-data-[state=open]/button:rotate-90" />已处理 {items.length} 条
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 divide-y rounded-xl border bg-card">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1 break-words text-muted-foreground">{i.text}</span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusBadge value={i.result ?? '已处理'} tone={!i.result || i.result === '已处理' ? 'neutral' : 'primary'} />
                {i.done_at && <span className="text-xs text-muted-foreground">{ago(i.done_at)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
