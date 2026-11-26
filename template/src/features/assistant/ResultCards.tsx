// 回答下面的结果卡（2026-11-26 照 A梦 自用工作台）：这一轮 AI 写进工作台的每一处——改了什么、“打开”去那一条、“撤回”退回去。
// 撤不了的写原因（之后又被改过、改的是知识库文件只能打开看）；撤回以后卡片变灰写“已撤回”。写了两处以上能“全部撤回”（后写的先撤）。
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Info, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ChangeCard = { id: number; at: string; entity: string; action: string; summary: string; link: string | null; revert: 'ready' | 'blocked' | 'reverted' | 'unsupported'; why: string | null }

export function ResultCards({ cards }: { cards: ChangeCard[] }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  if (!cards.length) return null
  const refresh = () => { void qc.invalidateQueries() }
  const revert = async (id: number) => {
    setBusy(id)
    try { await api.post(`/changes/${id}/revert`, {}); toast.success('撤回了') } catch (e) { toast.error((e as Error).message) } finally { setBusy(null); refresh() }
  }
  const ready = cards.filter((c) => c.revert === 'ready')
  const revertAll = async () => {
    setBusy('all')
    // 后写的先撤（前面的往往被后面的又改过）
    try { for (const c of [...cards].reverse()) if (c.revert === 'ready' || c.revert === 'blocked') await api.post(`/changes/${c.id}/revert`, {}).catch(() => {}); toast.success('能撤的都撤回了') } finally { setBusy(null); refresh() }
  }
  return (
    <div className="mt-2.5">
      {cards.length > 1 && ready.length > 0 && (
        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">这一轮写了 {cards.length} 处</span>
          <Button type="button" size="xs" variant="ghost" disabled={busy !== null} onClick={() => void revertAll()}>{busy === 'all' ? <Loader2 className="animate-spin" /> : <Undo2 />}全部撤回</Button>
        </div>
      )}
      <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="这一轮做了什么">{cards.map((c) => <Card key={c.id} c={c} busy={busy === c.id || busy === 'all'} onRevert={() => void revert(c.id)} />)}</ul>
    </div>
  )
}

function Card({ c, busy, onRevert }: { c: ChangeCard; busy: boolean; onRevert: () => void }) {
  const nav = useNavigate()
  const reverted = c.revert === 'reverted'
  const Icon = reverted || c.revert === 'unsupported' ? Info : CheckCircle2
  return (
    <li className={cn('min-w-0 rounded-lg border px-2.5 py-2', reverted ? 'bg-muted/40' : 'bg-card')}>
      <div className="flex min-w-0 items-start gap-2">
        <Icon className={cn('mt-0.5 size-4 shrink-0', reverted || c.revert === 'unsupported' ? 'text-muted-foreground' : 'text-ok')} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-medium [overflow-wrap:anywhere]', reverted && 'text-muted-foreground')}>{reverted ? `已撤回 · ${c.summary}` : c.summary}</p>
          {c.revert === 'blocked' && <p className="mt-0.5 text-xs text-muted-foreground">不能撤回：{c.why}</p>}
          {c.revert === 'unsupported' && c.why && <p className="mt-0.5 text-xs text-muted-foreground">{c.why}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {c.link && !reverted && <Button type="button" size="xs" variant="ghost" onClick={() => nav(c.link!)}>打开</Button>}
          {c.revert === 'ready' && <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onRevert}>{busy ? <Loader2 className="animate-spin" /> : <Undo2 />}撤回</Button>}
        </div>
      </div>
    </li>
  )
}
