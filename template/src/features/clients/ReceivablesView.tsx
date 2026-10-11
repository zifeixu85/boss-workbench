// 应收款：按状态切换的明细表（表头吸顶、合计行吸底）。筛选条件放在地址栏（?status=逾期），可以直接分享这个视图
import type { KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { PageBody } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { StickyTable } from '@/components/data-view'
import { ViewTabs } from '@/components/view-tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useOverlay } from '@/app/overlay'
import { useApi } from '@/lib/api'
import type { Receivable } from '@/lib/types'
import { relDay, shortDate, wan } from '@/lib/format'
import { EmptyNote, Failed, n1 } from '@/components/chart-kit'

const FILTERS = ['全部', '逾期', '7天内到期', '部分收款', '未到期', '已收清'] as const
type Filter = (typeof FILTERS)[number]
const isFilter = (v: string | null): v is Filter => v !== null && (FILTERS as readonly string[]).includes(v)

/** 没收清的排前面，按到期日从早到晚；收清的放最后 */
const byUrgency = (a: Receivable, b: Receivable) =>
  Number(a.status === '已收清') - Number(b.status === '已收清') || a.due.localeCompare(b.due)

/** 到期日下面的小字：收清写哪天收清；没到期写“4 天后”；逾期天数已在状态列，不重复 */
function dueHint(r: Receivable) {
  if (r.status === '已收清') return r.received_date ? `${shortDate(r.received_date)}收清` : null
  if (r.status === '逾期') return null
  const rel = relDay(r.due)
  return rel === shortDate(r.due) ? null : rel
}

// 合计到两位小数，和今日页、接口一致（3.09 万、0.85 万；第二轮修 #9，原来一位小数显示成 3.1、0.9）
const sumOf = (rs: Receivable[], k: 'amount' | 'received' | 'outstanding') => Math.round(rs.reduce((a, r) => a + r[k], 0) * 100) / 100

export function ReceivablesView() {
  const { data, isError, error, refetch } = useApi<Receivable[]>('/receivables')
  const [sp, setSp] = useSearchParams()
  const raw = sp.get('status')
  const filter: Filter = isFilter(raw) ? raw : '全部'
  const setFilter = (v: Filter) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      if (v === '全部') n.delete('status')
      else n.set('status', v)
      return n
    }, { replace: true })
  }

  if (isError) return <PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody>
  if (!data) return <PageBody className="grid gap-3"><Skeleton className="h-9 w-96 max-w-full" /><Skeleton className="h-80" /></PageBody>

  const open = data.filter((r) => r.status !== '已收清')
  const overdue = data.filter((r) => r.status === '逾期')
  const rows = (filter === '全部' ? data : data.filter((r) => r.status === filter)).slice().sort(byUrgency)
  const count = (f: Filter) => (f === '全部' ? data.length : data.filter((r) => r.status === f).length)

  return (
    <PageBody className="grid gap-4">
      <p className="text-sm">
        合计未收 <b className="num font-semibold">{wan(sumOf(open, 'outstanding'))}</b>（{open.length} 笔）
        {overdue.length > 0 ? (
          <>，其中逾期 <b className="num font-semibold text-danger">{wan(sumOf(overdue, 'outstanding'))}</b>（{overdue.length} 笔），先催这几笔。</>
        ) : '，没有逾期的。'}
      </p>

      {/* 手机上 6 个状态一行放不下：只让这一行横向滑动，页面本身不横向溢出 */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <ViewTabs label="按状态筛选" value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ value: f, label: f, count: count(f) }))} />
      </div>

      {!data.length ? (
        <EmptyNote>还没有登记应收款。签单时把定金、尾款，渠道的月结货款记下来，到期前这里会提醒你。</EmptyNote>
      ) : !rows.length ? (
        <EmptyNote>「{filter}」下面没有应收款，换个状态看看。</EmptyNote>
      ) : (
        <ReceivableTable rows={rows} />
      )}
    </PageBody>
  )
}

function ReceivableTable({ rows }: { rows: Receivable[] }) {
  const ov = useOverlay()
  const openRow = (r: Receivable) => {
    if (r.project_id) ov.openDetail('project', r.project_id)
    else if (r.client_id) ov.openDetail('client', r.client_id)
  }
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, r: Receivable) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      openRow(r)
    }
  }
  return (
    <StickyTable className="min-w-0">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">客户</TableHead>
          <TableHead>说明</TableHead>
          <TableHead>节点</TableHead>
          <TableHead className="text-right">金额（万）</TableHead>
          <TableHead className="text-right">已收</TableHead>
          <TableHead className="text-right">未收</TableHead>
          <TableHead>到期</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="pr-4 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} tabIndex={0} className="cursor-pointer" onClick={() => openRow(r)} onKeyDown={(e) => onKey(e, r)}>
            <TableCell className="pl-4 font-medium">{r.client_name ?? '—'}</TableCell>
            <TableCell className="max-w-[220px] truncate text-muted-foreground">{r.note ?? r.project_name ?? '—'}</TableCell>
            <TableCell>{r.milestone}</TableCell>
            <TableCell className="num text-right">{n1(r.amount)}</TableCell>
            <TableCell className="num text-right text-muted-foreground">{r.received > 0 ? n1(r.received) : '—'}</TableCell>
            <TableCell className="num text-right font-semibold">{r.outstanding > 0 ? n1(r.outstanding) : '—'}</TableCell>
            <TableCell>
              <div className="num">{shortDate(r.due)}</div>
              <div className="text-xs text-muted-foreground">{dueHint(r)}</div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <StatusBadge value={r.status} />
                {r.status === '逾期' && <span className="num text-xs text-danger">{r.overdue_days} 天</span>}
              </div>
            </TableCell>
            <TableCell className="pr-4 text-right">
              {r.status !== '已收清' && (
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); ov.openNew('collect', { for: r.id }) }}>
                  登记回款
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="sticky bottom-0 z-10 border-t-0 bg-surface-2 shadow-[0_-1px_0_var(--border)]">
        <TableRow className="hover:bg-transparent">
          <TableCell className="pl-4" colSpan={3}>合计 {rows.length} 笔</TableCell>
          <TableCell className="num text-right">{n1(sumOf(rows, 'amount'))}</TableCell>
          <TableCell className="num text-right">{n1(sumOf(rows, 'received'))}</TableCell>
          <TableCell className="num text-right">{n1(sumOf(rows, 'outstanding'))}</TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      </TableFooter>
    </StickyTable>
  )
}
