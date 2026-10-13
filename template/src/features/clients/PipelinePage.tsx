// 跟进看板：客户按阶段分列（5 组），拖动卡片换阶段——松手后要写一句原因，留下新旧值和时间；卡片上不放改阶段的下拉。
// 第二个视图“按商机”是原来的商机看板。归属：大客户模块
// 第二轮：卡片不再被列宽裁掉；列头固定两行；手机上一次看一列，列名做成页签。
// 第三轮（产品评审 #2 #4 #5 #23）：列最小宽 220（侧栏展开时 1440 宽 5 列刚好放下，不再出横滑遮罩）；
//   卡片第一行只放名字，等级章、联系人、具体阶段挪到第二行；每列一个带名字的主数，列头合计同一个口径；
//   手机上“按客户阶段 / 按商机”收进页头右边的小下拉，阶段页签右边有渐隐，提示还能往右滑。
// 第四轮：待复购只有按上次的单估过的写“估”，列头合计和客户列表顶上“按去年估的复购约 10.8 万”是同一个数；没估过的写“上次 X 万”、不算进合计。
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Columns3, Handshake, History } from 'lucide-react'
import { useApi } from '@/lib/api'
import { relDay, shortDate, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { useIsMobile } from '@/hooks/use-mobile'
import { PageHeader, PageBody, Panel, SubTabs } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { Skeleton } from '@/components/ui/skeleton'
import { ViewTabs } from '@/components/view-tabs'
import { Choice } from '@/components/form'
import { Board, BoardColumn, MetaRow } from '@/components/data-view'
import { DndBoard, DragCard, DropColumn } from '@/components/dnd-board'
import { Failed } from '@/components/chart-kit'
import { FlagChips, LevelMark, yuanToWan } from '@/features/crm/parts'
import { StageDialog, type StageTarget } from '@/features/crm/dialogs'
import { BOARD_COLUMNS, BOARD_MIN_COL, PARKED, toLocal } from '@/features/crm/rules'
import type { ClientRow, Edit } from '@/features/crm/types'
import { cn } from '@/lib/utils'
import { CLIENT_TABS } from './ClientsPage'
import { DealsBoard } from './DealsBoard'
import { ColumnHead, FadeScroll } from './ColumnHead'

const VIEWS = [{ value: 'stage', label: '按客户阶段' }, { value: 'deals', label: '按商机' }] as const

export default function PipelinePage() {
  const [sp, setSp] = useSearchParams()
  const mobile = useIsMobile()
  const view = sp.get('view') === 'deals' ? 'deals' : 'stage'
  const setView = (v: string) => setSp((p) => { const n = new URLSearchParams(p); n.delete('col'); if (v === 'stage') n.delete('view'); else n.set('view', v); return n }, { replace: true })
  return (
    <>
      <PageHeader eyebrow="客户" title="跟进看板"
        desc={view === 'stage' ? '客户按阶段从左往右排，越往右越接近成交、复购。拖动卡片换阶段，松手后写一句原因；对方说“考虑一下”不算往前走。' : '一位客户可以有几个商机（中秋礼、春节礼），这里按商机看卡在哪一步；拖到右边一列就是推进一个阶段。'}
        actions={mobile ? <div className="w-32"><Choice value={view} onChange={(v) => setView(v ?? 'stage')} options={VIEWS} /></div> : undefined}>
        <SubTabs items={CLIENT_TABS} />
      </PageHeader>
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {!mobile && <ViewTabs value={view} onChange={setView} items={[{ value: 'stage', label: '按客户阶段', icon: Columns3 }, { value: 'deals', label: '按商机', icon: Handshake }]} className="justify-self-start" />}
        {view === 'stage' ? <StageBoard /> : <DealsBoard />}
      </PageBody>
    </>
  )
}

type ColKey = (typeof BOARD_COLUMNS)[number]['key']

/** 每列一个主数，卡片和列头同一个口径（第三轮修产品评审 #5） */
function mainNumber(col: ColKey, c: ClientRow): { label: string; wan: number | null; muted?: boolean; title?: string } {
  if (col === 'lead' || col === 'deal') return c.open_amount ? { label: '在谈', wan: c.open_amount } : { label: '在谈', wan: null, muted: true }
  if (col === 'after') return { label: '这单', wan: c.pending_orders ? yuanToWan(c.pending_orders) : c.last_order_amount ? yuanToWan(c.last_order_amount) : null }
  if (col === 'repeat') {
    // 只有按上次的单估过复购的才写“估”，和客户列表顶上“按去年估的复购约 10.8 万”同一个数；没估过的写上次买了多少，不算进列头合计
    if (c.est_amount) return { label: '估', wan: c.est_amount, muted: true, title: c.est_basis ?? '按上次的单估的，还没开口谈' }
    return { label: '上次', wan: c.last_order_amount ? yuanToWan(c.last_order_amount) : null, muted: true, title: '上次买了多少；还没按它估复购' }
  }
  return { label: '今年', wan: c.spent_year ? yuanToWan(c.spent_year) : 0 }
}
const COL_SUM_LABEL: Record<ColKey, string> = { lead: '在谈', deal: '在谈', after: '这单', repeat: '估', keep: '今年' }

function StageBoard() {
  const ov = useOverlay()
  const mobile = useIsMobile()
  const [sp, setSp] = useSearchParams()
  const { data = [], isLoading, error, refetch } = useApi<ClientRow[]>('/crm/clients')
  const edits = useApi<Edit[]>('/crm/stage-edits')
  const [target, setTarget] = useState<StageTarget | null>(null)
  if (error) return <Failed message={error.message} onRetry={() => refetch()} />
  if (isLoading) return <Skeleton className="h-[480px]" />
  const clients = data.filter((c) => c.kind === '客户')
  const onMove = (id: string, col: string) => {
    const c = clients.find((x) => x.id === id)
    if (!c) return
    const column = BOARD_COLUMNS.find((b) => b.key === col)
    const stages: readonly string[] = column ? column.stages : [col]
    if (stages.includes(c.stage)) return
    setTarget({ id: c.id, name: c.name, from: c.stage, options: stages, to: stages.length === 1 ? stages[0] : undefined })
  }
  const parked = clients.filter((c) => (PARKED as readonly string[]).includes(c.stage))
  const columns = BOARD_COLUMNS.map((col) => ({
    col, xs: clients.filter((c) => (col.stages as readonly string[]).includes(c.stage))
      .sort((a, b) => b.key_account - a.key_account || (a.next_follow ?? '9999').localeCompare(b.next_follow ?? '9999')),
  }))
  const head = (x: (typeof columns)[number]) => {
    const total = Math.round(x.xs.reduce((a, c) => { const n = mainNumber(x.col.key, c); return a + (n.label === COL_SUM_LABEL[x.col.key] ? n.wan ?? 0 : 0) }, 0) * 100) / 100
    return <ColumnHead label={x.col.label} count={x.xs.length} amount={total ? `${COL_SUM_LABEL[x.col.key]} ${wan(total)}` : undefined} hint={x.col.hint} />
  }

  // 手机：列名做成页签（横滑，右边渐隐），一次看一列；改阶段点开卡片在抽屉里改
  if (mobile) {
    const cur = BOARD_COLUMNS.find((b) => b.key === sp.get('col'))?.key ?? 'deal'
    const x = columns.find((c) => c.col.key === cur)!
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <FadeScroll>
          <ViewTabs label="看哪一列" value={cur} onChange={(v) => setSp((p) => { const n = new URLSearchParams(p); n.set('col', v); return n }, { replace: true })}
            items={columns.map((c) => ({ value: c.col.key, label: c.col.label, count: c.xs.length }))} />
        </FadeScroll>
        <div className="rounded-xl border bg-surface-2/60">
          <div className="border-b px-3 py-2.5">{head(x)}</div>
          <div className="grid gap-2 p-2">
            {x.xs.map((c) => <FollowCard key={c.id} c={c} col={x.col.key} onOpen={() => ov.openDetail('client', c.id)} showStage={x.col.stages.length > 1} />)}
            {!x.xs.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">这一列现在没有客户</p>}
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">手机上不拖动：点开客户，在抽屉里点“改阶段”，写一句原因。暂停、流失的 {parked.length} 位在客户列表的“范围”里看。</p>
      </div>
    )
  }

  return (
    <>
      <DndBoard onMove={onMove} renderOverlay={(id) => { const c = clients.find((x) => x.id === id); const col = columns.find((k) => k.xs.some((y) => y.id === id))?.col.key ?? 'deal'; return c ? <div className="w-[230px]"><FollowCard c={c} col={col} /></div> : null }}>
        <Board minCol={BOARD_MIN_COL}>
          {columns.map((x) => (
            <DropColumn key={x.col.key} id={x.col.key}>
              {(over) => (
                <BoardColumn highlight={over} title={head(x)}>
                  {x.xs.map((c) => <DragCard key={c.id} id={c.id} column={x.col.key} className="w-full min-w-0"><FollowCard c={c} col={x.col.key} onOpen={() => ov.openDetail('client', c.id)} showStage={x.col.stages.length > 1} /></DragCard>)}
                  {!x.xs.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">拖到这里</div>}
                </BoardColumn>
              )}
            </DropColumn>
          ))}
        </Board>
        <div className="grid gap-3 sm:grid-cols-2">
          {PARKED.map((stage) => {
            const xs = parked.filter((c) => c.stage === stage)
            return (
              <DropColumn key={stage} id={stage}>
                {(over) => (
                  <div className={cn('flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm transition-colors', over ? 'border-primary bg-accent' : 'text-muted-foreground')}>
                    <span>拖到这里：<StatusBadge value={stage} /></span>
                    {xs.map((c) => <DragCard key={c.id} id={c.id} column={stage}><button onClick={() => ov.openDetail('client', c.id)} className="rounded-md border bg-card px-2 py-0.5 text-xs text-foreground">{c.name}</button></DragCard>)}
                  </div>
                )}
              </DropColumn>
            )
          })}
        </div>
      </DndBoard>
      <Panel title={<span className="flex items-center gap-1.5"><History className="size-4 text-muted-foreground" />最近改阶段</span>} desc="每次改阶段都留着：从哪到哪、为什么、哪天改的" bodyClass="p-2">
        {edits.data?.length ? (
          <ol className="grid">
            {edits.data.map((e) => (
              <li key={e.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/50 sm:grid-cols-[72px_140px_minmax(0,auto)_minmax(0,1fr)] sm:items-center">
                <span className="num whitespace-nowrap text-muted-foreground">{shortDate(toLocal(e.at))}</span>
                <button className="truncate text-left font-medium hover:text-primary" onClick={() => ov.openDetail('client', e.client_id)}>{e.client_name}</button>
                <span className="col-start-2 flex items-center gap-1.5 sm:col-start-auto"><StatusBadge value={e.old_value ?? '—'} />→<StatusBadge value={e.new_value ?? '—'} /></span>
                <span className="col-start-2 text-muted-foreground sm:col-start-auto">{e.reason}</span>
              </li>
            ))}
          </ol>
        ) : <p className="px-3 py-4 text-sm text-muted-foreground">还没改过阶段。</p>}
      </Panel>
      {target && <StageDialog target={target} onClose={() => setTarget(null)} />}
    </>
  )
}

/** 看板卡片：第一行名字；第二行等级章、联系人、具体阶段；主数（这一列统一的口径）和下次跟进。只能拖动或点开抽屉改，卡片上不放下拉 */
function FollowCard({ c, col, onOpen, showStage }: { c: ClientRow; col: ColKey; onOpen?: () => void; showStage?: boolean }) {
  const late = (c.follow_overdue ?? -1) > 0
  const n = mainNumber(col, c)
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border bg-card p-3 shadow-paper">
      <button className="block w-full min-w-0 text-left" onClick={onOpen}>
        <div className="truncate text-[14px] font-medium" title={c.name}>{c.name}</div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {c.kind === '客户' && <LevelMark level={c.level} className="h-[18px] px-1 text-[12px]" />}
          <span className="min-w-0 truncate">{c.contact_name ?? c.label}{showStage && <span className="text-muted-foreground/80"> · {c.stage}</span>}</span>
        </div>
      </button>
      <MetaRow className="mt-2.5 justify-between">
        <span className={cn('num text-[12px] whitespace-nowrap', n.muted ? 'text-muted-foreground' : 'text-foreground')} title={n.title}>
          {n.label}{' '}
          <span className={cn('font-heading text-[15px] font-semibold', n.muted && 'font-medium')}>{n.wan ? wan(n.wan) : n.label === '在谈' ? '金额没定' : '—'}</span>
        </span>
        <span className={cn('num whitespace-nowrap', late && 'font-medium text-danger')}>下次 {c.next_follow ? relDay(c.next_follow) : '未定'}</span>
      </MetaRow>
      {c.flags.length > 0 && <FlagChips flags={c.flags} className="mt-2" />}
    </div>
  )
}
