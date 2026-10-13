// 日程：月 / 周 / 日 / 列表 四种视图；点日程开详情抽屉，点空白处新建；拖动改时间
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn'
import type { DatesSetArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction'
import { CalendarPlus, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List, Rows3 } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import type { CalEvent, Todo } from '@/lib/types'
import { toDateStr } from '@/lib/format'
import { now } from '@/lib/clock'
import { useOverlay } from '@/app/overlay'
import { PageHeader, PageBody } from '@/components/page'
import { EVENT_COLORS } from '@/components/status'
import { Button } from '@/components/ui/button'
import { ViewTabs } from '@/components/view-tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useIsMobile } from '@/hooks/use-mobile'
import { AgendaSide } from './AgendaSide'

const VIEWS = { month: 'dayGridMonth', week: 'timeGridWeek', day: 'timeGridDay', list: 'listMonth' } as const
type View = keyof typeof VIEWS
const VIEW_ITEMS = [
  { value: 'month' as const, label: '月', icon: CalendarDays }, { value: 'week' as const, label: '周', icon: CalendarRange },
  { value: 'day' as const, label: '日', icon: Rows3 }, { value: 'list' as const, label: '列表', icon: List },
]

const fmtLocal = (d: Date, allDay: boolean) => allDay ? toDateStr(d) : `${toDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** 08:30 这样的开始时间 */
const fmtHm = (d: Date | null) => (d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '')

export default function CalendarPage() {
  const ov = useOverlay()
  const mobile = useIsMobile()
  const [sp, setSp] = useSearchParams()
  const view = (sp.get('view') as View) || (mobile ? 'list' : 'month')
  const cal = useRef<FullCalendar>(null)
  const [range, setRange] = useState<{ from: string; to: string; title: string } | null>(null)
  const [showTodos, setShowTodos] = useState(false)
  const { data: events = [] } = useApi<CalEvent[]>(range ? `/events?from=${range.from}&to=${range.to}` : null)
  const { data: todos = [] } = useApi<Todo[]>('/todos?open=1')
  const move = useWrite((b: { id: string; start: string; end: string | null }) => api.patch(`/events/${b.id}`, { start: b.start, end: b.end }), '已改时间')
  const moveTodo = useWrite((b: { id: string; due: string }) => api.patch(`/todos/${b.id}`, { due: b.due }), (o) => `待办已改到 ${(o as { due: string }).due.slice(5).replace('-', '月')}日`)

  const items = useMemo<EventInput[]>(() => [
    ...events.map((e) => {
      const c = EVENT_COLORS[e.kind] ?? EVENT_COLORS['内部']
      return { id: e.id, title: e.client_name && !e.title.includes(e.client_name) ? `${e.title} · ${e.client_name}` : e.title, start: e.start, end: e.end ?? undefined, allDay: !!e.all_day, backgroundColor: c.bg, borderColor: c.border, textColor: c.text, extendedProps: { type: 'event' } }
    }),
    ...(showTodos ? todos.filter((t) => t.due).map((t) => ({
      id: `todo:${t.id}`, title: `☐ ${t.title}`, start: t.due!, allDay: true, startEditable: true, durationEditable: false,
      backgroundColor: 'transparent', borderColor: t.priority === '紧急' ? 'var(--danger)' : 'var(--border)', textColor: 'var(--muted-foreground)', extendedProps: { type: 'todo' },
    })) : []),
  ], [events, todos, showTodos])

  const setView = (v: View) => { setSp((p) => { const n = new URLSearchParams(p); n.set('view', v); return n }, { replace: true }); cal.current?.getApi().changeView(VIEWS[v]) }
  const onDates = (a: DatesSetArg) => setRange({ from: toDateStr(a.start), to: `${toDateStr(a.end)}T00:00`, title: a.view.title })
  const onClick = (a: EventClickArg) => { a.jsEvent.preventDefault(); const id = a.event.id; if (id.startsWith('todo:')) ov.openDetail('todo', id.slice(5)); else ov.openDetail('event', id) }
  const onDateClick = (a: DateClickArg) => ov.openNew('event', { date: a.allDay ? (view === 'month' ? `${a.dateStr}T10:00` : a.dateStr) : fmtLocal(a.date, false) })
  const onDrop = (a: EventDropArg | EventResizeDoneArg) => {
    const e = a.event
    if (!e.start) return
    if (e.id.startsWith('todo:')) { moveTodo.mutate({ id: e.id.slice(5), due: toDateStr(e.start) }, { onError: () => a.revert() }); return }
    move.mutate({ id: e.id, start: fmtLocal(e.start, e.allDay), end: e.end ? fmtLocal(e.end, e.allDay) : null }, { onError: () => a.revert() })
  }
  const api_ = () => cal.current?.getApi()

  return (
    <>
      <PageHeader eyebrow="今日" title="日程" desc="见客户、门店品鉴、送货、内部会和直播都在这里。点空白处新建，拖动可以改时间；勾选“显示待办”能看到每天到期的事。"
        actions={<Button onClick={() => ov.openNew('event')}><CalendarPlus />新建日程</Button>} />
      <PageBody>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 rounded-xl border bg-card p-3 shadow-paper sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" aria-label="上一段" onClick={() => api_()?.prev()}><ChevronLeft /></Button>
                <Button variant="outline" size="sm" onClick={() => api_()?.today()}>今天</Button>
                <Button variant="outline" size="icon-sm" aria-label="下一段" onClick={() => api_()?.next()}><ChevronRight /></Button>
              </div>
              <h2 className="num min-w-0 flex-1 font-heading text-lg font-semibold">{range?.title}</h2>
              <div className="flex items-center gap-2 text-sm"><Switch id="todos" checked={showTodos} onCheckedChange={setShowTodos} /><Label htmlFor="todos" className="font-normal text-muted-foreground">显示待办</Label></div>
              <ViewTabs value={view} onChange={setView} items={VIEW_ITEMS} label="日历视图" />
            </div>
            <div className="wb-cal">
              <FullCalendar
                ref={cal}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                locale={zhCnLocale}
                initialView={VIEWS[view]}
                headerToolbar={false}
                height="auto"
                firstDay={1}
                nowIndicator
                now={() => now()}
                editable
                dayMaxEvents={3}
                slotMinTime="07:00:00"
                slotMaxTime="22:00:00"
                allDayText="全天"
                noEventsText="这段时间没有安排"
                events={items}
                datesSet={onDates}
                eventClick={onClick}
                dateClick={onDateClick}
                eventDrop={onDrop}
                eventResize={onDrop}
                eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                dayCellContent={(a) => a.dayNumberText.replace('日', '')}
                eventDisplay="block"
                // 列表视图用自带的样子（有自己的时间列）；月、周、日视图都自己画：时间 + 标题。
                // 原来周、日视图返回 undefined，FullCalendar 6 会画成空白方块（集成时修）
                eventContent={(a) => {
                  if (a.view.type.startsWith('list')) return true
                  const grid = a.view.type.startsWith('timeGrid') && !a.event.allDay
                  const mins = a.event.start && a.event.end ? (a.event.end.getTime() - a.event.start.getTime()) / 60000 : 60
                  // 半小时以内的短安排：时间和标题挤一行，不溢出格子
                  if (grid && mins < 45) {
                    return <div className="flex h-full min-w-0 items-center gap-1 overflow-hidden px-1 text-[12px] leading-none"><span className="num shrink-0 opacity-75">{fmtHm(a.event.start)}</span><span className="truncate font-medium">{a.event.title}</span></div>
                  }
                  return (
                    <div className={`min-w-0 overflow-hidden px-1 py-0.5 leading-tight ${grid ? 'h-full' : ''}`}>
                      {!a.event.allDay && <div className="num text-[12px] opacity-75">{grid ? a.timeText : fmtHm(a.event.start)}</div>}
                      <div className={`text-[12px] font-medium break-all ${grid ? 'line-clamp-3' : 'line-clamp-2'}`}>{a.event.title}</div>
                    </div>
                  )
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {Object.entries(EVENT_COLORS).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-l-[3px]" style={{ background: c.bg, borderColor: c.border }} />{k}</span>)}
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border" />待办（到期日）</span>
            </div>
          </div>
          <AgendaSide />
        </div>
      </PageBody>
    </>
  )
}
