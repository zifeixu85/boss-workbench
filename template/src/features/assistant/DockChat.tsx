// 对话栏里的一个对话（2026-11-26 照 A梦 自用工作台的对话框）：消息、过程（一步一行，答完折成一行点开看）、要他点的“是否允许”、输入框。
// 输入框：圆角框里放“本页”胶囊（他在看的页面，能去掉）、选中的文字（能去掉）、输入框（跟着内容长高）、下面一行状态和发送 / 停止。
// 回车发送、Shift+回车换行，输入法选字的那一下不算。
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { AlertTriangle, ArrowUp, Check, ChevronRight, FileText, ImagePlus, Loader2, Paperclip, Square, TextQuote, X } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { ResultCards, type ChangeCard } from './ResultCards'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Tip } from './DockFrame'

export type Step = { tool: string; label: string; state: 'running' | 'ok' | 'failed'; detail?: string }
export type Approval = { key: string; kind: '跑命令' | '改文件' | '要权限'; text: string; reason: string }
export type Attached = { id: string; name: string; kind: 'image' | 'file'; size: number }
export type Msg = { id: string; thread_id: string | null; role: 'user' | 'assistant'; text: string; status: 'running' | 'done' | 'failed' | 'cancelled'; error: string | null; steps: Step[]; page_title: string | null; page_selection: string | null; created_at: string; approvals?: Approval[]; attachments?: Attached[]; images?: { step: number; url: string; name: string }[]; cards?: ChangeCard[] }

const CHAT_MARKDOWN = cn('text-[14px] leading-6 [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-[16px] [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[15px] [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-[14px] [&_p]:my-1.5',
  '[&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_table]:text-[13px] [&_th]:px-2 [&_th]:py-1.5 [&_th]:whitespace-nowrap [&_td]:px-2 [&_td]:py-1.5',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/60 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-[12.5px] [&_pre]:leading-5 [&_pre_code]:bg-transparent [&_pre_code]:p-0')
const CHIP = 'inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs text-muted-foreground'

// ───────────────────────────── 消息

export function MessageList({ msgs, empty, onApprove }: { msgs: Msg[]; empty: React.ReactNode; onApprove: (key: string, choice: 'allow' | 'allow-session' | 'deny') => void }) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [msgs])
  if (!msgs.length) return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">{empty}</div>
  return (
    <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <ol className="m-0 grid list-none gap-5 p-0" aria-label="对话记录">
        {msgs.map((m) => <li key={m.id} className="min-w-0">{m.role === 'user' ? <UserBubble m={m} /> : <AssistantMessage m={m} onApprove={onApprove} />}</li>)}
      </ol>
    </div>
  )
}

function UserBubble({ m }: { m: Msg }) {
  return (
    <div className="ml-10 flex flex-col items-end">
      <div className="max-w-full rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap">{m.text}</div>
      {(m.page_title || m.page_selection || m.attachments?.length) && (
        <div className="mt-1 flex max-w-full flex-wrap justify-end gap-1">
          {m.attachments?.map((a) => <span key={a.id} className={CHIP} title={a.name}>{a.kind === 'image' ? <ImagePlus className="size-3 shrink-0" /> : <Paperclip className="size-3 shrink-0" />}<span className="truncate">{a.name}</span></span>)}
          {m.page_title && <span className={CHIP} title={`发这句时带上了本页：${m.page_title}`}><span className="shrink-0">本页</span><span className="truncate">{m.page_title}</span></span>}
          {m.page_selection && <span className={CHIP} title={m.page_selection}><TextQuote className="size-3 shrink-0" /><span className="truncate">{m.page_selection}</span></span>}
        </div>
      )}
    </div>
  )
}

function AssistantMessage({ m, onApprove }: { m: Msg; onApprove: (key: string, choice: 'allow' | 'allow-session' | 'deny') => void }) {
  return (
    <div className="min-w-0">
      <Activity m={m} />
      {m.text && <Markdown source={m.text} className={CHAT_MARKDOWN} />}
      {!!m.images?.length && <Images m={m} />}
      {m.approvals?.map((a) => <ApprovalCard key={a.key} a={a} onApprove={onApprove} />)}
      {m.status !== 'running' && !!m.cards?.length && <ResultCards cards={m.cards} />}
      {m.status === 'failed' && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-soft/60 px-3 py-2 text-[13px] text-danger"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{m.error || '这一轮没答完'}</p>}
      {m.status === 'cancelled' && <p className="mt-1.5 text-xs text-muted-foreground">已停止</p>}
    </div>
  )
}

/** 回答里生成的图：点开看大图；在小红书稿子页上能“放进当前稿子”（做成这篇的封面垫图，存成新的一版，旧版留着） */
function Images({ m }: { m: Msg }) {
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const piece = pathname.match(/^\/content\/studio\/([^/]+)/)?.[1]
  const [busy, setBusy] = useState<number | null>(null)
  const put = async (step: number) => {
    if (!piece) return
    setBusy(step)
    try { await api.post(`/m/xhs/pieces/${encodeURIComponent(piece)}/image`, { message: m.id, step }); toast.success('放进这篇稿子了：做成了封面的垫图，旧版留着'); void qc.invalidateQueries() }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {m.images!.map((im) => (
        <figure key={im.step} className="m-0 grid gap-1">
          <a href={im.url} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border bg-muted" title="看大图">
            <img src={im.url} alt={im.name} loading="lazy" className="aspect-square w-full object-cover transition-transform hover:scale-[1.02]" />
          </a>
          {piece && <Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={() => void put(im.step)}>{busy === im.step ? <Loader2 className="animate-spin" /> : <ImagePlus />}放进当前稿子</Button>}
        </figure>
      ))}
    </div>
  )
}

/** 每秒走一次的时钟（只在答的时候走） */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!active) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [active])
  return now
}
const elapsed = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒` }

/** 这一轮的过程：答的时候一行一行写（做完的打勾，正在做的转圈，带上等了多久）；答完折成一行，点开看每一步 */
function Activity({ m }: { m: Msg }) {
  const [open, setOpen] = useState(false)
  const running = m.status === 'running'
  const now = useTicker(running)
  if (running) {
    const cur = [...m.steps].reverse().find((s) => s.state === 'running')
    return (
      <div className="mb-2 grid gap-1">
        {m.steps.filter((s) => s !== cur).map((s, i) => <StepRow key={i} step={s} />)}
        <div className="flex min-w-0 items-center gap-1.5 py-0.5 text-[13px] text-muted-foreground" role="status">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate">{cur ? cur.label : m.approvals?.length ? '等你点一下' : m.text ? '在写' : '在想'}<span className="num"> · {elapsed(now - Date.parse(m.created_at))}</span></span>
        </div>
      </div>
    )
  }
  if (!m.steps.length) return null
  const warn = m.steps.some((s) => s.state === 'failed')
  return (
    <div className="mb-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={cn('-mx-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted', warn ? 'text-warn' : 'text-muted-foreground hover:text-foreground')}>
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
        {warn && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
        <span className="min-w-0 truncate">做了 {m.steps.length} 步{warn ? '，有没做成的' : ''}</span>
      </button>
      {open && <div className="mt-1 ml-1.5 grid gap-1 border-l pl-3">{m.steps.map((s, i) => <StepRow key={i} step={s} />)}</div>}
    </div>
  )
}

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false)
  const icon = step.state === 'running' ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
    : step.state === 'failed' ? <AlertTriangle className="size-3.5 shrink-0 text-warn" aria-hidden /> : <Check className="size-3.5 shrink-0 text-ok" aria-hidden />
  const line = <span className={cn('min-w-0 [overflow-wrap:anywhere]', step.state === 'failed' ? 'text-warn' : 'text-muted-foreground')}>{step.label}</span>
  if (!step.detail) return <div className="flex min-w-0 items-start gap-1.5 py-0.5 text-xs"><span className="mt-px">{icon}</span>{line}</div>
  return (
    <div className="min-w-0 text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="-mx-1 flex w-full min-w-0 items-start gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-muted">
        <span className="mt-px">{icon}</span>{line}<ChevronRight className={cn('mt-px ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
      </button>
      {open && <pre className="m-0 mt-1 mb-1.5 ml-5 overflow-x-auto rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-[11.5px] leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">{step.detail}</pre>}
    </div>
  )
}

/** Codex 要问“是否允许”（照他 Codex 自己的设置） */
function ApprovalCard({ a, onApprove }: { a: Approval; onApprove: (key: string, choice: 'allow' | 'allow-session' | 'deny') => void }) {
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-warn/40 bg-warn-soft/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium"><AlertTriangle className="size-4 shrink-0 text-warn" />Codex 想{a.kind}，要你点一下</p>
      <code className="block rounded-md bg-card px-2 py-1 font-mono text-[12px] break-all whitespace-pre-wrap">{a.text}</code>
      {a.reason && <p className="text-xs text-muted-foreground">原因：{a.reason}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="xs" onClick={() => onApprove(a.key, 'allow')}><Check />允许</Button>
        <Button type="button" size="xs" variant="outline" onClick={() => onApprove(a.key, 'allow-session')}>这次对话都允许</Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => onApprove(a.key, 'deny')}>不允许</Button>
      </div>
    </div>
  )
}

// ───────────────────────────── 输入框

/** 页面上最后选中的文字（对话栏外面的）：点进输入框时页面上的选区会没，所以选的时候就记下来；换页清掉 */
let lastSelection = ''
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.addEventListener('selectionchange', () => {
  const sel = document.getSelection()
  const t = sel?.toString().trim() ?? ''
  const node = sel?.anchorNode
  const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement)
  if (t && !el?.closest('[data-assistant-panel]')) { lastSelection = t.slice(0, 2000); listeners.forEach((f) => f()) }
})
function useSelection(): [string, () => void] {
  const [sel, setSel] = useState(lastSelection)
  const { pathname } = useLocation()
  useEffect(() => { const f = () => setSel(lastSelection); listeners.add(f); return () => { listeners.delete(f) } }, [])
  useEffect(() => { lastSelection = ''; setSel('') }, [pathname])
  return [sel, () => { lastSelection = ''; setSel('') }]
}

/** 当前页面：标题、地址、正文（主区域 + 打开着的详情抽屉，不含对话栏自己） */
function pageNow(path: string) {
  const main = document.querySelector('main')
  const sheet = [...document.querySelectorAll('[data-slot="sheet-content"]')].map((d) => (d as HTMLElement).innerText).join('\n')
  const title = (document.querySelector('[data-slot="sheet-content"] [data-slot="sheet-title"]')?.textContent || main?.querySelector('h1')?.textContent || document.title).trim()
  return { title, path, text: `${sheet ? `${sheet}\n` : ''}${main?.innerText ?? ''}`.slice(0, 6000) }
}

export function Composer({ running, usable, statusText, statusTone, onSend, onStop, sendRef }: {
  running: boolean; usable: boolean; statusText: string; statusTone: 'ok' | 'warn' | 'danger'
  onSend: (text: string, page: { title: string; path: string; text: string; selection: string } | null, attachments: Attached[]) => Promise<boolean>
  onStop: () => void; sendRef?: React.MutableRefObject<((t: string) => void) | null>
}) {
  const loc = useLocation()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [withPage, setWithPage] = useState(true)
  const [sel, clearSel] = useSelection()
  const tray = useAttachTray()
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setWithPage(true) }, [loc.pathname, loc.search])
  // 输入框跟着内容长高（最多 8 行左右）
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px` }, [text])
  const page = withPage ? pageNow(loc.pathname + loc.search) : null
  const send = async (value = text) => {
    const t = value.trim()
    if ((!t && !tray.items.length) || running || busy || !usable || tray.uploading) return
    setBusy(true)
    try { if (await onSend(t || '看看我发的附件', page ? { ...page, selection: sel } : (sel ? { title: '', path: '', text: '', selection: sel } : null), tray.items)) { setText(''); clearSel(); tray.clear() } }
    finally { setBusy(false) }
  }
  useEffect(() => { if (sendRef) sendRef.current = (v: string) => void send(v) })
  return (
    <div className="px-3 pt-2 pb-3">
      <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); tray.setOver(true) } }} onDragLeave={() => tray.setOver(false)}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); tray.setOver(false); void tray.add(e.dataTransfer.files) } }}
        className={cn('rounded-2xl border bg-background transition-colors focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-ring/25', tray.over && 'border-primary bg-primary/5')}>
        {(tray.items.length > 0 || tray.uploading) && (
          <div className="flex flex-wrap gap-1 px-2.5 pt-2.5">
            {tray.items.map((a) => (
              <span key={a.id} className={cn(CHIP, 'pr-0.5')} title={a.name}>
                {a.kind === 'image' ? <ImagePlus className="size-3 shrink-0" /> : <Paperclip className="size-3 shrink-0" />}<span className="max-w-40 truncate">{a.name}</span>
                <button type="button" onClick={() => tray.remove(a.id)} aria-label={`不发 ${a.name}`} className="grid size-4 shrink-0 place-items-center rounded hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
              </span>
            ))}
            {tray.uploading && <span className={CHIP}><Loader2 className="size-3 animate-spin" />在传…</span>}
          </div>
        )}
        {sel && (
          <div className="flex min-w-0 items-center gap-1 px-2.5 pt-2.5">
            <span className={cn(CHIP, 'flex-1')} title={sel}><TextQuote className="size-3 shrink-0" /><span className="shrink-0">选中</span><span className="truncate">{sel}</span></span>
            <button type="button" onClick={clearSel} aria-label="不带选中的文字" className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
          </div>
        )}
        <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={1}
          onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); void tray.add(files) } }} aria-label="对 AI 说" data-assistant-input disabled={!usable}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send() } }}
          placeholder={!usable ? '现在用不了' : running ? '等这一句答完，或先停止…' : '想让我做什么？我看得到你在看的这一页；截图能直接粘贴'}
          className="block max-h-[200px] w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-[14px] leading-6 outline-none placeholder:text-muted-foreground" />
        <div className="flex min-w-0 items-center gap-1 px-1.5 pb-1.5">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden">
            <input ref={tray.input} type="file" multiple hidden accept="image/*,.pdf,.txt,.md,.csv,.docx,.xlsx,.pptx" onChange={(e) => { if (e.target.files?.length) void tray.add(e.target.files); e.target.value = '' }} />
            <Tip label="加图片或文件（也能粘贴截图、拖进来）"><button type="button" onClick={() => tray.input.current?.click()} disabled={!usable} aria-label="加附件" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><Paperclip className="size-4" /></button></Tip>
            {page?.title && (
              <span className={cn(CHIP, 'ml-1 pr-0.5')} title={`发这句时带上本页：${page.title}`}>
                <FileText className="size-3 shrink-0" /><span className="shrink-0">本页</span><span className="truncate">{page.title}</span>
                <button type="button" onClick={() => setWithPage(false)} aria-label="这句不带本页" className="grid size-4 shrink-0 place-items-center rounded hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
              </span>
            )}
          </div>
          <span className={cn('inline-flex h-7 max-w-[40%] shrink-0 items-center gap-1 rounded-md px-1 text-xs whitespace-nowrap', statusTone === 'danger' ? 'text-danger' : statusTone === 'warn' ? 'text-warn' : 'text-muted-foreground')} title={statusText}>
            <span className={cn('size-1.5 shrink-0 rounded-full', statusTone === 'ok' ? 'bg-ok' : statusTone === 'warn' ? 'bg-warn' : 'bg-danger')} aria-hidden /><span className="min-w-0 truncate">{statusText}</span>
          </span>
          {running
            ? <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onStop} aria-label="停止这一轮"><Square />停止</Button>
            : <Tip label="发送（回车）· Shift+回车换行"><Button type="button" size="icon-sm" className="shrink-0 rounded-full" onClick={() => void send()} disabled={(!text.trim() && !tray.items.length) || busy || !usable || tray.uploading} aria-label="发送">{busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}</Button></Tip>}
        </div>
      </div>
    </div>
  )
}

/** 附件托盘：粘贴、拖进来、点曲别针选；一个个传到工作台的“对话附件”文件夹，传完才能发 */
const MAX_MB = 15
function useAttachTray() {
  const [items, setItems] = useState<Attached[]>([])
  const [uploading, setUploading] = useState(0)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const add = async (list: FileList | File[]) => {
    for (const f of [...list]) {
      if (f.size > MAX_MB * 1024 * 1024) { toast.error(`${f.name} 太大了，一个附件最多 ${MAX_MB}MB`); continue }
      setUploading((n) => n + 1)
      try {
        const data = await readBase64(f)
        const name = f.name && f.name !== 'image.png' ? f.name : `截图-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`
        const r = await api.post<Attached>('/assistant/attachments', { name, data })
        setItems((xs) => [...xs, r])
      } catch (e) { toast.error(`${f.name || '附件'} 没传上：${(e as Error).message}`) }
      finally { setUploading((n) => n - 1) }
    }
  }
  return { items, uploading: uploading > 0, over, setOver, input, add, remove: (id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), clear: () => setItems([]) }
}
function readBase64(f: Blob): Promise<string> {
  return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => bad(new Error('读不了这个文件')); r.readAsDataURL(f) })
}

export const approve = (key: string, choice: 'allow' | 'allow-session' | 'deny') => api.post('/assistant/approve', { key, choice })
