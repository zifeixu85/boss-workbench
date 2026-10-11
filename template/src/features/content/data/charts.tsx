// 数据页的两块图：内容支柱 × 一篇收藏的中位数（横条，只算自然；平均数放旁边灰字）；按周的篇均赞藏（一张柱图，横轴下写这周发了几篇，
// 单篇爆款撑起来的那周直接标出是哪篇）。一张图一个纵轴。归属：小红书内容模块。
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Panel } from '@/components/page'
import { AXIS, GRID_STROKE, LABEL_STYLE, CURSOR, UnitTip, ChartNote } from '@/components/chart-kit'
import { md } from '@/lib/format'
import type { DataPage } from '../types'

const pillarConfig = { median_saves: { label: '一篇收藏的中位数（自然）', color: 'var(--chart-1)' } } satisfies ChartConfig
const engConfig = { avg_engaged: { label: '篇均赞藏（自然）', color: 'var(--chart-1)' } } satisfies ChartConfig

export function PillarChart({ data }: { data: DataPage }) {
  const rows = data.pillars.filter((p) => p.median_saves != null).sort((a, b) => (b.median_saves ?? 0) - (a.median_saves ?? 0))
  const meds = rows.map((r) => r.median_saves!)
  const lo = Math.min(...meds), hi = Math.max(...meds)
  const pulled = rows.filter((p) => p.hits.length)
  const close = hi <= lo * 1.5
  const desc = !rows.length ? '这段时间没有数据'
    : `${close ? `按中位数看${rows.length === 4 ? '四' : ' ' + rows.length + ' '}类差不多（${lo}—${hi}）` : `按中位数「${rows[0].name}」最高（${hi}）`}${pulled.length ? `；${pulled.map((p) => `「${p.name}」平均 ${p.avg_saves}`).join('、')}，是被${pulled.length > 1 ? '各自' : ''}的爆款拉高的` : ''}`
  return (
    <Panel title="哪类内容收藏高？" desc={desc}>
      <ChartContainer config={pillarConfig} className="aspect-auto h-[196px] w-full">
        <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ top: 0, right: 64, left: 4, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
          <XAxis type="number" {...AXIS} hide />
          <YAxis type="category" dataKey="name" {...AXIS} width={118} tick={{ fontSize: 12.5 }} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={pillarConfig} unit=" 个" />} />
          <Bar dataKey="median_saves" fill="var(--color-median_saves)" radius={4} barSize={22}>
            <LabelList dataKey="median_saves" position="right" style={LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
        {rows.map((p) => (
          <li key={p.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2">
            <span className="text-foreground/80">{p.name}</span>
            <span className="num">{p.notes} 篇有数据 · 平均 {p.avg_saves}{p.hits.length ? `（含《${p.hits[0].title}》${p.hits[0].saves.toLocaleString('zh-CN')} 藏）` : ''} · 收藏率中位数 {p.median_rate ?? '—'}% · 近两周 {p.recent_14d} 篇</span>
          </li>
        ))}
      </ul>
      <ChartNote>条长是一篇收藏数的中位数，只算自然流量；平均数被爆款拉高，只放在旁边 · 截至 {md(data.through)} · 来源：小红书笔记数据（导入）</ChartNote>
    </Panel>
  )
}

/** 横轴：周一的日子，下面一行写这周发了几篇；第一周不满 7 天的写“几号起” */
function WeekTick({ x, y, payload, rows }: { x?: number; y?: number; payload?: { value: string; index: number }; rows: DataPage['weekly'] }) {
  const w = rows[payload?.index ?? 0]
  if (!w) return null
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={11} textAnchor="middle" fill="var(--muted-foreground)" fontSize={11}>{w.label}</text>
      <text x={0} y={0} dy={25} textAnchor="middle" fill="var(--muted-foreground)" fontSize={10.5} opacity={0.8}>{w.partial_from ? `${md(w.partial_from)}起 ` : ''}{w.posts}篇</text>
    </g>
  )
}

/** 爆款那周柱顶的一行小字（不换行） */
function SpikeLabel(p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  if (!p.value) return null
  const x = Number(p.x) + Number(p.width) / 2
  return <text x={x} y={Number(p.y) - 7} textAnchor="middle" fontSize={10.5} fill="var(--muted-foreground)">{String(p.value)}</text>
}

const nice = (max: number) => { const step = max > 2400 ? 1000 : max > 1200 ? 500 : max > 400 ? 200 : 100; const top = Math.ceil(max / step) * step; return Array.from({ length: top / step + 1 }, (_, i) => i * step) }

export function WeeklyChart({ data }: { data: DataPage }) {
  const rows = data.weekly.map((w) => ({ ...w, tag: w.spike ? `含《${w.spike.title.slice(0, 7)}…》` : '' }))
  const withData = rows.filter((w) => w.avg_engaged != null)
  const last = withData.at(-1)
  const spikes = rows.filter((w) => w.spike)
  const ticks = nice(Math.max(1, ...withData.map((w) => w.avg_engaged!)))
  return (
    <Panel title="每周篇均赞藏" desc={last ? `${spikes.length ? `${spikes.length === 1 ? '尖峰' : `${spikes.length} 个尖峰都`}是单篇爆款撑起来的：${spikes.map((w) => `${w.label} 那周含《${w.spike!.title}》${w.spike!.saves.toLocaleString('zh-CN')} 藏`).join('；')}` : `${last.label} 那周篇均赞藏 ${last.avg_engaged}，发了 ${last.posts} 篇`}` : '—'}>
      <ChartContainer config={engConfig} className="aspect-auto h-[236px] w-full">
        <BarChart accessibilityLayer data={rows} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} interval={0} height={42} tick={<WeekTick rows={data.weekly} />} />
          <YAxis {...AXIS} width={44} ticks={ticks} domain={[0, ticks.at(-1)!]} />
          <ChartTooltip cursor={CURSOR} content={<UnitTip config={engConfig} unit="" />} />
          <Bar dataKey="avg_engaged" fill="var(--color-avg_engaged)" radius={[4, 4, 0, 0]} barSize={22}>
            <LabelList dataKey="tag" content={SpikeLabel} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ChartNote>柱高 = 这周每篇的自然点赞 + 收藏，取平均；横轴是每周一，下面是这周发了几篇 · 截至 {md(data.through)}，之后发的还没有数据（那周空着）</ChartNote>
    </Panel>
  )
}
