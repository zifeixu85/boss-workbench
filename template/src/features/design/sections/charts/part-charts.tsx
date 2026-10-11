// 看占比和完成度的图：环形 / 饼图、进度环、热力日历
import { useMemo } from 'react'
import { Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { UnitTip, n1 } from '@/components/chart-kit'
import { shortDate, todayStr, weekday } from '@/lib/format'
import { ChartCard } from './chart-card'
import { CUMULATIVE, HEAT_WEEKS, SHARE, YEAR_TARGET, heatDays } from './data'

const shareConfig = {
  whole: { label: '白茶', color: 'var(--chart-1)' },
  cabinet: { label: '岩茶', color: 'var(--chart-2)' },
  closet: { label: '花草茶', color: 'var(--chart-3)' },
  study: { label: '茶具', color: 'var(--chart-4)' },
  other: { label: '其他', color: 'var(--chart-5)' },
} satisfies ChartConfig

export function DonutDemo() {
  const total = SHARE.reduce((a, s) => a + s.value, 0)
  const data = SHARE.map((s) => ({ ...s, fill: `var(--color-${s.key})` }))
  return (
    <ChartCard kind="环形 / 饼图" question="今年卖的茶，主要是哪一类？" desc="中间写合计，旁边逐项写金额和占比（图例就是这张清单）。最小的几类合并成“其他”。"
      fit="一个整体分成几块，只看谁占大头。最多 6 块。" unfit="比较差不多大的几块（用横向条）；看随时间的变化。">
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-[180px]">
          <ChartContainer config={shareConfig} className="aspect-square w-full">
            <PieChart>
              <ChartTooltip content={<UnitTip config={shareConfig} unit=" 万" nameKey="key" hideLabel />} />
              <Pie data={data} dataKey="value" nameKey="key" innerRadius="62%" outerRadius="100%" stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270} />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="text-[20px] leading-none font-semibold">{Math.round(total)}</span>
            <span className="mt-1 text-[11px] text-muted-foreground">万 · 合计</span>
          </div>
        </div>
        <ul className="grid gap-1.5 text-[13px]">
          {SHARE.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--chart-${i + 1})` }} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="num">{n1(s.value)} 万</span>
              <span className="num w-11 text-right text-muted-foreground">{Math.round((s.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  )
}

const ringConfig = { done: { label: '完成', color: 'var(--chart-1)' } } satisfies ChartConfig

export function RadialDemo() {
  const done = CUMULATIVE.at(-1)?.total ?? 0
  const pct = Math.round((done / YEAR_TARGET) * 1000) / 10
  const t = todayStr()
  const dayOfYear = Math.round((new Date(`${t}T00:00:00`).getTime() - new Date(`${t.slice(0, 4)}-01-01T00:00:00`).getTime()) / 864e5) + 1
  const timePct = Math.round((dayOfYear / 365) * 1000) / 10
  return (
    <ChartCard kind="进度环" question="今年的签约目标完成多少了？" desc={`已签 ${n1(done)} 万 / 目标 ${YEAR_TARGET} 万；时间过去了 ${n1(timePct)}%，${pct >= timePct ? '进度比时间快' : '进度落后于时间'}。`}
      fit="一个目标的完成度，配一句和时间进度的比较。" unfit="多个目标挤在一起（用横向条）；没有明确目标值。">
      <div className="flex flex-wrap items-center justify-center gap-6">
        <div className="relative size-[170px]">
          <ChartContainer config={ringConfig} className="aspect-square size-full">
            <RadialBarChart data={[{ key: 'done', value: pct }]} innerRadius="78%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={14}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
              <RadialBar dataKey="value" background={{ fill: 'var(--muted)' }} cornerRadius={8} fill="var(--color-done)" isAnimationActive={false} />
            </RadialBarChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="text-[26px] leading-none font-semibold">{n1(pct)}<span className="text-sm font-normal text-muted-foreground">%</span></span>
            <span className="mt-1 text-[11px] text-muted-foreground">年度目标</span>
          </div>
        </div>
        <dl className="grid gap-1.5 text-[13px]">
          <div className="flex gap-3"><dt className="w-16 text-muted-foreground">已签</dt><dd className="num">{n1(done)} 万</dd></div>
          <div className="flex gap-3"><dt className="w-16 text-muted-foreground">还差</dt><dd className="num">{n1(Math.max(0, YEAR_TARGET - done))} 万</dd></div>
          <div className="flex gap-3"><dt className="w-16 text-muted-foreground">时间进度</dt><dd className="num">{n1(timePct)}%</dd></div>
        </dl>
      </div>
    </ChartCard>
  )
}

/** 同一种颜色由浅到深的 5 档：0 次用底色，越多越深 */
const LEVELS = [0, 0.3, 0.5, 0.72, 1]
const level = (n: number) => (n <= 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4)
const ROW_LABELS = ['一', '', '三', '', '五', '', '日']

export function HeatmapDemo() {
  const days = useMemo(() => heatDays(), [])
  const weeks = Array.from({ length: HEAT_WEEKS }, (_, w) => days.slice(w * 7, w * 7 + 7))
  const total = days.reduce((a, d) => a + (d.count ?? 0), 0)
  return (
    <ChartCard kind="热力日历" question="哪些日子跟进得勤，哪些日子断了？" desc={`最近 ${HEAT_WEEKS} 周每天的跟进次数，共 ${total} 次。一列是一周，越深越多；空格是还没到的日子。`}
      fit="按天看习惯和断档：跟进、发内容、打卡。" unfit="要读具体数字（用表格）；数据只有几天。">
      <div role="img" aria-label={`最近 ${HEAT_WEEKS} 周跟进热力图，共 ${total} 次`} className="grid max-w-[440px] grid-cols-[14px_minmax(0,1fr)] gap-1.5">
        <div className="grid grid-rows-[14px_repeat(7,minmax(0,1fr))] gap-[3px] text-[10px] leading-none text-muted-foreground">
          <span />
          {ROW_LABELS.map((l, i) => <span key={i} className="flex items-center">{l}</span>)}
        </div>
        <div className="grid min-w-0 gap-[3px]" style={{ gridTemplateColumns: `repeat(${HEAT_WEEKS}, minmax(0, 1fr))` }}>
          {weeks.map((w, wi) => {
            const first = w[0].date
            const showMonth = wi === 0 || first.slice(5, 7) !== weeks[wi - 1][0].date.slice(5, 7)
            return (
              <div key={first} className="grid grid-rows-[14px_repeat(7,auto)] gap-[3px]">
                <span className="truncate text-[10px] leading-none text-muted-foreground">{showMonth ? `${Number(first.slice(5, 7))}月` : ''}</span>
                {w.map((d) => (
                  <span key={d.date} title={d.count == null ? undefined : `${shortDate(d.date)} ${weekday(d.date)}：跟进 ${d.count} 次`}
                    className={d.count == null ? 'aspect-square rounded-[3px]' : 'aspect-square rounded-[3px] bg-muted'}
                    style={d.count ? { background: 'var(--chart-1)', opacity: LEVELS[level(d.count)] } : undefined} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-3 flex max-w-[440px] items-center justify-end gap-1 text-[11px] text-muted-foreground">
        少{LEVELS.map((o, i) => <span key={i} aria-hidden className="size-2.5 rounded-[2px] bg-muted" style={i ? { background: 'var(--chart-1)', opacity: o } : undefined} />)}多
      </div>
    </ChartCard>
  )
}
