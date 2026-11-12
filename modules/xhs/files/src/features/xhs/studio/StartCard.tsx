// 起点卡：为什么做这篇、从哪儿开始、AI 手上有哪些资料（每份都能点开读原文）。开始聊以后缩成一行留在最上面。归属：小红书内容模块。
import { useState } from 'react'
import { ChevronDown, Leaf } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DocChip } from '../KbDoc'
import type { Kit, Piece } from '../types'

const ASK: Record<string, string> = {
  选题: '这个选题，我们从哪儿下手？', 旧笔记: '翻新这篇旧笔记，换个什么角度？', 一款茶: '从这款茶写一篇，写给什么场景？', 对标笔记: '借它的结构，换成我们自己的茶和场景？', 一句话: '你说的这句，我先写一版给你看？',
}

export function StartCard({ piece, kit, compact }: { piece: Piece; kit?: Kit; compact: boolean }) {
  const [open, setOpen] = useState(!compact)
  const kind = piece.start?.kind ?? '选题'
  const show = open || !compact
  return (
    <div className="overflow-hidden rounded-xl border bg-gradient-to-br from-accent/70 via-card to-card">
      <button type="button" onClick={() => compact && setOpen(!open)} className={cn('flex w-full items-start gap-2.5 px-4 pt-3.5 text-left', !show && 'pb-3', !compact && 'cursor-default')}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Leaf className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{ASK[kind] ?? ASK['选题']}</span>
          <span className={cn('mt-0.5 block text-[12.5px] text-muted-foreground', !show && 'truncate')}>
            {piece.start?.label ?? (piece.topic_date ? `${Number(piece.topic_date.slice(5, 7))}/${Number(piece.topic_date.slice(8, 10))} 早上的选题` : '记下的选题')}{piece.reason ? ` · ${piece.reason}` : ''}
          </span>
        </span>
        {compact && <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />}
      </button>
      {show && (
        <div className="px-4 pt-2.5 pb-3.5">
          {piece.reason && <p className="text-[12.5px] leading-relaxed"><span className="font-medium text-primary">为什么做：</span>{piece.reason}</p>}
          {piece.start?.text && piece.start.text !== piece.reason && <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground"><span className="font-medium text-primary">起点：</span>{piece.start.text}</p>}
          {piece.warn && <p className="mt-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">提醒：{piece.warn}</p>}
          <div className="mt-3 rounded-lg border border-dashed border-primary/35 bg-card/70 px-3 py-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium">AI 手上有什么{kit?.skill && <DocChip path={kit.skill} label="小红书写法" />}</div>
            {kit ? (
              <dl className="grid gap-1.5 text-[12px]">
                {kit.groups.map((g) => (
                  <div key={g.label} className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-2">
                    <dt className="pt-0.5 text-muted-foreground">{g.label}</dt>
                    <dd className="flex min-w-0 flex-wrap gap-1">{g.files.filter((f) => !f.endsWith('README.md')).map((f) => <DocChip key={f} path={f} />)}</dd>
                  </div>
                ))}
                <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">账号数据</dt><dd>{kit.data_note}</dd></div>
                {kit.last_review && <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">最近复盘</dt><dd>{kit.last_review}</dd></div>}
              </dl>
            ) : <p className="text-xs text-muted-foreground">读取中…</p>}
          </div>
          {!compact && <p className="mt-2.5 text-[12px] text-muted-foreground">直接点下面的建议开始，或者用自己的话说。Codex 只读这些文件，不改知识库，稿件由工作台存成新版本。</p>}
        </div>
      )}
    </div>
  )
}
