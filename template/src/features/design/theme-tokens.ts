// 风格预览用的工具：5 套风格的说明、读 <html data-theme>、从样式表读出每套风格的令牌。
// 颜色直接从 src/index.css 读出来（不在组件里抄色值），改了令牌这里自动跟着变。
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Theme } from '@/lib/types'

export const THEMES: { id: Theme; name: string; note: string; fit: string }[] = [
  { id: 'jade', name: '松石', note: '默认。米白底、墨绿主色', fit: '大多数生意' },
  { id: 'wood', name: '原木', note: '暖底色、赭色主色', fit: '家居、餐饮、手作' },
  { id: 'navy', name: '墨蓝', note: '冷静理性，深色侧栏，标题黑体', fit: '咨询、贸易、制造' },
  { id: 'mono', name: '素白', note: '黑白灰，内容优先，标题黑体', fit: '设计、内容创作' },
  { id: 'night', name: '夜墨', note: '深色，晚上看不刺眼；图表换深色版配色', fit: '晚上用' },
]

export const htmlTheme = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? 'jade'

export function setHtmlTheme(t: Theme) {
  const el = document.documentElement
  if (t === 'jade') delete el.dataset.theme
  else el.dataset.theme = t
  el.classList.toggle('dark', t === 'night')
}

/** 当前 <html> 上的风格；别处（设置页、服务推送）改了也能跟上 */
export function useHtmlTheme() {
  const [theme, setTheme] = useState<Theme>(htmlTheme)
  useEffect(() => {
    const ob = new MutationObserver(() => setTheme(htmlTheme()))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => ob.disconnect()
  }, [])
  return theme
}

export type Preview = { active: Theme; saved: Theme; preview: (t: Theme) => void; reset: () => void }
export const ThemePreviewContext = createContext<Preview | null>(null)

export function useThemePreview() {
  const v = useContext(ThemePreviewContext)
  if (!v) throw new Error('useThemePreview 要放在 ThemePreviewProvider 里面')
  return v
}

type TokenMap = Record<string, string>

function collect(rules: CSSRuleList, root: TokenMap, themes: Record<string, TokenMap>) {
  for (const r of Array.from(rules)) {
    if (r instanceof CSSStyleRule) {
      const sel = r.selectorText.trim()
      const m = sel.match(/^:root\[data-theme=["']?([\w-]+)["']?\]$/)
      const target = sel === ':root' ? root : m ? (themes[m[1]] ??= {}) : null
      if (!target) continue
      for (const prop of Array.from(r.style)) if (prop.startsWith('--')) target[prop] = r.style.getPropertyValue(prop).trim()
    } else if ('cssRules' in r) {
      collect((r as CSSGroupingRule).cssRules, root, themes)
    }
  }
}

/** 从样式表里读出 5 种风格各自的令牌；读不到（比如样式表跨域）就返回 null */
export function readThemeTokens(): Record<Theme, TokenMap> | null {
  const root: TokenMap = {}
  const themes: Record<string, TokenMap> = {}
  for (const sheet of Array.from(document.styleSheets)) {
    try { collect(sheet.cssRules, root, themes) } catch { /* 跨域样式表读不了，跳过 */ }
  }
  if (!root['--primary']) return null
  return Object.fromEntries(THEMES.map((t) => [t.id, t.id === 'jade' ? root : { ...root, ...(themes[t.id] ?? {}) }])) as Record<Theme, TokenMap>
}

/** 把某个风格的令牌变成内联 CSS 变量：包在外面，里面的 bg-primary、text-foreground 就按那个风格显示 */
export const scopeStyle = (tokens: TokenMap): CSSProperties => ({ ...tokens, background: 'var(--background)', color: 'var(--foreground)' }) as CSSProperties

/** 读一个令牌在当前风格下的实际值（显示在色块旁边） */
export function useTokenValue(name: string) {
  const theme = useHtmlTheme()
  // theme 变了要重新读：它不出现在函数体里，但决定了读出来的值
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), [name, theme])
}
