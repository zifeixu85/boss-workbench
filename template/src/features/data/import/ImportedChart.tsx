// 完成页、导入记录抽屉的小图：这次导进来的每天成交额。标题是一个问题（按实际日期写）、副标题是结论；纵轴按 5,000 元一格；没导进来的天空着，不当 0。归属：数据源与导入模块
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, ChartNote, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { shortDate } from '@/lib/format'
import { mdOf } from '../labels'

const config = { gmv: { label: '成交额', color: 'var(--chart-1)' } } satisfies ChartConfig
const yuan = (n: number) => Math.round(n).toLocaleString('zh-CN')

export function ImportedChart({ series, channel, compact }: { series: { date: string; gmv: number | null }[]; channel: string; compact?: boolean }) {
  const rows = series.map((s) => ({ label: mdOf(s.date), gmv: s.gmv == null ? null : Math.round(s.gmv) }))
  const got = series.filter((s): s is { date: string; gmv: number } => s.gmv != null)
  const gaps = series.filter((s) => s.gmv == null).map((s) => shortDate(s.date))
  const max = Math.max(...got.map((s) => s.gmv), 0)
  const top = Math.max(5000, Math.ceil(max / 5000) * 5000)
  const ticks = Array.from({ length: top / 5000 + 1 }, (_, i) => i * 5000)
  const avg = got.length ? got.reduce((a, s) => a + s.gmv, 0) / got.length : 0
  const best = got.reduce<{ date: string; gmv: number } | null>((b, s) => (!b || s.gmv > b.gmv ? s : b), null)
  const first = series[0]?.date
  const last = series.at(-1)?.date
  return (
    <figure>
      {!compact && (
        <figcaption className="mb-2">
          <div className="text-[15px] font-semibold">{shortDate(first)}—{shortDate(last)}，{channel}每天卖了多少？</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">导进来 <span className="num">{got.length}</span> 天，日均 <span className="num">{yuan(avg)}</span> 元{best && <>，{shortDate(best.date)}最高（<span className="num">{yuan(best.gmv)}</span> 元）</>}{gaps.length ? `；${gaps.join('、')}没有数，空着` : ''}</div>
        </figcaption>
      )}
      <ChartContainer config={config} className={compact ? 'aspect-auto h-[150px] w-full' : 'aspect-auto h-[190px] w-full'}>
        <BarChart accessibilityLayer data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} minTickGap={14} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={58} domain={[0, top]} ticks={ticks} tickFormatter={(v: number) => v.toLocaleString('zh-CN')} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={config} unit=" 元" />} />
          <Bar dataKey="gmv" fill="var(--color-gmv)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>
      <ChartNote>单位：元 · {compact ? `日均 ${yuan(avg)} 元 · ` : ''}截至 {shortDate(last)} · 来源：这次导入的文件（{channel}）{compact && gaps.length ? ` · ${gaps.join('、')}没有数` : ''}</ChartNote>
    </figure>
  )
}
