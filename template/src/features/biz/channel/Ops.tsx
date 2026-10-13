// 渠道页：这段时间做了什么（运营记录，通栏的时间线，找异常原因时对着看）、数据是哪几次导进来的（导入记录，来自数据源与导入）。
import { Panel } from '@/components/page'
import { EmptyNote } from '@/components/chart-kit'
import { md, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge } from '../parts'
import { hhmm } from '../fmt'
import type { ChannelData } from '../types'

export function OpsPanel({ d }: { d: ChannelData }) {
  return (
    <Panel title="这段时间做了什么" desc={`近 ${d.days} 天的运营记录：改价、改出价、发货、活动……找异常原因时对着看（大家手动记的）`} bodyClass="p-0">
      {d.ops.length ? (
        <ol className="divide-y">
          {d.ops.map((o) => (
            <li key={o.id} className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-5 py-2.5 text-[13px] sm:grid-cols-[110px_120px_minmax(0,1fr)]">
              <span className="num text-xs whitespace-nowrap text-muted-foreground sm:text-[13px]">{md(o.at)} {weekday(o.at)} <span className="max-sm:block">{o.at.slice(11, 16)}</span></span>
              <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground max-sm:col-start-2 max-sm:row-start-1">
                {o.who}<span className="rounded bg-muted px-1 text-[12px]">{o.kind}</span>{!o.channel_id && <span className="text-[12px]">全店</span>}
              </span>
              <span className="leading-relaxed max-sm:col-start-2">{o.action}</span>
            </li>
          ))}
        </ol>
      ) : <div className="p-5"><EmptyNote>这段时间没有记运营动作。</EmptyNote></div>}
    </Panel>
  )
}

export function RunsPanel({ d }: { d: ChannelData }) {
  return (
    <Panel title="数据是哪几次导进来的" desc={`近 7 天 ${d.runs.length} 次；哪天没到，那天的数就是“暂无”，不算成 0`} bodyClass="p-0">
      {d.runs.length ? (
        <ul className="divide-y">
          {d.runs.map((r) => {
            const ok = r.status === '成功'
            const who = r.actor.includes('定时') || r.actor.includes('Codex') ? '自动' : r.actor
            return (
              <li key={r.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-2.5 text-[13px]', !ok && 'bg-warn-soft/30')}>
                <span className="min-w-0">
                  <span className="num">{md(r.started_at)} {hhmm(r.started_at)}</span>
                  <span className="text-muted-foreground"> {who}导进来 </span>
                  <span className="num">{r.rows_ok ?? 0} 行</span>
                  <span className="text-xs text-muted-foreground"> · {md(r.data_date)} 的数</span>
                  {!ok && r.message && <span className="mt-0.5 block text-xs text-warn">{r.message}</span>}
                </span>
                {!ok && <BizBadge value={r.status} />}
              </li>
            )
          })}
        </ul>
      ) : <div className="p-5"><EmptyNote>没有导入记录。到“数据 ▸ 导入”看看。</EmptyNote></div>}
    </Panel>
  )
}
