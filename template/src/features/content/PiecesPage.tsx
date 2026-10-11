// 小红书 · 内容：所有内容一处看，看板（灵感池 → 已选 → 写稿中 → 待发布 → 已发布，拖动）/ 日历（拖动改排期）/ 列表。没有对话窗口。归属：小红书内容模块。
import { CalendarDays, Columns3, Plus, Sparkles, Table2 } from 'lucide-react'
import { PageHeader, PageBody, SubTabs } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Failed } from '@/components/chart-kit'
import { usePieces } from './api'
import { CONTENT_TABS } from './tabs'
import { useParam } from './lib'
import { ContentOverlays, useCreateParam } from './ContentOverlays'
import { BoardView } from './pieces/BoardView'
import { CalendarView } from './pieces/CalendarView'
import { ListView } from './pieces/ListView'

type View = 'board' | 'calendar' | 'list'

export default function PiecesPage() {
  const [view, setView] = useParam<View>('view', 'board')
  const { data = [], isLoading, error, refetch } = usePieces()
  const create = useCreateParam()
  const live = data.filter((p) => p.status !== '已放弃')
  const doing = live.filter((p) => p.status !== '已发布').length
  const scheduled = live.filter((p) => p.status !== '已发布' && p.scheduled_date).length
  return (
    <>
      <PageHeader eyebrow="内容 · 小红书" title="内容"
        desc={isLoading ? '读取中…' : `一篇从选题到发布是同一条：在做的 ${doing} 篇（排了日子的 ${scheduled} 篇），已经发了 ${live.length - doing} 篇。拖动卡片换阶段，日历里拖动改发布日。`}
        actions={<><Button variant="outline" onClick={() => create.open('topics')}><Sparkles />AI 出选题</Button><Button onClick={() => create.open('piece')}><Plus />记一个选题</Button></>}>
        <SubTabs items={CONTENT_TABS} />
      </PageHeader>
      <PageBody className="grid gap-4">
        <ViewTabs value={view} onChange={setView} items={[
          { value: 'board', label: '看板', icon: Columns3, count: doing },
          { value: 'calendar', label: '日历', icon: CalendarDays, count: scheduled },
          { value: 'list', label: '列表', icon: Table2, count: live.length },
        ]} />
        {error ? <Failed message={(error as Error).message} onRetry={() => refetch()} /> : isLoading ? <Skeleton className="h-[520px]" /> : (
          view === 'board' ? <BoardView pieces={data} /> : view === 'calendar' ? <CalendarView pieces={data} /> : <ListView pieces={data} />
        )}
      </PageBody>
      <ContentOverlays />
    </>
  )
}
