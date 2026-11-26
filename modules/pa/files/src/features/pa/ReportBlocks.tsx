// 报告的一节按模板显示（2026-11-26 A梦 定：样式通用、要有图）：不为某几节做专用版式，用几种通用的块拼——
// 一段话、要点、数字卡、柱图、线图、占比、表格、待你点头。来源有“工作台”的节，数和图从这一期的数据现算（和上一期比）；
// 来源有“AI”的节，显示报告文件里写的字；AI 写的图表块，按那一节里的第一张表画。
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Panel, Stat } from '@/components/page'
import { Markdown } from '@/components/markdown'
import { tokens } from './UsagePanel'
import type { PeriodData, TemplateSection } from './types'

const SERIES = ['按天对话', '按天token', '按小时', '按对象'] as const
const LISTS = ['重复开对话'] as const
type Point = { label: string; value: number }
/** 一根柱或一个点：单系列是 value，按天对话是对话和做完两个系列 */
type Row = { label: string } & Record<string, string | number>

/** 这一节要不要占整行（有图的、表格的占整行，别的半行） */
export const wideSection = (s?: TemplateSection) => !!s && (s.blocks.some((b) => b === '柱图' || b === '线图' || b === '占比' || b === '表格') || s.data.some((d) => (SERIES as readonly string[]).includes(d)))

function compare(name: string, now: number | null, last: number | null, unit: string) {
  if (now === null || last === null) return '上一期没有可比的'
  if (now === last) return '和上一期一样'
  const d = now - last
  return `比上一期${d > 0 ? '多' : '少'} ${name === 'token' ? tokens(Math.abs(d)) : Math.abs(d)}${unit === '%' ? ' 个百分点' : name === 'token' ? '' : ` ${unit}`}`
}

function Cards({ names, data, prev }: { names: string[]; data: PeriodData; prev: PeriodData }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {names.map((n) => {
        const c = data.cards[n]
        return <Stat key={n} label={n} value={c.value === null ? '—' : n === 'token' ? tokens(c.value) : c.value} unit={c.value === null ? undefined : c.unit} hint={compare(n, c.value, prev.cards[n]?.value ?? null, c.unit)} />
      })}
    </div>
  )
}

const one = { value: { label: '数量', color: 'var(--chart-1)' } } satisfies ChartConfig
const two = { talks: { label: '对话', color: 'var(--chart-2)' }, done: { label: '做完', color: 'var(--chart-1)' } } satisfies ChartConfig

/** 柱图 / 线图：一串数（按天、按小时、AI 表格里的） */
function Chart({ title, points, line, unit }: { title: string; points: Row[]; line?: boolean; unit: string }) {
  const pair = points.length > 0 && 'talks' in points[0]
  const config = pair ? two : one
  const keys = pair ? ['talks', 'done'] : ['value']
  return (
    <figure className="grid gap-1.5">
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
      <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
        {line ? (
          <LineChart accessibilityLayer data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} width={36} allowDecimals={false} tickFormatter={(v: number) => (v >= 1e4 ? tokens(v) : String(v))} />
            <ChartTooltip cursor={false} content={<UnitTip unit={unit} config={config} />} />
            {pair && <ChartLegend content={<ChartLegendContent />} />}
            {keys.map((k) => <Line key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2} dot={false} />)}
          </LineChart>
        ) : (
          <BarChart accessibilityLayer data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} width={36} allowDecimals={false} tickFormatter={(v: number) => (v >= 1e4 ? tokens(v) : String(v))} />
            <ChartTooltip cursor={CURSOR} content={<UnitTip unit={unit} config={config} />} />
            {pair && <ChartLegend content={<ChartLegendContent />} />}
            {keys.map((k) => <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
          </BarChart>
        )}
      </ChartContainer>
    </figure>
  )
}

/** 占比：每一项一条横条，写数和百分比（按对象、AI 表格里的） */
function Share({ title, points }: { title: string; points: Point[] }) {
  const total = points.reduce((n, p) => n + p.value, 0)
  return (
    <figure className="grid gap-2">
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
      {!total ? <p className="text-sm text-muted-foreground">这一期没有。</p> : points.map((p) => (
        <div key={p.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
          <span className="truncate" title={p.label}>{p.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${(p.value / total) * 100}%` }} /></span>
          <span className="num text-xs text-muted-foreground">{p.value} · {Math.round((p.value / total) * 100)}%</span>
        </div>
      ))}
    </figure>
  )
}

const SERIES_TITLE: Record<string, string> = { 按天对话: '每天的对话和做完的', 按天token: '每天用了多少 token', 按小时: '一天里几点开对话', 按对象: '对话花在哪（还没归的按文件夹）' }

/** 节里的第一张 Markdown 表：第一列当名字，第二列当数（AI 写的图表块用） */
function firstTable(text: string): Point[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
  return rows.slice(1).map((r) => ({ label: r[0] ?? '', value: Number(String(r[1] ?? '').replace(/[^\d.-]/g, '')) })).filter((p) => p.label && Number.isFinite(p.value))
}
const withoutTables = (text: string) => text.split(/\r?\n/).filter((l) => !l.trim().startsWith('|')).join('\n').trim()

/** 待你点头：编了号的清单，老板回“写 1、3” */
function Approvals({ text }: { text: string }) {
  const items = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^([-*+]|\d+[.、])\s+/.test(l)).map((l) => l.replace(/^([-*+]|\d+[.、])\s+(\[[ xX]\]\s*)?/, ''))
  if (!items.length) return <Markdown source={text} />
  return (
    <div className="grid gap-2">
      <ol className="grid gap-2">
        {items.map((t, i) => (
          <li key={t} className="flex gap-2.5 rounded-lg border bg-surface-2/50 px-3 py-2 text-sm">
            <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
            <span className="min-w-0"><Markdown source={t} /></span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">要写进知识库的，在对话里回“写 1、3”这样的编号；不回就不写。</p>
    </div>
  )
}

/** 一节：按模板的块和来源拼出来；模板里没有这一节（报告里多写的）就当普通文字 */
export function ReportSection({ title, sec, text, data, prev }: { title: string; sec?: TemplateSection; text: string | null; data: PeriodData; prev: PeriodData }) {
  const fromWb = !!sec && sec.source !== 'AI'
  const fromAi = !sec || sec.source !== '工作台'
  const has = (b: string) => !!sec?.blocks.includes(b as never)
  const cards = fromWb ? sec!.data.filter((d) => d in data.cards) : []
  const series = fromWb ? sec!.data.filter((d) => (SERIES as readonly string[]).includes(d)) : []
  const lists = fromWb ? sec!.data.filter((d) => (LISTS as readonly string[]).includes(d)) : []
  const aiChart = !fromWb && sec && (has('柱图') || has('线图') || has('占比')) && text ? firstTable(text) : []
  const body = text && (sec?.source === '工作台' ? withoutTables(text) : text)
  const desc = sec ? `${sec.who === '分身' ? '分身写的' : sec.source === '工作台' ? '工作台算的' : sec.source === 'AI' ? '总助读对话写的' : '数是工作台算的，话是总助写的'}${sec.note ? ` · ${sec.note}` : ''}` : '模板里没有这一节'
  return (
    <Panel title={title} desc={desc} className={wideSection(sec) ? 'lg:col-span-2' : undefined}>
      <div className="grid gap-4">
        {cards.length > 0 && <Cards names={cards} data={data} prev={prev} />}
        {series.length > 0 && (
          <div className={series.length > 1 ? 'grid gap-5 lg:grid-cols-2' : 'grid'}>
            {series.map((n) => {
              const pts = data.series[n as keyof PeriodData['series']] as unknown as Row[]
              return n === '按对象' && has('占比') ? <Share key={n} title={SERIES_TITLE[n]} points={pts as unknown as Point[]} /> : <Chart key={n} title={SERIES_TITLE[n]} points={pts} line={has('线图')} unit={n === '按天token' ? 'token' : '个'} />
            })}
          </div>
        )}
        {lists.map((n) => (
          <div key={n} className="grid gap-1.5 text-sm">
            <div className="text-xs text-muted-foreground">同一件事一天里开了三个以上对话</div>
            {data.lists.重复开对话.length ? data.lists.重复开对话.map((x) => <div key={`${x.对象}${x.日期}`} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{x.对象}</span><span className="num text-xs text-muted-foreground">{x.日期.slice(5)} · {x.对话} 个</span></div>) : <p className="text-muted-foreground">没有</p>}
          </div>
        ))}
        {aiChart.length > 0 && (has('占比') ? <Share title="（按表里的数画）" points={aiChart} /> : <Chart title="（按表里的数画）" points={aiChart as unknown as Row[]} line={has('线图')} unit="" />)}
        {fromAi && (body
          ? (has('待你点头') ? <Approvals text={body} /> : <Markdown source={body} />)
          : (!sec || sec.source === 'AI') && <p className="text-sm text-muted-foreground">这一节还没写（总助按模板写进报告文件）。</p>)}
      </div>
    </Panel>
  )
}
