// 对话栏分隔条：拖动、键盘、双击与本机记忆。
import { useEffect, useState, type CSSProperties, type RefObject } from 'react'
import { CHAT_KEY, chatBounds, chatWidth } from './studio-utils'

export function useChatWidth(container: RefObject<HTMLDivElement | null>) {
  const [saved, setSaved] = useState<number | null>(() => {
    try { const v = localStorage.getItem(CHAT_KEY); return v !== null && Number.isFinite(Number(v)) ? Number(v) : null } catch { return null }
  })
  const [total, setTotal] = useState(1000)
  useEffect(() => {
    const el = container.current
    if (!el) return
    const observer = new ResizeObserver(() => setTotal(el.clientWidth))
    observer.observe(el)
    setTotal(el.clientWidth)
    return () => observer.disconnect()
  })
  const width = chatWidth(saved, total)
  const set = (value: number | null, persist = true) => {
    const next = value === null ? null : chatWidth(value, total)
    setSaved(next)
    if (persist) try { if (next === null) localStorage.removeItem(CHAT_KEY); else localStorage.setItem(CHAT_KEY, String(next)) } catch { /* 不能存时，这次仍能调 */ }
  }
  return { width, total, set, style: { '--chat-width': `${width}px` } as CSSProperties }
}
export function PaneResizer({ container, chat }: { container: RefObject<HTMLDivElement | null>; chat: ReturnType<typeof useChatWidth> }) {
  const { min, max } = chatBounds(chat.total)
  return <div role="separator" aria-label="调整对话栏宽度" aria-orientation="vertical" aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={chat.width}
    tabIndex={0} className="xhs-resizer" title="拖动调整宽度，双击恢复默认"
    onDoubleClick={() => chat.set(null)} onKeyDown={e => {
      if (e.key === 'ArrowLeft') chat.set(chat.width - 24)
      else if (e.key === 'ArrowRight') chat.set(chat.width + 24)
      else if (e.key === 'Home' || e.key === 'Enter') chat.set(null)
      else return
      e.preventDefault()
    }} onPointerDown={e => { if (e.button === 0) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId) } }}
    onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) chat.set(e.clientX - (container.current?.getBoundingClientRect().left ?? 0) - 12, false) }}
    onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { chat.set(chat.width); e.currentTarget.releasePointerCapture(e.pointerId) } }}
    onPointerCancel={() => chat.set(chat.width)}><span /></div>
}
