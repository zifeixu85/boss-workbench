// 商机看板（跟进看板里的“按商机”视图）：按商机阶段分列，每列合计金额；拖动卡片换阶段，签约 / 没成单独收起。归属：大客户模块（原 PipelinePage 的内容）
// 第二轮：列头和“按客户阶段”同一个样子（文字列头）；按去年估的商机灰字写“估”，不算进在谈合计。
// 第三轮（产品评审 #3、数据评审 #24）：按上次的单估的复购不放进“需求确认”那一列（原来那列 9 个，4 个是估的），单独一排“估的复购”；
//   外层不再撑宽页面；手机上和“按客户阶段”一样，阶段做成页签、一次看一列。
import { useSearchParams } from 'react-router'
import { api, useApi, useWrite } from '@/lib/api'
import { relDay, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { useIsMobile } from '@/hooks/use-mobile'
import { StatusBadge } from '@/components/status'
import { Skeleton } from '@/components/ui/skeleton'
import { ViewTabs } from '@/components/view-tabs'
import { Board, BoardColumn, MetaRow } from '@/components/data-view'
import { DndBoard, DragCard, DropColumn } from '@/components/dnd-board'
import { Failed } from '@/components/chart-kit'
import type { CrmDeal } from '@/features/crm/types'
import { BOARD_MIN_COL } from '@/features/crm/rules'
import { ColumnHead, FadeScroll } from './ColumnHead'

const OPEN = ['需求确认', '方案中', '报价中', '待签约'] as const
const HINT: Record<(typeof OPEN)[number], string> = { 需求确认: '问清要多少、什么时候要', 方案中: '在出方案、样品', 报价中: '报了价，等对方回', 待签约: '说定了，等签单付定金' }

export function DealsBoard() {
  const ov = useOverlay()
  const mobile = useIsMobile()
  const [sp, setSp] = useSearchParams()
  const { data = [], isLoading, error, refetch } = useApi<CrmDeal[]>('/deals')
  const move = useWrite(({ id, stage }: { id: string; stage: string }) => api.patch(`/deals/${id}`, { stage }), (d) => `已移到「${(d as CrmDeal).stage}」`)
  const sum = (xs: CrmDeal[]) => Math.round(xs.reduce((a, d) => a + (d.amount ?? 0), 0) * 100) / 100
  const open = data.filter((d) => (OPEN as readonly string[]).includes(d.stage))
  const talked = open.filter((d) => !d.estimated)
  const est = open.filter((d) => d.estimated)
  const closed = data.filter((d) => !(OPEN as readonly string[]).includes(d.stage))
  if (error) return <Failed message={error.message} onRetry={() => refetch()} />
  if (isLoading) return <Skeleton className="h-72" />
  const cols = OPEN.map((stage) => ({ stage, xs: talked.filter((d) => d.stage === stage) }))
  const head = (x: (typeof cols)[number]) => <ColumnHead label={x.stage} count={x.xs.length} amount={sum(x.xs) ? wan(sum(x.xs)) : undefined} hint={HINT[x.stage]} />
  const summary = (
    <p className="min-w-0 text-[13px] text-muted-foreground">
      真在谈的 {talked.length} 个商机，合计 {wan(sum(talked))}{est.length > 0 && <>；另有 {est.length} 个是按上次的单估的复购（约 {wan(sum(est))}），还没开口谈，放在最下面一排</>}。
    </p>
  )
  const estRow = est.length > 0 && (
    <section className="grid min-w-0 gap-2 rounded-xl border border-dashed p-3">
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold">估的复购<span className="num font-normal text-muted-foreground">{est.length} 个 · 估 {wan(sum(est))}</span><span className="text-xs font-normal text-muted-foreground">按上次的单估的，还没开口；聊过以后拖进上面对应的列</span></h3>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {est.map((d) => <DragCard key={d.id} id={d.id} column="估的复购" className="w-full min-w-0"><DealCard d={d} onOpen={() => ov.openDetail('client', d.client_id)} /></DragCard>)}
      </div>
    </section>
  )

  if (mobile) {
    const cur = (OPEN as readonly string[]).includes(sp.get('col') ?? '') ? sp.get('col')! : '报价中'
    const x = cols.find((c) => c.stage === cur)!
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {summary}
        <FadeScroll>
          <ViewTabs label="看哪个阶段" value={cur} onChange={(v) => setSp((p) => { const n = new URLSearchParams(p); n.set('col', v); return n }, { replace: true })}
            items={cols.map((c) => ({ value: c.stage, label: c.stage, count: c.xs.length }))} />
        </FadeScroll>
        <div className="rounded-xl border bg-surface-2/60">
          <div className="border-b px-3 py-2.5">{head(x)}</div>
          <div className="grid gap-2 p-2">
            {x.xs.map((d) => <DealCard key={d.id} d={d} onOpen={() => ov.openDetail('client', d.client_id)} />)}
            {!x.xs.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">这个阶段现在没有商机</p>}
          </div>
        </div>
        {est.length > 0 && <p className="text-[12px] text-muted-foreground">估的复购 {est.length} 个（{est.map((d) => d.client_name).join('、')}），在电脑上看。</p>}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <DndBoard onMove={(id, stage) => { if (stage !== '估的复购') move.mutate({ id, stage }) }} renderOverlay={(id) => { const d = open.find((x) => x.id === id); return d ? <div className="w-[230px]"><DealCard d={d} /></div> : null }}>
        {summary}
        <Board minCol={BOARD_MIN_COL}>
          {cols.map((x) => (
            <DropColumn key={x.stage} id={x.stage}>
              {(over) => (
                <BoardColumn highlight={over} title={head(x)}>
                  {x.xs.map((d) => <DragCard key={d.id} id={d.id} column={x.stage} className="w-full min-w-0"><DealCard d={d} onOpen={() => ov.openDetail('client', d.client_id)} /></DragCard>)}
                  {!x.xs.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">拖到这里</div>}
                </BoardColumn>
              )}
            </DropColumn>
          ))}
        </Board>
        {estRow}
        <div className="grid gap-3 sm:grid-cols-2">
          {(['已签约', '没成'] as const).map((stage) => (
            <DropColumn key={stage} id={stage}>
              {(over) => <div className={`rounded-xl border border-dashed p-3 text-center text-sm transition-colors ${over ? 'border-primary bg-accent' : 'text-muted-foreground'}`}>拖到这里：{stage}</div>}
            </DropColumn>
          ))}
        </div>
      </DndBoard>
      <section className="rounded-xl border bg-card p-4 shadow-paper">
        <h2 className="mb-2 text-sm font-semibold">已经有结果的</h2>
        <div className="grid gap-1">
          {closed.map((d) => (
            <button key={d.id} onClick={() => ov.openDetail('client', d.client_id)} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
              <StatusBadge value={d.stage} /><span className="min-w-0 flex-1 truncate">{d.client_name} · {d.title}</span><span className="num whitespace-nowrap text-muted-foreground">{wan(d.amount)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function DealCard({ d, onOpen }: { d: CrmDeal; onOpen?: () => void }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border bg-card p-3 shadow-paper">
      <button className="block w-full min-w-0 text-left" onClick={onOpen}>
        <div className="truncate text-sm font-medium">{d.client_name}</div>
        <div className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{d.title}</div>
      </button>
      <MetaRow className="mt-2.5 justify-between">
        {d.estimated
          ? <span className="num text-[12px] text-muted-foreground" title={d.basis ?? undefined}>估 <span className="font-heading text-[15px] font-medium">{wan(d.amount)}</span></span>
          : <span className="num font-heading text-lg font-semibold text-foreground">{d.amount != null ? wan(d.amount) : '金额没定'}</span>}
        {d.expected_close && <span className="whitespace-nowrap">预计 {relDay(d.expected_close)}</span>}
      </MetaRow>
      {d.estimated ? <p className="mt-1.5 line-clamp-2 text-[12px] text-muted-foreground">{d.basis}</p> : null}
    </div>
  )
}
