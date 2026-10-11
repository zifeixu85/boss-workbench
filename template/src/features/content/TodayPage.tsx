// 小红书 · 今天：今天发这篇、一句话开写 + 四个起点、本周排期、今日选题、数据提醒。没有对话窗口（对话只在创作页）。归属：小红书内容模块。
import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CheckCheck, ChevronRight, CircleCheck, Clock3, Eye, PenLine, Plus, Send } from 'lucide-react'
import { PageHeader, PageBody, Panel, SubTabs } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Failed } from '@/components/chart-kit'
import { fullDate, md, thousands, todayStr } from '@/lib/format'
import { now } from '@/lib/clock'
import { cn } from '@/lib/utils'
import { useCenter, usePatchPiece } from './api'
import { CONTENT_TABS } from './tabs'
import { SOURCE_SHORT, mdhm, usePieceParam, useChecks } from './lib'
import { StatusTag, ExampleTag } from './badges'
import { verdictOf } from './ChecksPanel'
import { PhonePreview } from './phone/PhonePreview'
import { ContentOverlays, useCreateParam } from './ContentOverlays'
import { OneLine, StartPicker } from './starts'
import { WeekStrip, TopicsPanel, RemindersPanel } from './TodayParts'
import { PublishDialog } from './dialogs'
import type { CenterToday, PieceDetail, PieceStatus } from './types'

export default function TodayPage() {
  const { data, isLoading, error, refetch } = useCenter()
  const create = useCreateParam()
  const a = data?.account
  return (
    <>
      <PageHeader eyebrow="内容 · 小红书" title="今天"
        desc={data ? <>{fullDate(data.date)} · {a?.name} 粉丝 <span className="num">{thousands(a?.followers)}</span>{a?.followers_7d != null && <>（近 7 天 <span className="num text-rise">+{a.followers_7d}</span>）</>} · 笔记数据截至 {md(a?.through)}</> : '读取中…'}
        actions={<><Button variant="outline" onClick={() => create.open('piece')}><Plus />记一个选题</Button><Button asChild><Link to="/content/studio"><PenLine />去创作</Link></Button></>}>
        <SubTabs items={CONTENT_TABS} />
      </PageHeader>
      <PageBody className="grid gap-5">
        {error ? <Failed message={(error as Error).message} onRetry={() => refetch()} /> : isLoading || !data ? <TodaySkeleton /> : (
          <>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.32fr)_minmax(360px,1fr)]">
              <MainCard d={data} />
              <div className="grid content-start gap-5">
                <Panel title="想写一篇什么？" desc="一句话，或者从下面四个地方开始">
                  <OneLine />
                </Panel>
                <RemindersPanel items={data.reminders} />
              </div>
            </div>
            <WeekStrip week={data.week} />
            <TopicsPanel topics={data.topics} />
          </>
        )}
      </PageBody>
      <ContentOverlays />
      <StartPicker />
    </>
  )
}

function TodaySkeleton() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.32fr_1fr]"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /></div>
      <Skeleton className="h-36" /><Skeleton className="h-72" />
    </div>
  )
}

function MainCard({ d }: { d: CenterToday }) {
  const piece = useCenterMain(d)
  if (!piece) {
    return (
      <Panel title="今天发这篇" desc="今天没排">
        <div className="grid place-items-center gap-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">今天没有要发的。{d.fallback ? `可以把「${d.fallback.title}」提前，或者从下面的选题里挑一个。` : '从下面的选题里挑一个开始写。'}</p>
          <Button asChild variant="outline"><Link to="/content/pieces?view=calendar"><CalendarClock />去排期</Link></Button>
        </div>
      </Panel>
    )
  }
  const next = d.week.days.filter((x) => x.date > d.date).flatMap((x) => x.items.map((i) => ({ ...i, date: x.date, weekday: x.weekday }))).slice(0, 3)
  return <MainPiece m={piece} next={next} />
}
const useCenterMain = (d: CenterToday) => d.main
const nowHm = () => now().toTimeString().slice(0, 5)
const slot = (t?: string | null) => (!t ? '' : t < '11:00' ? '上午发' : t < '14:00' ? '午休时间发' : t < '19:30' ? '下班路上发' : '晚上发')
type Next = { id: string; title: string; status: PieceStatus; time: string | null; date: string; weekday: string }

function MainPiece({ m, next }: { m: PieceDetail; next: Next[] }) {
  const p = m.piece
  const sheet = usePieceParam()
  const [pub, setPub] = useState(false)
  const checks = useChecks(m.has_draft ? m.draft : null, p.scheduled_date)
  const patch = usePatchPiece('记下了：林总看过了')
  const last = m.versions[0]
  const published = p.status === '已发布'
  const bad = checks?.items.filter((i) => i.level !== 'ok') ?? []
  const seen = /林总.*看过/.test(p.memo ?? '')
  return (
    <section className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-paper">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[40%] bg-gradient-to-br from-accent/80 via-accent/30 to-transparent sm:block" />
      <div className="relative grid gap-6 p-5 sm:grid-cols-[236px_minmax(0,1fr)] sm:p-6">
        <div className="hidden self-start sm:block">
          <button type="button" onClick={() => sheet.open(p.id)} className="block transition-transform hover:-translate-y-0.5" aria-label="打开这篇的手机预览">
            <PhonePreview draft={m.draft} view="笔记页" size="sm" className="[--s:0.69]" />
          </button>
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="text-[13px] font-semibold text-foreground">今天发这篇</span>
            <StatusTag s={p.status} />
            {p.pillar_name && <span>{p.pillar_name}</span>}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <Clock3 className="size-5 self-center text-primary" />
            <span className="num font-heading text-[40px] leading-none font-semibold tracking-tight">{published ? p.published_at?.slice(11, 16) : p.scheduled_time ?? '—'}</span>
            <span className="text-sm text-muted-foreground">{published ? '已经发了' : slot(p.scheduled_time)}</span>
          </div>
          <h2 className="mt-3 font-heading text-[22px] leading-snug font-semibold">{m.draft.title || p.title}</h2>
          {p.angle && <p className="mt-1.5 text-sm text-muted-foreground">{p.angle}</p>}

          <div className="mt-4 overflow-hidden rounded-lg border bg-background/70 text-[13px]">
            <button type="button" onClick={() => sheet.open(p.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40">
              <span className="text-muted-foreground">发布前检查</span>
              {checks ? <span className={cn('inline-flex items-center gap-1 font-medium', checks.blocks ? 'text-danger' : checks.warns ? 'text-warn' : 'text-ok')}>
                {!checks.blocks && !checks.warns && <CircleCheck className="size-4" />}{verdictOf(checks)}<ChevronRight className="size-3.5 text-muted-foreground" />
              </span> : <span className="text-muted-foreground">还没有稿件</span>}
            </button>
            {bad.length > 0 && (
              <ul className="grid gap-1 border-t px-3 py-2">
                {bad.map((i) => <li key={i.key} className={cn('text-xs', i.level === 'block' ? 'text-danger' : 'text-warn')}><span className="font-medium">{i.label}</span>：{i.detail}</li>)}
              </ul>
            )}
            {last && <div className="border-t px-3 py-2 text-xs text-muted-foreground">稿件 v{m.version} · {mdhm(last.created_at)} {last.author}{last.origin === '手动修改' ? '改的' : `（${last.origin}）`}{last.note ? `：${last.note}` : ''}{last.example && <ExampleTag className="ml-1.5" />}</div>}
          </div>

          {!published && (
            <div className={cn('mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[13px]', seen ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
              {seen ? <CircleCheck className="size-4 shrink-0" /> : <Eye className="size-4 shrink-0" />}
              <span className="min-w-0 flex-1">{seen ? p.memo : p.memo ?? '发之前请林总看一眼'}</span>
              {!seen && <Button size="xs" variant="outline" className="bg-card" disabled={patch.isPending} onClick={() => patch.mutate({ id: p.id, memo: `林总 ${md(todayStr())} ${nowHm()} 看过了，可以发` })}><CheckCheck />林总看过了</Button>}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild><Link to={`/content/studio/${p.id}`}><PenLine />继续写</Link></Button>
            <Button variant="outline" onClick={() => sheet.open(p.id)}><Eye />看预览</Button>
            {p.status === '待发布' && <Button variant="outline" onClick={() => setPub(true)}><Send />标记已发布</Button>}
          </div>

          {p.reason && (
            <div className="mt-5 border-l-2 border-primary/40 pl-3 text-[12.5px] leading-relaxed">
              <div className="text-muted-foreground">为什么做 · {SOURCE_SHORT[p.source] ?? p.source} · {p.created_by}{p.topic_date ? ` ${md(p.topic_date)} 早上出的选题` : ''}</div>
              <div className="mt-0.5 text-foreground/85">{p.reason}</div>
            </div>
          )}

          {next.length > 0 && (
            <div className="pt-5">
              <div className="mb-1.5 text-xs text-muted-foreground">接下来要发</div>
              <ul className="divide-y overflow-hidden rounded-lg border bg-background/60">
                {next.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => sheet.open(x.id)} className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/40">
                      <span className="num w-[116px] shrink-0 text-[11.5px] whitespace-nowrap text-muted-foreground">{x.weekday} {md(x.date)} {x.time}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{x.title}</span>
                      <StatusTag s={x.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {pub && <PublishDialog piece={p} onClose={() => setPub(false)} />}
    </section>
  )
}
