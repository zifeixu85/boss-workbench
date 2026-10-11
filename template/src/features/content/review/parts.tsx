// 复盘页的两块：下周选题建议（放进灵感池）、可以沉淀的经验（能改写；存进知识库前先给看要追加的那一节；或者“不要”）。归属：小红书内容模块。
import { useState } from 'react'
import { BookPlus, Check, Lightbulb, Pencil, Undo2, X } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mdhm, usePieceParam } from '../lib'
import { DocChip } from '../KbDoc'
import { Markdown } from '@/components/markdown'
import type { Idea, Learning } from '../types'

export function Ideas({ week, ideas }: { week: string; ideas: Idea[] }) {
  const sheet = usePieceParam()
  const pool = useWrite((i: number) => api.post<{ piece_id: string }>(`/content/reviews/${week}/ideas/${i}/pool`, {}), '放进灵感池了')
  if (!ideas.length) return null
  return (
    <section>
      <h3 className="mb-2 text-[15px] font-semibold">下周选题建议 · {ideas.length}</h3>
      <div className="grid gap-3">
        {ideas.map((x, i) => (
          <div key={i} className="flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-paper">
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Lightbulb className="size-3.5 text-primary" />{x.pillar ?? '不在支柱里'}</div>
            <div className="mt-1.5 text-[14px] leading-snug font-semibold">{x.title}</div>
            <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{x.reason}</p>
            {x.piece_id
              ? <Button size="xs" variant="ghost" className="mt-3 w-fit text-ok" onClick={() => sheet.open(x.piece_id!)}><Check />已在灵感池 · 看看</Button>
              : <Button size="xs" variant="outline" className="mt-3 w-fit" disabled={pool.isPending} onClick={() => pool.mutate(i)}>放进灵感池</Button>}
          </div>
        ))}
      </div>
    </section>
  )
}

function SaveDialog({ week, i, onClose }: { week: string; i: number; onClose: () => void }) {
  const { data } = useApi<{ path: string; number: number; markdown: string; source: string }>(`/content/reviews/${week}/learnings/${i}/preview`)
  const save = useWrite(() => api.post(`/content/reviews/${week}/learnings/${i}/save`, {}), '存进知识库了：追加到“待确认的发现”，等整理知识库时一起看')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">存进知识库前，先看要写什么</DialogTitle>
          <DialogDescription>只追加这一节，不改别的；状态写“待确认”。你点头以后，整理知识库时再写进小红书的规律或写法卡。</DialogDescription>
        </DialogHeader>
        {data ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">追加到 <DocChip path={data.path} /> 末尾，作为发现 {data.number}；“来源”里再加一行</div>
            <div className="max-h-[46vh] overflow-auto rounded-lg border bg-background px-4 py-3 text-[13px]"><Markdown source={data.markdown} basePath={data.path} /></div>
            <p className="text-xs text-muted-foreground">来源里加：{data.source.replace(/^- /, '')}</p>
            <p className="text-[11.5px] text-muted-foreground">文件开头的更新日期、“持续生长”的索引，等整理知识库时一起改；工作台只追加，不改别的。</p>
          </>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">读取中…</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>先不存</Button>
          <Button disabled={!data || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}><BookPlus />追加到知识库</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LearningCard({ week, i, l }: { week: string; i: number; l: Learning }) {
  const [editing, setEditing] = useState(false)
  const [rule, setRule] = useState(l.rule)
  const [saving, setSaving] = useState(false)
  const patch = useWrite((b: { rule?: string; status?: string }) => api.patch(`/content/reviews/${week}/learnings/${i}`, b))
  const done = l.status === '已存进知识库'
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-paper', l.status === '不要' && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="grid gap-2">
              <Textarea autoFocus value={rule} onChange={(e) => setRule(e.target.value)} rows={2} className="text-[14px]" />
              <div className="flex gap-1.5"><Button size="xs" onClick={() => patch.mutate({ rule }, { onSuccess: () => setEditing(false) })}><Check />改好了</Button><Button size="xs" variant="ghost" onClick={() => { setRule(l.rule); setEditing(false) }}>算了</Button></div>
            </div>
          ) : <p className="text-[14.5px] leading-snug font-semibold">{l.rule}</p>}
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground"><span className="text-foreground/70">依据：</span>{l.evidence}</p>
          {l.scope && <p className="mt-0.5 text-[12.5px] text-muted-foreground"><span className="text-foreground/70">适用：</span>{l.scope}</p>}
          {l.prior && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground"><span className="text-foreground/70">原来的做法：</span>{l.prior}{l.prior_path && <span className="ml-1 inline-flex align-middle"><DocChip path={l.prior_path} /></span>}</p>}
        </div>
        <StatusBadge value={l.status} tone={done ? 'ok' : l.status === '不要' ? 'neutral' : 'warn'} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {l.status === '待定' && !editing && <>
          <Button size="xs" onClick={() => setSaving(true)}><BookPlus />存进知识库</Button>
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}><Pencil />改写一下</Button>
          <Button size="xs" variant="ghost" onClick={() => patch.mutate({ status: '不要' })}><X />不要</Button>
        </>}
        {l.status === '不要' && <Button size="xs" variant="ghost" onClick={() => patch.mutate({ status: '待定' })}><Undo2 />放回待定</Button>}
        {done && <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{mdhm(l.saved_at)} 存进知识库{l.number ? `，是发现 ${l.number}` : ''}{l.kb_path && <> · 在 <DocChip path={l.kb_path} /></>}（待确认）</span>}
      </div>
      {saving && <SaveDialog week={week} i={i} onClose={() => setSaving(false)} />}
    </div>
  )
}

export function Learnings({ week, items }: { week: string; items: Learning[] }) {
  if (!items.length) return null
  const pending = items.filter((l) => l.status === '待定').length
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between"><h3 className="text-[15px] font-semibold">可以沉淀的经验 · {items.length}</h3>{pending > 0 && <span className="text-xs text-warn">{pending} 条等你定</span>}</div>
      <div className="grid gap-3">{items.map((l, i) => <LearningCard key={`${i}-${l.rule}`} week={week} i={i} l={l} />)}</div>
    </section>
  )
}
