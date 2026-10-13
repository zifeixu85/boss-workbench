// 内容日历：月 / 周（?cal=week）；已发布的弱化成浅灰，还没发的按状态上色、加粗；拖动改发布日（过去的日子不行），右边“待排期”能拖进来。
// 停业那几天斜线底 + “停业”小字，新品上线那天角标；手机宽度改成按天列出。归属：小红书内容模块。
import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { Draggable, type EventReceiveArg } from '@fullcalendar/interaction'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn'
import type { DatesSetArg, DayCellContentArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/api'
import { md, toDateStr, todayStr } from '@/lib/format'
import { now } from '@/lib/clock'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePatchPiece } from '../api'
import { useParam, usePieceParam } from '../lib'
import { StatusTag } from '../badges'
import { CoverArt } from '../phone/Cover'
import { inRange, useStoreClosed } from '../dialogs'
import { AgendaView } from './AgendaView'
import type { Piece, PieceStatus, Rules } from '../types'
import './calendar.css'

/** 已发布：浅灰底、正文色（过去的事弱化）；还没发的按状态上色 */
export const COLORS: Record<PieceStatus, { bg: string; border: string; text: string }> = {
  已发布: { bg: 'var(--surface-2)', border: 'var(--border)', text: 'var(--muted-foreground)' },
  待发布: { bg: 'var(--warn-soft)', border: 'var(--warn)', text: 'var(--foreground)' },
  写稿中: { bg: 'var(--info-soft)', border: 'var(--info)', text: 'var(--foreground)' },
  已选: { bg: 'var(--card)', border: 'var(--muted-foreground)', text: 'var(--foreground)' },
  灵感池: { bg: 'var(--card)', border: 'var(--border)', text: 'var(--muted-foreground)' },
  已放弃: { bg: 'var(--muted)', border: 'var(--border)', text: 'var(--muted-foreground)' },
}
const VIEWS = { month: 'dayGridMonth', week: 'dayGridWeek' } as const

/** 新品上线日：从发布前检查的词表里拿（商品清单“待上线”那一行），不写死 */
export function useLaunchDay() {
  const { data } = useApi<Rules>('/content/check-rules')
  return data?.rules.find((r) => r.category === '新品上线日')?.until ?? null
}

export function CalendarView({ pieces }: { pieces: Piece[] }) {
  const mobile = useIsMobile()
  return mobile ? <AgendaView pieces={pieces} /> : <MonthWeek pieces={pieces} />
}

function MonthWeek({ pieces }: { pieces: Piece[] }) {
  const sheet = usePieceParam()
  const patch = usePatchPiece()
  const cal = useRef<FullCalendar>(null)
  const side = useRef<HTMLDivElement>(null)
  const [view, setView] = useParam<keyof typeof VIEWS>('cal', 'month')
  const [title, setTitle] = useState('')
  const launch = useLaunchDay()
  const shut = useStoreClosed()
  const inClosed = (d: string) => inRange(shut, d)
  const unscheduled = pieces.filter((p) => ['已选', '写稿中'].includes(p.status) && !p.scheduled_date)
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces])

  const events = useMemo<EventInput[]>(() => pieces.filter((p) => p.status !== '已放弃' && p.status !== '灵感池' && (p.status === '已发布' ? p.published_at : p.scheduled_date)).map((p) => {
    const c = COLORS[p.status]
    const pub = p.status === '已发布'
    return {
      id: p.id, title: p.draft?.title || p.title, start: pub ? p.published_at!.slice(0, 10) : p.scheduled_date!, allDay: true, editable: !pub,
      backgroundColor: c.bg, borderColor: c.border, textColor: c.text, classNames: [pub ? 'xhs-ev-past' : 'xhs-ev-next'],
      extendedProps: { status: p.status, time: pub ? p.published_at!.slice(11, 16) : p.scheduled_time },
    }
  }), [pieces])

  // 右边“待排期”的卡片可以拖进日历
  useEffect(() => {
    if (!side.current) return
    const d = new Draggable(side.current, { itemSelector: '[data-piece]', eventData: (el) => ({ id: el.getAttribute('data-piece')!, title: el.getAttribute('data-title') ?? '', allDay: true, create: true }) })
    return () => d.destroy()
  }, [])
  useEffect(() => { cal.current?.getApi().changeView(VIEWS[view]) }, [view])

  /** 拖到哪天：过去的日子不行；品茶会、门店活动排进停业期提醒一句 */
  const guard = (id: string, date: string) => {
    if (date < todayStr()) { toast.error('这天已经过了，排到今天以后'); return false }
    const p = byId.get(id)
    if (p && inClosed(date) && /品茶会|门店/.test(p.title)) toast.warning(`门店 ${md(shut!.from)}—${md(shut!.to)} 停业，「${p.title}」排在这几天要改一下`)
    return true
  }
  const onDrop = (a: EventDropArg) => {
    if (!a.event.start) return
    const d = toDateStr(a.event.start)
    if (!guard(a.event.id, d)) { a.revert(); return }
    patch.mutate({ id: a.event.id, scheduled_date: d }, { onError: () => a.revert() })
  }
  const onReceive = (a: EventReceiveArg) => {
    const id = a.event.id, start = a.event.start
    a.event.remove()
    // 待排期的没定时间：先按账号最常发的 12:10 排上，点开单篇能改
    if (start && guard(id, toDateStr(start))) patch.mutate({ id, scheduled_date: toDateStr(start), scheduled_time: byId.get(id)?.scheduled_time ?? '12:10' })
  }
  const api = () => cal.current?.getApi()

  const dayClass = (a: { date: Date }) => {
    const d = toDateStr(a.date)
    return [inClosed(d) ? 'xhs-closed' : '', d === launch ? 'xhs-launch' : ''].filter(Boolean)
  }
  const dayContent = (a: DayCellContentArg) => {
    const d = toDateStr(a.date)
    return (
      <span className="flex w-full items-center gap-1">
        {inClosed(d) && <span className="xhs-tag xhs-tag-closed" title={shut ? `门店停业（${md(shut.from)}—${md(shut.to)}）` : undefined}>停业</span>}
        {d === launch && <span className="xhs-tag xhs-tag-launch" title="新品上线，这天起能说名字和上线日">新品上线</span>}
        {a.dayNumberText && <span className={cn('xhs-num ml-auto', a.isToday && 'xhs-num-today', a.isOther && 'opacity-45')}>{a.dayNumberText.replace('日', '')}</span>}
      </span>
    )
  }
  const eventContent = (a: EventContentArg) => {
    const p = byId.get(a.event.id)
    const time = a.event.extendedProps.time as string | null
    const status = String(a.event.extendedProps.status ?? '')
    const head = [time, status].filter(Boolean).join(' · ')
    if (view === 'week' && p) {
      const d = p.draft
      return (
        <div className="grid gap-1.5">
          {d ? <div className="overflow-hidden rounded-[5px]"><CoverArt text={d.cover_text} cover={d.cover} pages={d.pages} seed={d.title} /></div>
            : <div className="grid place-items-center rounded-[5px] border border-dashed text-[12px] text-muted-foreground" style={{ aspectRatio: '4 / 3' }}>还没动笔</div>}
          <div className="num text-[12px] opacity-80">{head}</div>
          <div className="line-clamp-2 text-[12.5px] leading-snug font-semibold">{a.event.title}</div>
          {p.check && <div className={cn('text-[12px] font-medium', p.check.blocks ? 'text-danger' : p.check.warns ? 'text-warn' : 'text-ok')}>{p.check.blocks ? `检查：${p.check.blocks} 处要改` : p.check.warns ? `检查：${p.check.warns} 项提醒` : '检查都过了'}</div>}
          {p.status === '已发布' && (p.total ? <div className="num text-[12px]">阅读 {p.total.reads.toLocaleString('zh-CN')} · 藏 {p.total.saves}</div> : <div className="text-[12px]">还没有数据</div>)}
        </div>
      )
    }
    return (
      <div className="min-w-0 px-0.5 py-px leading-tight">
        <div className="num text-[12px] opacity-80">{head}</div>
        <div className="line-clamp-2 text-[12px] break-all">{a.event.title}</div>
      </div>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 rounded-xl border bg-card p-3 shadow-paper sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="上一段" onClick={() => api()?.prev()}><ChevronLeft /></Button>
            <Button variant="outline" size="sm" onClick={() => api()?.today()}>今天</Button>
            <Button variant="outline" size="icon-sm" aria-label="下一段" onClick={() => api()?.next()}><ChevronRight /></Button>
          </div>
          <h2 className="num min-w-0 flex-1 font-heading text-lg font-semibold">{title}</h2>
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="按月还是按周看">
            {(['month', 'week'] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn('rounded-md px-3 py-1 text-sm', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{v === 'month' ? '月' : '周'}</button>)}
          </div>
        </div>
        <div className={cn('wb-cal xhs-cal', view === 'week' && 'xhs-cal-week')}>
          <FullCalendar
            ref={cal}
            plugins={[dayGridPlugin, interactionPlugin]}
            locale={zhCnLocale}
            initialView={VIEWS[view]}
            headerToolbar={false}
            height="auto"
            firstDay={1}
            now={() => now()}
            initialDate={toDateStr(now())}
            editable
            droppable
            dayMaxEvents={view === 'week' ? false : 4}
            events={events}
            eventAllow={(span) => toDateStr(span.start) >= todayStr()}
            datesSet={(a: DatesSetArg) => setTitle(a.view.title)}
            eventClick={(a: EventClickArg) => { a.jsEvent.preventDefault(); sheet.open(a.event.id) }}
            eventDrop={onDrop}
            eventReceive={onReceive}
            dayCellClassNames={dayClass}
            dayCellContent={dayContent}
            eventContent={eventContent}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {(['待发布', '写稿中', '已选', '已发布'] as PieceStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] border-l-[3px]" style={{ background: COLORS[s].bg, borderColor: COLORS[s].border, boxShadow: `inset 0 0 0 1px ${COLORS[s].border}` }} />{s}{s === '已发布' && '（弱化）'}</span>
          ))}
          {shut && <span className="inline-flex items-center gap-1.5"><span className="xhs-swatch-closed size-2.5 rounded-[2px]" />门店停业 {md(shut.from)}—{md(shut.to)}</span>}
          {launch && <span className="inline-flex items-center gap-1.5"><span className="xhs-tag xhs-tag-launch">新品上线</span>{md(launch)} 起能说名字</span>}
          <span className="ml-auto">拖动改日子；过去的日子拖不进去</span>
        </div>
      </div>
      <aside className="grid content-start gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-paper">
          <h3 className="text-[15px] font-semibold">待排期 · {unscheduled.length}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">已选和写稿中还没定日子的，拖进日历就排上了</p>
          <div ref={side} className="mt-3 grid gap-2">
            {unscheduled.map((p) => (
              <div key={p.id} data-piece={p.id} data-title={p.title} className="flex cursor-grab items-start gap-2 rounded-lg border bg-background p-2.5 active:cursor-grabbing">
                <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <button type="button" onClick={() => sheet.open(p.id)} className="min-w-0 text-left">
                  <StatusTag s={p.status} />
                  <div className="mt-1 line-clamp-2 text-[13px] font-medium">{p.title}</div>
                  {p.memo && <div className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{p.memo}</div>}
                </button>
              </div>
            ))}
            {!unscheduled.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">都排上了</p>}
          </div>
        </div>
        <div className="rounded-xl border bg-accent/50 p-4 text-[13px] leading-relaxed">
          <div className="font-medium">排的时候留意</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>新品{launch ? ` ${md(launch)} ` : ''}上线，之前的预热不说名字和日子；当天起可以说。</li>
            {shut && <li>门店 {md(shut.from)}—{md(shut.to)} 停业，品茶会类的别排在这几天。</li>}
            <li>账号常发的时间：12:10、18:30、20:00 前后。</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
