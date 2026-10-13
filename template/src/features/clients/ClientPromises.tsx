// 答应过的事（第二轮并进“往来和答应”页签）：还没做到的放最上面——谁答应谁、什么、哪天说的、哪天前；
// 和判断规则对不上的标黄，当场能定：这次算例外（写原因）/ 规则该改了（记进知识库待确认的发现）；定了变成灰字。
// 下面是做到了 / 不做了、改动留痕（新旧值、原因、时间），都折起来。归属：大客户模块
import { useState } from 'react'
import { CalendarClock, CheckCheck, ChevronRight, History, Scale, TriangleAlert, X } from 'lucide-react'
import { daysFromToday, shortDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { StatusBadge } from '@/components/status'
import { ConflictDialog, PromiseDialog } from '@/features/crm/dialogs'
import { SourceLink } from '@/features/crm/parts'
import type { ClientProfile, ClientPromise } from '@/features/crm/types'
import { cn } from '@/lib/utils'
import { toLocal, withoutDue } from '@/features/crm/rules'
import { useIdentity } from '@/lib/identity'

/** 日期只说一次：“10/28 前 · 明天”（第三轮修产品评审 #10） */
function dueBadge(p: ClientPromise) {
  if (p.status !== '待兑现') return <StatusBadge value={p.status} tone={p.status === '已兑现' ? 'ok' : 'neutral'} />
  if (!p.due) return <StatusBadge value="没说哪天" tone="neutral" />
  const n = daysFromToday(p.due)
  const md = `${Number(p.due.slice(5, 7))}/${Number(p.due.slice(8, 10))} 前`
  return <StatusBadge value={`${md} · ${n < 0 ? `过了 ${-n} 天` : n === 0 ? '今天' : n === 1 ? '明天' : `${n} 天后`}`} tone={n < 0 ? 'danger' : n <= 2 ? 'warn' : 'neutral'} />
}

const said = (p: ClientPromise) => `${shortDate(p.said_on ?? toLocal(p.created_at))}${p.said_channel ? ` ${p.said_channel}里` : ''}说的`

/** 标黄的地方：还没定就给两个按钮；定了就是一行灰字 */
function ConflictLine({ p, clientName }: { p: ClientPromise; clientName: string }) {
  const [mode, setMode] = useState<'例外' | '改规则' | null>(null)
  const { owner } = useIdentity()
  if (!p.conflict) return null
  if (p.decision) {
    return (
      <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/70 px-2.5 py-1.5 text-[12.5px] text-muted-foreground">
        <Scale className="mt-0.5 size-3.5 shrink-0" />
        <span>{owner} {shortDate(p.decision_at)}{p.decision === '例外' ? '定为例外' : '说规则该改，已记进知识库“待确认的发现”'}：{p.decision_note}<span className="block text-[12px] opacity-80">原来对不上的地方：{p.conflict}</span></span>
      </p>
    )
  }
  return (
    <div className="mt-2 rounded-md bg-card/80 px-2.5 py-2 text-[12.5px]">
      <p className="flex items-start gap-1.5 text-warn"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /><span>和判断规则对不上，等你定：{p.conflict}</span></p>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
        <Button size="xs" variant="outline" onClick={() => setMode('例外')}>这次算例外（写原因）</Button>
        <Button size="xs" variant="outline" onClick={() => setMode('改规则')}>规则该改了</Button>
      </div>
      {mode && <ConflictDialog mode={mode} promiseId={p.id} onClose={() => setMode(null)}
        finding={{ client: clientName, promise: p.text, said: said(p), source: p.source_file, conflict: p.conflict }} />}
    </div>
  )
}

/** 还没做到的答应 */
export function OpenPromises({ d }: { d: ClientProfile }) {
  const [dlg, setDlg] = useState<{ p: ClientPromise; mode: '已兑现' | '取消' | '改日期' } | null>(null)
  const open = d.promises.filter((p) => p.status === '待兑现')
  if (!open.length) return <p className="rounded-lg border border-dashed px-3 py-3 text-[13px] text-muted-foreground">没有答应了还没做的事。聊天里答应对方的事（发效果图、寄样品、哪天送到），记一笔跟进或从新材料提取时会记进来。</p>
  return (
    <>
      <ul className="grid gap-2">
        {open.map((p) => (
          <li key={p.id} className={cn('rounded-xl border bg-card p-3.5', p.conflict && !p.decision && 'border-warn/40 bg-warn-soft/60')}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-muted-foreground">{p.who} 答应{p.to_whom ? ` ${p.to_whom}` : ''} · {said(p)}</div>
                <div className="mt-0.5 text-[14px] font-medium">{withoutDue(p)}</div>
              </div>
              {dueBadge(p)}
            </div>
            <ConflictLine p={p} clientName={d.client.name} />
            {p.note && <p className="mt-1.5 text-xs text-muted-foreground">备注：{p.note}</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {p.source_file && <SourceLink path={p.source_file} label="看原话" className="mr-auto" />}
              <Button size="xs" variant="outline" onClick={() => setDlg({ p, mode: '已兑现' })}><CheckCheck />标已兑现</Button>
              <Button size="xs" variant="ghost" onClick={() => setDlg({ p, mode: '改日期' })}><CalendarClock />改日期</Button>
              <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setDlg({ p, mode: '取消' })}><X />不做了</Button>
            </div>
          </li>
        ))}
      </ul>
      {dlg && <PromiseDialog p={dlg.p} mode={dlg.mode} onClose={() => setDlg(null)} />}
    </>
  )
}

function Fold({ title, count, children }: { title: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 py-1 text-left text-[13px] font-semibold text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />{title}<span className="num font-normal">{count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** 做到了 / 不做了 + 改动留痕，折起来放在往来记录下面 */
export function PromiseHistory({ d }: { d: ClientProfile }) {
  const { owner } = useIdentity()
  const closed = d.promises.filter((p) => p.status !== '待兑现')
  const time = (iso: string) => { const x = new Date(iso); return `${shortDate(toLocal(iso))} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` }
  return (
    <div className="grid gap-2 border-t pt-3">
      {closed.length > 0 && (
        <Fold title="做到了 / 不做了的答应" count={closed.length}>
          <ul className="divide-y rounded-lg border bg-card">
            {closed.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1"><span className="block truncate">{p.text}</span><span className="block text-[12px] text-muted-foreground">{p.who} 答应{p.to_whom ? ` ${p.to_whom}` : ''}{p.due ? ` · ${shortDate(p.due)}前` : ''}{p.done_at ? ` · ${shortDate(p.done_at)}做到` : ''}{p.note ? ` · ${p.note}` : ''}</span></span>
                {dueBadge(p)}
              </li>
            ))}
          </ul>
        </Fold>
      )}
      <Fold title={<span className="inline-flex items-center gap-1.5"><History className="size-3.5" />改动留痕（阶段、答应的事、下次跟进）</span>} count={d.edits.length}>
        {d.edits.length ? (
          <ol className="grid gap-1.5">
            {d.edits.map((e) => (
              <li key={e.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 rounded-lg px-1 py-1 text-[12.5px]">
                <span className="num whitespace-nowrap text-muted-foreground">{time(e.at)}</span>
                <span className="min-w-0">
                  <span className="font-medium">{e.entity}</span>
                  <span className="mx-1.5 text-muted-foreground">{e.old_value ?? '无'} → {e.new_value ?? '无'}</span>
                  <span className="block text-muted-foreground">原因：{e.reason}<span className="ml-1.5 opacity-70">（{e.actor === '网页' ? `${owner}在网页上改` : `${e.actor} 改`}）</span></span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="text-[12.5px] text-muted-foreground">还没改过。</p>}
      </Fold>
    </div>
  )
}
