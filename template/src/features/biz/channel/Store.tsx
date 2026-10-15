// 门店特有：改造停业的提醒（项目和日程里来的）、一周里哪几天人多、会员撑起几成生意。
// 只用门店日报里有的数（当天成交、单数、进店人数、会员单数）：日报不分时段，所以不做“几点人多”。颜色都用门店自己的颜色，工作日 / 周末深浅两档。
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from 'recharts'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, ChartNote, EmptyNote, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Panel } from '@/components/page'
import { md, shortDate, weekday } from '@/lib/format'
import { channelColor, dateTicks, numAxis, p1, yuanNum, dayLabel } from '../fmt'
import { Legend } from '../parts'
import type { ChannelData } from '../types'

const COLOR = channelColor('store')
const SRC = '门店日报（宋姐每晚 21:30 在飞书多维表格填：当天成交、单数、进店人数、会员单数）'

/** 页头下面的提示块：11/3 起停业约 10 天、撞上的品鉴、什么时候通知会员 */
export function StoreNotice({ d }: { d: ChannelData }) {
  const n = d.extras.notice
  if (!n) return null
  return (
    <section className="flex gap-3 rounded-xl border border-warn/50 bg-warn-soft/40 px-4 py-3 shadow-paper">
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 text-[13.5px] leading-relaxed">
        <div className="font-semibold">{md(n.from)} 起门店改造停业约 {n.days} 天，{md(n.reopen)} 恢复营业</div>
        <ul className="mt-1 grid gap-0.5 text-[13px] text-muted-foreground">
          {n.clash.map((e) => (
            <li key={e.id}><span className="font-medium text-danger">撞期：</span>{md(e.at)} {e.at.slice(11, 16)} {e.title}，还约在门店 · <Link to={`/calendar?event=${e.id}`} className="text-primary hover:underline">看日程</Link></li>
          ))}
          {n.notice && <li>{md(n.notice.date)} 前{n.notice.title.replace('停业时间', '')}（{n.notice.note ?? '宋姐负责'}）· {n.notice.status}</li>}
          {n.lost_per_day && <li>按近 30 天的平常日子算，一天约 {yuanNum(n.lost_per_day)} 元，停业 {n.days} 天门店少卖约 {p1((n.lost_per_day * n.days) / 10000)} 万</li>}
        </ul>
        <Link to={`/projects?project=${n.project.id}`} className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] text-primary hover:underline">看“{n.project.name}”项目<ChevronRight className="size-3.5" /></Link>
      </div>
    </section>
  )
}

const weekConfig = { visitors: { label: '平均进店', color: COLOR } } satisfies ChartConfig

export function StoreWeekPanel({ d }: { d: ChannelData }) {
  const s = d.extras.store
  if (!s || !s.by_day.some((x) => x.visitors !== null)) return <Panel title="一周里哪几天人多？"><EmptyNote>门店日报还没有数。</EmptyNote></Panel>
  const data = [...s.by_day.map((x, i) => ({ ...x, kind: i >= 5 ? '周末' : '工作日' })), ...(s.holiday ? [{ label: '国庆', days: s.holiday.days, visitors: s.holiday.visitors, gmv: s.holiday.gmv, kind: '节假日' }] : [])]
  const axis = numAxis(Math.max(...data.map((x) => x.visitors ?? 0)))
  const op = (k: string) => (k === '周末' ? 1 : k === '工作日' ? 0.5 : 0.25)
  const we = s.weekend_avg
  const wd = s.weekday_avg
  return (
    <Panel title="一周里哪几天人多？" desc={`周末有数 ${we.days} 天，日均进店 ${we.visitors === null ? '暂无' : p1(we.visitors)} 人、成交 ${yuanNum(we.gmv)} 元；工作日有数 ${wd.days} 天，日均 ${wd.visitors === null ? '暂无' : p1(wd.visitors)} 人、${yuanNum(wd.gmv)} 元。缺日未计为 0`}>
      <ChartContainer config={weekConfig} className="aspect-auto h-[210px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} interval={0} />
          <YAxis {...AXIS} width={28} ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.fmt} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={weekConfig} unit=" 人" labelFormatter={(_, p) => { const r = p?.[0]?.payload as { label?: string; days?: number; gmv?: number } | undefined; return r ? `${r.label}（${r.days} 天平均，成交 ${yuanNum(r.gmv)} 元）` : '' }} />} />
          <Bar dataKey="visitors" radius={[4, 4, 0, 0]} maxBarSize={30}>
            {data.map((x) => <Cell key={x.label} fill={COLOR} fillOpacity={op(x.kind)} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
      <Legend className="mt-2" items={[{ label: '工作日', color: COLOR, opacity: 0.5 }, { label: '周末', color: COLOR }, ...(s.holiday ? [{ label: `国庆（${s.holiday.days} 天，单独算）`, color: COLOR, opacity: 0.25 }] : [])]} />
      <ChartNote>每个星期几的平均进店人数，算的是 {shortDate(s.week_from)}—{shortDate(d.to)}，国庆那几天不算进星期几里 · 来源：{SRC}</ChartNote>
    </Panel>
  )
}

const memberConfig = { share: { label: '会员单占比', color: COLOR } } satisfies ChartConfig

export function MemberPanel({ d }: { d: ChannelData }) {
  const s = d.extras.store
  if (!s) return null
  const data = s.daily.map((x) => ({ ...x, label: md(x.date) }))
  return (
    <Panel title="会员撑起了几成生意？" desc={`近 ${d.days} 天 ${s.buyers ?? '暂无'} 位买茶的客人里，会员 ${s.members ?? '暂无'} 位；节假日游客多，会员占比会掉下来`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div><span className="num font-heading text-[28px] font-semibold">{s.member_share === null ? '—' : p1(s.member_share)}</span><span className="ml-1 text-sm text-muted-foreground">% 是会员单</span></div>
        <div className="text-xs text-muted-foreground">新客 <span className="num text-foreground">{s.new_share === null ? '—' : `${p1(s.new_share)}%`}</span>（门店口径：会员单算老客，两个加起来是 100%）</div>
      </div>
      <ChartContainer config={memberConfig} className="aspect-auto h-[160px] w-full">
        <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} ticks={dateTicks(data.map((x) => x.label))} interval={0} />
          <YAxis {...AXIS} width={48} domain={[40, 100]} ticks={[40, 60, 80, 100]} tickFormatter={(v: number) => `${v}%`} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={memberConfig} unit="%" labelFormatter={dayLabel} />} />
          <Line dataKey="share" type="monotone" stroke="var(--color-share)" strokeWidth={2} connectNulls={false} dot={{ r: 2, fill: 'var(--color-share)', strokeWidth: 0 }} />
        </LineChart>
      </ChartContainer>
      <ChartNote>每天会员单 ÷ 当天买茶的客人（纵轴从 40% 起）· 截至 {shortDate(d.to)} {weekday(d.to)} · 来源：{SRC}</ChartNote>
    </Panel>
  )
}
