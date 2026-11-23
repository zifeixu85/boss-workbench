// 外壳用的菜单（2026-10-13）：nav.ts 的 NAV 按模块开关（shared/modules.ts）过滤，关掉的模块不出现，空了的分区跟着不显示。
// 三种外壳、全局搜索、手机底栏和“更多”、汉堡菜单、用户菜单都从这里取，不直接用 NAV / SECTIONS。
// 设置还没读到时按全部打开算（和 useModules 一样）。
import { useMemo } from 'react'
import { navWithModules, sectionsOf, withBadges, withDynamicNav, type NavItem, type NavSection } from './nav'
import { navIcon } from './nav-icons'
import { useApi } from '@/lib/api'
import type { Overview } from '@/lib/types'
import { useModules } from '@/lib/modules'
import { useIdentity } from '@/lib/identity'

export type NavState = { nav: NavItem[]; sections: NavSection[]; top: NavSection[] }

export function useNav(): NavState {
  const { list } = useModules()
  const kb = useIdentity().kb
  // 模块运行时给的菜单项和角标（2026-11-24）：跟着 /api/overview 来，和外壳算角标用的是同一份缓存
  const { data: o } = useApi<Overview>('/overview')
  const extra = o?.nav_extra
  const badges = o?.nav_badges
  return useMemo(() => {
    // “知识库”这一页的名字跟设置走（settings-set --kb-name 资料）
    const base = navWithModules((id) => list.includes(id)).map((n) => (n.key === 'kb' ? { ...n, label: kb } : n))
    const nav = withBadges(withDynamicNav(base, (extra ?? []).filter((d) => list.includes(d.module)), navIcon), badges)
    const sections = sectionsOf(nav)
    return { nav, sections, top: sections.filter((s) => !s.hidden) }
  }, [list, kb, extra, badges])
}
