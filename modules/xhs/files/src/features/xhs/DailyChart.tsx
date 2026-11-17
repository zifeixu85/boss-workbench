// 单篇：发布后每天的累计阅读（自然 / 投流两条线）。归属：小红书内容模块。
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, GRID_STROKE, UnitTip, ChartNote } from '@/components/chart-kit'
import type { DailyRow } from './types'

const config = {
  organic_reads: { label: '自然阅读', color: 'var(--chart-1)' },
  paid_reads: { label: '投流阅读', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** 刻度取整：0 / 1,000 / 2,000 … 这种 */
function niceTicks(max: number) {
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

export function DailyChart({ series, boosted }: { series: DailyRow[]; boosted: boolean }) {
  const rows = series.map((r) => ({ ...r, label: `第${r.day}天` }))
  const ticks = niceTicks(Math.max(1, ...series.flatMap((r) => [r.organic_reads ?? 0, r.paid_reads ?? 0])))
  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-[200px] w-full">
        <LineChart accessibilityLayer data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={44} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000) / 10}万` : v.toLocaleString('zh-CN'))} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={config} unit="" />} />
          {boosted && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
          <Line dataKey="organic_reads" type="monotone" stroke="var(--color-organic_reads)" strokeWidth={2} dot={false} />
          {boosted && <Line dataKey="paid_reads" type="monotone" stroke="var(--color-paid_reads)" strokeWidth={2} dot={false} connectNulls={false} />}
        </LineChart>
      </ChartContainer>
      <ChartNote>累计数，第 1 天 = 发布当天；超过 30 天的只记到第 30 天 · 来源：小红书专业号笔记数据（导入）</ChartNote>
    </>
  )
}
