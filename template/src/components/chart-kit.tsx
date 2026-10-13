// 图表积木：所有模块的图表共用。规则见 README“产品规范”：一张图一个纵轴、系列色固定顺序、空值写“暂无”、图下写截至日期和来源
import type { ComponentProps, ReactNode } from 'react'
import { Rectangle, type BarShapeProps } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** 坐标轴：不画刻度线和轴线，让数据本身说话 */
export const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const
export const GRID_STROKE = 'var(--border)'
export const LABEL_STYLE = { fill: 'var(--foreground)', fontSize: 12 } as const
export const CURSOR = { fill: 'var(--muted)', opacity: 0.5 } as const

/** 一位小数，整数不带 .0；10 以下保留到两位、去掉末尾的 0（0.54 不再显示成 0.5，E5 修 #2） */
export const n1 = (n: number) => (Number.isInteger(n) ? String(n) : Math.abs(n) < 10 ? String(Math.round(n * 100) / 100) : n.toFixed(1))
export const round1 = (n: number) => Math.round(n * 10) / 10
export const monthName = (m: string) => `${Number(m.slice(5, 7))} 月`
export const monthFull = (m: string) => `${m.slice(0, 4)} 年 ${Number(m.slice(5, 7))} 月`
/** 横轴月份：第一个月和每年 1 月带上年份，其余只写月 */
export const monthTick = (m: string, i: number) => {
  const mm = Number(m.slice(5, 7))
  return i === 0 || mm === 1 ? `${m.slice(2, 4)}年${mm}月` : `${mm}月`
}

/** 同一种颜色由浅到深：用于有先后顺序的分组（账龄、漏斗阶段） */
const RAMP = [0.34, 0.5, 0.66, 0.83, 1]
export function RampBar(p: BarShapeProps) {
  return <Rectangle x={p.x} y={p.y} width={p.width} height={p.height} radius={p.radius} fill={p.fill} fillOpacity={RAMP[Math.min(p.index, RAMP.length - 1)]} />
}

/** 提示框：数值后面带单位，空值写“暂无”；数据里有 month 字段时标题写完整年月 */
type TipProps = ComponentProps<typeof ChartTooltipContent> & { config: ChartConfig; unit: string }
export function UnitTip({ config, unit, ...props }: TipProps) {
  return (
    <ChartTooltipContent
      labelFormatter={(label, payload) => {
        const m = (payload?.[0]?.payload as { month?: string } | undefined)?.month
        return m && /^\d{4}-\d{2}$/.test(m) ? monthFull(m) : String(label ?? '')
      }}
      {...props}
      formatter={(value, name, item) => (
        <div className="flex w-full items-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
          <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
          <span className="num ml-auto pl-3 font-medium text-foreground">{value == null ? '暂无' : `${value}${unit}`}</span>
        </div>
      )}
    />
  )
}

export function ChartNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{children}</p>
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
}

export function Loading() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  )
}

export function Failed({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
      <p className="text-sm">数据没取到{message ? `：${message}` : ''}</p>
      <p className="text-xs text-muted-foreground">确认本地服务开着，再点一次重试。</p>
      <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw />重试</Button>
    </div>
  )
}
