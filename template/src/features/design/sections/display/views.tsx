// 表格、卡片、看板三种展示，用同一批示例客户
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
import { relDay, shortDate, wan, daysFromToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Board, BoardColumn, MetaRow, StickyTable } from '@/components/data-view'
import { StatusBadge } from '@/components/status'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BOARD_STAGES, CLIENTS, type SampleClient } from './data'

const open = (c: SampleClient) => toast(`实际页面会在右侧抽屉打开「${c.name}」`, { description: '地址栏加上 ?client=…' })

function FollowDate({ date }: { date: string }) {
  const late = daysFromToday(date) < 0
  return <span className={cn('num', late ? 'font-medium text-danger' : 'text-muted-foreground')}>{relDay(date)}</span>
}

export function TableView() {
  return (
    <StickyTable maxHeight="340px">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[120px]">客户</TableHead>
          <TableHead>阶段</TableHead>
          <TableHead className="text-right">预算</TableHead>
          <TableHead>下次跟进</TableHead>
          <TableHead>最近联系</TableHead>
          <TableHead>来源</TableHead>
          <TableHead>城市</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {CLIENTS.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <button type="button" onClick={() => open(c)} className="rounded-sm text-left font-medium outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{c.name}</button>
              <span className="ml-1.5 text-xs text-muted-foreground">{c.label}</span>
            </TableCell>
            <TableCell><StatusBadge value={c.stage} /></TableCell>
            <TableCell className="num text-right">{wan(c.budget)}</TableCell>
            <TableCell><FollowDate date={c.next} /></TableCell>
            <TableCell className="num text-muted-foreground">{shortDate(c.last)}</TableCell>
            <TableCell className="text-muted-foreground">{c.source}</TableCell>
            <TableCell className="text-muted-foreground">{c.city}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </StickyTable>
  )
}

export function ClientCard({ c, compact }: { c: SampleClient; compact?: boolean }) {
  return (
    <button type="button" onClick={() => open(c)} className="group min-w-0 rounded-xl border bg-card p-3.5 text-left shadow-paper transition-[border-color,box-shadow] outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{c.label}</span>
        </span>
        {!compact && <StatusBadge value={c.stage} />}
      </div>
      {!compact && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{c.note}</p>}
      <MetaRow className="mt-2.5">
        <span className="num font-medium text-foreground">{wan(c.budget)}</span>
        <span>跟进 <FollowDate date={c.next} /></span>
        {!compact && <span className="ml-auto inline-flex items-center gap-0.5"><MapPin className="size-3" />{c.city}</span>}
      </MetaRow>
    </button>
  )
}

export function CardsView() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {CLIENTS.slice(0, 6).map((c) => <ClientCard key={c.id} c={c} />)}
    </div>
  )
}

export function BoardView() {
  return (
    <Board minCol={200}>
      {BOARD_STAGES.map((s) => {
        const xs = CLIENTS.filter((c) => c.stage === s)
        const sum = xs.reduce((a, c) => a + (c.budget ?? 0), 0)
        return (
          <BoardColumn key={s} title={<StatusBadge value={s} />} meta={`${xs.length} 个 · ${wan(Math.round(sum * 10) / 10)}`} className="max-h-[360px]">
            {xs.map((c) => <ClientCard key={c.id} c={c} compact />)}
            {!xs.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">空</div>}
          </BoardColumn>
        )
      })}
    </Board>
  )
}
