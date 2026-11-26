// 页面里的 AI 助手（⌘J）。2026-11-26 照 A梦 自用工作台的对话框重做（A梦：“我们是挤压页面实现的，包括那些交互 UI 组件，你都复用一下”）：
// - 默认钉在右侧当侧栏，把页面往左挤（dock.css），两边能同时看、同时点；可以改成浮在页面上；中等宽度一律浮着，手机全屏（dock-layout.ts）；
// - 左边那条竖线能拖宽、拖窄（键盘左右键也行，双击回到默认），宽度、钉不钉、开没开记在这台电脑的浏览器里；
// - ⌘J：收着就打开；开着但光标在页面上就回到输入框；光标在对话栏里就收起。浮着、全屏时 Esc 收起；
// - 对话栏开着时详情抽屉不是模态的（components/ui/sheet.tsx）：抽屉开着也能打开、能打字，点对话栏不关抽屉；
// - 头部：左边历史（在历史里是“返回”），中间对话名，右边新对话、钉住 / 浮着、收起；历史按今天 / 昨天 / 这 7 天 / 更早分组（DockHistory.tsx）。
// 默认关（2026-11-12）：设置里打开才有。
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, History, SquarePen, Sparkles } from 'lucide-react'
import { api, useApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Settings } from '@/lib/types'
import { DOCK_WIDTH, canPin, clampDockWidth, dockLayout, dragDockWidth, hotkeyAction, nudgeDockWidth, type DockLayout } from './dock-layout'
import { useDockMark, useDockPrefs, useViewportWidth } from './use-dock'
import { DockFrameContext, DockHeader, Tip, type DockFrame } from './DockFrame'
import { HistoryView, type Thread } from './DockHistory'
import { PersonaPicker, usePersona } from './DockPersona'
import { Composer, MessageList, approve, type Msg, type Attached } from './DockChat'
import './dock.css'

type Status = { ready: boolean; version: string | null; detail: string; fix: string | null; on: boolean; running: string | null; running_thread: string | null; engine?: 'simple' | 'codex' }

const THREAD_KEY = 'wb.assistant.thread'
const readThread = () => { try { return localStorage.getItem(THREAD_KEY) } catch { return null } }
const saveThread = (id: string | null) => { try { if (id) localStorage.setItem(THREAD_KEY, id); else localStorage.removeItem(THREAD_KEY) } catch { /* 隐私模式 */ } }
const focusInput = (root: HTMLElement | null) => root?.querySelector<HTMLTextAreaElement>('textarea[data-assistant-input]')?.focus()

export function AssistantDock() {
  const enabled = useApi<Settings>('/settings').data?.assistant_on === true
  return enabled ? <Dock /> : null
}

function Dock() {
  const viewport = useViewportWidth()
  const [prefs, set] = useDockPrefs()
  const layout = dockLayout(viewport, prefs.pinned)
  const width = clampDockWidth(prefs.width, viewport, layout)
  const open = prefs.open
  useDockMark(open, layout, width)
  const panel = useRef<HTMLElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const giveBack = useRef(false)
  const toggle = (next = !open) => { if (!next) giveBack.current = !!panel.current?.contains(document.activeElement); set.setOpen(next) }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'j' || e.isComposing) return
      e.preventDefault()
      const action = hotkeyAction(open, !!panel.current?.contains(document.activeElement))
      if (action === 'open') toggle(true)
      else if (action === 'close') toggle(false)
      else focusInput(panel.current)
    }
    // 抓在最前面（capture）：详情抽屉开着、焦点在抽屉里时也收得到
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  })
  useEffect(() => { if (open) setTimeout(() => focusInput(panel.current), 30); else if (giveBack.current) { giveBack.current = false; launcher.current?.focus() } }, [open])
  if (!open) {
    return (
      <button ref={launcher} onClick={() => toggle(true)} aria-label="打开 AI 对话（⌘J）" title="问 Codex（⌘J）"
        className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-40 grid size-11 place-items-center rounded-full border bg-card shadow-lg transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none md:right-6 md:bottom-6 md:flex md:size-auto md:items-center md:gap-2 md:px-3.5 md:py-2.5 md:text-sm md:font-medium">
        <Sparkles className="size-[18px] text-primary md:size-4" /><span className="hidden md:inline">问 Codex</span><kbd className="hidden rounded border px-1 font-mono text-xs text-muted-foreground md:inline">⌘J</kbd>
      </button>
    )
  }
  const frame: DockFrame = { layout, pinned: prefs.pinned, pinnable: canPin(viewport) && layout !== 'full', togglePin: () => set.setPinned(!prefs.pinned), close: () => toggle(false) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing || layout === 'pinned') return
    if (!panel.current?.contains(e.target as Node)) return
    e.preventDefault()
    toggle(false)
  }
  return (
    <aside ref={panel} aria-label="AI 对话" data-assistant-panel={layout} onKeyDown={onKeyDown} style={layout === 'full' ? undefined : { width }}
      className={cn('fixed flex flex-col bg-card text-card-foreground', layout === 'full' ? 'inset-0 z-[60] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : 'inset-y-0 right-0 z-[60] border-l', layout === 'float' && 'shadow-2xl')}>
      {layout !== 'full' && <ResizeHandle width={width} viewport={viewport} layout={layout} onWidth={set.setWidth} />}
      <DockFrameContext.Provider value={frame}><DockBody /></DockFrameContext.Provider>
    </aside>
  )
}

/** 左边那条竖线：拖着改宽度（拖的时候不存，松手才存），键盘左右键、Home / End 也行，双击回到默认宽度 */
function ResizeHandle({ width, viewport, layout, onWidth }: { width: number; viewport: number; layout: DockLayout; onWidth: (w: number, save?: boolean) => void }) {
  const drag = useRef<{ x: number; w: number; last: number } | null>(null)
  const end = (e: React.PointerEvent) => {
    if (!drag.current) return
    const last = drag.current.last
    drag.current = null
    delete document.documentElement.dataset.assistantResizing
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* 已经释放了 */ }
    onWidth(last, true)
  }
  return (
    <div role="separator" aria-orientation="vertical" aria-label="拖动调宽度（键盘左右键也行，双击回到默认）" tabIndex={0}
      aria-valuenow={width} aria-valuemin={DOCK_WIDTH.min} aria-valuemax={clampDockWidth(DOCK_WIDTH.max, viewport, layout)}
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); drag.current = { x: e.clientX, w: width, last: width }; e.currentTarget.setPointerCapture(e.pointerId); document.documentElement.dataset.assistantResizing = '' }}
      onPointerMove={(e) => { if (!drag.current) return; const next = dragDockWidth(drag.current.w, drag.current.x, e.clientX, viewport, layout); drag.current.last = next; onWidth(next, false) }}
      onPointerUp={end} onPointerCancel={end}
      onDoubleClick={() => onWidth(clampDockWidth(DOCK_WIDTH.default, viewport, layout), true)}
      onKeyDown={(e) => { const next = nudgeDockWidth(width, e.key, viewport, layout); if (next !== null) { e.preventDefault(); onWidth(next, true) } }}
      className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none">
      <span aria-hidden className="absolute inset-y-0 left-1.5 w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  )
}

const SUGGEST = ['今天我先做哪件事？', '这页上有什么要我注意的？', '整理一下收件箱']

/** 对话栏里面：历史，或一个对话 */
function DockBody() {
  const qc = useQueryClient()
  const [thread, setThreadState] = useState<string | null>(readThread)
  const [history, setHistory] = useState(false)
  /** 这次打开里新开的对话（历史清单还没刷新到它时，不能当成“不在了”） */
  const fresh = useRef(new Set<string>())
  const setThread = (id: string | null) => { saveThread(id); setThreadState(id) }
  const { data: status, refetch: recheck } = useApi<Status>('/assistant/status')
  const threads = useQuery<Thread[]>({ queryKey: ['assistant-threads', false], queryFn: () => api.get<Thread[]>('/assistant/threads') })
  const current = threads.data?.find((t) => t.id === thread)
  const who = usePersona(thread, current?.persona)
  // 记着的对话不在了（归档了、换了数据库）：当新对话
  useEffect(() => { if (thread && threads.data && !threads.isFetching && !current && !fresh.current.has(thread)) setThread(null) }, [thread, threads.data, threads.isFetching, current]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data: msgs } = useQuery<Msg[]>({
    queryKey: ['assistant-messages', thread], queryFn: () => (thread ? api.get<Msg[]>(`/assistant/messages?thread=${encodeURIComponent(thread)}`) : Promise.resolve([])),
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === 'running') ? 1200 : false),
  })
  const running = !!msgs?.some((m) => m.status === 'running')
  const wasRunning = useRef(false)
  // 一轮答完刷新全部数据（AI 写的东西马上出现在页面上）
  useEffect(() => { if (wasRunning.current && !running) void qc.invalidateQueries(); wasRunning.current = running }, [running, qc])
  const [error, setError] = useState<string | null>(null)
  const sendRef = useRef<((t: string) => void) | null>(null)
  const usable = !!status?.ready && !!status.on
  const codex = status?.engine === 'codex'

  if (history) return <HistoryView onBack={() => setHistory(false)} onPick={(t) => { setThread(t.id); setHistory(false) }} />

  const send = async (text: string, page: { title: string; path: string; text: string; selection: string } | null, attachments: Attached[] = []) => {
    setError(null)
    try {
      const r = await api.post<{ id: string; thread: string }>('/assistant/ask', { text, page, ...(who.list.length ? { persona: who.persona?.key ?? '' } : {}), ...(attachments.length ? { attachments: attachments.map((a) => ({ id: a.id, name: a.name })) } : {}), ...(thread ? { thread } : {}) })
      if (r.thread !== thread) { fresh.current.add(r.thread); setThread(r.thread) }
      await qc.invalidateQueries({ queryKey: ['assistant-messages', r.thread] })
      void qc.invalidateQueries({ queryKey: ['assistant-threads'] })
      return true
    } catch (e) { setError((e as Error).message); return false }
  }
  const stop = async () => { await api.post('/assistant/stop', {}).catch(() => {}); void qc.invalidateQueries({ queryKey: ['assistant-messages'] }) }
  const onApprove = async (key: string, choice: 'allow' | 'allow-session' | 'deny') => { await approve(key, choice).catch((e) => setError((e as Error).message)); void qc.invalidateQueries({ queryKey: ['assistant-messages'] }) }
  const empty = (
    <div className="grid gap-3 text-sm text-muted-foreground">
      {status && !usable ? (
        <div className="rounded-lg border border-warn/30 bg-warn-soft/40 px-3.5 py-3">
          <div className="flex items-center gap-1.5 font-medium text-foreground"><CircleAlert className="size-4 text-warn" />{status.on ? status.detail : 'AI 助手关着'}</div>
          <p className="mt-1 text-[13px]">{status.on ? status.fix : '到“设置 → AI 助手”打开。'}</p>
          {status.on && <Button size="sm" variant="outline" className="mt-2" onClick={() => api.get('/assistant/status?refresh=1').then(() => recheck())}>重新检查</Button>}
        </div>
      ) : (
        <>
          <p>{codex ? '和在 Codex 里开一个对话一样：用你的插件、技能和规矩。我看得到你在看的这一页，选中页面上的字再问，我知道你指的是哪段。' : '想让我做什么，直接说。我看得到你在看的这一页。'}</p>
          <div className="flex flex-wrap gap-1.5">{SUGGEST.map((s) => <button key={s} type="button" disabled={!usable} onClick={() => sendRef.current?.(s)} className="rounded-full border px-2.5 py-1 text-xs hover:border-primary/40 hover:text-foreground disabled:opacity-50">{s}</button>)}</div>
        </>
      )}
    </div>
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DockHeader title={current?.title ?? '新对话'} sub={codex ? '你的 Codex · 和在 Codex 里对话一样' : '本机 Codex · 一问一答'}
        left={<Tip label="历史对话"><Button variant="ghost" size="icon-sm" onClick={() => setHistory(true)} aria-label="历史对话"><History /></Button></Tip>}
        actions={<Tip label="新对话"><Button variant="ghost" size="icon-sm" onClick={() => setThread(null)} aria-label="新对话" disabled={!thread}><SquarePen /></Button></Tip>} />
      <MessageList msgs={msgs ?? []} empty={empty} onApprove={(k, c) => void onApprove(k, c)} />
      {error && <p className="mx-3 mb-1 text-[13px] text-danger" role="alert">没发出去：{error}</p>}
      <Composer running={running} usable={usable} sendRef={sendRef} onSend={send}
        picker={<PersonaPicker list={who.list} persona={who.persona} onPick={who.set} disabled={!usable} />} onStop={() => void stop()}
        statusText={!status ? '检查中' : !usable ? '用不了' : codex ? `你的 Codex${status.version ? ` · ${status.version.replace(/^codex-cli\s*/, '')}` : ''}` : '一问一答'}
        statusTone={!status || usable ? 'ok' : 'warn'} />
    </div>
  )
}
