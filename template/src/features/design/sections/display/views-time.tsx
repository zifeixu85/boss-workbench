// 清单、时间线、日历三种展示
import { useMemo, useState } from 'react'
import { zhCN } from 'react-day-picker/locale'
import { fullDate, relDay, shortDate, toDateStr, todayStr, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/status'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { CLIENTS, LOGS, TASKS, type SampleTask } from './data'

export function ChecklistView() {
  const [tasks, setTasks] = useState<SampleTask[]>(TASKS)
  const toggle = (id: string) => setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  const t0 = todayStr()
  return (
    <ul className="overflow-hidden rounded-xl border bg-card shadow-paper">
      {tasks.map((t) => {
        const late = !t.done && t.due < t0
        return (
          <li key={t.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-muted/50">
            <Checkbox id={`demo-${t.id}`} checked={t.done} onCheckedChange={() => toggle(t.id)} />
            <label htmlFor={`demo-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className={cn('block truncate text-sm', t.done && 'text-muted-foreground line-through')}>{t.title}</span>
              <span className="block text-xs text-muted-foreground">{t.who}</span>
            </label>
            {t.priority !== '普通' && <StatusBadge value={t.priority} />}
            <span className={cn('num w-14 shrink-0 text-right text-xs', late ? 'font-medium text-danger' : 'text-muted-foreground')}>{relDay(t.due)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function TimelineView() {
  const days = useMemo(() => {
    const map = new Map<string, typeof LOGS>()
    for (const l of LOGS) map.set(l.date, [...(map.get(l.date) ?? []), l])
    return [...map.entries()]
  }, [])
  return (
    <ol className="grid gap-4">
      {days.map(([date, logs]) => (
        <li key={date}>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{relDay(date)} · {shortDate(date)} {weekday(date)}</div>
          <ol className="ml-1.5 grid gap-3 border-l pl-4">
            {logs.map((l) => (
              <li key={l.id} className="relative">
                <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
                <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-medium">{l.who}</span>
                  <span className="text-xs text-muted-foreground">{l.channel} · <span className="num">{l.time}</span></span>
                </div>
                <p className="text-[13px] leading-relaxed">{l.summary}</p>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

export function MonthView() {
  const [day, setDay] = useState(todayStr())
  const byDay = useMemo(() => {
    const map = new Map<string, typeof CLIENTS>()
    for (const c of CLIENTS) map.set(c.next, [...(map.get(c.next) ?? []), c])
    return map
  }, [])
  const list = byDay.get(day) ?? []
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
      <Calendar
        mode="single" locale={zhCN} weekStartsOn={1} required
        selected={new Date(`${day}T00:00:00`)} onSelect={(d) => d && setDay(toDateStr(d))}
        className="mx-auto rounded-lg border bg-card"
        modifiers={{ busy: (d) => byDay.has(toDateStr(d)) }}
        modifiersClassNames={{ busy: 'relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary' }}
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{fullDate(day)}</div>
        {list.length ? (
          <ul className="mt-2 grid gap-1.5">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[13px]">
                <span className="font-medium">跟进{c.name}</span><span className="truncate text-xs text-muted-foreground">{c.label}</span>
                <StatusBadge value={c.stage} className="ml-auto" />
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[13px] text-muted-foreground">这天没有要跟进的客户。有圆点的日子才有安排。</p>}
      </div>
    </div>
  )
}
