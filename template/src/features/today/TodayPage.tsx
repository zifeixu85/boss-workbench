// 今日：林总早上最想看的三件事（各平台昨天卖得怎么样、今天该跟进的大客户、小红书今天发什么），
// 然后是数据异常、日程、待办、该联系的人、钱、卡在哪。数据都从 /api/overview 一次取回。
import { CalendarPlus, MessageSquarePlus, Sparkles } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import type { Overview, Settings } from '@/lib/types'
import { fullDate, relDay, yuan } from '@/lib/format'
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

const greet = () => { const h = now().getHours(); return h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' }

/** 页头的一句话：把三件事压成一行 */
function digest(o: Overview) {
  const parts: string[] = []
  if (o.sales) {
    const d = o.sales.total.vs_prev
    parts.push(`昨天 5 个渠道卖了 ${yuan(o.sales.total.gmv)}${d === null ? '' : `，比前天${d >= 0 ? '多' : '少'} ${Math.abs(d)}%`}`)
  }
  const biz = o.alerts.filter((a) => a.module === 'biz').length
  const data = o.alerts.length - biz
  if (o.alerts.length) parts.push(`${biz ? `${biz} 处数据不对劲` : ''}${biz && data ? '，' : ''}${data ? `${data} 个数据源没跟上` : ''}`)
  if (o.key_clients.length) parts.push(`${o.key_clients.slice(0, 3).map((c) => c.name).join('、')}等着跟进`)
  const post = o.xhs?.posts[0]
  if (post) parts.push(`小红书 ${post.time ?? '今天'} 发《${post.title}》`)
  return parts.join('；') + '。'
}

export default function TodayPage() {
  const ov = useOverlay()
  const { data: o, error, refetch } = useApi<Overview>('/overview')
  const { data: s } = useApi<Settings>('/settings')
  const doneTop = useWrite((id: string) => api.patch(`/todos/${id}`, { status: '完成' }), '漂亮，最要紧的一件做完了')
  if (error && !o) return <PageBody className="pt-7"><Failed message={error.message} onRetry={() => refetch()} /></PageBody>
  if (!o) return <PageBody className="grid gap-4 pt-7"><Skeleton className="h-24" /><div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div><Skeleton className="h-60" /></PageBody>
  return (
    <>
      <PageHeader eyebrow={fullDate(o.date)} title={`${greet()}，${s?.owner ?? '老板'}`} desc={digest(o)}
        actions={<><Button variant="outline" onClick={() => ov.openNew('event')}><CalendarPlus />日程</Button><Button onClick={() => ov.openNew('log')}><MessageSquarePlus />记一笔跟进</Button></>} />
      <PageBody className="grid gap-5">
        {o.module_errors.length > 0 && (
          <Alert className="border-danger/30 bg-danger-soft/50">
            <AlertTitle>有模块出错了，其他部分照常显示</AlertTitle>
            <AlertDescription>{o.module_errors.map((m) => `${m.module}：${m.error}`).join('；')}</AlertDescription>
          </Alert>
        )}

        {o.headline && (
          <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(120deg,var(--accent),var(--card)_70%)] px-5 py-4 shadow-paper">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary"><Sparkles className="size-3.5" />现在最该做的一件事</div>
                <div className="mt-1 font-heading text-xl font-semibold">{o.headline.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">截止 {relDay(o.headline.due)}</div>
              </div>
              <div className="flex gap-2"><Button variant="outline" onClick={() => ov.openDetail('todo', o.headline!.id)}>打开</Button><Button onClick={() => doneTop.mutate(o.headline!.id)}>做完了</Button></div>
            </div>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 lg:col-span-2 xl:col-span-1"><SalesBrief sales={o.sales} alerts={o.alerts} /></div>
          <KeyClients items={o.key_clients} />
          <XhsToday plan={o.xhs} />
        </div>

        <AlertsPanel alerts={o.alerts} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <ScheduleAndTodos o={o} />
          <SideColumn o={o} />
        </div>
      </PageBody>
    </>
  )
}
