// 新材料提取的一次运行：进行中（等 Codex）、超时 / 出错、放弃、已写入、待确认（ExtractResult）。归属：大客户模块
// 第四轮（数据评审 #4 #12、产品评审 #15）：等 Codex 的几十秒里显示它真做到哪一步（从 Codex 的运行日志认出来的，不按时间编），
//   旁边是工作台按字面先标出的“要核对的几句”，演示的人有话说；预先跑好的结果写“事先”，不写日子；写入后的结果用人话分组说改了知识库哪几处。
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleDot, Highlighter, LoaderCircle, RefreshCw, TriangleAlert, Undo2 } from 'lucide-react'
import { api, useWrite } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Failed } from '@/components/chart-kit'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { toLocal } from './rules'
import { ExtractResult } from './ExtractResult'
import { KbChanges } from './kb-changes'
import { startPrepared, startRun } from './extract-api'
import type { Extraction, Hint } from './types'

const TAG_TONE: Record<string, string> = {
  林总答应: 'border-primary/30 bg-accent text-accent-foreground', '价格、份数': 'border-warn/30 bg-warn-soft text-warn', 还没定: 'border-info/25 bg-info-soft text-info',
}

/** 工作台按字面先标出来的几句（价格、日子、“考虑一下”、来门店）：不用 AI，等 Codex 的时候演示的人可以先讲 */
export function HintList({ hints, className }: { hints: Hint[]; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-xl border bg-card px-4 py-3.5', className)}>
      <h3 className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-semibold"><Highlighter className="size-4 text-warn" />原件里要核对的几句<span className="text-[12px] font-normal text-muted-foreground">工作台按字面先标出来的（价格、日子、“考虑一下”），不是 Codex 的结论</span></h3>
      <ol className="mt-2 grid gap-1.5">
        {hints.map((h) => (
          <li key={h.line} className="grid grid-cols-[minmax(0,1fr)] gap-1 text-[13px] leading-relaxed sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-3">
            <span className="min-w-0">{h.line}</span>
            <span className="flex flex-wrap gap-1 sm:justify-end">{h.tags.map((t) => <span key={t} className={cn('inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] whitespace-nowrap', TAG_TONE[t] ?? 'bg-surface-2/60 text-muted-foreground')}>{t}</span>)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Waiting({ x }: { x: Extraction }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const sec = Math.max(x.elapsed_s, Math.round((now - new Date(x.started_at).getTime()) / 1000))
  const steps = x.progress ?? []
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="grid min-w-0 gap-4 rounded-xl border bg-card px-6 py-6 shadow-paper sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6">
        <div className="grid justify-items-center gap-2 text-center sm:w-44">
          <LoaderCircle className="size-8 animate-spin text-primary" />
          <p className="num text-3xl font-semibold">{sec}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {x.timeout_s} 秒</span></p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (sec / x.timeout_s) * 100)}%` }} /></div>
          <p className="text-[11.5px] text-muted-foreground">一般 30—60 秒</p>
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Codex 在这台电脑上提取</h2>
          <ol className="mt-2.5 grid gap-1.5 text-[13px]">
            {steps.map((s, i) => {
              const last = i === steps.length - 1
              return (
                <li key={`${s.s}-${s.text}`} className={cn('grid grid-cols-[3.2em_16px_minmax(0,1fr)] items-baseline gap-1.5', last ? 'text-foreground' : 'text-muted-foreground')}>
                  <span className="num text-right text-[12px] text-muted-foreground">{s.s} 秒</span>
                  {last ? <LoaderCircle className="size-3.5 translate-y-0.5 animate-spin text-primary" /> : <CircleDot className="size-3 translate-y-0.5 text-ok" />}
                  <span className="min-w-0">{s.text}</span>
                </li>
              )
            })}
            {!steps.length && <li className="text-muted-foreground">在等 Codex 回话…</li>}
          </ol>
          <p className="mt-3 text-[12.5px] text-muted-foreground">只能看、不能改文件；{x.timeout_s} 秒没做完会停下并告诉你，不会拿现成的内容冒充。可以先去别的页面，回来结果还在。</p>
        </div>
      </section>
      {x.hints.length > 0 && <HintList hints={x.hints} />}
    </div>
  )
}

/** 一次提取：进行中每 1.5 秒问一次结果、秒数按开始时间在本地算；完成显示结果；超时、出错如实说，能直接再提取一次 */
export function RunView({ id, onStarted, onBack }: { id: string; onStarted: (id: string) => void; onBack: (path: string | null) => void }) {
  const [, setSp] = useSearchParams()
  const openClient = (cid: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('client', cid); n.set('ctab', 'log'); return n })
  const q = useQuery<Extraction>({
    queryKey: [`/crm/extractions/${id}`],
    queryFn: () => api.get<Extraction>(`/crm/extractions/${id}`),
    refetchInterval: (query) => (query.state.data?.status === '提取中' ? 1500 : false),
  })
  const x = q.data
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const again = (fn: () => Promise<Extraction>) => { setBusy(true); setErr(null); fn().then((r) => onStarted(r.id)).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false)) }
  const undo = useWrite(() => api.post<Extraction>(`/crm/extractions/${id}/undo`, {}), '已撤销：写进去的都退回了，这次提取回到“待确认”')
  if (q.error) return <Failed message={q.error.message} onRetry={() => q.refetch()} />
  if (!x) return <Skeleton className="h-96" />
  const retry = () => again(() => startRun(x.source_path ? { source_path: x.source_path } : { text: x.raw_text, client_id: x.client_id }))
  if (x.status === '提取中') return <Waiting x={x} />
  if (x.status === '超时' || x.status === '出错' || x.status === '不可用') {
    return (
      <section className="grid min-w-0 gap-3 rounded-xl border border-warn/30 bg-warn-soft/60 px-6 py-8 shadow-paper">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-warn"><TriangleAlert className="size-5" />{x.status === '超时' ? `Codex ${x.timeout_s} 秒内没做完` : x.status === '不可用' ? '这台电脑上用不了 Codex' : 'Codex 没提取成'}</h2>
        <p className="text-[13.5px]">{x.error}</p>
        <p className="text-[12.5px] text-muted-foreground">什么都没写进去。可以再提取一次；材料太长就只粘贴关键的几段；实在不行，先“记一笔跟进”手动记。</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || x.status === '不可用'} onClick={retry}>{busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}再提取一次</Button>
          {x.prepared && x.source_path && <Button variant="outline" disabled={busy} onClick={() => again(() => startPrepared(x.source_path!))}>用事先跑好的结果（不是现场生成）</Button>}
          <Button variant="ghost" onClick={() => onBack(x.source_path)}>回到原件</Button>
        </div>
        {err && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
      </section>
    )
  }
  if (x.status === '放弃') {
    return <section className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">这次提取放弃了，什么都没写。<div className="mt-3"><Button size="sm" variant="outline" disabled={busy} onClick={retry}><RefreshCw />重新提取</Button></div></section>
  }
  if (x.status === '已写入') {
    const w = x.written
    const prepared = (x.engine ?? '').startsWith('预先')
    return (
      <section className="grid min-w-0 gap-4 rounded-xl border bg-card p-6 shadow-paper">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ok"><CheckCircle2 className="size-5" />已写入{x.client ? ` ${x.client.name}` : ''}</h2>
        <dl className="grid gap-2.5 text-[13.5px]">
          <div><dt className="inline text-muted-foreground">工作台：</dt><dd className="inline">{w?.summary}{w?.confirmed_at ? `（林总 ${w.confirmed_at} 确认）` : ''}</dd></div>
          {w?.skipped_todos?.length ? <div className="text-[12.5px] text-muted-foreground">没另建的待办（和已有的是一件事）：{w.skipped_todos.join('；')}</div> : null}
          {w?.kb
            ? <div className="grid gap-1.5"><dt className="text-muted-foreground">知识库：</dt><dd><KbChanges done c={{ ...w.kb, inbox: w.inbox ?? null }} /></dd></div>
            : <div className="text-muted-foreground">知识库：没写（{w?.kb_error ?? '这次没勾“写回知识库”'}）{w?.inbox ? '；收件箱原件末尾记了一句已提取' : ''}</div>}
          {w?.findings?.map((f) => <div key={f.title} className="text-[12.5px]"><span className="text-muted-foreground">待确认的发现：</span>加了一节“{f.title}”</div>)}
          <div className="text-[12px] text-muted-foreground">{prepared ? '用的是事先用 Codex 跑过一次的结果（不是现场生成）' : `本机 Codex 现场提取，用时 ${x.elapsed_s} 秒`} · {shortDate(toLocal(x.started_at))}提取</div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {x.client && <Button onClick={() => openClient(x.client!.id)}>看客户的往来和答应</Button>}
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" disabled={undo.isPending}><Undo2 />撤销这次写入</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>撤销这次写入？</AlertDialogTitle>
                <AlertDialogDescription>会删掉这次写进去的往来记录、答应的事、待办、喜好和日子，客户的上次联系、下次跟进、关掉的事{w?.kb ? '、知识库客户文件里改的几处、收件箱的那句备注' : ''}都改回去。提取结果还在，可以再确认一次。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>不撤销</AlertDialogCancel><AlertDialogAction onClick={() => undo.mutate(undefined)}>撤销</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    )
  }
  return <ExtractResult key={x.id} x={x} />
}
