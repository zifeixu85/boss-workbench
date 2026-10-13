// 创作页左边的对话：起点卡、消息（参考了哪些文件、写成了哪一版、候选“用这个”）、进行中、失败重试、快捷建议、输入框。
// 背后是本机 Codex（只能看、不能改、不能联网，按“小红书创作” Skill 写）；预先写好的示例对话标清楚，不冒充现场生成。归属：小红书内容模块。
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowUp, Bot, CircleCheck, Images, Loader2, Paperclip, RotateCcw, Square, X } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { cn } from '@/lib/utils'
import { now } from '@/lib/clock'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSend } from '../api'
import { mdhm, took, kbName } from '../lib'
import { ExampleTag } from '../badges'
import { DocChip } from '../KbDoc'
import { StartCard } from './StartCard'
import type { CodexStatus, Kit, Message, StudioData } from '../types'

const FIELD: Record<string, string> = { title: '标题', cover_text: '封面大字', opening: '开头', angle: '切入角度' }

function suggestions(hasDraft: boolean) {
  return hasDraft
    ? ['再给 3 个标题', '开头换成一个具体场景', '正文再短一点', '加一个办公室小技巧', '封面大字再给 3 个', '检查一遍不能说的话']
    : ['直接写一版完整稿件', '先给我 3 个切入角度', '先问我 2 个关键问题再写']
}

function useElapsed(since: string) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  return Math.max(0, Math.round((now().getTime() - Date.parse(since)) / 1000))
}

/** 进行中：在读哪份文件、走了几秒；超过 90 秒先说“比平时慢”，不急着停 */
function Running({ m, onStop, slow, limit }: { m: Message; onStop: () => void; slow: number; limit: number }) {
  const s = useElapsed(m.created_at)
  return (
    <div className="rounded-xl rounded-tl-sm border bg-background px-3.5 py-3">
      <div className="flex items-center gap-2 text-[13px]"><Loader2 className="size-4 animate-spin text-primary" /><span className="min-w-0 flex-1 truncate">{m.progress ?? '正在读资料…'}</span><span className="num text-xs text-muted-foreground">{s} 秒</span></div>
      {m.files_read.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.files_read.map((f) => <DocChip key={f} path={f} />)}</div>}
      <div className={cn('mt-2 flex items-center justify-between gap-2 text-[12px]', s > slow ? 'text-warn' : 'text-muted-foreground')}>
        <span>{s > slow ? `比平时慢，还在写（${limit} 秒还没写完才会停）` : '本机 Codex 在翻知识库，一般 30—80 秒'}</span>
        <Button size="xs" variant="ghost" onClick={onStop}><Square className="size-3" />停止</Button>
      </div>
    </div>
  )
}

function Options({ m, onAdopt, busy }: { m: Message; onAdopt: (i: number) => void; busy: boolean }) {
  const o = m.options!
  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border bg-background">
      <div className="border-b bg-surface-2/70 px-3 py-1.5 text-xs text-muted-foreground">{FIELD[o.field] ?? '候选'} · {o.items.length} 个{o.chosen != null && <span className="ml-1 text-ok">已采用第 {o.chosen + 1} 个，想换可以改选</span>}</div>
      <ol className="divide-y">
        {o.items.map((it, i) => (
          <li key={i} className={cn('flex items-start gap-2.5 px-3 py-2', o.chosen === i && 'bg-accent/50')}>
            <span className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-medium">{i + 1}</span>
            <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">{it.text}</div>{it.note && <div className="text-xs text-muted-foreground">{it.note}</div>}</div>
            {o.chosen === i ? <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-xs text-ok"><CircleCheck className="size-3.5" />在用</span>
              : <Button size="xs" variant="outline" disabled={busy} onClick={() => onAdopt(i)}>{o.field === 'angle' ? '按这个写' : '用这个'}</Button>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function AiMessage({ m, onAdopt, onRetry, onStop, onShowDraft, busy, slow, limit }: { m: Message; onAdopt: (i: number) => void; onRetry: () => void; onStop: () => void; onShowDraft: () => void; busy: boolean; slow: number; limit: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Bot className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Codex</span>
          {m.origin === '示例' ? <ExampleTag text="示例 · 预先写好的" /> : m.status === 'done' ? <span>本机 · 用时 {took(m.duration_ms)}</span> : null}
          <span className="num">{mdhm(m.created_at)}</span>
        </div>
        {m.status === 'running' ? <Running m={m} onStop={onStop} slow={slow} limit={limit} /> : (
          <div className={cn('rounded-xl rounded-tl-sm border bg-background px-3.5 py-2.5', m.status !== 'done' && 'border-danger/40')}>
            {m.text && <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{m.text}</div>}
            {m.status !== 'done' && (
              <div className="mt-1.5 flex items-start gap-2 rounded-md bg-danger-soft px-2.5 py-2 text-[12.5px] text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1">{m.status === 'stopped' ? '这一轮停掉了。' : '没写成：'}{m.error?.replace(/^(超时|出错|不可用|已停止)：/, '')}</span>
                <Button size="xs" variant="outline" onClick={onRetry} disabled={busy}><RotateCcw />重试</Button>
              </div>
            )}
            {m.status === 'done' && m.error && <p className="mt-1.5 text-xs text-warn">{m.error}</p>}
            {m.options && <Options m={m} onAdopt={onAdopt} busy={busy} />}
            {m.version != null && (
              <button type="button" onClick={onShowDraft} className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-ok-soft px-2.5 py-1 text-[12.5px] font-medium text-ok hover:brightness-95"><CircleCheck className="size-3.5" />稿件已更新到 v{m.version} · 看稿件</button>
            )}
            {m.refs.length > 0 && <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground">参考了：{m.refs.map((f) => <DocChip key={f} path={f} />)}</div>}
            {m.files_read.length > 0 && (
              <div className="mt-1.5 text-[12px] text-muted-foreground">
                <button type="button" onClick={() => setOpen(!open)} className="hover:text-foreground">{open ? '收起' : `这一轮打开了 ${m.files_read.length} 个文件`}</button>
                {open && <div className="mt-1 flex flex-wrap gap-1">{m.files_read.map((f) => <DocChip key={f} path={f} />)}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function UserMessage({ m }: { m: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[86%]">
        <div className="mb-1 text-right text-[12px] text-muted-foreground"><span className="font-medium text-foreground">{m.author}</span> <span className="num">{mdhm(m.created_at)}</span></div>
        <div className="rounded-xl rounded-tr-sm bg-primary px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-primary-foreground">{m.text}</div>
      </div>
    </div>
  )
}

export function ChatPane({ data, ensureSaved, onShowDraft, onCover, className }: { data: StudioData; ensureSaved: () => Promise<void>; onShowDraft: () => void; onCover: () => void; className?: string }) {
  const [text, setText] = useState('')
  const [pin, setPin] = useState<string | null>(null)
  const send = useSend()
  const { data: codex } = useApi<CodexStatus>('/content/codex')
  const { data: kit } = useApi<Kit>('/content/kit')
  const stop = useWrite((mid: string) => api.post(`/content/messages/${mid}/stop`, {}))
  const retry = useWrite((mid: string) => api.post(`/content/messages/${mid}/retry`, {}))
  const adopt = useWrite(({ mid, i }: { mid: string; i: number }) => api.post<{ version?: number }>(`/content/messages/${mid}/adopt`, { index: i }), (r) => ((r as { version?: number }).version ? `已采用，存为 v${(r as { version: number }).version}` : '按这个角度写了，等一会儿'))
  const list = useRef<HTMLDivElement>(null)
  const msgs = data.messages
  const busy = data.running || send.isPending
  const firstExample = msgs.findIndex((m) => m.origin === '示例')
  const lastExample = msgs.map((m) => m.origin).lastIndexOf('示例')

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, data.running])

  const submit = async (t = text) => {
    const s = t.trim()
    if (!s || busy) return
    await ensureSaved()
    send.mutate({ id: data.piece.id, text: s, pin }, { onSuccess: () => { setText(''); setPin(null) } })
  }
  const allFiles = kit ? [...(kit.skill ? [kit.skill] : []), ...kit.groups.flatMap((g) => g.files)] : []
  return (
    <section className={cn('flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-paper lg:min-h-0', className)}>
      <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <StartCard piece={data.piece} kit={kit} compact={msgs.length > 0} />
        {msgs.map((m, i) => (
          <div key={m.id}>
            {i === firstExample && <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground"><span className="h-px flex-1 bg-border" />下面是预先写好的示例对话，不是现场生成的<span className="h-px flex-1 bg-border" /></div>}
            {m.role === 'user' ? <UserMessage m={m} /> : <AiMessage m={m} busy={busy || adopt.isPending}
              onAdopt={async (k) => { await ensureSaved(); adopt.mutate({ mid: m.id, i: k }) }} onRetry={() => retry.mutate(m.id)} onStop={() => stop.mutate(m.id)} onShowDraft={onShowDraft}
              slow={codex?.slow_s ?? 90} limit={codex?.timeout_s ?? 180} />}
            {i === lastExample && lastExample < msgs.length - 1 && <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground"><span className="h-px flex-1 bg-border" />以下是现场对话<span className="h-px flex-1 bg-border" /></div>}
          </div>
        ))}
      </div>
      <div className="border-t bg-surface-2/40 px-3 pt-2.5 pb-3">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {suggestions(data.has_draft).map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => submit(s)} className="shrink-0 rounded-full border bg-card px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-primary hover:text-primary disabled:opacity-50">{s}</button>
          ))}
        </div>
        {pin && <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">这次一定会参考：<DocChip path={pin} /><button type="button" aria-label="不参考了" onClick={() => setPin(null)}><X className="size-3.5" /></button></div>}
        <div className="rounded-xl border bg-card focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={!codex?.available && !!codex}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
            placeholder={data.has_draft ? '告诉 Codex 想怎么改，比如：开头换成加班的场景，正文再短一点' : '说一句想怎么写，比如：降温了，写一篇办公室一个杯子泡白茶'}
            className="max-h-40 min-h-[56px] resize-none border-0 bg-transparent text-[13.5px] shadow-none focus-visible:ring-0" />
          <div className="flex items-center gap-1 px-2 pb-2">
            <Popover>
              <PopoverTrigger asChild><Button size="xs" variant="ghost"><Paperclip />引用资料</Button></PopoverTrigger>
              <PopoverContent align="start" className="max-h-72 w-72 gap-0 overflow-y-auto p-1.5">
                <div className="shrink-0 px-2 py-1 text-xs text-muted-foreground">下一条一定带上这份</div>
                {allFiles.map((f) => <button key={f} type="button" title={kbName(f)} onClick={() => setPin(f)} className="block w-full shrink-0 truncate rounded px-2 py-1.5 text-left text-[13px] leading-5 hover:bg-muted">{kbName(f)}</button>)}
              </PopoverContent>
            </Popover>
            <Button size="xs" variant="ghost" onClick={onCover}><Images />做封面</Button>
            <span className={cn('ml-auto truncate text-[12px]', codex && !codex.available ? 'text-warn' : 'text-muted-foreground')}>{codex?.detail ?? ''}</span>
            <Button size="icon-sm" aria-label="发送" onClick={() => submit()} disabled={busy || !text.trim()}>{send.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}</Button>
          </div>
        </div>
      </div>
    </section>
  )
}
