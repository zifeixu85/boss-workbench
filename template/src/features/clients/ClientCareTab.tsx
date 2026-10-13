// 关怀页签：接下来的日子、送什么、怎么说的草稿（复制 / 标记已发 / 改一改，其余在“更多”）；没有草稿可以让 Codex 现场写一版。归属：大客户模块
import { Cake, Gift } from 'lucide-react'
import { relDay, shortDate } from '@/lib/format'
import { EmptyNote } from '@/components/chart-kit'
import { StatusBadge } from '@/components/status'
import type { ClientProfile } from '@/features/crm/types'
import { CareDraftCard, CodexDraftButton } from '@/features/crm/CareDraft'
import { useIdentity } from '@/lib/identity'

export function ClientCareTab({ d }: { d: ClientProfile }) {
  const { owner } = useIdentity()
  const c = d.client
  const soon = d.dates.filter((x) => x.days_left <= 120)
  const open = d.care.filter((x) => ['建议', '已安排'].includes(x.status))
  const past = d.care.filter((x) => !['建议', '已安排'].includes(x.status))
  const next = soon[0]
  return (
    <div className="grid gap-5">
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">接下来的日子</h3>
        {soon.length ? (
          <div className="flex flex-wrap gap-2">
            {soon.map((x) => (
              <span key={x.id} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[13px]">
                <Cake className="size-4 text-primary" /><span className="num font-medium whitespace-nowrap">{shortDate(x.next)}</span>{x.label}<span className="text-xs whitespace-nowrap text-muted-foreground">{x.days_left === 0 ? '今天' : `${x.days_left} 天后`}</span>
              </span>
            ))}
          </div>
        ) : <p className="text-[13px] text-muted-foreground">4 个月内没有记下的生日和重要日子。{d.dates.length ? `最近的是 ${d.dates[0].label}（${shortDate(d.dates[0].next)}）。` : '对方自己说了再记，不去查。'}</p>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-muted-foreground">送什么、怎么说</h3>
          <CodexDraftButton clientId={c.id} occasion={next ? next.label : open.length ? '问候一声' : '好久没联系，问候一声'} date={next?.next ?? null} />
        </div>
        {open.length ? <div className="grid gap-3">{open.map((x) => <CareDraftCard key={x.id} care={x} clientName={c.name} kbPath={d.kb_note.path} />)}</div>
          : <EmptyNote>还没有关怀草稿。点右上角“让 Codex 写一版”，它会读这位客户的档案和《大客户关怀》的做法来写；也可以去“关怀与回访”页看这个月该关心谁。</EmptyNote>}
        <p className="mt-2 text-[12px] text-muted-foreground">话都是草稿，{owner}自己改、自己发；送什么、怎么说照知识库《大客户关怀》的规矩，送礼的消息里不提单子。</p>
      </section>

      {past.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">做过的</h3>
          <ul className="divide-y rounded-lg border bg-card">
            {past.map((x) => (
              <li key={x.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                <Gift className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{x.occasion}{x.gift && <span className="text-muted-foreground"> · {x.gift}</span>}</span>
                <StatusBadge value={x.status === '已送出' ? '已发出' : x.status} tone={x.status === '已送出' ? 'ok' : 'neutral'} />
                <span className="num shrink-0 text-xs text-muted-foreground">{x.date ? relDay(x.date) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
