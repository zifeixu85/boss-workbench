// 今日：顶上是老板“最想先看到”的重点卡（最多 3 张，按设置 home 排：经营、大客户、小红书、项目、收件箱，见 shared/home.ts），
// 然后是数据异常、日程、待办、该联系的人、钱、卡在哪。数据都从 /api/overview 一次取回。
import { CalendarPlus, MessageSquarePlus, Sparkles } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import type { Overview, Settings } from '@/lib/types'
import { dueText, fullDate, yuan } from '@/lib/format'
import { now } from '@/lib/clock'
import { useOverlay } from '@/app/overlay'
import { PageHeader, PageBody } from '@/components/page'
import { Failed } from '@/components/chart-kit'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SalesBrief } from './SalesBrief'
import { KeyClients } from './KeyClients'
import { XhsToday } from './XhsToday'
import { AlertsPanel } from './AlertsPanel'
import { ScheduleAndTodos, SideColumn } from './DayColumns'
import { NotifyBanner } from './NotifyBanner'
import { InboxBrief, ProjectsBrief } from './BaseBriefs'

/** 模块开没开：今日页只放打开着的模块（模块开关，见 shared/modules.ts；老服务没给 modules = 全部） */
const hasModule = (o: Overview, id: string) => !o.modules || o.modules.includes(id)

const greet = () => { const h = now().getHours(); return h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' }

/** 页头的一句话：把三件事压成一行 */
function digest(o: Overview) {
  const parts: string[] = []
  if (o.sales) {
    const d = o.sales.total.vs_prev
    parts.push(o.sales.total.gmv === null ? `昨天有渠道没数，合计先不算` : `昨天 ${o.sales.channels.length} 个渠道卖了 ${yuan(o.sales.total.gmv)}${d === null ? '' : `，比前天${d >= 0 ? '多' : '少'} ${Math.abs(d)}%`}`)
  }
  const biz = o.alerts.filter((a) => a.module === 'biz').length
  const data = o.alerts.length - biz
  if (o.alerts.length) parts.push(`${biz ? `${biz} 处数据不对劲` : ''}${biz && data ? '，' : ''}${data ? `${data} 个数据源没跟上` : ''}`)
  if (o.key_clients.length) parts.push(`${o.key_clients.slice(0, 3).map((c) => c.name).join('、')}等着跟进`)
  const post = o.xhs?.posts[0]
  if (post) parts.push(`小红书 ${post.time ?? '今天'} 发《${post.title}》`)
  // 基础版（没开经营、客户、内容时）：说项目的下一个关键日子和收件箱
  if (!parts.length) {
    const next = (o.projects_brief ?? []).filter((p) => p.next_milestone).sort((a, b) => a.next_milestone!.date.localeCompare(b.next_milestone!.date))[0]
    if (o.projects_active) parts.push(`${o.projects_active} 个项目在推进${next ? `，最近的关键日子是${next.name}的“${next.next_milestone!.title}”（${next.next_milestone!.date.slice(5)}）` : ''}`)
    if (o.inbox_open) parts.push(`收件箱有 ${o.inbox_open} 份等你看`)
  }
  return parts.length ? parts.join('；') + '。' : '今天还没有要特别留意的事。'
}

export default function TodayPage() {
  const ov = useOverlay()
  const { data: o, error, refetch } = useApi<Overview>('/overview')
  const { data: s } = useApi<Settings>('/settings')
  const doneTop = useWrite((id: string) => api.patch(`/todos/${id}`, { status: '完成' }), '漂亮，最要紧的一件做完了')
  if (error && !o) return <PageBody className="pt-7"><Failed message={error.message} onRetry={() => refetch()} /></PageBody>
  const has = (id: string) => !!o && hasModule(o, id)
  if (!o) return <PageBody className="grid gap-4 pt-7"><Skeleton className="h-24" /><div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div><Skeleton className="h-60" /></PageBody>
  // 顶上的重点卡：服务端按老板定的顺序给（shared/home.ts）；老服务没给就按以前的三件事
  const focus = o.home ?? (['sales', 'clients', 'xhs'] as const).filter((id) => has({ sales: 'biz', clients: 'clients', xhs: 'content' }[id]))
  const card = (id: (typeof focus)[number]) => ({
    sales: <div key="sales" className="min-w-0 lg:col-span-2 xl:col-span-1"><SalesBrief sales={o.sales} alerts={o.alerts} /></div>,
    clients: <KeyClients key="clients" items={o.key_clients} />,
    xhs: <XhsToday key="xhs" plan={o.xhs} />,
    projects: <ProjectsBrief key="projects" o={o} />,
    inbox: <InboxBrief key="inbox" o={o} />,
  })[id]
  return (
    <>
      <PageHeader eyebrow={fullDate(o.date)} title={`${greet()}，${s?.owner ?? '老板'}`} desc={digest(o)}
        actions={<>{has('tasks') && <Button variant="outline" onClick={() => ov.openNew('event')}><CalendarPlus />日程</Button>}{has('clients') && <Button onClick={() => ov.openNew('log')}><MessageSquarePlus />记一笔跟进</Button>}</>} />
      <PageBody className="grid gap-5">
        {o.module_errors.length > 0 && (
          <Alert className="border-danger/30 bg-danger-soft/50">
            <AlertTitle>有模块出错了，其他部分照常显示</AlertTitle>
            <AlertDescription>{o.module_errors.map((m) => `${m.module}：${m.error}`).join('；')}</AlertDescription>
          </Alert>
        )}

        {/* 手动打开、没开提醒的（默认）不问浏览器通知权限 */}
        {s?.reminders?.on && <NotifyBanner />}

        {o.headline && (
          <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(120deg,var(--accent),var(--card)_70%)] px-5 py-4 shadow-paper">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary"><Sparkles className="size-3.5" />现在最该做的一件事</div>
                <div className="mt-1 font-heading text-xl font-semibold">{o.headline.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">截止 {dueText(o.headline.due, o.headline.due_time)}</div>
              </div>
              <div className="flex gap-2"><Button variant="outline" onClick={() => ov.openDetail('todo', o.headline!.id)}>打开</Button><Button onClick={() => doneTop.mutate(o.headline!.id)}>做完了</Button></div>
            </div>
          </section>
        )}

        {/* 重点卡：老板“最想先看到”的，最多 3 张；三张且第一张是经营时经营那张更宽 */}
        {focus.length > 0 && (
          <div className={focus.length === 3 ? `grid gap-5 lg:grid-cols-2 ${focus[0] === 'sales' ? 'xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'xl:grid-cols-3'}` : focus.length === 2 ? 'grid gap-5 lg:grid-cols-2' : 'grid gap-5'}>
            {focus.map(card)}
          </div>
        )}

        {(has('biz') || has('data')) && <AlertsPanel alerts={o.alerts} hasBiz={!!o.sales?.channels.some((c) => c.gmv !== null)} sources={o.source_count ?? 0} />}

        <div className={has('tasks') ? 'grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : 'grid gap-5'}>
          {has('tasks') && <ScheduleAndTodos o={o} />}
          <SideColumn o={o} />
        </div>
      </PageBody>
    </>
  )
}
