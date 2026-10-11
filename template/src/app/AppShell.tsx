// 按设置选择导航样式和风格；详情抽屉、新建弹窗挂在最外层
import { useEffect } from 'react'
import { useApi, useLiveRefresh } from '@/lib/api'
import type { Settings, Theme } from '@/lib/types'
import { NavModeContext } from './nav-mode'
import { SimpleShell } from './SimpleShell'
import { ComplexShell } from './ComplexShell'
import { TopShell } from './TopShell'
import { Overlays } from './Overlays'

const THEME_KEY = 'wb.theme'

/** 把风格写到 <html data-theme>；先用上次的缓存，避免刷新时闪一下 */
export function applyTheme(theme: Theme) {
  const el = document.documentElement
  if (theme === 'jade') delete el.dataset.theme
  else el.dataset.theme = theme
  el.classList.toggle('dark', theme === 'night')
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* 隐私模式 */ }
}
try { const t = localStorage.getItem(THEME_KEY) as Theme | null; if (t) applyTheme(t) } catch { /* 隐私模式 */ }

function useSettingsEffects() {
  const { data } = useApi<Settings>('/settings')
  useEffect(() => { if (data) applyTheme(data.theme) }, [data])
  return data
}

export function AppShell() {
  const live = useLiveRefresh()
  const data = useSettingsEffects()
  const mode = data?.nav_mode ?? 'complex'
  return (
    <NavModeContext.Provider value={mode}>
      {mode === 'simple' ? <SimpleShell live={live} /> : mode === 'top' ? <TopShell live={live} /> : <ComplexShell live={live} />}
      <Overlays />
    </NavModeContext.Provider>
  )
}

/** 嵌入模式：没有导航，只显示内容（给 Codex 插件侧栏、浏览器小窗用） */
export function EmbedShell({ children }: { children: React.ReactNode }) {
  useLiveRefresh()
  useSettingsEffects()
  return <NavModeContext.Provider value="complex"><div className="min-h-dvh bg-card">{children}</div><Overlays /></NavModeContext.Provider>
}
