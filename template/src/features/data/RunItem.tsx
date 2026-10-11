// 运行记录（时间线）：结果、一句话、文件和行数；连着几天都成功的合成一条（点开看每一天），失败、超时、没导全的单独一条，默认展开看原因。
// 预置的记录写“预置”，示例里没放原件的文件如实说；你在网页、命令行现场导的标“你导的”。归属：数据源与导入模块
import { useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge, TablesLine } from './parts'
import { actorText, spanOf, when } from './labels'
import type { Run } from './types'
import { groupRuns } from './runs'

const DOT: Record<string, string> = { 成功: 'bg-ok', 部分成功: 'bg-warn', 失败: 'bg-danger', 超时: 'bg-warn', 进行中: 'bg-info' }

/** 运行时间：跑了一整段的（日历一天的汇总）写成“10/26 00:00—23:30”；几分钟就写好的写“几点写好”那个时间（结束时间） */
function timeText(r: Run) {
  if (r.finished_at && r.finished_at.slice(0, 10) === r.started_at.slice(0, 10) && minutes(r.started_at, r.finished_at) > 30) return `${when(r.started_at)}—${r.finished_at.slice(11, 16)}`
  if (r.finished_at && r.finished_at.slice(0, 10) !== r.started_at.slice(0, 10) && r.status === '超时') return `${when(r.started_at)} 起`
  return when(wrote(r) ? r.finished_at : r.started_at)
}
/** Codex 定时任务写东西要几分钟：记录写“几点写好”（和内容、大客户、经营模块里“由 Codex 定时任务几点写”一致） */
const wrote = (r: Run) => /Codex/.test(r.actor) && !!r.finished_at && r.finished_at.slice(0, 10) === r.started_at.slice(0, 10)
const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000

export function RunTimeline({ runs }: { runs: Run[] }) {
  const items = groupRuns(runs)
  const firstBad = runs.find((r) => r.status !== '成功')?.id
  return (
    <ol className="grid">
      {items.map((it) => it.kind === 'one'
        ? <RunItem key={it.run.id} run={it.run} defaultOpen={it.run.id === firstBad} />
        : <RunGroup key={it.runs[0].id} runs={it.runs} />)}
    </ol>
  )
}

function Line({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <li className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0 before:absolute before:top-4 before:bottom-0 before:left-[8px] before:w-px before:bg-border last:before:hidden">
      <span className={cn('relative z-10 mt-1.5 size-[9px] justify-self-center rounded-full ring-4 ring-card', dot)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </li>
  )
}

function RunGroup({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState(false)
  const newest = runs[0]
  const oldest = runs.at(-1)!
  // Codex 定时任务按“几点写好”算；飞书日历是一整天的汇总，单独说
  const times = [...new Set(runs.map((r) => (wrote(r) ? r.finished_at! : r.started_at).slice(11, 16)))].sort()
  const calendar = newest.detail?.sub === '日历'
  return (
    <Line dot="bg-ok">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="num font-medium">{spanOf(oldest.started_at.slice(0, 10), newest.started_at.slice(0, 10))}</span>
        <Badge value="成功" /><span className="text-xs text-muted-foreground">{actorText(newest.actor)} · 预置</span>
      </div>
      <p className="mt-0.5 text-[13.5px] leading-relaxed">{calendar ? `日历每 30 分钟同步一次，${runs.length} 天都成功` : `每天 ${times.length > 2 ? `${times[0]}—${times.at(-1)}` : times.join('、')} 都成功，一共 ${runs.length} 次`}</p>
      {!calendar && <p className="text-xs text-muted-foreground">最近一次：{newest.message}</p>}
      <TablesLine tables={newest.detail?.表} className="mt-0.5" />
      <button className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary hover:underline" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '看每一天'}<ChevronDown className={cn('size-3 transition', open && 'rotate-180')} /></button>
      {open && <ul className="mt-2 grid gap-1 rounded-lg border bg-background/70 p-2.5 text-[12.5px]">{runs.map((r) => <li key={r.id} className="flex gap-2"><span className="num w-[86px] shrink-0 text-muted-foreground">{timeText(r)}</span><span className="min-w-0">{r.message}</span></li>)}</ul>}
    </Line>
  )
}

export function RunItem({ run: r, defaultOpen }: { run: Run; defaultOpen?: boolean }) {
  const d = r.detail
  const hasDetail = !!d && (!!d.表头?.length || !!d.缺少的列?.length || !!d.多出来的列?.length || !!d.样例行 || !!d.rows?.length || !!d.有问题的行?.length || !!d.建议 || !!d.拿不准的列?.length)
  const [open, setOpen] = useState(!!defaultOpen && hasDetail)
  const file = r.file_name?.split('/').pop()
  return (
    <Line dot={DOT[r.status] ?? 'bg-muted-foreground'}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="num font-medium">{timeText(r)}</span>
        <Badge value={r.status} />
        {r.batch_status === '已撤销' && <Badge value="已撤销" />}
        {!r.preset && <Badge value="你导的" />}
        <span className="text-xs text-muted-foreground">{actorText(r.actor)}{r.preset ? ' · 预置' : ''}</span>
      </div>
      <p className="mt-0.5 text-[13.5px] leading-relaxed">{r.message}</p>
      <TablesLine tables={d?.表} className="mt-0.5" />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {file && <span className="inline-flex max-w-full items-center gap-1 truncate"><FileText className="size-3 shrink-0" />{file}</span>}
        {r.rows_total != null && r.rows_total > 0 && !d?.表 && !d?.sub && <span className="num">{r.rows_ok ?? 0}/{r.rows_total} 行{r.rows_failed ? `，${r.rows_failed} 行没导` : ''}</span>}
        {d?.表 && !!r.rows_failed && <span className="num text-warn">{r.rows_failed} 行没导</span>}
        {(r.date_from || r.data_date) && !r.detail?.sub && <span className="num">数据 {spanOf(r.date_from, r.data_date)}</span>}
        {hasDetail && <button className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '看原因'}<ChevronDown className={cn('size-3 transition', open && 'rotate-180')} /></button>}
      </div>
      {open && d && <RunDetailView d={d} />}
    </Line>
  )
}

function Chips({ label, items, tone }: { label: string; items: string[]; tone: 'danger' | 'info' | 'warn' }) {
  const cls = { danger: 'border-danger/30 bg-danger-soft text-danger', info: 'border-info/30 bg-info-soft text-info', warn: 'border-warn/30 bg-warn-soft text-warn' }[tone]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[76px] shrink-0 text-xs text-muted-foreground">{label}</span>
      {items.map((x) => <span key={x} className={cn('rounded-md border px-1.5 py-0.5 text-xs', cls)}>{x}</span>)}
    </div>
  )
}

export function RunDetailView({ d }: { d: NonNullable<Run['detail']> }) {
  const problems = d.rows ?? d.有问题的行 ?? []
  return (
    <div className="mt-2.5 grid gap-2.5 rounded-xl border bg-background/70 p-3.5">
      {!!d.缺少的列?.length && <Chips label="缺少的列" items={d.缺少的列} tone="danger" />}
      {!!d.多出来的列?.length && <Chips label="多出来的列" items={d.多出来的列} tone="info" />}
      {!!d.拿不准的列?.length && <Chips label="拿不准的列" items={d.拿不准的列} tone="warn" />}
      {!!d.表头?.length && <Chips label="这份的表头" items={d.表头} tone="info" />}
      {d.样例行 && (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">新表的一行（《{d.样例行.笔记标题?.split('：')[0] ?? '样例'}》）</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-3">
            {Object.entries(d.样例行).filter(([k]) => k !== '笔记标题').map(([k, v]) => <div key={k} className="min-w-0"><dt className="truncate text-muted-foreground">{k}</dt><dd className="num truncate">{v}</dd></div>)}
          </dl>
        </div>
      )}
      {problems.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">没导进来的行</div>
          <ul className="grid gap-1 text-[12.5px]">{problems.map((p) => <li key={p.行} className="flex gap-2"><span className="num shrink-0 text-muted-foreground">第 {p.行} 行</span><span className="min-w-0">{'商品' in p && p.商品 ? `${p.商品}：` : ''}{p.原因}</span></li>)}</ul>
        </div>
      )}
      {d.建议 && <p className="text-[13px]"><span className="text-muted-foreground">怎么办：</span>{d.建议}</p>}
    </div>
  )
}
