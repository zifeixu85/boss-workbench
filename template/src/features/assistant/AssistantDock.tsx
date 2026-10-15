// AI 助手（2026-10-15）：每一页右边都能打开的对话栏（⌘J 或右下角按钮）。它知道你正在看哪一页，
// 后台调本机 Codex，用工作台工具读写（server/assistant/）；写完页面自动刷新。宽屏时和页面并排，不挡内容；窄屏时盖在上面。
// 本机没有 Codex、没登录、或在设置里关了，就在这里说清怎么办，其他功能照常。
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleAlert, Loader2, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react'
import { api, useApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Kbd } from '@/components/ui/kbd'

type Step = { tool: string; label: string; state: 'running' | 'ok' | 'failed'; detail?: string }
type Msg = { id: string; role: 'user' | 'assistant'; text: string; status: 'running' | 'done' | 'failed' | 'cancelled'; error: string | null; steps: Step[]; page_title: string | null; created_at: string }
type Status = { ready: boolean; version: string | null; detail: string; fix: string | null; on: boolean; running: string | null }

const OPEN_KEY = 'wb.assistant.open'
const WIDE = '(min-width: 1280px)'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }

/** 当前页面：标题、地址、正文（只取主区域，不含对话栏自己），给 AI 当上下文 */
function pageContext(path: string) {
  const main = document.querySelector('main')
  const title = main?.querySelector('h1')?.textContent?.trim() || document.title
  return { title, path, text: (main?.innerText ?? '').slice(0, 6000) }
}

const SUGGEST = ['今天我先做哪件事？', '整理一下收件箱', '这页上有什么要我注意的？']

export function AssistantDock() {
  const [open, setOpen] = useState(readOpen)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loc = useLocation()
  const qc = useQueryClient()
  const { data: status, refetch: recheck } = useApi<Status>(open ? '/assistant/status' : null)
  const { data: msgs } = useQuery<Msg[]>({
    queryKey: ['assistant-messages'], queryFn: () => api.get<Msg[]>('/assistant/messages'), enabled: open,
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === 'running') ? 1500 : false),
  })
  const running = msgs?.some((m) => m.status === 'running') ?? false
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wasRunning = useRef(false)

  // 记住开关；宽屏时把页面往左让出位置
  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* 隐私模式 */ }
    const apply = () => { document.body.style.paddingRight = open && window.matchMedia(WIDE).matches ? '400px' : '' }
    if (open) document.body.dataset.assistant = 'open'; else delete document.body.dataset.assistant // 右下角的提示让开对话栏（index.css）
    apply()
    const mq = window.matchMedia(WIDE)
    mq.addEventListener('change', apply)
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    return () => { mq.removeEventListener('change', apply); document.body.style.paddingRight = ''; delete document.body.dataset.assistant }
  }, [open])
  // ⌘J / Ctrl+J 开关
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((v) => !v) } }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  // 新消息滚到底；一轮答完刷新全部数据（AI 写的东西马上出现在页面上）
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [msgs])
  useEffect(() => { if (wasRunning.current && !running) qc.invalidateQueries(); wasRunning.current = running }, [running, qc])

  const send = async (q = text) => {
    const t = q.trim()
    if (!t || running || sending) return
    setSending(true); setError(null)
    try {
      await api.post('/assistant/ask', { text: t, page: pageContext(loc.pathname + loc.search) })
      setText('')
      await qc.invalidateQueries({ queryKey: ['assistant-messages'] })
    } catch (e) { setError((e as Error).message) } finally { setSending(false) }
  }
  const stop = async () => { await api.post('/assistant/stop', {}).catch(() => {}); qc.invalidateQueries({ queryKey: ['assistant-messages'] }) }
  const restart = async () => { await api.del('/assistant/messages').catch(() => {}); qc.invalidateQueries({ queryKey: ['assistant-messages'] }) }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex items-center gap-1.5 rounded-full border border-primary/25 bg-card px-3.5 py-2 text-sm font-medium text-primary shadow-paper hover:bg-accent md:bottom-5" aria-label="打开 AI 助手">
        <Sparkles className="size-4" />AI 助手<Kbd className="ml-1 hidden md:inline-flex">⌘J</Kbd>
      </button>
    )
  }

  const usable = status?.ready && status.on
  return (
    <aside aria-label="AI 助手" className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-card shadow-2xl sm:w-[400px] xl:shadow-none">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">AI 助手</div>
          <div className="truncate text-xs text-muted-foreground">{status ? (usable ? `本机 Codex · 能读写工作台和知识库` : status.on ? '还用不了' : '已在设置里关掉') : '检查中…'}</div>
        </div>
        {!!msgs?.length && <Button size="icon-sm" variant="ghost" aria-label="新对话" title="新对话" onClick={restart}><RotateCcw /></Button>}
        <Button size="icon-sm" variant="ghost" aria-label="收起 AI 助手" onClick={() => setOpen(false)}><X /></Button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {status && !usable && (
          <div className="rounded-lg border border-warn/30 bg-warn-soft/40 px-3.5 py-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium"><CircleAlert className="size-4 text-warn" />{status.on ? status.detail : 'AI 助手关着'}</div>
            <p className="mt-1 text-[13px] text-muted-foreground">{status.on ? status.fix : '到“设置 → AI 助手”打开。'}</p>
            {status.on && <Button size="sm" variant="outline" className="mt-2" onClick={() => api.get('/assistant/status?refresh=1').then(() => recheck())}>重新检查</Button>}
            <p className="mt-2 text-xs text-muted-foreground">不用页面里的助手也行：在 Codex 里直接说，比如“工作台加一条待办……”，它用同一套命令读写，这里会自动刷新。</p>
          </div>
        )}
        {usable && !msgs?.length && (
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>想让我做什么，直接说。我能看到你正在看的这一页。</p>
            <div className="flex flex-wrap gap-1.5">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border px-2.5 py-1 text-xs hover:border-primary/40 hover:text-foreground">{s}</button>)}</div>
            <p className="text-xs">普通的事（记跟进、加日程、整理收件箱）我直接写；报价、合同、收款、答应别人的事，我先问你。</p>
          </div>
        )}
        {msgs?.map((m) => m.role === 'user' ? (
          <div key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm whitespace-pre-wrap text-accent-foreground">{m.text}{m.page_title && <div className="mt-1 text-[11px] opacity-70">在看：{m.page_title}</div>}</div>
        ) : (
          <div key={m.id} className="mr-4 grid gap-1.5">
            {m.steps.length > 0 && (
              <div className="flex flex-wrap gap-1">{m.steps.map((s, i) => (
                <span key={i} className={cn('inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground', s.state === 'failed' && 'text-danger')} title={s.detail}>
                  {s.state === 'running' ? <Loader2 className="size-3 animate-spin" /> : s.state === 'ok' ? <Check className="size-3" /> : <CircleAlert className="size-3" />}{s.label}
                </span>
              ))}</div>
            )}
            {m.text && <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.text.replace(/\*\*(.+?)\*\*/g, '$1')}</div>}
            {m.status === 'running' && !m.text && <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />在想…</div>}
            {m.status === 'failed' && <div className="text-[13px] text-danger">{m.error}</div>}
            {m.status === 'cancelled' && <div className="text-xs text-muted-foreground">已停止</div>}
          </div>
        ))}
      </div>

      <form className="border-t p-3" onSubmit={(e) => { e.preventDefault(); send() }}>
        {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} disabled={!usable} rows={2} className="max-h-40 min-h-11 resize-none"
            placeholder={usable ? '比如：刚和客户聊完，下周三前要给报价' : '现在用不了'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
          {running
            ? <Button type="button" size="icon" variant="outline" aria-label="停止" onClick={stop}><Square /></Button>
            : <Button type="submit" size="icon" aria-label="发送" disabled={!usable || !text.trim() || sending}>{sending ? <Loader2 className="animate-spin" /> : <Send />}</Button>}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Enter 发送，Shift+Enter 换行 · 用的是你自己电脑上的 Codex</p>
      </form>
    </aside>
  )
}
