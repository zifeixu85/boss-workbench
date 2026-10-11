// 项目：每个项目一张卡——想达到什么、里程碑走到哪、下一步、在等谁、风险。点开在抽屉里改
import { FolderPlus, TriangleAlert } from 'lucide-react'
import { useApi } from '@/lib/api'
import type { Milestone, Project } from '@/lib/types'
import { dateWithRel, daysFromToday, relDay, shortDate, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { PageHeader, PageBody } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const RULES = ['里程碑过了日子还没完成', '3 天内到期的里程碑', '超过 7 天没更新', '手动标记的风险']

/** 里程碑：一排节点，完成的实心、进行中的描边、没开始的灰；手机上竖着排 */
export function MilestoneTrack({ items }: { items: Milestone[] }) {
  return (
    <ol className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr sm:gap-2">
      {items.map((m, i) => {
        const late = m.status !== '完成' && daysFromToday(m.date) < 0
        const soon = m.status !== '完成' && !late && daysFromToday(m.date) <= 3
        return (
          <li key={m.id} className="relative flex gap-3 sm:block">
            {i > 0 && <span aria-hidden className={cn('absolute top-[7px] right-[calc(50%+10px)] hidden h-px w-[calc(100%-12px)] sm:block', m.status === '完成' ? 'bg-primary' : 'bg-border')} />}
            <span aria-hidden className={cn('relative z-[1] mt-0.5 block size-4 shrink-0 rounded-full border-2 sm:mx-auto sm:mt-0',
              m.status === '完成' ? 'border-primary bg-primary' : m.status === '进行中' ? 'border-primary bg-card' : late ? 'border-danger bg-card' : 'border-border bg-card')} />
            <span className="block min-w-0 sm:mt-2 sm:text-center">
              <span className={cn('num block text-xs', late ? 'font-medium text-danger' : soon ? 'font-medium text-warn' : 'text-muted-foreground')}>{shortDate(m.date)}{soon || late ? ` · ${relDay(m.date)}` : ''}</span>
              <span className={cn('mt-0.5 block text-[13px] leading-snug', m.status === '完成' && 'text-muted-foreground')}>{m.title}</span>
              {m.status === '进行中' && <StatusBadge value="进行中" className="mt-1" />}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const ov = useOverlay()
  const miles = p.milestones ?? []
  return (
    <section className={cn('min-w-0 rounded-xl border bg-card shadow-paper', p.risks.length > 0 && 'border-danger/25')}>
      <button onClick={() => ov.openDetail('project', p.id)} className="block w-full rounded-t-xl px-5 pt-4 pb-3 text-left hover:bg-muted/40">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-[18px] font-semibold">{p.name}</h2>
          <StatusBadge value={p.stage} />
          <span className="ml-auto text-xs text-muted-foreground">截止 {p.due ? dateWithRel(p.due) : '未定'}</span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.goal}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {p.owner && <span>负责人：<span className="text-foreground">{p.owner}</span></span>}
          {p.budget && <span>预算：<span className="num text-foreground">{wan(p.budget)}</span></span>}
          {miles.length > 0 && <span>里程碑：<span className="num text-foreground">{p.milestones_done}/{miles.length}</span> 完成</span>}
        </div>
      </button>
      {miles.length > 0 && <div className="border-t px-5 py-4"><MilestoneTrack items={miles} /></div>}
      <div className="grid gap-2 border-t px-5 py-3 text-sm sm:grid-cols-2">
        <div><span className="text-muted-foreground">下一步：</span>{p.next_step ?? '—'}</div>
        <div><span className="text-muted-foreground">在等谁：</span>{p.waiting_on ?? '不用等人'}</div>
      </div>
      {p.risks.length > 0 && (
        <div className="grid gap-1.5 rounded-b-xl border-t border-danger/20 bg-danger-soft/40 px-5 py-3">
          {p.risks.map((r) => <div key={r.text} className="flex items-start gap-2 text-[13px]"><StatusBadge value={r.level} />{r.text}</div>)}
        </div>
      )}
    </section>
  )
}

export default function ProjectsPage() {
  const ov = useOverlay()
  const { data = [], isLoading } = useApi<Project[]>('/projects')
  const going = data.filter((p) => p.stage !== '已完成')
  const risky = going.filter((p) => p.risks.length)
  return (
    <>
      <PageHeader eyebrow="日常" title="项目" desc={`进行中 ${going.length} 个，其中 ${risky.length} 个有风险。风险由规则自动算：${RULES.join('、')}。`}
        actions={<Button onClick={() => ov.openNew('project')}><FolderPlus />新建项目</Button>} />
      <PageBody className="grid gap-5">
        {isLoading && <><Skeleton className="h-64" /><Skeleton className="h-64" /></>}
        {risky.length > 0 && (
          <p className="flex items-center gap-2 text-sm"><TriangleAlert className="size-4 text-danger" />要留意的坎：{risky.map((p) => p.next_milestone ? `${p.name}（${shortDate(p.next_milestone.date)} ${p.next_milestone.title}）` : p.name).join('；')}</p>
        )}
        {going.map((p) => <ProjectCard key={p.id} p={p} />)}
        {!isLoading && !going.length && <EmptyNote>还没有进行中的项目。新品上市、春节预售、门店改造这种要好几步推进的事，建成项目来跟。</EmptyNote>}
      </PageBody>
    </>
  )
}
