// 基础版的两张重点卡（2026-10-15）：项目推进到哪、收件箱等你看的。没开客户、经营、内容的工作台，首页也有东西看；
// 开着的也能按老板定的顺序排进前面（shared/home.ts）。数据来自 /api/overview 的 projects_brief、inbox_brief
import { Link } from 'react-router'
import type { Overview } from '@/lib/types'
import { relDay } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { GoLink } from './parts'

export function ProjectsBrief({ o }: { o: Overview }) {
  const ov = useOverlay()
  const items = o.projects_brief ?? []
  return (
    <Panel title="项目推进到哪" desc={items.length ? `${o.projects_active ?? items.length} 个在推进；下一个关键日子和下一步` : undefined} action={<GoLink to="/projects">项目</GoLink>} bodyClass="p-2">
      {items.map((p) => (
        <button key={p.id} onClick={() => ov.openDetail('project', p.id)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60">
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-1.5"><span className="shrink-0 font-medium">{p.name}</span><span className="truncate text-xs text-muted-foreground">{p.stage}</span></span>
            {p.next_milestone && <span className="mt-0.5 block truncate text-[13px]">{relDay(p.next_milestone.date)} · {p.next_milestone.title}</span>}
            {(p.next_step || p.waiting_on) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.waiting_on ? `在等${p.waiting_on}` : `下一步：${p.next_step}`}</span>}
          </span>
          {p.risks > 0 ? <StatusBadge value={`${p.risks} 处风险`} tone="warn" /> : p.due ? <StatusBadge value={relDay(p.due)} tone="neutral" /> : null}
        </button>
      ))}
      {!items.length && (
        <div className="grid gap-2 px-3 py-2">
          <EmptyNote>还没有在推进的项目。</EmptyNote>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Button size="sm" variant="outline" onClick={() => ov.openNew('project')}>新建项目</Button>也可以对 AI 助手说“建个项目：……”</div>
        </div>
      )}
    </Panel>
  )
}

export function InboxBrief({ o }: { o: Overview }) {
  const items = o.inbox_brief ?? []
  const left = (o.inbox_open ?? items.length) - items.length
  return (
    <Panel title="收件箱等你看的" desc={items.length ? `${o.inbox_open} 份还没处理；AI 写了它的看法和建议去向` : undefined} action={<GoLink to="/inbox">收件箱</GoLink>} bodyClass="p-2">
      {items.map((n) => (
        <Link key={n.id} to="/inbox" className="block rounded-lg px-3 py-2.5 hover:bg-muted/60">
          <span className="flex min-w-0 items-baseline gap-1.5"><StatusBadge value={n.kind || '随手记'} tone="neutral" /><span className="truncate text-sm">{n.text}</span></span>
          {(n.judgement || n.suggest) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.suggest ? `建议：${n.suggest}` : n.judgement}</span>}
        </Link>
      ))}
      {left > 0 && <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">还有 {left} 份</p>}
      {!items.length && <div className="px-3 py-2"><EmptyNote>收件箱是空的。随手记、聊天截图、会议纪要都可以先丢进来，对 AI 助手说“整理收件箱”，它会拆好再问你。</EmptyNote></div>}
    </Panel>
  )
}
