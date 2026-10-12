// 老板早上最想看的第 2 件：今天该跟进哪几家大客户、为什么（数据来自大客户模块 focus()）
import { MessageSquarePlus } from 'lucide-react'
import type { FocusClient } from '@/lib/types'
import { daysFromToday, relDay, yuan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { GoLink } from './parts'

function When({ date }: { date: string | null }) {
  if (!date) return null
  const n = daysFromToday(date)
  return <StatusBadge value={n < 0 ? `过了 ${-n} 天` : relDay(date)} tone={n < 0 ? 'danger' : n <= 1 ? 'warn' : 'neutral'} />
}

export function KeyClients({ items }: { items: FocusClient[] }) {
  const ov = useOverlay()
  const shown = items.slice(0, 5)
  return (
    <Panel title="今天该跟进的大客户" desc="答应的事快到期、约好的日子到了、钱快到期" action={<GoLink to="/clients">客户</GoLink>} bodyClass="p-2">
      {shown.map((c) => (
        <div key={c.id} className="flex items-start gap-2 rounded-lg px-3 py-2.5 hover:bg-muted/60">
          <button className="min-w-0 flex-1 text-left" onClick={() => ov.openDetail('client', c.id)}>
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-medium">{c.name}</span>
              <span className="truncate text-xs text-muted-foreground">{[c.contact, c.contact_title].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug">{c.reasons[0]}</span>
            {c.next_step && <span className="mt-0.5 block truncate text-xs text-muted-foreground">下一步：{c.next_step}</span>}
            {c.total_spent > 0 && <span className="mt-0.5 block text-[11.5px] text-muted-foreground">累计消费 {yuan(c.total_spent)}</span>}
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <When date={c.next_follow} />
            <Button size="icon-sm" variant="ghost" aria-label={`给${c.name}记一笔跟进`} onClick={() => ov.openNew('log', { for: c.id })}><MessageSquarePlus /></Button>
          </div>
        </div>
      ))}
      {!shown.length && <EmptyNote>今天没有到日子的大客户。可以翻翻“待复购”的老客户。</EmptyNote>}
      {items.length > shown.length && <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">还有 {items.length - shown.length} 位快到日子：{items.slice(shown.length).map((c) => c.name).join('、')}</p>}
    </Panel>
  )
}
