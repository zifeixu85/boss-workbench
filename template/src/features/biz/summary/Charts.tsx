// 汇总页的两张图：这段时间每天各渠道成交（堆叠柱）、渠道占比（环形）。渠道颜色在所有图里固定。
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, ChartNote, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Panel } from '@/components/page'
import { md, shortDate, weekday } from '@/lib/format'
import { channelColor, dateTicks, LEGEND_CLASS, moneyAxis, p1, wan1, yuanText } from '../fmt'
import { TraceNum } from '../parts'
import { useBizOverlay } from '../state'
import type { Board } from '../types'

const SOURCE = '来源：4 个平台后台导出 + 门店日报'

function configOf(b: Board) {
  return Object.fromEntries(b.channels.map((c) => [c.id, { label: c.name, color: channelColor(c.id) }])) satisfies ChartConfig
}

/** 一句结论：谁最多；时间段里有国庆时才说国庆（按数据算哪个渠道涨得最多） */
function headline(b: Board) {
  const top = [...b.table].sort((p, q) => (q.gmv ?? 0) - (p.gmv ?? 0))[0]
  const parts = [`合计 ${wan1(b.total.gmv)} 万元`, top ? `${top.name}最多（${p1(top.share ?? 0)}%）` : '']
  if (b.range_holiday_days > 0) {
    // 国庆那几天比平常日子高了多少，挑涨得最多的渠道说
    const isHol = (d: string) => b.holidays.some((h) => d >= h.f && d <= h.t)
    const hol = b.stacked.filter((r) => isHol(r.date))
    const rest = b.stacked.filter((r) => !isHol(r.date))
    const lift = b.channels.map((c) => {
      const avg = (xs: typeof hol) => xs.reduce((a, r) => a + Number(r[c.id] ?? 0), 0) / (xs.length || 1)
      return { name: c.name, x: avg(rest) ? avg(hol) / avg(rest) - 1 : 0 }
    }).sort((p, q) => q.x - p.x)[0]
    if (lift && lift.x > 0.15) parts.push(`国庆那几天${lift.name}涨得最多（比平常日子高 ${Math.round(lift.x * 100)}%）`)
  }
  return parts.filter(Boolean).join('，')
}

export function StackedByChannel({ b }: { b: Board }) {
  const ov = useBizOverlay()
  const config = configOf(b)
  const data = b.stacked.map((r) => ({ ...r, label: md(r.date) }))
  const last = b.channels.at(-1)?.id
  const axis = moneyAxis(Math.max(...b.stacked.map((r) => b.channels.reduce((a, c) => a + Number(r[c.id] ?? 0), 0))))
  return (
    <Panel title={`近 ${b.days} 天，每天的钱从哪个渠道来？`} desc={headline(b)} className="flex h-full flex-col" bodyClass="flex-1 pt-4">
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full cursor-pointer md:h-[318px]">
        <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}
          onClick={(s) => { const row = data[Number(s?.activeIndex)]; if (row) ov.openTrace({ metric: 'gmv', from: row.date, to: row.date }) }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} ticks={dateTicks(data.map((x) => x.label))} interval={0} />
          <YAxis {...AXIS} width={44} ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.fmt} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={config} unit=" 元" labelFormatter={(_, p) => { const r = p?.[0]?.payload as { date?: string } | undefined; return r?.date ? `${shortDate(r.date)} ${weekday(r.date)}` : '' }} />} />
          <ChartLegend itemSorter={null} content={<ChartLegendContent className={LEGEND_CLASS} />} />
          {b.channels.map((c) => (
            <Bar key={c.id} dataKey={c.id} stackId="ch" fill={`var(--color-${c.id})`} maxBarSize={b.days > 14 ? 18 : 28} stroke="var(--card)" strokeWidth={1}
              radius={c.id === last ? [3, 3, 0, 0] : 0} />
          ))}
        </BarChart>
      </ChartContainer>
      <ChartNote>截至 {shortDate(b.to)} · {SOURCE} · 点柱子看那一天的明细</ChartNote>
    </Panel>
  )
}

export function ChannelShare({ b }: { b: Board }) {
  const config = configOf(b)
  const rows = b.table.map((t) => ({ key: t.id, name: t.name, value: t.gmv ?? 0, share: t.share, fill: `var(--color-${t.id})` }))
  const q = (channel?: string) => ({ metric: 'gmv' as const, channel, from: b.from, to: b.to })
  return (
    <Panel title="钱主要从哪来？" desc={`近 ${b.days} 天各渠道成交占比；企业茶礼另算，不在这里`} className="flex h-full flex-col" bodyClass="flex flex-1 flex-col justify-between pt-4">
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,170px)_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-[170px]">
          <ChartContainer config={config} className="aspect-square w-full">
            <PieChart>
              <ChartTooltip content={<UnitTip config={config} unit=" 元" nameKey="key" hideLabel />} />
              <Pie data={rows} dataKey="value" nameKey="key" innerRadius="64%" outerRadius="100%" stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false} />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="num text-[19px] leading-none font-semibold">{wan1(b.total.gmv)}<span className="ml-0.5 text-xs font-normal text-muted-foreground">万</span></span>
            <span className="mt-1 text-[11px] text-muted-foreground">近 {b.days} 天合计</span>
          </div>
        </div>
        <ul className="grid gap-2 text-[13px]">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: channelColor(r.key) }} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <TraceNum q={q(r.key)}>{yuanText(r.value)}</TraceNum>
              <span className="num w-12 text-right text-muted-foreground">{p1(r.share ?? 0)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <ChartNote>截至 {shortDate(b.to)} · {SOURCE}</ChartNote>
    </Panel>
  )
}
