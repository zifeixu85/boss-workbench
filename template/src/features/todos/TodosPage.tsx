// 待办：按时间分组的清单 / 按状态的看板；点开在抽屉里改
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Columns3, ListChecks, ListPlus, Search } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import type { Todo } from '@/lib/types'
import { addDays, relDay, todayStr } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { PageHeader, PageBody } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ViewTabs } from '@/components/view-tabs'
import { Board, BoardColumn, MetaRow } from '@/components/data-view'
import { DndBoard, DragCard, DropColumn } from '@/components/dnd-board'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Choice } from '@/components/form'
import { cn } from '@/lib/utils'

function Row({ t }: { t: Todo }) {
  const ov = useOverlay()
  const toggle = useWrite(() => api.patch(`/todos/${t.id}`, { status: t.status === '完成' ? '待办' : '完成' }), t.status === '完成' ? '已恢复' : `已完成：${t.title}`)
  const late = t.due && t.status !== '完成' && t.due < todayStr()
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-muted/50">
      <Checkbox checked={t.status === '完成'} onCheckedChange={() => toggle.mutate(undefined)} aria-label="完成" />
      <button className="min-w-0 flex-1 text-left" onClick={() => ov.openDetail('todo', t.id)}>
        <span className={cn('block truncate text-sm', t.status === '完成' && 'text-muted-foreground line-through')}>{t.title}</span>
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">{t.client_name && <span>{t.client_name}</span>}{t.project_name && <span>· {t.project_name}</span>}</span>
      </button>
      {t.priority !== '普通' && <StatusBadge value={t.priority} />}
      {t.status !== '待办' && t.status !== '完成' && <StatusBadge value={t.status} />}
      <span className={cn('num w-16 shrink-0 text-right text-xs', late ? 'font-medium text-danger' : 'text-muted-foreground')}>{relDay(t.due)}</span>
    </div>
  )
}

function Group({ title, items, defaultOpen = true }: { title: string; items: Todo[]; defaultOpen?: boolean }) {
  if (!items.length) return null
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-xl border bg-card shadow-paper">
      <CollapsibleTrigger className="sticky top-(--sticky-top) z-10 flex w-full items-center gap-2 rounded-t-xl border-b bg-surface-2/95 px-4 py-2 text-left text-sm font-medium backdrop-blur">{title}<span className="num text-xs font-normal text-muted-foreground">{items.length}</span></CollapsibleTrigger>
      <CollapsibleContent>{items.map((t) => <Row key={t.id} t={t} />)}</CollapsibleContent>
    </Collapsible>
  )
}

const COLS = ['待办', '进行中', '等别人', '完成'] as const

function TodoCard({ t, onOpen }: { t: Todo; onOpen?: () => void }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3 shadow-paper">
      <button className="line-clamp-3 w-full text-left text-sm leading-snug break-words" onClick={onOpen}>{t.title}</button>
      <MetaRow className="mt-2">
        {t.priority !== '普通' && <StatusBadge value={t.priority} />}
        <span>{relDay(t.due)}</span>
        {t.client_name && <span>{t.client_name}</span>}
      </MetaRow>
    </div>
  )
}

/** 看板：拖卡片到另一列就改状态；列标题吸顶 */
function TodoBoard({ todos }: { todos: Todo[] }) {
  const ov = useOverlay()
  const move = useWrite(({ id, status }: { id: string; status: string }) => api.patch(`/todos/${id}`, { status }), (o) => `已移到「${(o as Todo).status}」`)
  return (
    <DndBoard onMove={(id, status) => move.mutate({ id, status })} renderOverlay={(id) => { const t = todos.find((x) => x.id === id); return t ? <TodoCard t={t} /> : null }}>
      <p className="-mt-1 text-xs text-muted-foreground">按住卡片拖到另一列即可改状态；手机上长按再拖。</p>
      <Board>
        {COLS.map((col) => {
          const xs = todos.filter((t) => t.status === col)
          return (
            <DropColumn key={col} id={col}>
              {(over) => (
                <BoardColumn highlight={over} title={<StatusBadge value={col} />} meta={`${xs.length} 件`}>
                  {xs.map((t) => <DragCard key={t.id} id={t.id} column={col}><TodoCard t={t} onOpen={() => ov.openDetail('todo', t.id)} /></DragCard>)}
                  {!xs.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">拖到这里</div>}
                </BoardColumn>
              )}
            </DropColumn>
          )
        })}
      </Board>
    </DndBoard>
  )
}

export default function TodosPage() {
  const ov = useOverlay()
  const [sp, setSp] = useSearchParams()
  const view = sp.get('view') === 'board' ? 'board' : 'list'
  const [q, setQ] = useState('')
  const [pri, setPri] = useState<string | null>(null)
  const { data: all = [], isLoading } = useApi<Todo[]>('/todos')
  const todos = useMemo(() => all.filter((t) => t.status !== '取消' && (!q || `${t.title}${t.client_name ?? ''}`.includes(q)) && (!pri || t.priority === pri)), [all, q, pri])
  const t0 = todayStr()
  const open = todos.filter((t) => t.status !== '完成')
  const groups = {
    overdue: open.filter((t) => t.due && t.due < t0), today: open.filter((t) => t.due === t0),
    week: open.filter((t) => t.due && t.due > t0 && t.due <= addDays(t0, 7)), later: open.filter((t) => t.due && t.due > addDays(t0, 7)),
    none: open.filter((t) => !t.due), done: todos.filter((t) => t.status === '完成'),
  }
  return (
    <>
      <PageHeader eyebrow="日常" title="待办" desc={`还有 ${open.length} 件没做完。和客户、项目有关的事记得关联，客户详情和跟进清单里都能看到。`}
        actions={<Button onClick={() => ov.openNew('todo')}><ListPlus />新建待办</Button>} />
      <PageBody className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64"><Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜待办或客户" className="pl-8" /></div>
          <div className="w-32"><Choice value={pri} onChange={setPri} options={['紧急', '重要', '普通']} allowEmpty emptyLabel="全部优先级" placeholder="全部优先级" /></div>
          <ViewTabs className="ml-auto" value={view} onChange={(v) => setSp({ view: v }, { replace: true })} items={[{ value: 'list', label: '清单', icon: ListChecks }, { value: 'board', label: '看板', icon: Columns3 }]} />
        </div>
        {view === 'board' ? <TodoBoard todos={todos} /> : (
          <div className="grid gap-4">
            <Group title="已经过了截止日" items={groups.overdue} />
            <Group title="今天" items={groups.today} />
            <Group title="未来 7 天" items={groups.week} />
            <Group title="以后" items={groups.later} />
            <Group title="没定日期" items={groups.none} />
            <Group title="已完成" items={groups.done} defaultOpen={false} />
            {isLoading && <Skeleton className="h-64" />}
            {!isLoading && !open.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">没有待办了。按 T 可以随时新建一条。</p>}
          </div>
        )}
      </PageBody>
    </>
  )
}
