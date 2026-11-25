// 今日页下半部分：今天的日程、要做的事；其他该联系的人、钱、卡在哪、最近改动
import { Link } from 'react-router'
import { CalendarDays, CircleCheck, Coins, History, MessageSquarePlus, Route, Users, type LucideIcon } from 'lucide-react'
import type { Overview } from '@/lib/types'
import { ago, relDay, timeOf, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { Panel } from '@/components/page'
import { StatusBadge, EVENT_COLORS } from '@/components/status'
import { Button } from '@/components/ui/button'
import { GoLink, TodoLine } from './parts'

/** 驾驶舱的卡片：两列一样高、每列的卡片分掉多出来的高度（底边对齐）；空的卡片有最小高度和一句说明（2026-11-26 A梦 实测要求） */
const CARD = 'flex min-h-48 flex-col'
const BODY = 'flex flex-1 flex-col p-2'

/** 空状态：一句是什么情况，一句怎么会有 */
function Empty({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-6 text-center">
      <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4.5" aria-hidden /></span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-64 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function ScheduleAndTodos({ o }: { o: Overview }) {
  const ov = useOverlay()
  return (
    <div className="flex flex-col gap-5 [&>section]:flex-1">
      <Panel title="今天的日程" desc={o.events.length ? `${o.events.length} 个安排` : '今天没有日程'} action={<GoLink to="/calendar">日历</GoLink>} className={CARD} bodyClass={BODY}>
        {!o.events.length && <Empty icon={CalendarDays} title="今天没有安排" hint={o.upcoming.length ? undefined : '接了日历的会自动同步过来；也可以在 Codex 里说“明天下午三点约客户开会”'} />}
        {o.events.map((e) => {
          const c = EVENT_COLORS[e.kind] ?? EVENT_COLORS['内部']
          return (
            <button key={e.id} onClick={() => ov.openDetail('event', e.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60">
              <span className="num w-12 shrink-0 text-sm font-medium">{e.all_day ? '全天' : timeOf(e.start)}</span>
              <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: c.border }} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.title}</span><span className="block truncate text-xs text-muted-foreground">{[e.kind, e.location].filter(Boolean).join(' · ')}{e.end && !e.all_day ? ` · 到 ${timeOf(e.end)}` : ''}</span></span>
            </button>
          )
        })}
        {o.upcoming.length > 0 && <div className="mt-auto border-t px-3 pt-2.5 pb-1 text-xs text-muted-foreground">接下来：{o.upcoming.slice(0, 3).map((e) => `${relDay(e.start)} ${e.title}`).join('；')}</div>}
      </Panel>

      <Panel title="今天要做" desc="今天到期、过了截止日的，和标成进行中的；打勾就算完成" action={<GoLink to="/todos">全部待办</GoLink>} className={CARD} bodyClass={BODY}>
        {o.todos.today.map((t) => <TodoLine key={t.id} t={t} />)}
        {!o.todos.today.length && (o.todos.week.length
          ? <p className="px-3 py-2 text-sm text-muted-foreground">今天没有到期、也没有进行中的事</p>
          : <Empty icon={CircleCheck} title="今天没有要做的" hint="定了今天截止的，或在待办里移到“进行中”的，会排在这里" />)}
        {o.todos.week.length > 0 && <><div className="mt-2 border-t px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">这周还要做</div>{o.todos.week.slice(0, 6).map((t) => <TodoLine key={t.id} t={t} />)}</>}
      </Panel>
    </div>
  )
}

export function SideColumn({ o }: { o: Overview }) {
  const ov = useOverlay()
  const keyIds = new Set(o.key_clients.slice(0, 5).map((c) => c.id))
  const others = o.follow.due.filter((c) => !keyIds.has(c.id))
  const money = [...o.cash.overdueList, ...o.cash.dueSoon]
  // 模块开关：客户没开就不放“该联系的人”和“钱”；项目、待办都没开就不放“卡在哪”
  const has = (id: string) => !o.modules || o.modules.includes(id)
  return (
    <div className="flex flex-col gap-5 [&>section]:flex-1">
      {has('clients') && <Panel title="其他该联系的人" desc="约好的跟进日子到了（上面的大客户不重复列）" action={<GoLink to="/clients/follow">跟进清单</GoLink>} className={CARD} bodyClass={BODY}>
        {others.slice(0, 6).map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/60">
            <button className="min-w-0 flex-1 text-left" onClick={() => ov.openDetail('client', c.id)}>
              <div className="flex min-w-0 items-baseline gap-1.5 text-sm"><span className="shrink-0 font-medium">{c.name}</span><span className="truncate text-xs text-muted-foreground">{c.label}</span></div>
              <div className="truncate text-xs text-muted-foreground">{c.last_summary ?? '还没有沟通记录'}</div>
            </button>
            <StatusBadge value={c.overdue > 0 ? `过了 ${c.overdue} 天` : c.overdue === 0 ? '今天' : relDay(c.next_follow)} tone={c.overdue > 0 ? 'warn' : 'neutral'} />
            <Button size="icon-sm" variant="ghost" aria-label={`给${c.name}写一条跟进`} onClick={() => ov.openNew('log', { for: c.id })}><MessageSquarePlus /></Button>
          </div>
        ))}
        {!others.length && <Empty icon={Users} title="没有别的要联系的人" hint="客户上写了“下次跟进”的日子，到了会排在这里" />}
      </Panel>}

      {has('clients') && <Panel title="钱" desc={`应收 ${wan(o.cash.outstanding)}，其中逾期 ${wan(o.cash.overdue.amount)}`} action={<GoLink to="/clients/receivables">应收款</GoLink>} className={CARD} bodyClass={BODY}>
        {money.map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <button className="min-w-0 flex-1 truncate text-left hover:text-primary" onClick={() => r.client_id && ov.openDetail('client', r.client_id)}>{r.client_name} · {r.milestone}</button>
            <span className="num shrink-0">{wan(r.outstanding)}</span>
            {r.status === '逾期' ? <StatusBadge value={`逾期 ${r.overdue_days} 天`} tone="danger" /> : <StatusBadge value={relDay(r.due)} tone="warn" />}
          </div>
        ))}
        {!money.length && <Empty icon={Coins} title="没有逾期或快到期的款" hint="项目里记了回款节点的，快到日子会提前出现在这里" />}
      </Panel>}

      {(has('projects') || has('tasks')) && <Panel title="卡在哪" desc="有风险的项目，和正在等别人的事" action={has('projects') ? <GoLink to="/projects">项目</GoLink> : undefined} className={CARD} bodyClass={BODY}>
        {o.risks.map((p) => (
          <button key={p.id} onClick={() => ov.openDetail('project', p.id)} className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted/60">
            <span className="text-sm font-medium">{p.name}</span>
            {p.risks.slice(0, 2).map((r) => <span key={r.text} className="flex items-start gap-1.5 text-xs text-muted-foreground"><StatusBadge value={r.level} />{r.text}</span>)}
          </button>
        ))}
        {!o.risks.length && !o.follow.waitingOn.length && <Empty icon={Route} title="没有卡住的事" hint="项目标了风险、待办标成“等别人”的，会列在这里" />}
        {o.follow.waitingOn.map((w) => <div key={w.kind + w.id} className="flex items-center gap-2 px-3 py-1.5 text-sm"><StatusBadge value="在等" tone="info" /><span className="min-w-0 truncate">{w.title}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">等{w.who}</span></div>)}
      </Panel>}

      <Panel title="最近改动" desc="网页、Codex、定时任务改的都记在这里" className={CARD} bodyClass={BODY}>
        {!o.changes.length && <Empty icon={History} title="还没有改动" hint="在网页里改、在 Codex 里说“更新进展”，改了什么都会记在这里" />}
        {o.changes.map((c) => (
          <div key={c.id} className="flex items-start gap-2 px-3 py-1.5 text-[13px]">
            <StatusBadge value={c.actor} tone={c.actor === 'Codex' ? 'info' : c.actor === '导入' ? 'primary' : 'neutral'} /><span className="min-w-0 flex-1">{c.summary}</span><span className="shrink-0 text-xs text-muted-foreground">{ago(c.at)}</span>
          </div>
        ))}
        <p className="mt-auto px-3 pt-1 pb-1 text-xs text-muted-foreground"><Link to="/settings" className="hover:text-primary">数据放在哪 →</Link></p>
      </Panel>
    </div>
  )
}
