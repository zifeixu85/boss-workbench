// 今日页下半部分：今天的日程、要做的事；其他该联系的人、钱、卡在哪、最近改动
import { Link } from 'react-router'
import { MessageSquarePlus } from 'lucide-react'
import type { Overview } from '@/lib/types'
import { ago, relDay, timeOf, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { Panel } from '@/components/page'
import { StatusBadge, EVENT_COLORS } from '@/components/status'
import { Button } from '@/components/ui/button'
import { GoLink, TodoLine } from './parts'

export function ScheduleAndTodos({ o }: { o: Overview }) {
  const ov = useOverlay()
  return (
    <div className="grid content-start gap-5">
      <Panel title="今天的日程" desc={o.events.length ? `${o.events.length} 个安排` : '今天没有日程'} action={<GoLink to="/calendar">日历</GoLink>} bodyClass="p-2">
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
        {o.upcoming.length > 0 && <div className="mt-1 border-t px-3 pt-2.5 pb-1 text-xs text-muted-foreground">接下来：{o.upcoming.slice(0, 3).map((e) => `${relDay(e.start)} ${e.title}`).join('；')}</div>}
      </Panel>

      <Panel title="今天要做" desc="打勾就算完成；过了截止日的排在这里" action={<GoLink to="/todos">全部待办</GoLink>} bodyClass="p-2">
        {o.todos.today.map((t) => <TodoLine key={t.id} t={t} />)}
        {!o.todos.today.length && <p className="px-3 py-2 text-sm text-muted-foreground">今天的事都做完了</p>}
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
  return (
    <div className="grid content-start gap-5">
      <Panel title="其他该联系的人" desc="约好的跟进日子到了（上面的大客户不重复列）" action={<GoLink to="/clients/follow">跟进清单</GoLink>} bodyClass="p-2">
        {others.slice(0, 6).map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/60">
            <button className="min-w-0 flex-1 text-left" onClick={() => ov.openDetail('client', c.id)}>
              <div className="flex min-w-0 items-baseline gap-1.5 text-sm"><span className="shrink-0 font-medium">{c.name}</span><span className="truncate text-xs text-muted-foreground">{c.label}</span></div>
              <div className="truncate text-xs text-muted-foreground">{c.last_summary ?? '还没有沟通记录'}</div>
            </button>
            <StatusBadge value={c.overdue > 0 ? `过了 ${c.overdue} 天` : c.overdue === 0 ? '今天' : relDay(c.next_follow)} tone={c.overdue > 0 ? 'warn' : 'neutral'} />
            <Button size="icon-sm" variant="ghost" aria-label={`给${c.name}记一笔`} onClick={() => ov.openNew('log', { for: c.id })}><MessageSquarePlus /></Button>
          </div>
        ))}
        {!others.length && <p className="px-3 py-2 text-sm text-muted-foreground">没有别的要联系的人</p>}
      </Panel>

      <Panel title="钱" desc={`应收 ${wan(o.cash.outstanding)}，其中逾期 ${wan(o.cash.overdue.amount)}`} action={<GoLink to="/clients/receivables">应收款</GoLink>} bodyClass="p-2">
        {money.map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <button className="min-w-0 flex-1 truncate text-left hover:text-primary" onClick={() => r.client_id && ov.openDetail('client', r.client_id)}>{r.client_name} · {r.milestone}</button>
            <span className="num shrink-0">{wan(r.outstanding)}</span>
            {r.status === '逾期' ? <StatusBadge value={`逾期 ${r.overdue_days} 天`} tone="danger" /> : <StatusBadge value={relDay(r.due)} tone="warn" />}
          </div>
        ))}
        {!money.length && <p className="px-3 py-2 text-sm text-muted-foreground">没有逾期或快到期的款</p>}
      </Panel>

      <Panel title="卡在哪" desc="有风险的项目，和正在等别人的事" action={<GoLink to="/projects">项目</GoLink>} bodyClass="p-2">
        {o.risks.map((p) => (
          <button key={p.id} onClick={() => ov.openDetail('project', p.id)} className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted/60">
            <span className="text-sm font-medium">{p.name}</span>
            {p.risks.slice(0, 2).map((r) => <span key={r.text} className="flex items-start gap-1.5 text-xs text-muted-foreground"><StatusBadge value={r.level} />{r.text}</span>)}
          </button>
        ))}
        {o.follow.waitingOn.map((w) => <div key={w.kind + w.id} className="flex items-center gap-2 px-3 py-1.5 text-sm"><StatusBadge value="在等" tone="info" /><span className="min-w-0 truncate">{w.title}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">等{w.who}</span></div>)}
      </Panel>

      <Panel title="最近改动" desc="网页、Codex、定时任务改的都记在这里" bodyClass="p-2">
        {o.changes.map((c) => (
          <div key={c.id} className="flex items-start gap-2 px-3 py-1.5 text-[13px]">
            <StatusBadge value={c.actor} tone={c.actor === 'Codex' ? 'info' : c.actor === '导入' ? 'primary' : 'neutral'} /><span className="min-w-0 flex-1">{c.summary}</span><span className="shrink-0 text-xs text-muted-foreground">{ago(c.at)}</span>
          </div>
        ))}
        <p className="px-3 pt-1 pb-1 text-xs text-muted-foreground"><Link to="/settings" className="hover:text-primary">数据放在哪 →</Link></p>
      </Panel>
    </div>
  )
}
