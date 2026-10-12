// 日程页右栏：小月历（有安排的日子带点）+ 选中那天的安排
import { useState } from 'react'
import { zhCN } from 'react-day-picker/locale'
import { useApi } from '@/lib/api'
import type { CalEvent } from '@/lib/types'
import { addDays, fullDate, timeOf, toDateStr, todayStr } from '@/lib/format'
import { now } from '@/lib/clock'
import { useOverlay } from '@/app/overlay'
import { Calendar } from '@/components/ui/calendar'
import { EVENT_COLORS } from '@/components/status'
import { Panel } from '@/components/page'

export function AgendaSide() {
  const ov = useOverlay()
  const [day, setDay] = useState(todayStr())
  const [month, setMonth] = useState(now())
  const from = toDateStr(new Date(month.getFullYear(), month.getMonth(), 1))
  const to = `${toDateStr(new Date(month.getFullYear(), month.getMonth() + 1, 1))}T00:00`
  const { data: monthEvents = [] } = useApi<CalEvent[]>(`/events?from=${addDays(from, -7)}&to=${to}`)
  const busy = new Set(monthEvents.map((e) => e.start.slice(0, 10)))
  // 全天日程的 end 是“结束后的那一天”（end 写 5/13 = 实际到 5/12），所以那天不算（底座审查 #5）
  const list = monthEvents.filter((e) => e.start.slice(0, 10) <= day && (e.all_day && e.end ? e.end.slice(0, 10) > day : (e.end ?? e.start).slice(0, 10) >= day))
  return (
    <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <div className="rounded-xl border bg-card p-2 shadow-paper">
        <Calendar mode="single" locale={zhCN} weekStartsOn={1} today={now()} selected={new Date(`${day}T00:00:00`)} onSelect={(d) => d && setDay(toDateStr(d))}
          month={month} onMonthChange={setMonth} className="mx-auto"
          modifiers={{ busy: (d) => busy.has(toDateStr(d)) }}
          modifiersClassNames={{ busy: 'relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary' }} />
      </div>
      <Panel title={fullDate(day)} desc={list.length ? `${list.length} 个安排` : '这天没有安排'} bodyClass="p-2">
        {list.map((e) => {
          const c = EVENT_COLORS[e.kind] ?? EVENT_COLORS['内部']
          return (
            <button key={e.id} onClick={() => ov.openDetail('event', e.id)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted">
              <span className="num w-11 shrink-0 pt-0.5 text-xs text-muted-foreground">{e.all_day ? '全天' : timeOf(e.start)}</span>
              <span className="mt-1 h-8 w-[3px] shrink-0 rounded-full" style={{ background: c.border }} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{e.title}</span><span className="block truncate text-xs text-muted-foreground">{[e.kind, e.client_name, e.location].filter(Boolean).join(' · ')}</span></span>
            </button>
          )
        })}
        <button onClick={() => ov.openNew('event', { date: `${day}T10:00` })} className="mt-1 w-full rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary">+ 在这天加日程</button>
      </Panel>
    </div>
  )
}
