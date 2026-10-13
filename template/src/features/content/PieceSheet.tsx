// 单篇抽屉（?piece=）：左边手机预览，右边按状态——写稿中 / 待发布看发布前检查，已发布看数据（第 1、3、7 天）。
// 今天、内容（看板 / 日历 / 列表）、数据、复盘都能打开。归属：小红书内容模块。
import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, CalendarClock, CheckCheck, PenLine, Repeat2, Send, Sparkles, Archive, TriangleAlert, LineChart as LineIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SheetSection } from '@/components/sheet-shell'
import { ViewTabs } from '@/components/view-tabs'
import { useApi } from '@/lib/api'
import { dateWithRel, shortDate, thousands, md } from '@/lib/format'
import { usePiece, usePatchPiece } from './api'
import { usePieceParam, SOURCE_SHORT, useChecks, mdhm, pct, isKbPath } from './lib'
import { StatusTag, TrafficTag, ExampleTag } from './badges'
import { DocChip } from './KbDoc'
import { weekOf } from './review/week'
import { PhonePreview, type PhoneView } from './phone/PhonePreview'
import { ChecksPanel } from './ChecksPanel'
import { ScheduleDialog, PublishDialog, useRemake } from './dialogs'
import { DailyChart } from './DailyChart'
import type { NoteDaily, Piece, PieceDetail } from './types'

export function PieceSheet() {
  const { id, close } = usePieceParam()
  const { data, error } = usePiece(id)
  const [view, setView] = useState<PhoneView>('笔记页')
  if (!id) return null
  if (error) return <Missing message={(error as Error).message} onClose={close} />
  const p = data?.piece
  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="flex flex-col gap-0 bg-card p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[980px]">
        <SheetHeader className="border-b px-6 pt-5 pb-4">
          <div className="text-xs tracking-wide text-muted-foreground">小红书 · {p?.pillar_name ?? '不在内容支柱里'} · {p?.format ?? '图文'}</div>
          <SheetTitle className="pr-8 font-heading text-xl leading-snug">{p ? (data.draft.title || p.title) : <Skeleton className="h-6 w-60" />}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {p && <StatusTag s={p.status} />}
              {p?.status === '已发布' ? <span>{shortDate(p.published_at)} {p.published_at?.slice(11, 16)} 发布</span>
                : p?.scheduled_date ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />排在 {dateWithRel(p.scheduled_date)} {p.scheduled_time ?? ''}</span> : p && <span>还没排期</span>}
              {data?.version ? <span>稿件 v{data.version}</span> : null}
              {p?.ai && <span className="inline-flex items-center gap-1 text-primary"><Sparkles className="size-3.5" />{p.created_by}出的选题</span>}
              {p?.status === '已发布' && <TrafficTag boosted={p.boosted} spend={p.paid_spend} none={!p.total} />}
            </div>
          </SheetDescription>
          {p && <Actions p={p} hasDraft={!!data?.has_draft} />}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!data ? <div className="grid gap-4 p-6 md:grid-cols-[320px_1fr]"><Skeleton className="h-[560px] rounded-[40px]" /><Skeleton className="h-96" /></div> : (
            <div className="grid gap-6 px-6 py-5 md:grid-cols-[320px_minmax(0,1fr)]">
              <div className="flex flex-col items-center gap-3 md:sticky md:top-0 md:self-start">
                <ViewTabs label="手机画面" value={view} onChange={setView} items={[{ value: '发现页', label: '发现页' }, { value: '笔记页', label: '笔记页' }]} />
                <PhonePreview draft={data.draft} view={view} selfNote={p!.note_id} comments={data.comments} stats={p!.status === '已发布' && p!.total ? { likes: p!.total.likes, saves: p!.total.saves, comments: p!.total.comments, date: p!.published_at!.slice(0, 10) } : null} />
                <p className="text-center text-[12px] text-muted-foreground">{view === '发现页' ? '红框是这篇，旁边是自己最近的笔记和收藏的同行笔记' : p!.status === '已发布' ? '点图片翻页；评论是赞最多的几条（后台导出的）' : '点图片翻页；封面和内页按模板实时画'}</p>
              </div>
              <div className="min-w-0">{p!.status === '已发布' ? <Published d={data} /> : <Draft d={data} />}</div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** 打开了不存在的一篇（链接旧了、已经放弃删掉了） */
function Missing({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 bg-card p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        <SheetHeader className="border-b px-6 pt-5 pb-4">
          <SheetTitle className="font-heading text-xl">找不到这一篇</SheetTitle>
          <SheetDescription>{message.includes('找不到') ? '可能已经放弃了，或者链接是旧的。' : message}</SheetDescription>
        </SheetHeader>
        <div className="grid place-items-center gap-3 px-6 py-14 text-center">
          <p className="text-sm text-muted-foreground">所有在做的、发过的都在“内容”里。</p>
          <Button asChild variant="outline" onClick={onClose}><Link to="/content/pieces">回到内容</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** 和经营那边对得上的事（例如这篇带火的商品正在退款） */
function RelatedNotes({ items }: { items: PieceDetail['related'] }) {
  if (!items.length) return null
  return (
    <div className="mb-5 grid gap-2">
      {items.map((r) => (
        <div key={r.href} className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1 text-foreground/90">{r.text}</span>
          <Link to={r.href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline">{r.label}<ArrowUpRight className="size-3" /></Link>
        </div>
      ))}
    </div>
  )
}

function Actions({ p, hasDraft }: { p: Piece; hasDraft: boolean }) {
  const [dlg, setDlg] = useState<'schedule' | 'final' | 'publish' | null>(null)
  const patch = usePatchPiece()
  const remake = useRemake()
  const week = p.published_at ? weekOf(p.published_at.slice(0, 10)).key : null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {['灵感池', '已选'].includes(p.status) && <>
        <Button size="sm" asChild><Link to={`/content/studio/${p.id}`}><PenLine />开始写</Link></Button>
        <Button size="sm" variant="outline" onClick={() => setDlg('schedule')}><CalendarClock />排期</Button>
        {p.status === '灵感池' && <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: p.id, status: '已选' })}><CheckCheck />放进已选</Button>}
        <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: p.id, status: '已放弃' })}><Archive />不做了</Button>
      </>}
      {p.status === '写稿中' && <>
        <Button size="sm" asChild><Link to={`/content/studio/${p.id}`}><PenLine />继续写</Link></Button>
        {hasDraft && <Button size="sm" variant="outline" onClick={() => setDlg('final')}><CheckCheck />定稿 · 排期</Button>}
      </>}
      {p.status === '待发布' && <>
        <Button size="sm" onClick={() => setDlg('publish')}><Send />标记已发布</Button>
        <Button size="sm" variant="outline" asChild><Link to={`/content/studio/${p.id}`}><PenLine />再改改</Link></Button>
        <Button size="sm" variant="outline" onClick={() => setDlg('schedule')}><CalendarClock />改排期</Button>
      </>}
      {p.status === '已发布' && <>
        {week && <Button size="sm" variant="outline" asChild><Link to={`/content/review?week=${week}`}><LineIcon />看这周复盘</Link></Button>}
        <Button size="sm" variant="outline" onClick={() => remake(p)}><Repeat2 />从这篇翻新</Button>
      </>}
      {p.status === '已放弃' && <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: p.id, status: '灵感池' })}>放回灵感池</Button>}
      {dlg === 'schedule' && <ScheduleDialog piece={p} onClose={() => setDlg(null)} />}
      {dlg === 'final' && <ScheduleDialog piece={p} finalize onClose={() => setDlg(null)} />}
      {dlg === 'publish' && <PublishDialog piece={p} onClose={() => setDlg(null)} />}
    </div>
  )
}

function Topic({ p }: { p: Piece }) {
  return (
    <SheetSection title="这个选题">
      <dl className="grid gap-2 text-sm">
        {p.warn && <div className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">提醒：{p.warn}</div>}
        <div className="grid grid-cols-[64px_1fr] gap-2"><dt className="text-muted-foreground">为什么做</dt><dd>{p.reason ?? <span className="text-muted-foreground">未填</span>}</dd></div>
        {p.angle && <div className="grid grid-cols-[64px_1fr] gap-2"><dt className="text-muted-foreground">角度</dt><dd>{p.angle}</dd></div>}
        {p.ref && <div className="grid grid-cols-[64px_1fr] gap-2"><dt className="text-muted-foreground">依据</dt><dd className="text-muted-foreground">{isKbPath(p.ref) ? <DocChip path={p.ref.trim()} /> : p.ref}</dd></div>}
        <div className="grid grid-cols-[64px_1fr] gap-2"><dt className="text-muted-foreground">来源</dt><dd>{SOURCE_SHORT[p.source] ?? p.source} · {p.created_by}{p.topic_date ? ` · ${md(p.topic_date)} 早上` : ''}</dd></div>
        {p.memo && <div className="grid grid-cols-[64px_1fr] gap-2"><dt className="text-muted-foreground">备注</dt><dd>{p.memo}</dd></div>}
      </dl>
    </SheetSection>
  )
}

function Draft({ d }: { d: PieceDetail }) {
  const p = d.piece
  const checks = useChecks(d.has_draft ? d.draft : null, p.scheduled_date)
  return (
    <>
      <RelatedNotes items={d.related} />
      {d.has_draft ? <div className="mb-6"><ChecksPanel checks={checks} ai={d.ai_check} /></div>
        : <p className="mb-6 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">还没动笔。点上面“开始写”进创作页，和 AI 聊一句就有第一版；手机预览先按标题画了个样子。</p>}
      <Topic p={p} />
      {d.versions.length > 0 && (
        <SheetSection title={`稿件版本（${d.versions.length}）`} action={<Link to={`/content/studio/${p.id}?tab=versions`} className="text-xs text-primary hover:underline">去创作页看全部</Link>}>
          <ul className="grid gap-1.5 text-[13px]">
            {d.versions.slice(0, 4).map((v) => (
              <li key={v.id} className="flex items-center gap-2"><span className="num w-7 font-medium">v{v.version}</span><span className="shrink-0 text-muted-foreground">{v.origin} · {v.author}</span>{v.example && <ExampleTag />}<span className="min-w-0 flex-1 truncate">{v.note}</span><span className="num text-xs text-muted-foreground">{mdhm(v.created_at)}</span></li>
            ))}
          </ul>
        </SheetSection>
      )}
    </>
  )
}

function Big({ label, total, organic, paid }: { label: string; total: number | null | undefined; organic?: number | null; paid?: number | null }) {
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-0.5 font-heading text-[22px] leading-tight font-semibold">{thousands(total)}</div>
      <div className="num mt-1 text-[12px] text-muted-foreground">自然 {thousands(organic)}{paid != null ? ` · 投流 ${thousands(paid)}` : ''}</div>
    </div>
  )
}

function Published({ d }: { d: PieceDetail }) {
  const p = d.piece
  const { data: daily } = useApi<NoteDaily>(p.note_id ? `/content/notes/${p.note_id}/daily` : null)
  if (!p.total) {
    return <>
      <RelatedNotes items={d.related} />
      <div className="mb-6 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">这篇还没有数据：笔记数据停在 {md(daily?.through ?? '2026-10-25')}，今早的导入没成功（平台改了导出表的列名）。<Link to="/sources?source=src_xhs_notes" className="text-primary hover:underline">去数据源看看</Link>，导入修好后这里自动出现第 1、3、7 天。</div>
      <Topic p={p} />
    </>
  }
  const rate = pct(p.saves, p.reads)
  return (
    <>
      <RelatedNotes items={d.related} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>数据截至 {md(p.stats_date)} 累计</span><span>·</span><span>自然收藏率 <span className="num font-medium text-foreground">{rate ?? '—'}%</span></span>
        {p.boosted && <><span>·</span><span>投流那部分带来阅读 <span className="num">{thousands(p.paid_reads)}</span></span></>}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Big label="阅读" total={p.total.reads} organic={p.reads} paid={p.boosted ? p.paid_reads : null} />
        <Big label="收藏" total={p.total.saves} organic={p.saves} />
        <Big label="点赞" total={p.total.likes} organic={p.likes} />
        <Big label="评论" total={p.total.comments} organic={p.comments} />
        <Big label="曝光" total={p.total.impressions} organic={p.impressions} />
        <Big label="涨粉" total={p.total.new_followers} organic={p.new_followers} />
      </div>
      <SheetSection title="发布后第 1、3、7 天（累计，自然 + 投流）">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">第几天</th><th className="px-3 py-2 text-right font-medium">阅读</th><th className="px-3 py-2 text-right font-medium">其中投流</th><th className="px-3 py-2 text-right font-medium">收藏</th><th className="px-3 py-2 text-right font-medium">涨粉</th></tr></thead>
            <tbody>
              {(daily?.milestones ?? []).map((m) => (
                <tr key={m.day} className="border-t">
                  <td className="px-3 py-2">第 {m.day} 天<span className="ml-1.5 text-xs text-muted-foreground">{md(m.date)}</span></td>
                  {m.row ? <>
                    <td className="num px-3 py-2 text-right">{thousands(m.row.reads)}</td><td className="num px-3 py-2 text-right text-muted-foreground">{m.row.paid_reads == null ? '—' : thousands(m.row.paid_reads)}</td>
                    <td className="num px-3 py-2 text-right">{thousands(m.row.saves)}</td><td className="num px-3 py-2 text-right">{thousands(m.row.new_followers)}</td>
                  </> : <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">{m.state === 'waiting' ? `还没到（${md(m.date)}）` : <span className="text-warn">{md(m.date)} 的数据没导进来（今早导入失败）<Link to="/sources?source=src_xhs_notes" className="ml-1.5 text-primary hover:underline">去数据源</Link></span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetSection>
      {daily && daily.series.length > 1 && (
        <SheetSection title={daily.takeaway ?? '阅读是怎么涨上来的'}>
          <DailyChart series={daily.series} boosted={p.boosted} />
        </SheetSection>
      )}
      <Topic p={p} />
    </>
  )
}
