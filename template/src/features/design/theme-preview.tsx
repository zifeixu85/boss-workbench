// 风格预览：只在组件规范页里临时换 <html data-theme>，离开页面自动换回；长期更换在“设置”里
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Theme } from '@/lib/types'
import { ThemePreviewContext, htmlTheme, setHtmlTheme, useHtmlTheme, type Preview } from './theme-tokens'

export function ThemePreviewProvider({ children }: { children: ReactNode }) {
  const active = useHtmlTheme()
  const [saved] = useState<Theme>(htmlTheme) // 进页面时用的风格，离开时换回它
  useEffect(() => () => setHtmlTheme(saved), [saved])
  const value = useMemo<Preview>(() => ({ active, saved, preview: setHtmlTheme, reset: () => setHtmlTheme(saved) }), [active, saved])
  return <ThemePreviewContext.Provider value={value}>{children}</ThemePreviewContext.Provider>
}
