// AI 对话栏的几个小钩子：屏幕宽度、本机记着的宽度 / 钉不钉 / 开没开、钉住时在 <html> 上写侧栏宽度（dock.css 按它把页面往左挤）
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { DOCK_OPEN_KEY, DOCK_PINNED_ATTR, DOCK_PINNED_KEY, DOCK_WIDTH_KEY, readDockPrefs, saveDockPref, type DockLayout, type DockPrefs } from './dock-layout'

const store = () => { try { return window.localStorage } catch { return null } }

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => { const on = () => setWidth(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])
  return width
}

export function useDockPrefs(): [DockPrefs, { setWidth: (w: number, save?: boolean) => void; setPinned: (p: boolean) => void; setOpen: (o: boolean) => void }] {
  const [prefs, setPrefs] = useState<DockPrefs>(() => readDockPrefs(store()))
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === DOCK_WIDTH_KEY || e.key === DOCK_PINNED_KEY || e.key === DOCK_OPEN_KEY) setPrefs(readDockPrefs(store())) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])
  const setWidth = useCallback((width: number, save = true) => { setPrefs((p) => ({ ...p, width })); if (save) saveDockPref(store(), DOCK_WIDTH_KEY, width) }, [])
  const setPinned = useCallback((pinned: boolean) => { setPrefs((p) => ({ ...p, pinned })); saveDockPref(store(), DOCK_PINNED_KEY, pinned) }, [])
  const setOpen = useCallback((open: boolean) => { setPrefs((p) => ({ ...p, open })); saveDockPref(store(), DOCK_OPEN_KEY, open) }, [])
  return [prefs, { setWidth, setPinned, setOpen }]
}

/** 打开时在 <html> 上写 data-assistant-dock="pinned|float|full"（钉住时再写 --assistant-dock-w，dock.css 只在 pinned 时挤页面）；收起时去掉 */
export function useDockMark(open: boolean, layout: DockLayout, width: number) {
  useLayoutEffect(() => {
    const root = document.documentElement
    if (!open) return
    root.setAttribute(DOCK_PINNED_ATTR, layout)
    if (layout === 'pinned') root.style.setProperty('--assistant-dock-w', `${width}px`)
    return () => { root.removeAttribute(DOCK_PINNED_ATTR); root.style.removeProperty('--assistant-dock-w') }
  }, [open, layout, width])
}

/** 对话栏开着没有（钉着、浮着、全屏都算；详情抽屉开着对话栏时不是模态，两边都能点）：<html> 上的标记一变就跟着变 */
export function useDockPinned(): boolean {
  const read = () => typeof document !== 'undefined' && document.documentElement.hasAttribute(DOCK_PINNED_ATTR)
  const [pinned, setPinned] = useState(read)
  useEffect(() => {
    const ob = new MutationObserver(() => setPinned(read()))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: [DOCK_PINNED_ATTR] })
    return () => ob.disconnect()
  }, [])
  return pinned
}
