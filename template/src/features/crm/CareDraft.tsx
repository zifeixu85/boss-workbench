// 关怀草稿卡：送什么、怎么说、谁写的。按钮只留三个：复制（主）、标记已发、改一改；“让 Codex 写一版 / 在 Codex 里改 / 为什么这么写 / 这次不做”收进“更多”。
// “让 Codex 写一版”真的调本机 Codex，最多等 90 秒，写好存起来并标“Codex 现场写 · 时间”。归属：大客户模块
// 第二轮：来源单独一行放在草稿下面，写成“类型 · 细节”，不截断；模板拼的直接在来源后面给“让 Codex 写一版”。
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Gift, LoaderCircle, PenLine, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, useWrite } from '@/lib/api'
import { daysFromToday, shortDate, todayStr } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/status'
import { cn } from '@/lib/utils'
import { AuthorNote, codexEditPrompt, copyText } from './parts'
import type { AuthorKind } from './types'
import { useIdentity } from '@/lib/identity'

const dayLabel = (d: string) => { const n = daysFromToday(d); return n === 0 ? '今天' : n === 1 ? '明天' : n > 0 ? `${n} 天后` : `已过 ${-n} 天` }

export type DraftLike = {
  id: string | null; client_id: string; occasion: string; date: string | null; gift: string | null; message: string | null
  status: string; author: string | null; note: string | null; sent_at?: string | null; author_kind?: AuthorKind
}

/** 存一条（模板拼的建议第一次被处理时才存进数据库） */
function useCareWrite() {
  const create = useWrite((b: Record<string, unknown>) => api.post('/crm/care', b))
  const patch = useWrite(({ id, ...b }: Record<string, unknown> & { id: string }) => api.patch(`/crm/care/${id}`, b))
  const { owner } = useIdentity()
  return {
    pending: create.isPending || patch.isPending,
    save: (x: DraftLike, change: { status?: string; message?: string }, done: string) => {
      const opts = { onSuccess: () => toast.success(done) }
      if (x.id) patch.mutate({ id: x.id, ...change }, opts)
      else create.mutate({ client_id: x.client_id, occasion: x.occasion, date: x.date ?? todayStr(), gift: x.gift, message: change.message ?? x.message, status: change.status ?? '建议', author: change.message ? `${owner}（在工作台模板上改的）` : x.author, note: x.note }, opts)
    },
  }
}

type DraftResult = { ok: true; ms: number } | { ok: false; status: string; error: string; ms: number }

/** 让 Codex 现场写一版：返回 run 和等了几秒；超时、没装 Codex 都如实说 */
export function useCodexDraft(clientId: string, occasion: string, date: string | null) {
  const [sec, setSec] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const w = useWrite((b: { client_id: string; occasion: string; date: string | null }) => api.post<DraftResult>('/crm/care/draft', b))
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  const run = () => {
    setSec(0)
    timer.current = setInterval(() => setSec((s) => s + 1), 1000)
    w.mutate({ client_id: clientId, occasion, date }, {
      onSettled: () => { if (timer.current) clearInterval(timer.current) },
      onSuccess: (r) => {
        if (r.ok) toast.success(`Codex 写好了，用了 ${Math.round(r.ms / 1000)} 秒`, { description: '存成了草稿，标着“Codex 现场写”' })
        else toast.error(r.status === '不可用' ? '这台电脑上没找到 Codex' : r.status === '超时' ? 'Codex 90 秒内没写完' : 'Codex 没写成', { description: r.error })
      },
    })
  }
  return { run, pending: w.isPending, sec }
}

export function CodexDraftButton({ clientId, occasion, date, size = 'xs', label = '让 Codex 写一版', variant = 'outline' }: { clientId: string; occasion: string; date: string | null; size?: 'xs' | 'sm'; label?: string; variant?: 'outline' | 'link' }) {
  const x = useCodexDraft(clientId, occasion, date)
  return (
    <Button size={size} variant={variant} disabled={x.pending} onClick={x.run} className={variant === 'link' ? 'h-auto p-0 text-[12px]' : undefined}>
      {x.pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
      {x.pending ? `Codex 在写… ${x.sec} 秒` : label}
    </Button>
  )
}

export function CareDraftCard({ care, clientName, kbPath, compact }: { care: DraftLike; clientName: string; kbPath?: string | null; compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [why, setWhy] = useState(false)
  const [text, setText] = useState(care.message ?? '')
  const w = useCareWrite()
  const codex = useCodexDraft(care.client_id, care.occasion, care.date)
  const done = care.status === '已送出' || care.status === '不做'
  const template = (care.author_kind ?? (care.id ? undefined : '模板')) === '模板'
  const copy = async (t: string, ok: string) => { if (await copyText(t)) toast.success(ok); else toast.error('没复制成功，手动选中文字复制') }
  return (
    <div className={cn('min-w-0', compact ? '' : 'rounded-xl border bg-card p-4', done && 'opacity-75')}>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Gift className="size-4 text-primary" /><span className="text-[14px] font-medium">{care.occasion}</span>
          {care.date && <span className="num text-xs whitespace-nowrap text-muted-foreground">{shortDate(care.date)} · {dayLabel(care.date)}</span>}
          <StatusBadge value={care.status === '已送出' ? '已发出' : care.status} tone={care.status === '已安排' ? 'info' : care.status === '已送出' ? 'ok' : 'neutral'} className="ml-auto" />
        </div>
      )}
      {care.gift && <p className={cn('text-[13px]', !compact && 'mt-2')}><span className="text-muted-foreground">送：</span>{care.gift}</p>}
      {editing ? (
        <div className="mt-2 grid gap-2">
          <Textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button size="xs" disabled={w.pending || !text.trim()} onClick={() => { w.save(care, { message: text.trim() }, '草稿已保存'); setEditing(false) }}><Check />保存</Button>
            <Button size="xs" variant="ghost" onClick={() => { setText(care.message ?? ''); setEditing(false) }}><X />不改了</Button>
          </div>
        </div>
      ) : care.message ? (
        <blockquote className="mt-2 rounded-lg border-l-[3px] border-primary/50 bg-accent/50 px-3 py-2 text-[13.5px] leading-relaxed text-accent-foreground">{care.message}</blockquote>
      ) : <p className="mt-2 text-[13px] text-muted-foreground">还没写怎么说。</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <AuthorNote author={care.author} kind={care.author_kind} className="min-w-0" />
        {codex.pending
          ? <span className="inline-flex items-center gap-1 text-[12px] text-info"><LoaderCircle className="size-3.5 animate-spin" />Codex 在写… {codex.sec} 秒</span>
          : template && !done && <button type="button" onClick={codex.run} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><Sparkles className="size-3.5" />让 Codex 写一版</button>}
      </div>
      {why && care.note && <p className="mt-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-[12px] text-muted-foreground">为什么这么写：{care.note}</p>}
      {!done && care.message && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Button size="xs" onClick={() => copy(care.message!, '已复制，去微信粘贴')}><Copy />复制</Button>
          <Button size="xs" variant="outline" disabled={w.pending} onClick={() => w.save(care, { status: '已送出' }, `已标记：${care.occasion}发出了`)}><Send />标记已发</Button>
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}><PenLine />改一改</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="xs" variant="ghost" className="text-muted-foreground">更多<ChevronDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={codex.pending} onSelect={codex.run}><Sparkles />{template ? '让 Codex 写一版' : '让 Codex 重写一版'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copy(codexEditPrompt(clientName, kbPath, care.occasion, care.message!), '已复制，去 Codex 粘贴')}><Copy />在 Codex 里改（复制一段话）</DropdownMenuItem>
              {care.note && <DropdownMenuItem onSelect={() => setWhy((v) => !v)}><PenLine />{why ? '收起' : ''}为什么这么写</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={w.pending} onSelect={() => w.save(care, { status: '不做' }, '这次不做了')}><X />这次不做</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {care.status === '已送出' && care.sent_at && <p className="mt-1.5 text-[12px] text-ok">已发出</p>}
    </div>
  )
}
