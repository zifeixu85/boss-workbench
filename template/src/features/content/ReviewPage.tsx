// 小红书 · 复盘：一周按周二到下周一（和知识库的每周复盘一样，每周二 07:30 定时任务写上一周）。
// 页头切换哪一周；正文：谁写的、指标（比上周红涨绿跌）、总结、做得好的 / 要改的、经验（点头才存进知识库）、下周选题建议、这周发的笔记。
// “生成复盘 / 重新生成”现场调本机 Codex；重新生成先确认，已存的经验和已放进灵感池的选题保留，旧的一份留着。没有对话窗口。归属：小红书内容模块。
import { useState } from 'react'
import { Link } from 'react-router'
import { AlertCircle, Bot, ChevronLeft, ChevronRight, History, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { PageHeader, PageBody, SubTabs, Stat } from '@/components/page'
import { Dot } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Choice } from '@/components/form'
import { EmptyNote } from '@/components/chart-kit'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, useApi, useWrite } from '@/lib/api'
import { md, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { now } from '@/lib/clock'
import { CONTENT_TABS } from './tabs'
import { useParam, mdhm, took, usePieceParam } from './lib'
import { useReviewDetail } from './api'
import { ContentOverlays } from './ContentOverlays'
import { ExampleTag, TrafficTag } from './badges'
import { Learnings, Ideas } from './review/parts'
import type { Review, ReviewDetail, WeekRow } from './types'

export default function ReviewPage() {
  const { data: weeks } = useApi<WeekRow[]>('/content/reviews')
  const fallback = weeks?.find((w) => w.state === '已复盘')?.week ?? weeks?.[1]?.week ?? ''
  const [week, setWeek] = useParam<string>('week', fallback)
  const sel = weeks?.some((x) => x.week === week) ? week : fallback // 旧链接（2026-W43 这种）或不在列表里的，退回最近复盘过的那周
  const { data } = useReviewDetail(sel || null)
  const at = weeks?.findIndex((x) => x.week === sel) ?? -1
  const w = at >= 0 ? weeks![at] : undefined
  const older = at >= 0 ? weeks![at + 1] : undefined
  const newer = at > 0 ? weeks![at - 1] : undefined
  return (
    <>
      <PageHeader eyebrow="内容 · 小红书" title="复盘" desc="一周按周二到下周一算，和每周复盘一样；每周二 07:30 Codex 定时任务写上一周。看出来的规律，你点头了才存进知识库。"
        actions={weeks && w && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="上一周" disabled={!older} onClick={() => older && setWeek(older.week)}><ChevronLeft /></Button>
            <Choice className="w-[236px] sm:w-[296px]" value={sel} onChange={(v) => v && setWeek(v)} options={weeks.map((x) => ({ value: x.week, label: `${x.label} · ${x.state === '已复盘' ? (x.pending ? `${x.pending} 条经验待定` : '已复盘') : x.state} · ${x.posts} 篇` }))} />
            <Button variant="outline" size="icon-sm" aria-label="下一周" disabled={!newer} onClick={() => newer && setWeek(newer.week)}><ChevronRight /></Button>
          </div>
        )}>
        <SubTabs items={CONTENT_TABS} />
      </PageHeader>
      <PageBody>
        {!data || !w ? <div className="grid gap-4"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : <WeekReview key={sel} d={data} w={w} />}
      </PageBody>
      <ContentOverlays />
    </>
  )
}

function WeekReview({ d, w }: { d: ReviewDetail; w: WeekRow }) {
  const m = d.metrics
  const p = d.prev
  const r = d.review
  const [ask, setAsk] = useState(false)
  const [old, setOld] = useState(false)
  const gen = useWrite((week: string) => api.post(`/content/reviews/${week}/generate`, {}), '已经让本机 Codex 写复盘了，一般 1 分钟左右')
  const delta = (a: number, b?: number | null) => (b ? Math.round(((a - b) / b) * 100) : null)
  const run = () => (r ? setAsk(true) : gen.mutate(m.week))
  return (
    <div className="grid gap-5">
      <section className="rounded-xl border bg-card px-5 py-4 shadow-paper">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-[22px] font-semibold">{md(m.from)}—{md(m.to)} 这周</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              {r ? <><span className="inline-flex items-center gap-1.5"><Bot className="size-4 shrink-0" />{r.written_by}</span>{mdhm(r.created_at)} 写的 · 用时 {took(r.duration_ms)}{r.origin === '示例' && <ExampleTag text="示例数据" />}</>
                : w.state === '本周' ? `这周还没过完，${md(m.to)} 过完后周二早上复盘` : '这周没复盘过：点右边“生成复盘”，本机 Codex 现场写一份'}
            </p>
            {r?.previous && <button type="button" onClick={() => setOld(true)} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><History className="size-3.5" />替换了 {r.previous.written_by} {mdhm(r.previous.created_at)} 写的那份（还留着，点开看）</button>}
          </div>
          {w.state !== '本周' && (
            <Button variant={r ? 'outline' : 'default'} disabled={!!d.running || gen.isPending || !m.posts} onClick={run}>
              {d.running || gen.isPending ? <Loader2 className="animate-spin" /> : r ? <RefreshCw /> : <Sparkles />}{r ? '重新生成' : '生成复盘'}
            </Button>
          )}
        </div>
        {d.running && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info"><Loader2 className="size-4 animate-spin" />本机 Codex 正在写复盘：{d.running.progress ?? '读账号定位和规律…'}（已经 {Math.max(0, Math.round((now().getTime() - Date.parse(d.running.started_at)) / 1000))} 秒，关掉页面也会写完）</div>
        )}
        {!d.running && d.last_error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="flex-1">上次没写成：{d.last_error}</span><Button size="xs" variant="outline" onClick={() => gen.mutate(m.week)}>重试</Button></div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="发布" value={m.posts} unit="篇" hint={`${m.with_data} 篇有数据 · 上周 ${p.posts} 篇`} />
        <Stat label="自然阅读" value={thousands(m.organic_reads)} hint={<Change v={delta(m.organic_reads, p.organic_reads)} extra={`合计 ${thousands(m.total_reads)}（含投流）`} />} />
        <Stat label="自然收藏" value={thousands(m.organic_saves)} hint={<Change v={delta(m.organic_saves, p.organic_saves)} extra={`整体收藏率 ${m.save_rate ?? '—'}%`} />} />
        <Stat label="涨粉" value={thousands(m.new_followers)} hint={<Change v={delta(m.new_followers, p.new_followers)} extra={m.spend ? `投流 ${thousands(m.spend)} 元` : '这周没投流'} />} />
      </div>

      {r ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-5">
            <section className="rounded-xl border bg-card px-5 py-4 shadow-paper">
              <h3 className="mb-1.5 text-[15px] font-semibold">总结</h3>
              <p className="text-[14.5px] leading-7">{r.summary}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><h4 className="mb-1.5 text-[13px] font-semibold">做得好的</h4><ul className="grid gap-2">{r.worked.map((x, i) => <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed"><span className="mt-[9px]"><Dot tone="ok" /></span>{x}</li>)}</ul></div>
                <div><h4 className="mb-1.5 text-[13px] font-semibold">要改的</h4><ul className="grid gap-2">{r.change.map((x, i) => <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed"><span className="mt-[9px]"><Dot tone="warn" /></span>{x}</li>)}</ul></div>
              </div>
              <p className="mt-3 text-[11.5px] text-muted-foreground">数据截至 {md(String(r.inputs.through ?? m.through))} 累计，以自然流量为准；账号一篇的收藏率中位数 {m.median_rate ?? '—'}%。</p>
            </section>
            <Learnings week={m.week} items={r.learnings} />
          </div>
          <div className="grid min-w-0 gap-5">
            <Ideas week={m.week} ideas={r.ideas} />
            <WeekNotes d={d} />
          </div>
        </div>
      ) : (
        <>
          {w.state !== '本周' && !d.running && <EmptyNote>这周还没复盘。点右上“生成复盘”，本机 Codex 会按这周的数据、账号定位和规律写一份；写好的经验要你点头才存进知识库。</EmptyNote>}
          <WeekNotes d={d} />
        </>
      )}
      <p className="text-[11.5px] text-muted-foreground">想看某一篇的手机样子和第 1、3、7 天，点标题。复盘放进灵感池的选题在 <Link to="/content/pieces" className="text-primary hover:underline">内容</Link> 里。</p>

      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新生成这周的复盘？</AlertDialogTitle>
            <AlertDialogDescription>本机 Codex 会现场重写一份，换掉现在这份（{r?.written_by} {r ? mdhm(r.created_at) : ''} 写的）。现在这份会留着能翻看；已经存进知识库的经验、已经放进灵感池的选题都保留，不会重复存。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>先不了</AlertDialogCancel><AlertDialogAction onClick={() => gen.mutate(m.week)}>重新生成</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {old && r?.previous && <Previous r={r} onClose={() => setOld(false)} />}
    </div>
  )
}

/** 被替换掉的那一份（只读） */
function Previous({ r, onClose }: { r: Review; onClose: () => void }) {
  const p = r.previous!
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[84vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">原来那份复盘</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">{p.written_by} {mdhm(p.created_at)} 写的（只读）{p.origin === '示例' && <ExampleTag text="示例数据" />}</DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-7">{p.summary}</p>
        <div className="grid gap-3 text-[13px] md:grid-cols-2">
          <div><div className="mb-1 font-semibold">做得好的</div><ul className="grid list-disc gap-1 pl-4">{p.worked.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          <div><div className="mb-1 font-semibold">要改的</div><ul className="grid list-disc gap-1 pl-4">{p.change.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WeekNotes({ d }: { d: ReviewDetail }) {
  const m = d.metrics
  const sheet = usePieceParam()
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-paper">
      <div className="flex items-baseline justify-between gap-2 border-b px-5 py-3"><h3 className="text-[15px] font-semibold">这周发的 {m.notes.length} 篇</h3><span className="text-xs text-muted-foreground">截至 {md(m.through)} · 自然阅读 / 收藏</span></div>
      {m.notes.length ? (
        <ul className="divide-y">
          {m.notes.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => n.piece_id && sheet.open(n.piece_id)} className="flex w-full min-w-0 items-center gap-3 px-5 py-2.5 text-left hover:bg-muted/40">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{n.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{md(n.date)} · {n.kind} · {n.pillar_name}<TrafficTag boosted={n.boosted} spend={n.paid?.spend} none={!n.organic && !n.paid} /></span>
                </span>
                <span className="num shrink-0 text-right text-[13px]">{n.organic ? <>{thousands(n.organic.reads)}<span className="ml-1.5 text-muted-foreground">/ {thousands(n.organic.saves)}</span></> : <span className="text-muted-foreground">—</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="px-5 py-6 text-sm text-muted-foreground">这周没发笔记。</p>}
    </section>
  )
}

/** 比上周：红涨绿跌，只说方向 */
function Change({ v, extra }: { v: number | null; extra?: string }) {
  return (
    <span className="flex flex-wrap gap-x-1.5">
      {v != null && <span>比上周 <span className={cn('num font-medium', v > 0 && 'text-rise', v < 0 && 'text-fall')}>{v > 0 ? '▲' : v < 0 ? '▼' : ''}{Math.abs(v)}%</span></span>}
      {extra && <span>{extra}</span>}
    </span>
  )
}
