// 项目：三种看法（2026-10-17，A梦 嫌原来一张大卡信息太密）——
//   卡片（默认）：一项目一张小卡，只看阶段、下一个关键日子、下一步、里程碑进度；
//   列表：一行一个项目，横着比；
//   时间线：原来的大卡，想达到什么、整条里程碑、下一步、在等谁、风险都在。点开都在抽屉里改。视图记在地址栏 ?view=
import { useSearchParams } from 'react-router'
import { FolderPlus, LayoutGrid, List, Route, TriangleAlert } from 'lucide-react'
import { useApi } from '@/lib/api'
import type { Milestone, Project } from '@/lib/types'
import { dateWithRel, daysFromToday, relDay, shortDate, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { PageHeader, PageBody } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StickyTable } from '@/components/data-view'
import { ViewTabs } from '@/components/view-tabs'
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

/** 下一个关键日子：日期（近了标黄、过了标红）+ 名字 */
function NextMilestone({ p, className }: { p: Project; className?: string }) {
  const m = p.next_milestone
  if (!m) return <span className={cn('text-muted-foreground', className)}>没有待办的里程碑</span>
  const left = daysFromToday(m.date)
  return <span className={cn('min-w-0', className)}><span className={cn('num whitespace-nowrap', left < 0 ? 'font-medium text-danger' : left <= 3 ? 'font-medium text-warn' : 'text-muted-foreground')}>{shortDate(m.date)} · {relDay(m.date)}</span> <span>{m.title}</span></span>
}

/** 卡片：只放一眼要看的——阶段、风险、下一个关键日子、下一步、里程碑进度 */
function ProjectTile({ p }: { p: Project }) {
  const ov = useOverlay()
  const miles = p.milestones ?? []
  const done = p.milestones_done ?? 0
  return (
    <button onClick={() => ov.openDetail('project', p.id)} className={cn('flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-xl border bg-card px-4 py-3.5 text-left shadow-paper transition-colors hover:border-primary/40', p.risks.length > 0 && 'border-danger/30')}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-heading text-[16px] font-semibold">{p.name}</span>
        <StatusBadge value={p.stage} />
        {p.risks.length > 0 && <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger"><TriangleAlert className="size-3.5" />{p.risks.length} 处风险</span>}
      </div>
      <NextMilestone p={p} className="line-clamp-2 text-[13px]" />
      <div className="line-clamp-2 text-[13px] text-muted-foreground">{p.waiting_on ? `在等${p.waiting_on}` : `下一步：${p.next_step ?? '—'}`}</div>
      <div className="mt-auto flex items-center gap-2.5 pt-1">
        {miles.length > 0
          ? <><Progress value={Math.round((done / miles.length) * 100)} aria-label={`里程碑完成 ${done}/${miles.length}`} className="h-1.5 flex-1" /><span className="num shrink-0 text-xs text-muted-foreground">{done}/{miles.length}</span></>
          : <span className="text-xs text-muted-foreground">还没定里程碑</span>}
        {p.owner && <span className="shrink-0 truncate text-xs text-muted-foreground">· {p.owner}</span>}
      </div>
    </button>
  )
}

/** 列表：一行一个项目，横着比阶段、关键日子、下一步、截止和风险 */
function ProjectList({ rows }: { rows: Project[] }) {
  const ov = useOverlay()
  return (
    <StickyTable>
      <TableHeader><TableRow className="bg-surface-2/60 hover:bg-surface-2/60">
        <TableHead className="pl-4">项目</TableHead><TableHead>阶段</TableHead><TableHead>下一个关键日子</TableHead><TableHead>下一步 / 在等谁</TableHead>
        <TableHead>里程碑</TableHead><TableHead>负责人</TableHead><TableHead className="pr-4">截止</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id} className="cursor-pointer" onClick={() => ov.openDetail('project', p.id)}>
            <TableCell className="max-w-[220px] pl-4">
              <div className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium">{p.name}</span>{p.risks.length > 0 && <TriangleAlert className="size-3.5 shrink-0 text-danger" aria-label={`${p.risks.length} 处风险`} />}</div>
              {p.client_name && <div className="truncate text-xs text-muted-foreground">{p.client_name}</div>}
            </TableCell>
            <TableCell><StatusBadge value={p.stage} /></TableCell>
            <TableCell className="max-w-[240px]"><NextMilestone p={p} className="block truncate text-[13px]" /></TableCell>
            <TableCell className="max-w-[260px] truncate text-[13px] text-muted-foreground">{p.waiting_on ? `在等${p.waiting_on}` : p.next_step ?? '—'}</TableCell>
            <TableCell className="num whitespace-nowrap text-[13px]">{p.milestones?.length ? `${p.milestones_done ?? 0}/${p.milestones.length}` : '—'}</TableCell>
            <TableCell className="whitespace-nowrap text-[13px]">{p.owner ?? '—'}</TableCell>
            <TableCell className="num pr-4 whitespace-nowrap text-[13px]">{p.due ? dateWithRel(p.due) : '未定'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </StickyTable>
  )
}

type View = 'cards' | 'list' | 'timeline'
const VIEWS: { value: View; label: string; icon: typeof LayoutGrid }[] = [{ value: 'cards', label: '卡片', icon: LayoutGrid }, { value: 'list', label: '列表', icon: List }, { value: 'timeline', label: '时间线', icon: Route }]

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
  const [sp, setSp] = useSearchParams()
  const view: View = sp.get('view') === 'list' ? 'list' : sp.get('view') === 'timeline' ? 'timeline' : 'cards'
  const { data = [], isLoading } = useApi<Project[]>('/projects')
  const going = data.filter((p) => p.stage !== '已完成')
  const risky = going.filter((p) => p.risks.length)
  return (
    <>
      <PageHeader eyebrow="今日" title="项目" desc={`进行中 ${going.length} 个，其中 ${risky.length} 个有风险。风险由规则自动算：${RULES.join('、')}。`}
        actions={<Button onClick={() => ov.openNew('project')}><FolderPlus />新建项目</Button>} />
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <div className="flex flex-wrap items-center gap-2">
          {risky.length > 0 && <p className="flex min-w-0 items-center gap-2 text-sm"><TriangleAlert className="size-4 shrink-0 text-danger" /><span className="min-w-0">要留意的坎：{risky.map((p) => p.next_milestone ? `${p.name}（${shortDate(p.next_milestone.date)} ${p.next_milestone.title}）` : p.name).join('；')}</span></p>}
          <ViewTabs className="ml-auto" value={view} onChange={(v) => setSp({ view: v }, { replace: true })} items={VIEWS} />
        </div>
        {isLoading && <><Skeleton className="h-40" /><Skeleton className="h-40" /></>}
        {view === 'cards' && going.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{going.map((p) => <ProjectTile key={p.id} p={p} />)}</div>}
        {view === 'list' && going.length > 0 && <ProjectList rows={going} />}
        {view === 'timeline' && going.map((p) => <ProjectCard key={p.id} p={p} />)}
        {!isLoading && !going.length && <EmptyNote>还没有进行中的项目。新品上市、春节预售、门店改造这种要好几步推进的事，建成项目来跟。</EmptyNote>}
      </PageBody>
    </>
  )
}
