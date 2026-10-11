// 渠道页的两张走势：每天成交（柱）、每天订单（线），各一张、各一根纵轴，都用这个渠道自己的颜色。点柱子看那一天的明细。
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis, type BarShapeProps } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, ChartNote, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Panel } from '@/components/page'
import { md, shortDate, thousands } from '@/lib/format'
import { channelColor, dateTicks, dayLabel, moneyAxis, numAxis, yuanText } from '../fmt'
import { Delta } from '../parts'
import { useBizOverlay } from '../state'
import type { ChannelData } from '../types'

const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00`).getDay())

/** “比前 14 天 ▼3%”；上一段含国庆时补一句 */
function vsPrev(d: ChannelData) {
  if (d.range.vs_prev_period === null) return null
  return <>；比前 {d.days} 天 <Delta value={d.range.vs_prev_period} />{d.prev_holiday_days > 0 ? `（前 ${d.days} 天含国庆，偏高）` : ''}</>
}

export function GmvChart({ d, source }: { d: ChannelData; source: string }) {
  const ov = useBizOverlay()
  const config = { gmv: { label: '成交额', color: channelColor(d.channel.id) } } satisfies ChartConfig
  const data = d.daily.map((x) => ({ ...x, label: md(x.date) }))
  const avg = d.range.gmv !== null ? Math.round(d.range.gmv / d.days) : null
  const axis = moneyAxis(Math.max(...data.map((x) => x.gmv ?? 0)))
  return (
    <Panel title="每天卖了多少？" desc={<>近 {d.days} 天 {yuanText(d.range.gmv)}，日均 {yuanText(avg)}{vsPrev(d)}</>}>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full cursor-pointer">
        <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}
          onClick={(s) => { const r = data[Number(s?.activeIndex)]; if (r) ov.openTrace({ metric: 'gmv', channel: d.channel.id, from: r.date, to: r.date }) }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} ticks={dateTicks(data.map((x) => x.label))} interval={0} />
          <YAxis {...AXIS} width={44} ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.fmt} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={config} unit=" 元" labelFormatter={dayLabel} />} />
          {avg !== null && <ReferenceLine y={avg} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />}
          <Bar dataKey="gmv" fill="var(--color-gmv)" radius={[4, 4, 0, 0]} maxBarSize={d.days > 14 ? 16 : 26}
            shape={(p: BarShapeProps) => (
              <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, Number(p.height) || 0)} rx={3} fill="var(--color-gmv)" fillOpacity={isWeekend(data[p.index]?.date ?? '') ? 0.6 : 1} />
            )} />
        </BarChart>
      </ChartContainer>
      <ChartNote>浅一点的柱子是周末 · 虚线是日均 · 单位：{axis.unit} · 截至 {shortDate(d.to)} · 来源：{source} · 点柱子看那一天的明细</ChartNote>
    </Panel>
  )
}

export function OrdersChart({ d, source }: { d: ChannelData; source: string }) {
  const config = { orders: { label: '订单', color: channelColor(d.channel.id) } } satisfies ChartConfig
  const data = d.daily.map((x) => ({ ...x, label: md(x.date) }))
  const store = d.channel.id === 'store'
  const axis = numAxis(Math.max(...data.map((x) => x.orders ?? 0)))
  return (
    <Panel title="每天多少单？" desc={<>近 {d.days} 天 {thousands(d.range.orders)} 单，日均 {d.range.orders !== null ? Math.round(d.range.orders / d.days) : '—'} 单，客单价 {d.range.aov !== null ? Math.round(d.range.aov) : '—'} 元</>}>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
        <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} ticks={dateTicks(data.map((x) => x.label))} interval={0} />
          <YAxis {...AXIS} width={36} ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.fmt} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={config} unit=" 单" labelFormatter={dayLabel} />} />
          <Line dataKey="orders" type="monotone" stroke="var(--color-orders)" strokeWidth={2} connectNulls={false} dot={{ r: 2, fill: 'var(--color-orders)', strokeWidth: 0 }} />
        </LineChart>
      </ChartContainer>
      <ChartNote>{d.channel.id === 'tmall' ? '天猫导的是“支付子订单数”，一单买两样算两单 · ' : ''}{store ? '门店是宋姐日报里的“当天单数” · ' : ''}截至 {shortDate(d.to)} · 来源：{source}</ChartNote>
    </Panel>
  )
}
