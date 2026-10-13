// 数据源：每个来源一行（名称、方式、最近更新、近 7 天、状态、下一次），有问题的排在最上面；点开右侧抽屉看运行记录和失败原因。
// 顶上四张卡只放表格里看不出来的：经营数据到哪天了、近 7 天跑得怎么样、导入规则（哪个平台还没有）、今早几点导完。归属：数据源与导入模块
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlarmClock, ArrowRight, DatabaseZap, FileUp, RefreshCw, ShieldAlert, TrendingUp, TriangleAlert } from 'lucide-react'
import { useApi } from '@/lib/api'
import { PageBody, PageHeader, Panel, Stat } from '@/components/page'
import { StickyTable } from '@/components/data-view'
import { ViewTabs } from '@/components/view-tabs'
import { Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { addDays, todayStr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, RestoreButton, RunStrip, StripLegend } from './parts'
import { fullOf, iconOf, mdOf, when } from './labels'
import { SourceDrawer } from './SourceDrawer'
import { useSync } from './use-sync'
import type { Source, SourcesSummary, StripDay } from './types'

const TABS = [
  { value: 'all', label: '全部' }, { value: 'bad', label: '有问题' }, { value: 'ok', label: '正常' },
] as const
type Tab = (typeof TABS)[number]['value']
const RANK: Record<string, number> = { 读取失败: 0, 没数据: 1, 没按时更新: 2, 正常: 3, 停用: 4 }
const isBad = (s: Source) => s.display === '读取失败' || s.display === '没按时更新' || s.display === '没数据'

export default function SourcesPage() {
  const { data, isLoading, error, refetch } = useApi<Source[]>('/data/sources')
  const { data: sum } = useApi<SourcesSummary>('/data/sources/summary')
  const { data: strips } = useApi<Record<string, StripDay[]>>('/data/sources/strips')
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((t) => t.value === sp.get('status'))?.value ?? 'all') as Tab
  const open = sp.get('source')
  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: k === 'status' })
  const list = useMemo(() => (data ?? []).slice().sort((a, b) => RANK[a.display] - RANK[b.display] || a.sort - b.sort), [data])
  const bad = list.filter(isBad)
  const rows = list.filter((s) => tab === 'all' || (tab === 'bad' ? isBad(s) : s.display === '正常'))

  return (
    <>
      <PageHeader eyebrow="数据" title="数据源" desc={data ? (bad.length ? `${bad.length} 个来源要处理，其余按时到了。` : '都按时到了。') : '各平台的导出表、飞书表格、知识库、RSS、Codex 定时任务，每天几点来、来没来。'}
        actions={<Button asChild><Link to="/imports"><FileUp />导入文件</Link></Button>} />
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {error ? <Failed message="数据源没读出来" onRetry={() => refetch()} /> : isLoading || !data ? <LoadingRows /> : (
          <>
            {bad.length > 0 && <ProblemCards items={bad} onOpen={(id) => setParam('source', id)} />}
            {sum && <SummaryCards s={sum} />}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <ViewTabs label="按状态" value={tab} onChange={(v) => setParam('status', v === 'all' ? null : v)} items={TABS.map((t) => ({ value: t.value, label: t.label, count: t.value === 'all' ? list.length : t.value === 'bad' ? bad.length : list.filter((s) => s.display === '正常').length }))} />
              <span className="ml-auto hidden items-center gap-2 md:inline-flex"><span className="text-[12px] text-muted-foreground">近 7 天：</span><StripLegend /></span>
            </div>
            <SourceTable rows={rows} strips={strips} onOpen={(id) => setParam('source', id)} />
            <SourceCards rows={rows} onOpen={(id) => setParam('source', id)} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <RulesExplained />
              <FlowExplained />
            </div>
          </>
        )}
      </PageBody>
      {open && <SourceDrawer id={open} onClose={() => setParam('source', null)} />}
    </>
  )
}

function SummaryCards({ s }: { s: SourcesSummary }) {
  const r = s.runs_7d
  const m = s.morning
  const missing = s.rules.missing
  const bad = [r.failed && `失败 ${r.failed}`, r.late && `超时 ${r.late}`, r.partial && `没导全 ${r.partial}`].filter((x): x is string => !!x)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="经营数据" value={`${s.fresh.ok}/${s.fresh.total}`} unit="个渠道已到" tone={s.fresh.ok < s.fresh.total ? 'warn' : undefined}
        hint={s.fresh.empty.length ? `${s.fresh.empty.join('、')}现在没有数` : s.fresh.behind.length ? `${s.fresh.behind.join('、')}还没到` : `都到 ${fullOf(s.fresh.through)}（昨天）`} />
      <Stat label="近 7 天运行" value={r.total} unit="次"
        hint={bad.length ? bad.map((t, i) => <span key={t} className="whitespace-nowrap">{t}{i < bad.length - 1 ? ' ·' : ''}</span>) : '都成功'} />
      <Link to={missing.length ? '/imports' : '/imports/rules'} className="min-w-0 rounded-xl transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Stat label="导入规则" value={s.rules.active} unit="条在用" tone={missing.length ? 'warn' : undefined}
          hint={missing.length ? <span className="text-primary">{missing.map((x) => x.name).join('、')}新版表头还没规则 · 拖一份来 →</span> : <span>{s.rules.stopped ? `${s.rules.stopped} 条停用 · ` : ''}去看规则 →</span>} />
      </Link>
      <Stat label="今早导入" value={m ? m.first.slice(11, 16) : '—'} unit={m ? `到 ${m.last.slice(11, 16)}` : undefined}
        hint={m ? `${m.total} 个渠道到了 ${m.arrived} 个${m.later.length ? `（${m.later.map((x) => `${x.name}${Number(x.at.slice(0, 2)) >= 18 ? '晚上' : ''} ${x.at} 来`).join('、')}）` : ''}` : '今早还没导'} />
    </div>
  )
}

function ProblemCards({ items, onOpen }: { items: Source[]; onOpen: (id: string) => void }) {
  return (
    <section className="grid gap-3 md:grid-cols-2" aria-label="要处理的数据源">
      {items.map((s) => {
        const danger = s.display === '读取失败'
        const empty = s.display === '没数据'
        const Icon = danger ? ShieldAlert : empty ? DatabaseZap : AlarmClock
        return (
          <div key={s.id} className={cn('relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-4 pl-5 shadow-paper', danger ? 'border-danger/30' : 'border-warn/30')}>
            <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', danger ? 'bg-danger' : 'bg-warn')} />
            <div className="flex flex-wrap items-center gap-2">
              <Icon className={cn('size-4', danger ? 'text-danger' : 'text-warn')} />
              <span className="font-medium">{s.name}</span><Badge value={s.display} />
            </div>
            <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{s.reason ?? s.last_message}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 text-xs text-muted-foreground">
              {empty ? <span>经营页这个渠道先是空的，<b className="font-medium text-foreground">不当 0</b></span>
                : s.parts.length ? s.parts.map((p) => <span key={p.label}>{p.label} <b className={cn('font-medium', p.tone === 'ok' ? 'text-foreground' : 'text-warn')}>{p.text}</b></span>)
                : <span>数据停在 <b className="num font-medium text-foreground">{fullOf(s.data_through)}</b></span>}
              {s.pending > 0 && <span className="font-medium text-warn">{s.pending} 列对照等你确认</span>}
              {empty && s.channel_id && s.sample_rows > 0 ? <RestoreButton channel={s.channel_id} name={s.short.replace(/经营数据$/, '')} className="ml-auto" />
                : <Button size="sm" variant={danger ? 'default' : 'outline'} className="ml-auto" onClick={() => onOpen(s.id)}>{s.pending ? '去确认对照' : '看原因'}<ArrowRight /></Button>}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** 最近更新一格：飞书分日历 / 妙记两行；知识库现场数；其余是最近一次和结果 */
function LastCell({ s }: { s: Source }) {
  if (s.parts.length) {
    return (
      <div className="grid gap-0.5 text-[13px]">
        {s.parts.map((p) => <div key={p.label} className="whitespace-nowrap"><span className="text-muted-foreground">{p.label} </span><span className={cn(p.tone !== 'ok' && 'text-warn')}>{p.text}</span></div>)}
      </div>
    )
  }
  if (s.kb) {
    const at = s.kb.latest?.at
    const recent = at && at.slice(0, 10) <= todayStr() && at.slice(0, 10) >= addDays(todayStr(), -7)
    return (
      <div className="min-w-0 text-[13px]">
        <div>现在 <span className="num">{s.kb.notes}</span> 份笔记</div>
        {s.kb.latest && <div className="max-w-[200px] truncate text-xs text-muted-foreground" title={s.kb.latest.path}>最近改：{s.kb.latest.path.split('/').pop()?.replace(/\.md$/, '')}{recent ? `（${when(at)}）` : ''}</div>}
      </div>
    )
  }
  return <div className="num whitespace-nowrap">{when(s.last_run_at)}<div className={cn('max-w-[180px] truncate text-xs', s.last_status === '失败' ? 'text-danger' : 'text-muted-foreground')}>{s.last_status ?? '—'}</div></div>
}

/** 下一次：过了点还没跑写“该在 08:00 · 已过 6 小时”（警示色）；示例没连真账号的写“示例没连飞书 · 停在今天 07:30”（灰字）。
 *  withAuto：手机卡片上把“自动”并进这一格，只占一行 */
function NextCell({ s, withAuto }: { s: Source; withAuto?: boolean }) {
  const auto = withAuto && s.auto && !s.next_held && !s.overdue_min && s.kind !== '飞书日历与妙记'
  return <span className={cn('num whitespace-nowrap', s.overdue_min ? 'font-medium text-warn' : 'text-muted-foreground')}>{s.next_text}{auto ? ' · 自动' : ''}</span>
}

function SyncAction({ s, compact }: { s: Source; compact?: boolean }) {
  const sync = useSync()
  const busy = sync.isPending && sync.variables === s.id
  if (s.auto) return compact ? null : <span className="inline-block max-w-[96px] text-right text-xs leading-snug text-muted-foreground">{s.auto}</span>
  const tip = s.pending ? `先确认 ${s.pending} 列对照，再同步` : s.kind === '平台导出' ? `立即同步：去 ${s.inbox_dir ?? '导入文件夹'}/ 找新文件，按规则导` : '立即同步：现在读一遍知识库'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant={compact ? 'outline' : 'ghost'} aria-label={tip} disabled={busy} onClick={(e) => { e.stopPropagation(); sync.mutate(s.id) }}>
          <RefreshCw className={cn(busy && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function SourceTable({ rows, strips, onOpen }: { rows: Source[]; strips?: Record<string, StripDay[]>; onOpen: (id: string) => void }) {
  return (
    <StickyTable maxHeight="none" className="hidden md:block">
      <TableHeader><TableRow className="hover:bg-transparent">
        <TableHead className="pl-4">数据源</TableHead><TableHead>方式</TableHead><TableHead>最近更新</TableHead><TableHead>数据截至</TableHead>
        <TableHead className="hidden xl:table-cell">近 7 天</TableHead><TableHead>状态</TableHead><TableHead>下一次</TableHead><TableHead className="pr-4 text-right">同步</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((s) => {
          const Icon = iconOf(s)
          return (
            <TableRow key={s.id} className="cursor-pointer" onClick={() => onOpen(s.id)}>
              <TableCell className="max-w-[320px] min-w-[220px] py-3 pl-4">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2"><Icon className="size-3.5 text-muted-foreground" /></span>
                  <div className="min-w-0">
                    <button className="block max-w-full truncate text-left font-medium hover:text-primary" onClick={(e) => { e.stopPropagation(); onOpen(s.id) }}>{s.name}</button>
                    <div className="truncate text-xs text-muted-foreground" title={s.feeds}>{s.feeds}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{s.way}{s.owner && <div className="text-xs text-muted-foreground">{s.owner}负责</div>}</TableCell>
              <TableCell><LastCell s={s} /></TableCell>
              <TableCell className={cn('num whitespace-nowrap', s.display === '读取失败' && 'font-medium text-danger')}>{s.realtime ? <span className="text-muted-foreground">实时</span> : mdOf(s.data_through)}</TableCell>
              <TableCell className="hidden xl:table-cell">{s.realtime ? <span className="text-xs text-muted-foreground">直接读，不用跑</span> : strips?.[s.id] ? <RunStrip days={strips[s.id]} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell><Badge value={s.display} />{s.pending > 0 && <div className="mt-1 text-xs whitespace-nowrap text-warn">{s.pending} 列等确认</div>}</TableCell>
              <TableCell><NextCell s={s} /></TableCell>
              <TableCell className="pr-4 text-right"><SyncAction s={s} /></TableCell>
            </TableRow>
          )
        })}
        {!rows.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">这个分类下没有数据源</TableCell></TableRow>}
      </TableBody>
    </StickyTable>
  )
}

/** 手机：一张卡一个来源（名称、状态、数据截至、下一次、同步） */
function SourceCards({ rows, onOpen }: { rows: Source[]; onOpen: (id: string) => void }) {
  return (
    <ul className="grid gap-2.5 md:hidden">
      {rows.map((s) => {
        const Icon = iconOf(s)
        return (
          <li key={s.id} className="rounded-xl border bg-card p-3.5 shadow-paper" onClick={() => onOpen(s.id)}>
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2"><Icon className="size-4 text-muted-foreground" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="min-w-0 truncate font-medium">{s.name}</span></div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Badge value={s.display} />
                  {!s.realtime && <span className="num whitespace-nowrap">数据到 {mdOf(s.data_through)}</span>}
                  {!s.realtime && <span className="whitespace-nowrap">下一次 <NextCell s={s} withAuto /></span>}
                </div>
              </div>
              <span onClick={(e) => e.stopPropagation()}><SyncAction s={s} compact /></span>
            </div>
            {(s.pending > 0 || s.parts.some((p) => p.tone !== 'ok') || s.display === '没数据') && <p className="mt-2 text-xs text-warn">{s.display === '没数据' ? '现在没有数（示例数据清掉了）' : s.pending ? `${s.pending} 列对照等你确认` : s.parts.filter((p) => p.tone !== 'ok').map((p) => `${p.label}：${p.text}`).join('；')}</p>}
          </li>
        )
      })}
    </ul>
  )
}

/** 提醒规则：和 server/modules/data/service.ts、preview.ts 里的判断一致 */
function RulesExplained() {
  const items = [
    { icon: AlarmClock, tone: 'text-warn', title: '超时：过了约定时间 30 分钟还没新数据', text: '标“没按时更新”，今日页的数据异常里会出现一条。数据停在哪天就写哪天，不拿前一天的数顶上。' },
    { icon: ShieldAlert, tone: 'text-danger', title: '读取失败：记缺口，不当 0', text: '记一条失败和原因（例：平台改了列名）。缺的那几天在经营页显示“缺”，不会画成 0；补导之后自动补上。' },
    { icon: TriangleAlert, tone: 'text-warn', title: '表头变了：对不上规则就停下来', text: '少了一列、多了没见过的列，都不猜，等你确认。缺的数不能算成 0。' },
    { icon: TrendingUp, tone: 'text-info', title: '数字异常：导入前标出来让你核对', text: '和近 30 天的中位数差 3 倍以上、订单比访客还多、有推广成交却没有花费，预览里标黄，不拦。' },
  ]
  return (
    <Panel title="什么时候提醒你" desc="四条规则，网页、今日页和 Codex 都按这一套提醒">
      <ul className="grid gap-3.5">
        {items.map((i) => (
          <li key={i.title} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2"><i.icon className={cn('size-4', i.tone)} /></span>
            <div className="min-w-0"><div className="text-[14px] font-medium">{i.title}</div><p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{i.text}</p></div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function FlowExplained() {
  const steps = [
    ['平台后台导出', '阿杰、晓雯每天早上导出昨天的 5 张表：店铺日报、商品、流量来源、售后、推广（CSV）'],
    ['放进导入文件夹', '工作台/导入/抖店/ 这样一个平台一个；或者直接拖到导入页'],
    ['按规则对字段', '第一次对好存成规则；表头变了就停下来，等你点头'],
    ['写进经营数据', '同一天同一渠道覆盖，不累加；每次导入能撤销'],
    ['今日页、经营页、早报', '07:55 Codex 定时任务汇总写经营早报'],
  ]
  return (
    <Panel title="数据怎么进来" desc="平台导出的路线；飞书表格、RSS 由定时任务直接读">
      <ol className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
        {steps.map(([t, d], i) => (
          <li key={t} className="relative flex gap-3">
            <span className="num relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-card text-xs font-medium">{i + 1}</span>
            <div className="min-w-0"><div className="text-[14px] font-medium">{t}</div><p className="text-[13px] text-muted-foreground">{d}</p></div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function LoadingRows() {
  return <div className="grid gap-3"><div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-96" /></div>
}
