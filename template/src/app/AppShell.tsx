// 按设置选择导航样式和风格；详情抽屉、新建弹窗挂在最外层
import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router'
import { AssistantDock } from '@/features/assistant/AssistantDock'
import { useApi, useLiveRefresh } from '@/lib/api'
import type { Settings, Theme } from '@/lib/types'
import { NavModeContext } from './nav-mode'
import { SimpleShell } from './SimpleShell'
import { ComplexShell } from './ComplexShell'
import { DualShell } from './DualShell'
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

const EMBED_KEY = 'wb.embed'
/** 地址带 ?embed=1：不显示导航，只显示内容（Codex 右边的浏览器里打开工作台用）。这个标签页里之后换页也保持 */
function useEmbed() {
  const [sp] = useSearchParams()
  const flag = sp.get('embed')
  try {
    if (flag === '1') sessionStorage.setItem(EMBED_KEY, '1')
    if (flag === '0') sessionStorage.removeItem(EMBED_KEY)
    return sessionStorage.getItem(EMBED_KEY) === '1'
  } catch { return flag === '1' }
}

export function AppShell() {
  const live = useLiveRefresh()
  const data = useSettingsEffects()
  const embed = useEmbed()
  const mode = data?.nav_mode ?? 'complex'
  if (embed) return <NavModeContext.Provider value={mode}><main className="min-h-dvh min-w-0 bg-background"><Outlet /></main><Overlays /></NavModeContext.Provider>
  return (
    <NavModeContext.Provider value={mode}>
      {mode === 'simple' ? <SimpleShell live={live} /> : mode === 'top' ? <TopShell live={live} /> : mode === 'dual' ? <DualShell live={live} /> : <ComplexShell live={live} />}
      <Overlays />
      <AssistantDock />
    </NavModeContext.Provider>
  )
}

/** 嵌入模式：没有导航，只显示内容（给 Codex 插件侧栏、浏览器小窗用） */
export function EmbedShell({ children }: { children: React.ReactNode }) {
  useLiveRefresh()
  useSettingsEffects()
  return <NavModeContext.Provider value="complex"><div className="min-h-dvh bg-card">{children}</div><Overlays /></NavModeContext.Provider>
}
