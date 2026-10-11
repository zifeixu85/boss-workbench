// 今天页的三块：本周排期（7 天一条）、今日选题（Codex 定时任务早上写的）、数据提醒（按规则算的）。归属：小红书内容模块。
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, ArrowUpRight, Bot, CalendarPlus, CheckCheck, ChevronDown, Loader2, RefreshCw, TriangleAlert, TrendingUp } from 'lucide-react'
import { Panel } from '@/components/page'
import { Button } from '@/components/ui/button'
import { StatusBadge, Dot } from '@/components/status'
import { md } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePatchPiece } from './api'
import { SOURCE_SHORT, hm, took, localDay, usePieceParam } from './lib'
import { StatusTag, ExampleTag } from './badges'
import { useBegin } from './starts'
import { useCreateParam } from './ContentOverlays'
import type { CenterToday, Piece, Reminder } from './types'

export function WeekStrip({ week }: { week: CenterToday['week'] }) {
  const sheet = usePieceParam()
  const n = week.days.reduce((a, d) => a + d.items.length, 0)
  return (
    <Panel title="本周排期" desc={`第 ${Number(week.key.slice(6))} 周 · ${md(week.from)}—${md(week.to)} · 排了 ${n} 篇`}
      action={<Link to="/content/pieces?view=calendar" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">日历<ArrowRight className="size-3" /></Link>} bodyClass="p-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <ol className="grid min-w-[760px] grid-cols-7 gap-2">
          {week.days.map((d) => (
            <li key={d.date} className={cn('flex min-h-[132px] flex-col rounded-lg border bg-background/50 p-2', d.is_today && 'border-primary bg-accent/40 ring-1 ring-primary/30')}>
              <div className="mb-1.5 flex items-baseline justify-between px-0.5">
                <span className={cn('text-xs font-medium', d.is_today ? 'text-primary' : 'text-muted-foreground')}>{d.is_today ? '今天' : d.weekday}</span>
                <span className="num text-xs text-muted-foreground">{md(d.date)}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {d.items.map((x) => (
                  <button key={x.id} type="button" onClick={() => sheet.open(x.id)} className="group min-w-0 rounded-md border bg-card p-2 text-left shadow-paper transition-colors hover:border-primary">
                    <div className="mb-1 flex items-center justify-between gap-1"><StatusTag s={x.status} /><span className="num text-[11px] text-muted-foreground">{x.time}</span></div>
                    <div className="line-clamp-3 text-[12.5px] leading-snug group-hover:text-primary">{x.title}</div>
                  </button>
                ))}
                {!d.items.length && (
                  <Link to="/content/pieces?view=calendar" className="grid min-h-[76px] flex-1 place-items-center rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <span className="inline-flex items-center gap-1"><CalendarPlus className="size-3.5" />排一篇</span>
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  )
}

type Group = CenterToday['topics']['groups'][number]

/** 一组选题的表头：谁写的、几点、用了多久；示例数据和现场生成的分开写 */
function GroupHead({ g }: { g: Group }) {
  const j = g.job
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-5 py-2 text-[12.5px]', g.fresh ? 'bg-accent/50' : 'bg-surface-2/60')}>
      <Bot className="size-3.5 text-muted-foreground" />
      {j ? <>
        <span className="font-medium">{j.who === '本机 Codex' ? '现场 · 本机 Codex' : `早上 · ${j.who}`}</span>
        <span className="num text-muted-foreground">{md(localDay(j.finished_at ?? j.started_at))} {hm(j.finished_at ?? j.started_at)} 写的{j.duration_ms ? `，用时 ${took(j.duration_ms)}` : ''}</span>
        {j.origin === '示例' && <ExampleTag text="示例数据" />}
        {g.fresh && <StatusBadge value="刚出的" tone="primary" />}
      </> : <span className="text-muted-foreground">没记是哪次写的</span>}
      <span className="ml-auto text-xs text-muted-foreground">{g.items.length} 个</span>
    </div>
  )
}

function TopicItem({ t, n, onBegin, onPick, pending }: { t: Piece; n: number; onBegin: () => void; onPick: () => void; pending: boolean }) {
  return (
    <li className={cn('flex min-w-0 flex-col gap-1.5 border-b px-5 py-3.5 md:[&:nth-child(odd)]:border-r', t.status !== '灵感池' && 'bg-muted/30')}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span className="num w-5 font-medium">{String(n).padStart(2, '0')}</span>
        <StatusBadge value={SOURCE_SHORT[t.source] ?? t.source} tone="primary" />
        <span>{t.pillar_name ?? '不在四个支柱里'}</span>
        {t.status !== '灵感池' && <StatusTag s={t.status} />}
      </div>
      <button type="button" onClick={onBegin} disabled={pending} className="text-left text-[14.5px] leading-snug font-semibold hover:text-primary">{t.title}</button>
      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{t.reason}</p>
      {t.warn && <p className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2 py-1 text-[12px] text-warn"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{t.warn}</p>}
      {t.status === '灵感池' && (
        <div className="mt-0.5 flex gap-1.5">
          <Button size="xs" onClick={onBegin} disabled={pending}>就做这个</Button>
          <Button size="xs" variant="outline" onClick={onPick}><CheckCheck />先放进已选</Button>
        </div>
      )}
    </li>
  )
}

export function TopicsPanel({ topics }: { topics: CenterToday['topics'] }) {
  const [all, setAll] = useState(false)
  const create = useCreateParam()
  const patch = usePatchPiece('放进已选了')
  const { begin, pending } = useBegin()
  const items = topics.items
  const fresh = items.filter((t) => t.status === '灵感池').length
  const live = topics.groups.filter((g) => g.job?.who === '本机 Codex').reduce((a, g) => a + g.items.length, 0)
  return (
    <Panel
      title={`今日选题 · ${items.length} 个`}
      desc={<span>{topics.groups.length > 1 ? `早上写了 ${items.length - live} 个，现场又出了 ${live} 个` : '每天早上 07:00 Codex 定时任务按小红书的写法出 10 个'} · 还有 {fresh} 个没动{topics.warns > 0 && <> · <span className="text-warn">{topics.warns} 个附了提醒</span></>}</span>}
      action={<Button size="sm" variant="outline" onClick={() => create.open('topics')} disabled={!!topics.running}>{topics.running ? <Loader2 className="animate-spin" /> : <RefreshCw />}再出几个</Button>}
      bodyClass="p-0">
      {topics.running && (
        <div className="flex items-center gap-2 border-b bg-info-soft/60 px-5 py-2.5 text-[13px] text-info"><Loader2 className="size-4 animate-spin" />本机 Codex 正在出选题：{topics.running.progress ?? '读账号定位和作品索引…'}（{hm(topics.running.started_at)} 开始）</div>
      )}
      {!items.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">今天还没有选题。点右上“再出几个”，本机 Codex 现场出。</p>}
      {topics.groups.map((g) => {
        // 早上那组默认收起一半；附了提醒的不折叠（提醒要让人看到）
        const fold = !g.fresh && !all && g.items.length > 6
        const shown = fold ? g.items.filter((t, i) => i < 6 || t.warn) : g.items
        return (
          <div key={g.job?.id ?? 'none'}>
            <GroupHead g={g} />
            <ul className="grid md:grid-cols-2">
              {shown.map((t) => <TopicItem key={t.id} t={t} n={g.items.indexOf(t) + 1} pending={pending} onBegin={() => begin({ piece: t })} onPick={() => patch.mutate({ id: t.id, status: '已选' })} />)}
            </ul>
            {!g.fresh && g.items.length > 6 && (
              <button type="button" onClick={() => setAll(!all)} className="flex w-full items-center justify-center gap-1 border-b py-2.5 text-xs text-primary hover:bg-muted/40">
                {all ? '收起' : `看全部 ${g.items.length} 个（还有 ${g.items.length - shown.length} 个）`}<ChevronDown className={cn('size-3.5 transition-transform', all && 'rotate-180')} />
              </button>
            )}
          </div>
        )
      })}
    </Panel>
  )
}

export function RemindersPanel({ items }: { items: Reminder[] }) {
  const sheet = usePieceParam()
  const create = useCreateParam()
  const nav = useNavigate()
  const act = (r: Reminder) => {
    if (r.action.kind === 'topics') create.open('topics', r.action.value)
    else if (r.action.kind === 'piece' && r.action.value) sheet.open(r.action.value)
    else nav(r.action.value)
  }
  return (
    <Panel title="数据提醒" desc="按导进来的笔记数据算的，不是 AI 写的" bodyClass="grid gap-0 p-0">
      {items.map((r) => (
        <div key={r.id} className="flex gap-3 border-b px-5 py-3 last:border-b-0">
          <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-md', r.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-accent text-accent-foreground')}>
            {r.tone === 'warn' ? <TriangleAlert className="size-4" /> : <TrendingUp className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] leading-snug font-medium">{r.title}</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{r.detail}</p>
            <button type="button" onClick={() => act(r)} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">{r.action.label}<ArrowUpRight className="size-3" /></button>
          </div>
        </div>
      ))}
      {!items.length && <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground"><Dot tone="ok" />最近的数据没什么要提醒的。</p>}
    </Panel>
  )
}
