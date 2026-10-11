// 8. 图表：先列规则，再按“它回答什么问题”摆出常用的 12 种
import { Code, Rules, Section, Sub } from '../../parts'
import { BarDemo, FunnelDemo, GroupedDemo, HorizontalDemo, StackedDemo } from './bar-charts'
import { DonutDemo, HeatmapDemo, RadialDemo } from './part-charts'
import { AreaDemo, LineDemo, ScatterDemo, SparkDemo } from './trend-charts'

const PICK: [string, string][] = [
  ['随时间怎么变？', '折线、面积、迷你走势'],
  ['谁大谁小？', '柱状、横向条、分组柱'],
  ['由哪几块组成？', '堆叠柱、环形（≤6 块）'],
  ['卡在哪一步？', '漏斗（同色由浅到深）'],
  ['完成多少了？', '进度环、指标卡'],
  ['哪天勤、哪天断？', '热力日历'],
  ['两个数有没有关系？', '散点'],
]

export function ChartsSection() {
  return (
    <Section title="图表" desc="图表用 shadcn 的 ChartContainer（底下是 Recharts）加 chart-kit.tsx 的积木。每张图先想清楚它回答哪个问题，标题就写这个问题，副标题写结论。">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-paper">
          <div className="border-b px-5 pt-4 pb-3 text-[15px] font-semibold">按问题选图</div>
          <ul className="divide-y text-[13px]">
            {PICK.map(([q, a]) => (
              <li key={q} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-5 py-2.5"><span className="font-medium">{q}</span><span className="text-muted-foreground">{a}</span></li>
            ))}
          </ul>
        </div>
        <Rules title="图表规则（每张都要做到）" items={[
          <><b>一张图只有一根纵轴。</b>金额（万）和比例（%）不画在同一张图里，拆成两张。</>,
          <><b>系列色固定顺序</b> <Code>--chart-1…5</Code>：同一个东西在所有图里同一个颜色，不按大小排名上色。</>,
          <><b>状态色不当系列色</b>；涨跌用红涨绿跌（<Code>text-rise / text-fall</Code>）。</>,
          <><b>图下写截至日期和来源</b>（<Code>ChartNote</Code>），比如“截至 10月7日 · 来源：收支流水”。</>,
          <><b>暂无 ≠ 0</b>：没数据写“暂无”、线断开（<Code>UnitTip</Code> 已处理）；0 只表示真的是零。</>,
          <><b>饼图 / 环形最多 6 块</b>，小的合并成“其他”；两块的饼图不如直接写数字。</>,
          '两个以上系列要有图例；只有一个系列不加图例，标题说清楚画的是什么。',
          <>坐标轴不画刻度线和轴线（<Code>AXIS</Code>），网格只留横线（<Code>GRID_STROKE</Code>）；柱子从 0 开始，最宽 24–28px。</>,
          <>有先后的分组（账龄、漏斗阶段）用同一种颜色由浅到深（<Code>RampBar</Code>）。</>,
          <>没有数据时不画空坐标轴，放 <Code>EmptyNote</Code> 写下一步怎么做。</>,
        ]} />
      </div>

      <Sub title="看走势">
        <div className="grid gap-5 xl:grid-cols-2">
          <LineDemo />
          <AreaDemo />
        </div>
        <SparkDemo />
      </Sub>

      <Sub title="比大小、看组成">
        <div className="grid gap-5 xl:grid-cols-2">
          <BarDemo />
          <GroupedDemo />
          <StackedDemo />
          <HorizontalDemo />
        </div>
      </Sub>

      <Sub title="占比、进度、阶段">
        <div className="grid gap-5 xl:grid-cols-2">
          <DonutDemo />
          <RadialDemo />
          <FunnelDemo />
          <HeatmapDemo />
        </div>
      </Sub>

      <Sub title="找关系（少用）">
        <div className="grid gap-5 xl:grid-cols-2">
          <ScatterDemo />
        </div>
      </Sub>
    </Section>
  )
}
