// 小红书 · 数据：发出去的笔记表现，自然和投流分开。两张汇总卡（和上一段时间比）、内容支柱谁收藏高（中位数）、按周走势、笔记表格（点开单篇抽屉）。
// 没有对话窗口。归属：小红书内容模块。
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader, PageBody, SubTabs } from '@/components/page'
import { Choice } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Loading, Failed, EmptyNote } from '@/components/chart-kit'
import { useApi } from '@/lib/api'
import { md, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CONTENT_TABS } from './tabs'
import { useParam } from './lib'
import { ContentOverlays } from './ContentOverlays'
import { DocChip } from './KbDoc'
import { PillarChart, WeeklyChart } from './data/charts'
import { NotesTable } from './data/NotesTable'
import type { DataPage as D, Pillar } from './types'

type Sum = NonNullable<D['summary']['organic']>
const RULE = '11-内容与作品/规律/投流只放大不救选题.md'

/** 比上一段时间：红涨绿跌，只说方向和幅度 */
function Delta({ now, prev }: { now: number; prev?: number | null }) {
  if (!prev) return null
  const v = Math.round(((now - prev) / prev) * 100)
  return <span className={cn('num font-medium', v > 0 && 'text-rise', v < 0 && 'text-fall')}>{v > 0 ? '▲' : v < 0 ? '▼' : ''}{Math.abs(v)}%</span>
}

function Card({ tone, title, sub, main, mainLabel, compare, items, foot }: { tone: 1 | 2; title: string; sub: string; main: string; mainLabel: string; compare: ReactNode; items: [string, ReactNode, string?][]; foot?: ReactNode }) {
  return (
    <section className="relative min-w-0 overflow-hidden rounded-xl border bg-card px-5 py-4 shadow-paper">
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', tone === 1 ? 'bg-chart-1' : 'bg-chart-2')} />
      <div className="flex items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold">{title}</h2><span className="text-xs text-muted-foreground">{sub}</span></div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="num font-heading text-[30px] leading-none font-semibold">{main}</span><span className="text-sm text-muted-foreground">{mainLabel}</span><span className="text-xs text-muted-foreground">{compare}</span></div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        {items.map(([k, v, hint]) => <div key={k} className="min-w-0"><dt className="truncate text-[11.5px] text-muted-foreground">{k}</dt><dd className="num truncate text-[14px] font-medium">{v}</dd>{hint && <dd className="text-[11px] leading-snug text-muted-foreground">{hint}</dd>}</div>)}
      </dl>
      {foot && <div className="mt-3 border-t pt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{foot}</div>}
    </section>
  )
}

const per = (a: number, n: number) => thousands(n ? a / n : null)

function Cards({ d }: { d: D }) {
  const s = d.summary
  const p = s.prev
  const span = d.days === 60 ? '前 60 天' : `前 ${d.days} 天`
  const cmp = (now: number, prev: Sum | null, k: 'reads' | 'saves') => prev ? <>比{span} <Delta now={now} prev={prev[k]} /></> : <>{s.first_date ? `${md(s.first_date)} 开始发，没有更早的可比` : '没有更早的可比'}</>
  const o = s.organic, b = s.paid
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {o ? <Card tone={1} title="自然流量" sub={`${o.notes} 篇有数据`} main={thousands(o.reads)} mainLabel="阅读" compare={cmp(o.reads, p.organic, 'reads')}
        items={[
          ['收藏', thousands(o.saves), p.organic ? `${span} ${thousands(p.organic.saves)}` : undefined], ['点赞', thousands(o.likes)], ['评论', thousands(o.comments)], ['涨粉', thousands(o.new_followers)],
          ['收藏率中位数', `${o.median_rate ?? '—'}%`, '一篇一篇算，比较用这个'], ['整体收藏率', `${o.save_rate ?? '—'}%`, '总收藏 ÷ 总阅读'],
          ['篇均阅读', per(o.reads, o.notes)], ['曝光', thousands(o.impressions)],
        ]}
        foot={d.hits.length ? <>整体收藏率被 {d.hits.map((h) => `《${h.title}》`).join('、')}{d.hits.length > 1 ? `这 ${d.hits.length} 篇` : '这篇'}爆款拉高（{d.hits.map((h) => h.saves.toLocaleString('zh-CN')).join('、')} 藏），比较时看中位数。</> : '这段时间没有爆款，整体收藏率和中位数差不多。'} />
        : <EmptyNote>这段时间没有自然流量数据</EmptyNote>}
      {b ? <Card tone={2} title="投流" sub={`${b.notes} 篇投过 · 花了 ${thousands(b.spend)} 元`} main={thousands(b.reads)} mainLabel="阅读（投流带来的）" compare={cmp(b.reads, p.paid, 'reads')}
        items={[
          ['收藏', thousands(b.saves)], ['点赞', thousands(b.likes)], ['评论', thousands(b.comments)], ['涨粉', thousands(b.new_followers)],
          ['收藏率', `${b.save_rate?.toFixed(1) ?? '—'}%`, '投流那部分'], ['每个阅读', b.cost_per_read != null ? `${b.cost_per_read.toFixed(2)} 元` : '—'],
          ['每涨一个粉', b.cost_per_follower != null ? `${b.cost_per_follower} 元` : '—'], ['曝光', thousands(b.impressions)],
        ]}
        foot={<span className="inline-flex flex-wrap items-center gap-1">投流那部分的收藏率篇篇都在 5% 上下，笔记好坏差不多：投流只放大，救不了选题。<DocChip path={RULE} /></span>} />
        : <EmptyNote>这段时间没有投流</EmptyNote>}
    </div>
  )
}

export default function DataPage() {
  const [days, setDays] = useParam<string>('days', '60')
  const [traffic, setTraffic] = useParam<string>('traffic', '全部')
  const [format, setFormat] = useParam<string>('format', '全部')
  const [pillar, setPillar] = useParam<string>('pillar', '全部')
  const [sort, setSort] = useParam<string>('sort', 'new')
  const [, setSp] = useSearchParams()
  const { data: pillars = [] } = useApi<Pillar[]>('/content/pillars')
  const q = new URLSearchParams({ days, traffic, format, pillar, sort }).toString()
  const { data, isLoading, error, refetch } = useApi<D>(`/content/data?${q}`)
  const withData = data ? data.rows.length - data.summary.no_data : 0
  const filtered = traffic !== '全部' || format !== '全部' || pillar !== '全部'
  const clear = () => setSp((p) => { const n = new URLSearchParams(p); ['traffic', 'format', 'pillar'].forEach((k) => n.delete(k)); return n }, { replace: true })
  return (
    <>
      <PageHeader eyebrow="内容 · 小红书" title="数据" desc="发出去的笔记表现，自然流量和投流分开看；好坏以自然流量为准，投流只是放大。比较用中位数，两篇爆款会把平均数拉高。">
        <SubTabs items={CONTENT_TABS} />
      </PageHeader>
      <PageBody className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Choice className="w-28" value={days} onChange={(v) => setDays(v ?? '60')} options={[{ value: '7', label: '近 7 天' }, { value: '30', label: '近 30 天' }, { value: '60', label: '近 60 天' }]} />
          <Choice className="w-32" value={traffic} onChange={(v) => setTraffic(v ?? '全部')} options={[{ value: '全部', label: '自然 + 投流' }, { value: '自然', label: '只看自然' }, { value: '投流', label: '只看投流' }]} />
          <Choice className="w-28" value={format} onChange={(v) => setFormat(v ?? '全部')} options={[{ value: '全部', label: '图文和视频' }, { value: '图文', label: '图文' }, { value: '视频', label: '视频' }]} />
          <Choice className="w-40" value={pillar} onChange={(v) => setPillar(v ?? '全部')} options={[{ value: '全部', label: '全部内容支柱' }, ...pillars.map((p) => ({ value: p.id, label: p.name }))]} />
          <Choice className="w-36" value={sort} onChange={(v) => setSort(v ?? 'new')} options={[{ value: 'new', label: '最新发布' }, { value: 'reads', label: '阅读最多' }, { value: 'saves', label: '收藏最多' }, { value: 'rate', label: '自然收藏率最高' }]} />
          {filtered && <Button size="sm" variant="ghost" onClick={clear}>清空筛选</Button>}
          {data && <span className="ml-auto text-xs text-muted-foreground">{md(data.from)}—{md(data.to)} · {data.rows.length} 篇，{withData} 篇有数据 · 数据截至 {md(data.through)}（10/27 早上的导入没成功）</span>}
        </div>
        {error ? <Failed message={(error as Error).message} onRetry={() => refetch()} /> : isLoading || !data ? <Loading /> : !data.rows.length ? (
          <div className="grid place-items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            这段时间、这个筛选下没有笔记。{filtered && <Button size="sm" variant="outline" onClick={clear}>清空筛选</Button>}
          </div>
        ) : (
          <>
            <Cards d={data} />
            <div className="grid gap-4 xl:grid-cols-2">
              <PillarChart data={data} />
              <WeeklyChart data={data} />
            </div>
            <NotesTable data={data} traffic={traffic} />
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">口径：数字是截至 {md(data.through)} 的累计；“投流”是投过薯条或聚光的那部分，其余算自然；没有数据的写“—”，不当 0（10/26 那篇还没导进来）。内容支柱和按周的图只算自然流量。来源：小红书专业号笔记数据（导入）。</p>
          </>
        )}
      </PageBody>
      <ContentOverlays />
    </>
  )
}
