// 汇总页首屏只放四样：昨天成交的大数字、近 15 天走势、今天最要紧的事、最新一份经营早报（都能点进去）。
// 手机上顺序是：大数字 → 最要紧的事 → 15 天走势 → 早报（走势在大数字旁边的那份只在宽屏显示，手机上单独放在最要紧的事后面）。
import { useSyncExternalStore } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChevronRight, FileText } from 'lucide-react'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, ChartNote, EmptyNote, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { md, shortDate, thousands, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge, Delta, TraceNum } from '../parts'
import { channelColor, dateTicks, moneyAxis, pct, plainLines, roi1, yuanText } from '../fmt'
import { useBizOverlay } from '../state'
import type { AnomalyItem, Board, Report } from '../types'

const TOTAL = 'var(--foreground)'
const trendConfig = { gmv: { label: '全店成交', color: TOTAL } } satisfies ChartConfig
const SRC = '来源：抖店、天猫、小红书店、视频号小店后台导出（每天早上导入）+ 门店日报（飞书多维表格，每晚 22:00）'

/** 宽屏（≥768）还是手机：两份走势图只画看得见的那份（藏起来的图宽高是 0，图表库会在控制台报警告） */
const WIDE = '(min-width: 768px)'
const subscribe = (cb: () => void) => { const m = window.matchMedia(WIDE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const useWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => true)

export function HeroSales({ b }: { b: Board }) {
  const wide = useWide()
  return (
    <section className="grid h-full min-w-0 overflow-hidden rounded-xl border bg-card shadow-paper md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <HeroNumber b={b} />
      {wide && <div className="hidden min-w-0 px-5 pt-4 pb-3 md:block"><Trend b={b} /></div>}
    </section>
  )
}

/** 手机上单独一块（排在“今天最要紧的事”后面） */
export function MobileTrend({ b }: { b: Board }) {
  const wide = useWide()
  if (wide) return null
  return <section className="min-w-0 rounded-xl border bg-card px-4 pt-4 pb-3 shadow-paper md:hidden"><Trend b={b} /></section>
}

function HeroNumber({ b }: { b: Board }) {
  const ov = useBizOverlay()
  const y = b.yesterday
  const d = b.date
  const pctOf = (a: number | null, base: number | null) => (a !== null && base ? Math.round(((a - base) / base) * 1000) / 10 : null)
  const q = { metric: 'gmv' as const, from: d, to: d }
  return (
    <div className="flex flex-col border-b px-5 pt-4 pb-4 md:border-r md:border-b-0">
      <div className="text-xs text-muted-foreground">昨天 · {shortDate(d)} {weekday(d)} · {b.channels.length} 个渠道合计</div>
      <button type="button" onClick={() => ov.openTrace(q)} className="mt-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" title="看这个数是怎么来的">
        <span className="block text-[13px] text-muted-foreground">全店成交</span>
        <span className="num font-heading text-[44px] leading-none font-semibold tracking-tight">{thousands(y.gmv)}</span>
        <span className="ml-1.5 text-sm text-muted-foreground">元</span>
      </button>
      <dl className="mt-4 grid gap-1.5 text-[13px]">
        <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">比前一天 <span className="num text-xs">{thousands(y.prev)} 元</span></dt><dd><Delta value={pctOf(y.gmv, y.prev)} /></dd></div>
        <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">比上{weekday(d)} <span className="num text-xs">{thousands(y.last_week)} 元</span></dt><dd><Delta value={pctOf(y.gmv, y.last_week)} /></dd></div>
      </dl>
      <ChannelSplit b={b} />
      <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-dashed pt-3 text-xs whitespace-nowrap text-muted-foreground">
        <span>订单 <TraceNum q={{ ...q, metric: 'orders' }} className="text-foreground">{thousands(y.orders)} 单</TraceNum></span>
        <span>客单价 <TraceNum q={{ ...q, metric: 'aov' }} className="text-foreground">{y.aov === null ? '—' : Math.round(y.aov)} 元</TraceNum></span>
        <span>退款率 <TraceNum q={{ ...q, metric: 'refund_rate' }} className="text-foreground">{pct(y.refund_rate)}</TraceNum></span>
        <span>推广 ROI <TraceNum q={{ ...q, metric: 'roi' }} className="text-foreground">{roi1(y.roi)}</TraceNum></span>
      </div>
    </div>
  )
}

function Trend({ b }: { b: Board }) {
  const ov = useBizOverlay()
  const data = b.trend.map((t) => ({ ...t, label: md(t.date) }))
  const axis = moneyAxis(Math.max(...data.map((x) => x.gmv ?? 0)))
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[15px] font-semibold">近 15 天每天卖了多少？</h2>
        <span className="text-xs whitespace-nowrap text-muted-foreground"><span aria-hidden className="mr-1 inline-block w-4 border-t border-dashed border-muted-foreground align-middle" />日均 <span className="num text-foreground">{yuanText(b.trend_avg)}</span><span className="hidden sm:inline"> · 点任意一天看明细</span></span>
      </div>
      <ChartContainer config={trendConfig} className="mt-2 aspect-auto h-[220px] w-full cursor-pointer md:h-[268px]">
        <AreaChart accessibilityLayer data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          onClick={(s) => { const row = data[Number(s?.activeIndex)]; if (row) ov.openTrace({ metric: 'gmv', from: row.date, to: row.date }) }}>
          <defs>
            <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TOTAL} stopOpacity={0.1} /><stop offset="100%" stopColor={TOTAL} stopOpacity={0.01} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} ticks={dateTicks(data.map((x) => x.label))} interval={0} />
          <YAxis {...AXIS} width={44} ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.fmt} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={trendConfig} unit=" 元" labelFormatter={(_, p) => { const r = p?.[0]?.payload as { date?: string } | undefined; return r?.date ? `${shortDate(r.date)} ${weekday(r.date)}` : '' }} />} />
          <ReferenceLine y={b.trend_avg} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />
          <Area dataKey="gmv" type="monotone" stroke="var(--color-gmv)" strokeWidth={2} fill="url(#hero-fill)" connectNulls={false}
            dot={(p) => (p.index === data.length - 1 ? <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill="var(--color-gmv)" stroke="var(--card)" strokeWidth={2} /> : <g key={p.index} />)} />
        </AreaChart>
      </ChartContainer>
      <ChartNote>截至 {shortDate(b.date)} · {SRC}</ChartNote>
    </>
  )
}

/** 昨天这笔钱分到 5 个渠道：一条 100% 的条，下面逐项写金额 */
function ChannelSplit({ b }: { b: Board }) {
  const ov = useBizOverlay()
  const rows = b.table.map((t) => ({ id: t.id, name: t.name, gmv: t.yesterday_gmv ?? 0 }))
  const total = rows.reduce((a, r) => a + r.gmv, 0)
  if (!total) return null
  return (
    <div className="mt-4 mb-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label="昨天各渠道成交占比" title={rows.map((r) => `${r.name} ${thousands(r.gmv)} 元`).join('；')}>
        {rows.map((r) => <span key={r.id} style={{ width: `${(r.gmv / total) * 100}%`, background: channelColor(r.id) }} className="h-full border-r-2 border-card last:border-r-0" />)}
      </div>
      <ul className="mt-2.5 grid gap-1 text-xs max-sm:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => ov.openTrace({ metric: 'gmv', channel: r.id, from: b.date, to: b.date })} className="flex w-full items-center gap-2 text-left hover:text-primary">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: channelColor(r.id) }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
              <span className="num">{thousands(r.gmv)}</span>
              <span className="num w-9 text-right text-muted-foreground">{Math.round((r.gmv / total) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TopIssues({ b, onAll }: { b: Board; onAll: () => void }) {
  const ov = useBizOverlay()
  const open = b.anomalies.active.filter((a) => a.status !== '已处理')
  const handled = b.anomalies.history.filter((a) => a.status === '已处理').length
  const quiet = b.anomalies.history.filter((a) => a.quiet).length
  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border bg-card shadow-paper">
      <div className="flex items-start justify-between gap-3 border-b px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">今天最要紧的事</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{open.length ? `规则从昨天的数里找出 ${open.length} 件，点开看证据、原因和建议` : '退款、推广、库存、成交都在平常范围'}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onAll} className="shrink-0">全部<ChevronRight /></Button>
      </div>
      {open.length ? (
        <ol className="divide-y">
          {open.slice(0, 3).map((a, i) => <IssueRow key={a.id} a={a} i={i} onOpen={() => ov.openAnomaly(a.id)} />)}
        </ol>
      ) : <div className="p-5"><EmptyNote>没有要处理的异常。规则每天早上按“日报设置”里的阈值重算。</EmptyNote></div>}
      <div className="mt-auto border-t px-5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        已处理的旧异常 {handled} 条{quiet ? `，另有 ${quiet} 条还没处理完、按现在的阈值不报了` : ''} · 现在的规则：{b.rules_text}
      </div>
    </section>
  )
}

function IssueRow({ a, i, onOpen }: { a: AnomalyItem; i: number; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="group grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
        <span className={cn('num mt-0.5 grid size-5 place-content-center rounded-full text-[11px] font-semibold', a.level === '高' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>{i + 1}</span>
        <span className="min-w-0">
          <span className="block text-[14px] leading-snug font-medium group-hover:text-primary">{a.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{a.cause ?? a.detail}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <BizBadge value={a.status} />
            {a.owner && <span>{a.owner}在跟</span>}
            <span>{a.channel_name ?? '全店'} · {a.short ?? a.kind}</span>
          </span>
        </span>
        <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
      </button>
    </li>
  )
}

export function LatestReport({ r }: { r: Report | null }) {
  const ov = useBizOverlay()
  if (!r) return <section className="rounded-xl border bg-card p-5 shadow-paper"><EmptyNote>还没有经营早报。Codex 定时任务每天 07:55 写一份，写好后出现在这里。</EmptyNote></section>
  return (
    <section className="min-w-0 rounded-xl border bg-card shadow-paper">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 pt-3.5 pb-3">
        <FileText className="size-4 text-primary" aria-hidden />
        <h2 className="text-[15px] font-semibold">{r.title}</h2>
        <span className="text-xs text-muted-foreground">由 {r.author} {md(r.written_at)} {r.written_at.slice(11, 16)} 写 · 读的是工作台里的数</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => ov.openReport(r.id)}>看全文</Button>
      </div>
      <button type="button" onClick={() => ov.openReport(r.id)} className="block w-full text-left hover:bg-muted/30 focus-visible:outline-none">
        <div className="grid gap-x-6 gap-y-3 px-5 pt-3.5 pb-4 sm:grid-cols-2 xl:grid-cols-4">
          {r.sections.map((s, i) => (
            <div key={s.heading} className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="num grid size-4 place-content-center rounded bg-accent text-[10px] text-accent-foreground">{i + 1}</span>{s.heading}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed">{plainLines(s.body, 1)[0] ?? '—'}</p>
            </div>
          ))}
        </div>
      </button>
    </section>
  )
}
