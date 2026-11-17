// 内容看板：五列，拖动换阶段；拖到“待发布”要先定日子，拖到“已发布”要先确认发布时间。卡片上不放改状态的下拉。归属：小红书内容模块。
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { CalendarClock, FileText, Sparkles, TriangleAlert, Video } from 'lucide-react'
import { Board, BoardColumn, MetaRow } from '@/components/data-view'
import { DndBoard, DragCard, DropColumn } from '@/components/dnd-board'
import { dateWithRel, md, thousands, addDays, todayStr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePatchPiece } from '../api'
import { BOARD, STATUS_HINT, SOURCE_SHORT, mdhm, usePieceParam } from '../lib'
import { StatusTag } from '../badges'
import { CoverArt } from '../phone/Cover'
import { ScheduleDialog, PublishDialog } from '../dialogs'
import type { Piece, PieceStatus } from '../types'

export function PieceCard({ p, onOpen }: { p: Piece; onOpen?: () => void }) {
  const thumb = p.draft && ['写稿中', '待发布', '已发布'].includes(p.status)
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-paper">
      <button type="button" onClick={onOpen} className="block w-full min-w-0 p-3 text-left">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-px">{p.format === '视频' ? <Video className="size-3" /> : <FileText className="size-3" />}{p.format}</span>
          <span className="truncate">{p.pillar_name ?? '不在支柱里'}</span>
          {p.ai && <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded bg-accent px-1 py-px text-accent-foreground" title={`${p.created_by}出的选题`}><Sparkles className="size-3" />AI</span>}
        </div>
        <div className="mt-2 flex gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[13.5px] leading-snug font-medium">{p.draft?.title || p.title}</div>
            {p.angle && ['灵感池', '已选'].includes(p.status) && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.angle}</div>}
          </div>
          {thumb && <div className="w-11 shrink-0 overflow-hidden rounded shadow-sm"><CoverArt text={p.draft!.cover_text} cover={p.draft!.cover} pages={p.draft!.pages} seed={p.draft!.title} /></div>}
        </div>
        {['灵感池', '已选'].includes(p.status) && p.reason && (
          <p className="mt-2 line-clamp-2 border-l-2 border-primary/40 pl-2 text-[12px] leading-relaxed text-muted-foreground"><span className="text-primary">为什么做 · {SOURCE_SHORT[p.source] ?? p.source}：</span>{p.reason}</p>
        )}
        {p.warn && p.status !== '已发布' && <p className="mt-2 flex gap-1 text-[12px] leading-snug text-warn"><TriangleAlert className="mt-px size-3 shrink-0" /><span className="line-clamp-2">{p.warn}</span></p>}
        <MetaRow className="mt-2.5">
          {p.status === '写稿中' && <span>{p.version ? `稿件 v${p.version} · ${mdhm(p.version_at)}` : '还没动笔'}</span>}
          {p.check && (p.check.blocks || p.check.warns) ? <span className={cn('font-medium', p.check.blocks ? 'text-danger' : 'text-warn')}>{p.check.blocks ? `检查：${p.check.blocks} 处要改` : `检查：${p.check.warns} 项提醒`}</span> : null}
          {['已选', '写稿中', '待发布'].includes(p.status) && p.scheduled_date && <span className={cn('inline-flex items-center gap-0.5', p.status === '待发布' && 'font-medium text-foreground')}><CalendarClock className="size-3" />{dateWithRel(p.scheduled_date)} {p.scheduled_time}</span>}
          {p.status === '已发布' && <span className="num">{md(p.published_at)} 发</span>}
          {p.status === '已发布' && (p.total ? <span className="num">阅读 {thousands(p.total.reads)} · 藏 {thousands(p.total.saves)}</span> : <span>还没有数据</span>)}
          {p.status === '已发布' && p.boosted && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-chart-2" />投了 {Math.round(p.paid_spend ?? 0)} 元</span>}
        </MetaRow>
      </button>
    </div>
  )
}

export function BoardView({ pieces }: { pieces: Piece[] }) {
  const sheet = usePieceParam()
  const patch = usePatchPiece()
  const [ask, setAsk] = useState<{ kind: 'final' | 'publish'; p: Piece } | null>(null)
  const since = addDays(todayStr(), -14)
  const by = (s: PieceStatus) => pieces.filter((p) => p.status === s)
  const cols = BOARD.map((s) => {
    let xs = by(s)
    if (s === '已发布') xs = xs.filter((p) => (p.published_at ?? '') >= since)
    if (s === '待发布' || s === '已选' || s === '写稿中') xs = [...xs].sort((a, b) => (a.scheduled_date ?? '9').localeCompare(b.scheduled_date ?? '9'))
    if (s === '灵感池') xs = [...xs].sort((a, b) => (b.topic_date ?? b.created_at).localeCompare(a.topic_date ?? a.created_at) || a.sort - b.sort)
    return { s, xs }
  })
  const older = by('已发布').length - cols[4].xs.length
  const move = (id: string, to: string) => {
    const p = pieces.find((x) => x.id === id)
    if (!p || p.status === to) return
    if (p.status === '已发布') { toast('已经发出去的笔记不能拖回去'); return }
    if (to === '已发布') { setAsk({ kind: 'publish', p }); return }
    if (to === '待发布') { setAsk({ kind: 'final', p }); return } // 定稿前看一眼日子和检查
    patch.mutate({ id, status: to })
  }
  const abandoned = by('已放弃')
  return (
    <>
      <DndBoard onMove={move} renderOverlay={(id) => { const p = pieces.find((x) => x.id === id); return p ? <div className="w-[214px]"><PieceCard p={p} /></div> : null }}>
        <Board minCol={214}>
          {cols.map(({ s, xs }) => (
            <DropColumn key={s} id={s}>
              {(over) => (
                <BoardColumn highlight={over} className="max-h-[calc(100dvh-290px)]"
                  title={<span className="grid gap-0.5"><StatusTag s={s} className="w-fit" /><span className="text-[12px] leading-tight text-muted-foreground">{STATUS_HINT[s]}</span></span>}
                  meta={s === '已发布' ? `近 14 天 ${xs.length} 篇` : `${xs.length} 篇`}>
                  {xs.map((p) => <DragCard key={p.id} id={p.id} column={s}><PieceCard p={p} onOpen={() => sheet.open(p.id)} /></DragCard>)}
                  {!xs.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">拖到这里</div>}
                  {s === '已发布' && older > 0 && <Link to="/content/pieces?view=list" className="block rounded-lg border border-dashed p-2.5 text-center text-xs text-primary hover:bg-accent/40">更早的 {older} 篇在列表里</Link>}
                </BoardColumn>
              )}
            </DropColumn>
          ))}
        </Board>
      </DndBoard>
      <p className="text-xs text-muted-foreground">按住卡片拖到右边一列就是往前推一步；拖到“待发布”先定日子，拖到“已发布”先确认发布时间。{abandoned.length > 0 && ` 不做了的 ${abandoned.length} 篇在列表里。`}</p>
      {ask?.kind === 'final' && <ScheduleDialog piece={ask.p} finalize onClose={() => setAsk(null)} />}
      {ask?.kind === 'publish' && <PublishDialog piece={ask.p} onClose={() => setAsk(null)} />}
    </>
  )
}
