// 进展的数字和图：让老板一眼看到自己这段时间做了多少。数据来自 /m/pa/pulse（按本地日期分天）。
// 一张图一个纵轴、系列色固定顺序（图表积木的规矩）；数字都写清是哪段时间。
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Panel, Stat } from '@/components/page'
import type { Pulse } from './types'

const doneConfig = { done: { label: '做完的事', color: 'var(--chart-1)' } } satisfies ChartConfig
const outConfig = { images: { label: '图片', color: 'var(--chart-1)' }, files: { label: '文件', color: 'var(--chart-2)' } } satisfies ChartConfig

/** 和上周比的一句：多了、少了、持平都说人话 */
function compare(now: number, last: number, unit: string): string {
  if (!last && !now) return '上周同期也没有'
  if (now > last) return `比上周同期多 ${now - last} ${unit}`
  if (now < last) return `上周同期 ${last} ${unit}`
  return '和上周同期一样多'
}

/** 进展页顶上：本周做完、在等你、连续在用、本周产出 */
export function ProgressStats({ p, waiting }: { p: Pulse; waiting: number }) {
  const out = p.week.images + p.week.files
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="本周做完" value={p.week.done} unit="件" tone={p.week.done > 0 ? 'ok' : undefined} hint={compare(p.week.done, p.week.last.done, '件')} />
      <Stat label="本周产出" value={out} unit="个" hint={out ? `${p.week.images} 张图 · ${p.week.files} 个文件` : compare(out, p.week.last.outputs, '个')} />
      <Stat label="连续在用" value={p.streak} unit="天" hint={p.streak >= 3 ? '保持住' : p.streak ? '今天也来一件' : '今天开个头'} />
      <Stat label="在等你回话" value={waiting} unit="个" tone={waiting ? 'warn' : undefined} hint={waiting ? '点“在等我”看是哪几个' : '没有在等你的'} />
    </div>
  )
}

/** 近几天每天做完几件 + 这周花在哪 */
export function ProgressCharts({ p }: { p: Pulse }) {
  const max = Math.max(1, ...p.top.map((t) => t.n))
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Panel title={`近 ${p.days.length} 天，每天做完几件`} desc={`一共做完 ${p.total.done} 件，和 AI 动过 ${p.total.talks} 个对话。按对话最后一次动的那天算。`}>
        <ChartContainer config={doneConfig} className="aspect-auto h-[200px] w-full">
          <BarChart accessibilityLayer data={p.days} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" {...AXIS} minTickGap={12} interval="preserveStartEnd" />
            <YAxis {...AXIS} width={34} allowDecimals={false} />
            <ChartTooltip cursor={CURSOR} content={<UnitTip config={doneConfig} unit=" 件" />} />
            <Bar dataKey="done" fill="var(--color-done)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ChartContainer>
      </Panel>
      <Panel title="这周花在哪" desc="本周动过的对话，按归到的项目、客户数">
        {p.top.length ? (
          <ul className="grid gap-3">
            {p.top.map((t) => (
              <li key={t.name} className="grid gap-1 text-sm">
                <span className="flex items-baseline justify-between gap-2"><span className="truncate">{t.name}</span><span className="num shrink-0 text-muted-foreground">{t.n} 个</span></span>
                <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${(t.n / max) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">这周的对话还没有归到项目或客户上。在对话详情里给它指一个，这里就会有。</p>}
      </Panel>
    </div>
  )
}

/** 产出页顶上：本周出图、本周文件，近几天每天出了多少 */
export function OutputCharts({ p }: { p: Pulse }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
        <Stat label="本周出图" value={p.week.images} unit="张" hint={`近 ${p.days.length} 天 ${p.total.images} 张`} />
        <Stat label="本周写出的文件" value={p.week.files} unit="个" hint={`近 ${p.days.length} 天 ${p.total.files} 个（不算代码）`} />
      </div>
      <Panel title={`近 ${p.days.length} 天，每天出了多少`} desc="图片和文件分开数；改已有文件的不算，代码不算">
        <ChartContainer config={outConfig} className="aspect-auto h-[180px] w-full">
          <BarChart accessibilityLayer data={p.days} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" {...AXIS} minTickGap={12} interval="preserveStartEnd" />
            <YAxis {...AXIS} width={34} allowDecimals={false} />
            <ChartTooltip cursor={CURSOR} content={<UnitTip config={outConfig} unit=" 个" />} />
            <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
            <Bar dataKey="images" stackId="o" fill="var(--color-images)" maxBarSize={22} />
            <Bar dataKey="files" stackId="o" fill="var(--color-files)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ChartContainer>
      </Panel>
    </div>
  )
}
