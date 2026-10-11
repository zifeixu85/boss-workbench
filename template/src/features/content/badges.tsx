// 内容中心的小标签：一篇的状态（已选空心、已发布弱化）、流量（自然 / 投流用图表的 1、2 号色小点，不借状态色）、示例标记。归属：小红书内容模块。
import { StatusBadge } from '@/components/status'
import { cn } from '@/lib/utils'
import { STATUS_CLASS, STATUS_TONE } from './lib'
import type { PieceStatus } from './types'

export function StatusTag({ s, className }: { s: PieceStatus; className?: string }) {
  return <StatusBadge value={s} tone={STATUS_TONE[s]} className={cn(STATUS_CLASS[s], className)} />
}

/** 流量：自然 / 投了 N 元 / 暂无数据。中性底，前面一个小色点（和数据页的图同色） */
export function TrafficTag({ boosted, spend, none, className }: { boosted: boolean; spend?: number | null; none?: boolean; className?: string }) {
  if (none) return <span className={cn('inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[11.5px] text-muted-foreground', className)}>暂无数据</span>
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-md border bg-card px-1.5 text-[11.5px] whitespace-nowrap text-foreground/80', className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', boosted ? 'bg-chart-2' : 'bg-chart-1')} />
      {boosted ? `投了 ${Math.round(spend ?? 0)} 元` : '自然'}
    </span>
  )
}

/** 预先写好的示例数据：灰色小标签 */
export function ExampleTag({ text = '示例 · 预先写好', className }: { text?: string; className?: string }) {
  return <span className={cn('inline-flex h-[18px] shrink-0 items-center rounded bg-muted px-1.5 text-[11px] font-normal text-muted-foreground', className)}>{text}</span>
}
