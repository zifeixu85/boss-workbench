// 收件箱：想到什么先记下，之后一条条转成待办、跟进或日程
import { Inbox, Sparkles } from 'lucide-react'
import type { InboxItem } from '@/lib/types'
import { useApi } from '@/lib/api'
import { PageBody, PageHeader } from '@/components/page'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { DoneList, InboxCard, QuickAdd } from './InboxItems'

const newestFirst = (a: string, b: string) => b.localeCompare(a)

export default function InboxPage() {
  const { data, isLoading, error } = useApi<InboxItem[]>('/inbox')
  const open = (data ?? []).filter((i) => !i.done_at).sort((a, b) => newestFirst(a.created_at, b.created_at))
  const done = (data ?? []).filter((i) => i.done_at).sort((a, b) => newestFirst(a.done_at ?? '', b.done_at ?? ''))

  return (
    <>
      <PageHeader eyebrow="今日" title="收件箱" desc="想到什么先记下来，不用想放哪。有空再一条条转成待办、跟进或日程。" />
      <PageBody className="max-w-3xl">
        <QuickAdd />

        <section aria-labelledby="inbox-open" className="mt-7">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="inbox-open" className="text-[15px] font-semibold">
              待整理{data && <span className="num ml-1.5 text-sm font-normal text-muted-foreground">{open.length} 条</span>}
            </h2>
          </div>
          {isLoading ? (
            <div className="grid gap-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
          ) : error ? (
            <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">收件箱没取到：{error.message}</p>
          ) : open.length ? (
            <div className="grid gap-3">{open.map((i) => <InboxCard key={i.id} item={i} />)}</div>
          ) : (
            <Empty className="border bg-card py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>收件箱清空了</EmptyTitle>
                <EmptyDescription>有想法随时在上面写，或者在任何页面按 N 随手记。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>

        <p className="mt-5 flex items-start gap-2 rounded-lg bg-accent/50 px-3.5 py-2.5 text-[13px] text-accent-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>也可以对 Codex 说“整理收件箱”：它会逐条拆出下一步、待办（谁做、哪天前）和要你定的事，问清后列一张清单，你确认了再写。</span>
        </p>

        <DoneList items={done} />
      </PageBody>
    </>
  )
}
