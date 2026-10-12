// 手机上的日历：按天列出（今天往前一周、往后三周），每天写清排了几篇、门店停业、新品上线。归属：小红书内容模块。
import { addDays, md, todayStr, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePieceParam } from '../lib'
import { StatusTag } from '../badges'
import { CoverArt } from '../phone/Cover'
import { inRange, useStoreClosed } from '../dialogs'
import { useLaunchDay } from './CalendarView'
import type { Piece } from '../types'

export function AgendaView({ pieces }: { pieces: Piece[] }) {
  const sheet = usePieceParam()
  const launch = useLaunchDay()
  const shut = useStoreClosed()
  const t = todayStr()
  const days = Array.from({ length: 29 }, (_, i) => addDays(t, i - 7))
  const on = (d: string) => pieces.filter((p) => p.status !== '已放弃' && (p.status === '已发布' ? p.published_at?.slice(0, 10) : p.scheduled_date) === d)
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">手机上按天列出；拖动改日子请在电脑上，或者在单篇里点“改排期”。</p>
      <ol className="divide-y overflow-hidden rounded-xl border bg-card shadow-paper">
        {days.map((d) => {
          const items = on(d)
          const closed = inRange(shut, d)
          if (!items.length && d !== t && d !== launch && d !== shut?.from) return null
          return (
            <li key={d} className={cn('px-4 py-3', d === t && 'bg-accent/40')}>
              <div className="flex items-center gap-2 text-xs">
                <span className={cn('num font-semibold', d === t ? 'text-primary' : 'text-foreground')}>{md(d)} {weekday(d)}{d === t && ' · 今天'}</span>
                {closed && <span className="xhs-tag xhs-tag-closed">门店停业</span>}
                {d === launch && <span className="xhs-tag xhs-tag-launch">新品上线</span>}
                <span className="ml-auto text-muted-foreground">{items.length ? `${items.length} 篇` : '没排'}</span>
              </div>
              {items.map((p) => (
                <button key={p.id} type="button" onClick={() => sheet.open(p.id)} className="mt-2 flex w-full min-w-0 items-center gap-2.5 text-left">
                  <span className="w-9 shrink-0 overflow-hidden rounded-sm">{p.draft ? <CoverArt text={p.draft.cover_text} cover={p.draft.cover} pages={p.draft.pages} seed={p.draft.title} /> : <span className="block aspect-[3/4] rounded-sm border border-dashed" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13.5px] leading-snug font-medium">{p.draft?.title || p.title}</span>
                    <span className="num mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><StatusTag s={p.status} />{p.status === '已发布' ? p.published_at?.slice(11, 16) : p.scheduled_time ?? '时间未定'}</span>
                  </span>
                </button>
              ))}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
