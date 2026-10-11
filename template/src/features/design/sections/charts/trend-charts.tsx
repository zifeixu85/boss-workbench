// 看走势的图：折线、面积、迷你走势、散点
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, GRID_STROKE, UnitTip, n1 } from '@/components/chart-kit'
import { cn } from '@/lib/utils'
import { ChartCard } from './chart-card'
import { CUMULATIVE, MONTHLY, PROJECTS, SPARKS, YEAR_TARGET } from './data'

const DOT = { r: 3, fill: 'var(--card)', strokeWidth: 2 } as const
const ACTIVE_DOT = { r: 5, strokeWidth: 0 } as const
const wanTick = (v: number) => `${v}万`

const lineConfig = { signed: { label: '签约', color: 'var(--chart-1)' }, collected: { label: '回款', color: 'var(--chart-2)' } } satisfies ChartConfig

export function LineDemo() {
  return (
    <ChartCard kind="折线" question="签下的单，钱收回来了吗？" desc="近 12 个月签约和回款。2 月没记账，线在那里断开，提示框写“暂无”。"
      fit="看一段时间的走势、两三条线比高低。" unfit="类别之间比大小（用柱）；超过 4 条线（拆成小图）。">
      <ChartContainer config={lineConfig} className="aspect-auto h-[230px] w-full">
        <LineChart accessibilityLayer data={MONTHLY} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={44} tickFormatter={wanTick} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={lineConfig} unit=" 万" />} />
          <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
          <Line dataKey="signed" type="monotone" stroke="var(--color-signed)" strokeWidth={2} dot={DOT} activeDot={ACTIVE_DOT} />
          <Line dataKey="collected" type="monotone" stroke="var(--color-collected)" strokeWidth={2} dot={DOT} activeDot={ACTIVE_DOT} connectNulls={false} />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  )
}

const areaConfig = { total: { label: '累计签约', color: 'var(--chart-1)' } } satisfies ChartConfig

export function AreaDemo() {
  const last = CUMULATIVE.at(-1)?.total ?? 0
  return (
    <ChartCard kind="面积" question="今年累计签了多少，离目标还差多少？" desc={`累计 ${n1(last)} 万，虚线是全年目标 ${YEAR_TARGET} 万。面积只用 10% 的淡色。`}
      fit="一个量随时间累积（累计签约、累计回款）。" unfit="多个系列叠在一起（互相遮挡）；会上下波动的量（用折线）。">
      <ChartContainer config={areaConfig} className="aspect-auto h-[230px] w-full">
        <AreaChart accessibilityLayer data={CUMULATIVE} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} />
          <YAxis {...AXIS} width={48} tickFormatter={wanTick} domain={[0, YEAR_TARGET]} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={areaConfig} unit=" 万" />} />
          <ReferenceLine y={YEAR_TARGET} stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeOpacity={0.6} />
          <Area dataKey="total" type="monotone" stroke="var(--color-total)" strokeWidth={2} fill="var(--color-total)" fillOpacity={0.1} dot={false} activeDot={ACTIVE_DOT} />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  )
}

function Spark({ values, highlightLast }: { values: number[]; highlightLast?: boolean }) {
  const data = values.map((v, i) => ({ i, v }))
  const last = values.length - 1
  return (
    <ChartContainer config={{ v: { label: '数值', color: 'var(--chart-1)' } }} className="aspect-auto h-10 w-full">
      <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line dataKey="v" type="monotone" stroke="var(--muted-foreground)" strokeOpacity={0.55} strokeWidth={1.5} isAnimationActive={false}
          dot={(p) => (highlightLast && p.index === last ? <circle key={p.index} cx={p.cx} cy={p.cy} r={3.5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} /> : null)} />
      </LineChart>
    </ChartContainer>
  )
}

export function SparkDemo() {
  return (
    <ChartCard kind="迷你走势" question="最近是变好还是变差？" desc="指标卡里放一条没有坐标轴的小线，只看方向；最新一点用主图表色。"
      fit="指标卡、列表行里给数字配个走势。" unfit="要读具体数值（用正常的折线）；单独放成一张大图。">
      <div className="grid gap-3 sm:grid-cols-3">
        {SPARKS.map((s) => {
          const now = s.values.at(-1) ?? 0
          const prev = s.values.at(-2) ?? 0
          const d = Math.round((now - prev) * 10) / 10
          return (
            <div key={s.key} className="min-w-0 rounded-lg border bg-background/60 px-3 pt-2.5 pb-1.5">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[20px] leading-none font-semibold">{n1(now)}</span>
                <span className="text-xs text-muted-foreground">{s.unit}</span>
                <span className={cn('num ml-auto text-xs font-medium', d > 0 && 'text-rise', d < 0 && 'text-fall', d === 0 && 'text-muted-foreground')}>{d > 0 ? '▲' : d < 0 ? '▼' : '—'} {n1(Math.abs(d))}</span>
              </div>
              <Spark values={s.values} highlightLast />
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}

const scatterConfig = { p: { label: '订单', color: 'var(--chart-3)' } } satisfies ChartConfig

type Pt = (typeof PROJECTS)[number]

function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: Pt }[] }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{p.name}</div>
      <div className="text-muted-foreground">合同 <span className="num text-foreground">{n1(p.contract)} 万</span> · 毛利率 <span className="num text-foreground">{n1(p.margin)}%</span></div>
    </div>
  )
}

export function ScatterDemo() {
  return (
    <ChartCard kind="散点" question="大单是不是更赚钱？" desc="每个点是一张企业茶礼单子：横轴金额（万），纵轴毛利率。这批数据里，单子越大毛利率反而偏低。"
      fit="看两个数之间有没有关系，找离群的那几个。" unfit="点少于 8 个（直接列表）；要看时间走势。">
      <ChartContainer config={scatterConfig} className="aspect-auto h-[230px] w-full">
        <ScatterChart accessibilityLayer margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} />
          <XAxis type="number" dataKey="contract" name="合同额" {...AXIS} tickFormatter={wanTick} domain={[0, 60]} ticks={[0, 15, 30, 45, 60]} />
          <YAxis type="number" dataKey="margin" name="毛利率" {...AXIS} width={40} tickFormatter={(v: number) => `${v}%`} domain={[20, 45]} ticks={[20, 25, 30, 35, 40, 45]} />
          <ZAxis range={[70, 70]} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<ScatterTip />} />
          <Scatter data={PROJECTS} fill="var(--color-p)" stroke="var(--card)" strokeWidth={2} />
        </ScatterChart>
      </ChartContainer>
    </ChartCard>
  )
}
