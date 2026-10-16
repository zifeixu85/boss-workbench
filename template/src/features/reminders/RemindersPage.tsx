// 提醒：工作台后台服务按规则算出来的提醒（server/reminders/），最近的在上面；每条记着怎么弹的、读没读。
// 没弹的（免打扰、提醒已关、演示模式）也记在这里，可以回看。
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Bell, BellOff, CheckCheck, Moon, Monitor, Settings2, Sun, type LucideIcon } from 'lucide-react'
import type { Reminder, RemindersData, ReminderStatus } from '@/lib/types'
import { api, useApi, useWrite } from '@/lib/api'
import { dayOf, relDay, shortDate } from '@/lib/format'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { ViewTabs } from '@/components/view-tabs'
import { Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { NotifyControl } from './NotifyControl'

const KIND_TONE: Record<string, 'info' | 'primary' | 'warn' | 'danger' | 'ok' | 'neutral'> = {
  待办: 'info', 日程: 'primary', 跟进: 'warn', 异常: 'danger', 数据源: 'warn', 汇总: 'ok', 测试: 'neutral',
}
const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const dayLabel = (day: string) => { const r = relDay(day); return r === '今天' || r === '昨天' ? `${r} · ${shortDate(day)}` : shortDate(day) }

/** 页面关着时怎么提醒 */
function closedText(s: ReminderStatus) {
  if (!s.system_supported) return '只记在这里，不弹（这台电脑不支持系统通知）'
  if (s.demo && !s.settings.demo_system) return '演示模式：只记，不弹系统通知（设置里可以打开）'
  return s.platform === 'mac' ? '电脑系统通知（显示为“脚本编辑器”发的；点了打不开网页）' : '电脑系统通知（点了打开对应页面）'
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  )
}

function HowPanel({ s }: { s: ReminderStatus }) {
  const r = s.settings
  return (
    <Panel title="现在怎么提醒" desc={`工作台开着就每半分钟看一次，页面关着也照样算。现在 ${s.now.slice(11)}${s.demo ? `（演示日 ${shortDate(s.now.slice(0, 10))}）` : ''}`}
      action={<Button variant="ghost" size="sm" asChild><Link to="/settings#reminders"><Settings2 />提醒设置</Link></Button>}>
      {!r.on && <p className="mb-4 flex items-center gap-2 rounded-lg bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn"><BellOff className="size-4 shrink-0" aria-hidden />提醒已关：照样记在这里，不弹。到设置里打开。</p>}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact icon={Bell} label="页面开着时（这个浏览器）"><NotifyControl compact /></Fact>
        <Fact icon={Monitor} label="页面关着时">{closedText(s)}</Fact>
        <Fact icon={Moon} label="免打扰">{r.quiet_start && r.quiet_end ? <><span className="num">{r.quiet_start}—{r.quiet_end}</span> 不弹</> : '不设'}</Fact>
        <Fact icon={Sun} label="每天看汇总">{r.notify_at ? <>每天 <span className="num">{r.notify_at}</span> 提醒一次</> : '工作台开了 5 分钟后提醒一次'}</Fact>
      </div>
    </Panel>
  )
}

function Row({ r, onOpen }: { r: Reminder; onOpen: (r: Reminder) => void }) {
  const unread = !r.read_at
  return (
    <li>
      <button onClick={() => onOpen(r)} className="grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-x-3 px-5 py-3 text-left hover:bg-muted/50 md:grid-cols-[3rem_minmax(0,1fr)_auto]">
        <span className="num pt-0.5 text-sm text-muted-foreground">{hm(r.at)}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="没读" />}
            <StatusBadge value={r.kind} tone={KIND_TONE[r.kind] ?? 'neutral'} />
            <span className={cn('text-sm', unread ? 'font-semibold' : 'text-foreground/85')}>{r.title}</span>
          </span>
          {r.body && <span className="mt-1 block text-[13px] text-muted-foreground">{r.body}</span>}
          <span className="mt-1 block text-xs text-muted-foreground md:hidden">{viaText(r)}</span>
        </span>
        <span className="hidden max-w-[220px] pt-0.5 text-right text-xs text-muted-foreground md:block">{viaText(r)}</span>
      </button>
    </li>
  )
}
const viaText = (r: Reminder) => (r.note ? `${r.via} · ${r.note}` : r.via)

export default function RemindersPage() {
  const [sp, setSp] = useSearchParams()
  const view = sp.get('view') === 'unread' ? 'unread' : 'all'
  const navigate = useNavigate()
  const { data, error, refetch } = useApi<RemindersData>('/reminders?limit=200', ['/reminders'])
  const read = useWrite((b: { ids?: number[]; all?: boolean }) => api.post('/reminders/read', b))
  const items = (data?.items ?? []).filter((r) => view === 'all' || !r.read_at)
  const days = [...new Set(items.map((r) => dayOf(r.at)))]
  const open = (r: Reminder) => {
    if (!r.read_at) read.mutate({ ids: [r.id] })
    if (r.link) navigate(r.link)
  }
  return (
    <>
      <PageHeader className="max-w-5xl" eyebrow="今日" title="提醒"
        desc="待办到期前 1 小时、日程开始前 15 分钟、今天该跟进的客户、新出现的经营异常、没按时更新的数据源，每天还提醒你看一次汇总。每条只弹一次，点开直接去对应的地方。"
        actions={<Button variant="outline" disabled={!data?.unread || read.isPending} onClick={() => read.mutate({ all: true })}><CheckCheck />全部标为已读</Button>} />
      <PageBody className="grid max-w-5xl gap-5">
        {error && !data ? <Failed message={error.message} onRetry={() => refetch()} /> : !data ? <><Skeleton className="h-36" /><Skeleton className="h-80" /></> : (
          <>
            <HowPanel s={data.status} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ViewTabs label="看哪些" value={view} onChange={(v) => setSp((p) => { const n = new URLSearchParams(p); if (v === 'all') n.delete('view'); else n.set('view', v); return n })}
                items={[{ value: 'all', label: '全部', count: data.items.length }, { value: 'unread', label: '没读', count: data.unread }]} />
              <span className="text-xs text-muted-foreground">最近 200 条。“只记”是记下了、没弹出来（后面写着原因）</span>
            </div>
            {items.length ? days.map((day) => (
              <Panel key={day} title={dayLabel(day)} bodyClass="p-0">
                <ul className="divide-y">{items.filter((r) => dayOf(r.at) === day).map((r) => <Row key={r.id} r={r} onOpen={open} />)}</ul>
              </Panel>
            )) : (
              <Empty className="border bg-card py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Bell /></EmptyMedia>
                  <EmptyTitle>{view === 'unread' ? '提醒都读过了' : '还没有提醒'}</EmptyTitle>
                  <EmptyDescription>{view === 'unread' ? '新的提醒来了会出现在这里，左边菜单的“提醒”也会出数字。' : '想试一下：建一条待办，到期时间写 5 分钟后，半分钟内就会提醒你。'}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        )}
      </PageBody>
    </>
  )
}
