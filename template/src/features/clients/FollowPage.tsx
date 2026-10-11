// 跟进清单：该联系的人 / 我在等别人 / 别人在等我
import { MessageSquarePlus } from 'lucide-react'
import { useApi } from '@/lib/api'
import type { FollowUps } from '@/lib/types'
import { relDay, shortDate } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { PageHeader, PageBody, Panel, SubTabs } from '@/components/page'
import { CLIENT_TABS } from './ClientsPage'
import { StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export default function FollowPage() {
  const ov = useOverlay()
  const { data } = useApi<FollowUps>('/follow')
  return (
    <>
      <PageHeader eyebrow="客户" title="跟进清单" desc="三件事：到日子该联系的客户、我在等别人回复的、别人在等我交付的。记一笔之后，客户会从“该联系了”里移走。"
        actions={<Button onClick={() => ov.openNew('log')}><MessageSquarePlus />记一笔跟进</Button>}>
        <SubTabs items={CLIENT_TABS} />
      </PageHeader>
      <PageBody>
        {!data ? <Skeleton className="h-80" /> : (
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="该联系了" desc={`${data.due.length} 位 · 按过期天数排序`} bodyClass="p-2">
              {data.due.map((c) => (
                <div key={c.id} className="rounded-lg px-3 py-2.5 hover:bg-muted/60">
                  <div className="flex items-center gap-2">
                    <button className="min-w-0 flex-1 text-left text-sm font-medium" onClick={() => ov.openDetail('client', c.id)}>{c.name}<span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.label}</span></button>
                    <StatusBadge value={c.overdue > 0 ? `过了 ${c.overdue} 天` : c.overdue === 0 ? '今天' : relDay(c.next_follow)} tone={c.overdue > 0 ? 'warn' : 'neutral'} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">上次 {c.last_contact ? shortDate(c.last_contact) : '—'}：{c.last_summary ?? '还没有沟通记录'}</p>
                  <div className="mt-2 flex gap-2"><Button size="xs" onClick={() => ov.openNew('log', { for: c.id })}>记一笔</Button><Button size="xs" variant="outline" onClick={() => ov.openNew('event', { for: c.id })}>约时间</Button></div>
                </div>
              ))}
              {!data.due.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有到期要联系的客户</p>}
            </Panel>
            <Panel title="我在等别人" desc="对方还没回复、还没确认的" bodyClass="p-2">
              {data.waitingOn.map((w) => (
                <button key={w.kind + w.id} onClick={() => ov.openDetail(w.kind === '项目' ? 'project' : 'todo', w.id)} className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60">
                  <span className="text-sm">{w.title}</span>
                  <span className="text-xs text-muted-foreground"><StatusBadge value={w.kind} tone="neutral" className="mr-1.5" />等 {w.who}{w.since ? ` · ${relDay(w.since)}` : ''}</span>
                </button>
              ))}
              {!data.waitingOn.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有在等的事</p>}
            </Panel>
            <Panel title="别人在等我" desc="和客户有关、3 天内到期的待办" bodyClass="p-2">
              {data.waitingForMe.map((t) => (
                <button key={t.id} onClick={() => ov.openDetail('todo', t.id)} className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60">
                  <span className="text-sm">{t.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusBadge value={t.left < 0 ? `过了 ${-t.left} 天` : t.left === 0 ? '今天到期' : `${t.left} 天后`} tone={t.left <= 0 ? 'danger' : 'warn'} />{t.client_name}</span>
                </button>
              ))}
              {!data.waitingForMe.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有人在等你</p>}
            </Panel>
          </div>
        )}
      </PageBody>
    </>
  )
}
