// 最近几天的经营早报：一天一份，左边日期，中间是那天的要点（哪里不对劲），右边几处异常；点开右侧抽屉看全文。
import { Bot } from 'lucide-react'
import { Panel } from '@/components/page'
import { EmptyNote } from '@/components/chart-kit'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/api'
import { md, weekday } from '@/lib/format'
import { reportPoints } from '../fmt'
import { useBizOverlay } from '../state'
import type { Report } from '../types'

export function ReportHistory() {
  const ov = useBizOverlay()
  const { data, isLoading } = useApi<Report[]>('/biz/reports?limit=7')
  return (
    <Panel title="最近的经营早报" desc="Codex 定时任务每天 07:55 写一份；网页只读" bodyClass="p-0">
      {isLoading ? <div className="grid gap-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : !data?.length ? <div className="p-5"><EmptyNote>还没有早报。</EmptyNote></div> : (
        <ul className="divide-y">
          {data.map((r) => {
            const p = reportPoints(r)
            return (
              <li key={r.id}>
                <button type="button" onClick={() => ov.openReport(r.id)} className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-2.5 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                  <span className="grid text-center leading-tight">
                    <span className="num text-[15px] font-semibold">{md(r.date)}</span>
                    <span className="text-[11px] text-muted-foreground">{weekday(r.date)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[13px] leading-snug">{p.text}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground"><Bot className="size-3" aria-hidden />{r.author} {md(r.written_at)} {r.written_at.slice(11, 16)}</span>
                  </span>
                  <span className="pt-0.5 text-[11.5px] whitespace-nowrap">
                    {p.n > 0 ? <span className="font-medium text-danger">{p.n} 处异常</span> : p.watch ? <span className="text-warn">先盯着 {p.watch}</span> : <span className="text-muted-foreground">没有异常</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
