// 经营页面的小零件：涨跌、状态标签、迷你走势、指标卡、能点开看来源的数字、时间范围切换、知识库小标签。
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Line, LineChart, YAxis } from 'recharts'
import { BookOpen, CalendarRange, ChevronRight } from 'lucide-react'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { StatusBadge } from '@/components/status'
import { ViewTabs } from '@/components/view-tabs'
import { LinkChip } from '@/components/detail-parts'
import { cn } from '@/lib/utils'
import { bigNumber, deltaSuffix, p1, splitKbLinks } from './fmt'
import { DAY_OPTIONS, useBizOverlay, useDays, type TraceQuery } from './state'
import type { Kpi, KpiFlag } from './types'

/** 涨跌：红涨绿跌，只说方向，好坏用文字说。数字 1 位小数、不留末尾的 0 */
export function Delta({ value, suffix = '%', className }: { value: number | null | undefined; suffix?: string; className?: string }) {
  if (value === null || value === undefined) return <span className={cn('text-muted-foreground', className)}>—</span>
  const v = Math.round(value * 10) / 10 // 四舍五入到 1 位以后是 0 的算持平，不写“▼ 0”
  return (
    <span className={cn('num whitespace-nowrap', v > 0 && 'text-rise', v < 0 && 'text-fall', v === 0 && 'text-muted-foreground', className)}>
      {v > 0 ? '▲' : v < 0 ? '▼' : '持平'}{v !== 0 && ` ${p1(Math.abs(v))}${suffix}`}
    </span>
  )
}

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'primary'> = {
  待处理: 'warn', 处理中: 'info', 已处理: 'ok', 已退款: 'neutral', 退款中: 'info', 已补发: 'ok', 已拒绝: 'neutral',
  已入仓: 'ok', 已预约: 'info', 在途: 'info', 高: 'danger', 中: 'warn', 告急: 'danger', '7 天内': 'warn', 正常: 'ok', 待上线: 'neutral',
  成功: 'ok', 失败: 'danger', 超时: 'warn', 部分成功: 'warn', 进行中: 'info', 现在不报了: 'neutral',
}
/** 经营用到的状态词（处理状态、售后、入仓、库存）在本模块里定颜色，不改公共的状态表 */
export function BizBadge({ value, className }: { value: string; className?: string }) {
  return <StatusBadge value={value} tone={TONE[value]} className={className} />
}

/** 迷你走势：没有坐标轴，只看方向；最后一个点用这条线的颜色（默认正文色） */
export function Spark({ values, className, height = 34, color = 'var(--foreground)' }: { values: (number | null)[]; className?: string; height?: number; color?: string }) {
  const data = values.map((v, i) => ({ i, v }))
  const last = values.length - 1
  if (values.filter((v) => v !== null).length < 2) return null
  const config = { v: { label: '走势', color } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className={cn('aspect-auto w-full', className)} style={{ height }}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line dataKey="v" type="monotone" stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1.5} isAnimationActive={false} connectNulls={false}
          dot={(p) => (p.index === last ? <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill={color} stroke="var(--card)" strokeWidth={1.5} /> : <g key={p.index} />)} />
      </LineChart>
    </ChartContainer>
  )
}

/** 指标卡：昨天的数 + 比前一天 / 比上周同一天 + 所选时间范围的迷你走势。点卡片看这个数怎么来的。
 *  flags：这个指标下还没处理完的异常（“天猫异常 ›”），点了打开那条异常；卡片本身不加红边——全店的数不一定异常 */
export function KpiCard({ k, trace, days, flags = [], color }: { k: Kpi; trace: TraceQuery; days: number; flags?: KpiFlag[]; color?: string }) {
  const ov = useBizOverlay()
  const n = bigNumber(k.key, k.value)
  const suf = deltaSuffix(k.delta_kind)
  return (
    <div className="group relative flex min-w-0 flex-col rounded-xl border bg-card shadow-paper transition-colors hover:border-primary/40 has-[button.kpi-main:focus-visible]:ring-2 has-[button.kpi-main:focus-visible]:ring-ring">
      <button type="button" onClick={() => ov.openTrace(trace)} className="kpi-main px-4 pt-3 pb-2 text-left focus-visible:outline-none" aria-label={`${k.label}：看这个数是怎么来的`}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{k.label}</span>
          <span className="ml-auto text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">看来源</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="num font-heading text-[25px] leading-none font-semibold">{n.value}</span>
          {n.unit && <span className="text-[13px] text-muted-foreground">{n.unit}</span>}
        </div>
        <dl className="mt-2 grid gap-0.5 text-[11.5px] text-muted-foreground">
          <div className="flex justify-between gap-2"><dt className="whitespace-nowrap">比前一天</dt><dd><Delta value={k.vs_prev} suffix={suf} /></dd></div>
          <div className="flex justify-between gap-2"><dt className="whitespace-nowrap">比上周同日</dt><dd><Delta value={k.vs_last_week} suffix={suf} /></dd></div>
        </dl>
        <Spark values={k.spark} className="mt-1" color={color} />
        <div className="flex justify-between gap-2 text-[10.5px] whitespace-nowrap text-muted-foreground/80">
          <span>近 {days} 天</span>
          {k.hint && <span className="truncate">{k.hint}</span>}
        </div>
      </button>
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-dashed px-3 py-1.5">
          {flags.map((f) => (
            <button key={f.id} type="button" onClick={() => ov.openAnomaly(f.id)}
              className="flex items-center gap-0.5 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-danger hover:bg-danger-soft/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {f.channel_name}异常<ChevronRight className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 能点开看来源的数字：表格单元格、图表旁的数字都用它 */
export function TraceNum({ q, children, className }: { q: TraceQuery; children: ReactNode; className?: string }) {
  const ov = useBizOverlay()
  return (
    <button type="button" onClick={() => ov.openTrace(q)} title="看这个数是怎么来的"
      className={cn('num rounded-sm whitespace-nowrap underline decoration-border decoration-dotted underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', className)}>
      {children}
    </button>
  )
}

/** 时间范围：近 7 / 14 / 30 天，写进地址栏 */
export function RangeTabs({ className }: { className?: string }) {
  const [days, setDays] = useDays()
  return <ViewTabs label="时间范围" className={className} value={String(days)} onChange={(v) => setDays(Number(v) as 7 | 14 | 30)}
    items={DAY_OPTIONS.map((d) => ({ value: String(d), label: `近 ${d} 天`, icon: d === 30 ? CalendarRange : undefined }))} />
}

/** 一段的小标题：左边写这一段看什么，右边放操作 */
export function SectionHead({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="font-heading text-[18px] font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

/** 一段文字：里面的知识库链接 [售后与补偿](05-…md) 换成能点的小标签，点了去知识库 */
export function KbText({ text }: { text: string }) {
  const nav = useNavigate()
  return <>{splitKbLinks(text).map((p, i) => ('label' in p
    ? <span key={i} className="mx-0.5 inline-block align-baseline"><LinkChip icon={BookOpen} label={p.label} onClick={() => nav(`/kb?path=${encodeURIComponent(p.path)}`)} /></span>
    : <span key={i}>{p.text}</span>))}</>
}

/** 图例：一行放不下就整块换行（手机上两列），每项不拆开 */
export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean; opacity?: number }[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:justify-center', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 whitespace-nowrap">
          {i.dashed ? <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
            : <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: i.color, opacity: i.opacity ?? 1 }} />}
          {i.label}
        </li>
      ))}
    </ul>
  )
}
