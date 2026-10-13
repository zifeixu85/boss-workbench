// 外壳用的菜单（2026-10-13）：nav.ts 的 NAV 按模块开关（shared/modules.ts）过滤，关掉的模块不出现，空了的分区跟着不显示。
// 三种外壳、全局搜索、手机底栏和“更多”、汉堡菜单、用户菜单都从这里取，不直接用 NAV / SECTIONS。
// 设置还没读到时按全部打开算（和 useModules 一样）。
import { useMemo } from 'react'
import { navWithModules, sectionsOf, type NavItem, type NavSection } from './nav'
import { useModules } from '@/lib/modules'

export type NavState = { nav: NavItem[]; sections: NavSection[]; top: NavSection[] }

export function useNav(): NavState {
  const { list } = useModules()
  return useMemo(() => {
    const nav = navWithModules((id) => list.includes(id))
    const sections = sectionsOf(nav)
    return { nav, sections, top: sections.filter((s) => !s.hidden) }
  }, [list])
}
