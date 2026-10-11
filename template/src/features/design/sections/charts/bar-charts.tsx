// 比大小的图：柱状、分组柱、堆叠柱、横向条、漏斗
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, GRID_STROKE, LABEL_STYLE, RampBar, UnitTip, n1 } from '@/components/chart-kit'
import { ChartCard } from './chart-card'
import { BY_CATEGORY, FLOW, FUNNEL, MONTHLY, SOURCES } from './data'

const wanTick = (v: number) => `${v}万`

const barConfig = { newClients: { label: '新客户', color: 'var(--chart-1)' } } satisfies ChartConfig

export function BarDemo() {
  const total = MONTHLY.reduce((a, r) => a + r.newClients, 0)
  return (
    <ChartCard kind="柱状" question="每月来了几个新客户？" desc={`近 12 个月共 ${total} 个。只有一个系列：一种颜色，不加图例。`}
      fit="按月、按类别比数量。柱子从 0 开始。" unfit="给每根柱子换颜色；纵轴不从 0 开始（会夸大差别）。">
      <ChartContainer config={barConfig} className="aspect-auto h-[230px] w-full">
        <BarChart accessibilityLayer data={MONTHLY} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={28} allowDecimals={false} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={barConfig} unit=" 个" />} />
          <Bar dataKey="newClients" fill="var(--color-newClients)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

const flowConfig = { inflow: { label: '收入', color: 'var(--chart-1)' }, outflow: { label: '支出', color: 'var(--chart-2)' } } satisfies ChartConfig

export function GroupedDemo() {
  return (
    <ChartCard kind="分组柱" question="收进来的钱，够不够花？" desc="每月收入、支出并排。两个系列用 1、2 号色，一定带图例。"
      fit="同一时间点上 2–3 个量并排比较。" unfit="系列超过 3 个（太挤）；想看合计（用堆叠）。">
      <ChartContainer config={flowConfig} className="aspect-auto h-[230px] w-full">
        <BarChart accessibilityLayer data={FLOW} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={44} tickFormatter={wanTick} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={flowConfig} unit=" 万" />} />
          <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
          <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

const catConfig = {
  whole: { label: '白茶', color: 'var(--chart-1)' },
  cabinet: { label: '岩茶', color: 'var(--chart-2)' },
  closet: { label: '花草茶', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function StackedDemo() {
  return (
    <ChartCard kind="堆叠柱" question="每月成交里，哪类茶占得多？" desc="柱高是当月合计，每段之间留 2px 底色缝，不画描边。系列顺序在所有图里都一样。"
      fit="既看合计、又看组成；组成不超过 4 段。" unfit="要比较中间几段的大小（没有共同基线，看不准）。">
      <ChartContainer config={catConfig} className="aspect-auto h-[230px] w-full">
        <BarChart accessibilityLayer data={BY_CATEGORY} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={44} tickFormatter={wanTick} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={catConfig} unit=" 万" />} />
          <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
          <Bar dataKey="whole" stackId="c" fill="var(--color-whole)" maxBarSize={28} stroke="var(--card)" strokeWidth={2} />
          <Bar dataKey="cabinet" stackId="c" fill="var(--color-cabinet)" maxBarSize={28} stroke="var(--card)" strokeWidth={2} />
          <Bar dataKey="closet" stackId="c" fill="var(--color-closet)" maxBarSize={28} stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

const srcConfig = { amount: { label: '企业茶礼成交', color: 'var(--chart-1)' } } satisfies ChartConfig

export function HorizontalDemo() {
  return (
    <ChartCard kind="横向条" question="企业茶礼的客户从哪来？" desc="名字长、类别多时用横向条，从大到小排，条尾直接写数，不用纵轴刻度。"
      fit="排名、类别名字长（客户、渠道、产品）。" unfit="时间序列（时间应该从左往右）。">
      <ChartContainer config={srcConfig} className="aspect-auto h-[230px] w-full">
        <BarChart accessibilityLayer data={SOURCES} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="source" {...AXIS} width={76} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={srcConfig} unit=" 万" />} />
          <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} maxBarSize={20}>
            <LabelList dataKey="amount" position="right" offset={8} {...LABEL_STYLE} formatter={(v) => (typeof v === 'number' ? `${n1(v)} 万` : '')} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

const funnelConfig = { count: { label: '商机', color: 'var(--chart-1)' } } satisfies ChartConfig
const funnelData = FUNNEL.map((f) => ({ ...f, tag: `${f.count} 个 · ${f.amount} 万` }))

export function FunnelDemo() {
  return (
    <ChartCard kind="漏斗" question="生意卡在哪一步？" desc="横向条按阶段从上到下，越接近签约颜色越深（RampBar）。条长是商机个数，旁边写金额。"
      fit="有先后顺序的阶段：商机、转化。" unfit="阶段之间没有先后；用 5 种不同颜色给阶段上色。">
      <ChartContainer config={funnelConfig} className="aspect-auto h-[230px] w-full">
        <BarChart accessibilityLayer data={funnelData} layout="vertical" margin={{ top: 0, right: 96, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="stage" {...AXIS} width={64} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={funnelConfig} unit=" 个" />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={24} shape={RampBar}>
            <LabelList dataKey="tag" position="right" offset={8} {...LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
