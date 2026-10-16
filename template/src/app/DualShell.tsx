// 双层导航（2026-10-17 起叫“双层”；原来叫“复杂”，复杂改成侧栏三级，见 ComplexShell.tsx）：
// 顶栏放分区页签（今日 / 客户 / 经营 / 内容 / 数据 / 资料，带这个分区要处理的数），左栏只列当前分区的分组和页面；
// 左栏可收起成图标栏：每个页面一个图标（分组之间一条细线），悬停或聚焦出名字，触屏点一下直接进那一页，不靠悬停弹子菜单。分区只有一页（资料）时不显示左栏。
// 位置只画一层：顶栏不画面包屑（页签和左栏的高亮已经说明在哪），页头上方的小字就是那一层。
// 手机上页签和左栏都收起来，用底栏和“更多”（或汉堡菜单）。分区、分组、高亮都来自 nav.ts（经 useNav：关掉的模块不出现）。
// 顶栏的铃铛是普通链接，不算“当前页”（全站只亮一项，由 resolveNav 算）。
import { Fragment, useId, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { Bell, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { groupModule, pageBadge, resolveNav, sectionCount, type NavGroup, type NavPage, type NavSection } from './nav'
import { useNav } from './nav-sections'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, SettingsButton, UserMenu, useHotkeys, useShellData } from './shell-parts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import type { LiveState } from '@/lib/api'
import type { Overview } from '@/lib/types'
import { cn } from '@/lib/utils'
import { PageCenterContext } from '@/components/page'

const KEY = 'wb.sidebar.collapsed'
const GROUPS_KEY = 'wb.nav.groups'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
/** 收起了哪些二级分组（存本机，坏数据当没有） */
const readGroups = (): Record<string, boolean> => {
  try { const v: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, boolean> : {} } catch { return {} }
}

function itemCls(active: boolean) {
  return cn('relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
    active ? 'border border-sidebar-border bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-paper before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[3px] before:rounded-r before:bg-primary'
      : 'hover:bg-sidebar-accent/60')
}

/** 顶栏的分区页签：点进去落在分区的第一页；角标是分区里要你处理的数 */
function SectionTabs({ sections, current, overview }: { sections: NavSection[]; current?: NavSection; overview?: Overview }) {
  return (
    <nav className="hidden h-full min-w-0 items-stretch md:flex" aria-label="分区">
      {sections.map((s) => {
        const on = current?.key === s.key
        const count = sectionCount(s.items, overview)
        return (
          <Link key={s.key} to={s.to} aria-current={on ? 'true' : undefined}
            className={cn('relative inline-flex items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset lg:px-3.5',
              on ? 'font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')}>
            <s.icon className={cn('hidden size-4 xl:block', on ? 'text-primary' : 'opacity-70')} />{s.label}
            {count > 0 && <span className="num rounded-full bg-warn px-1.5 text-[12px] leading-4 font-medium text-white" aria-label={`${count} 项要处理`}>{count}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

/** 宽栏的一行：一个页面 */
function SideLink({ p, active, overview }: { p: NavPage; active: boolean; overview?: Overview }) {
  return (
    <Link to={p.to} aria-current={active ? 'page' : undefined} className={itemCls(active)}>
      <p.icon className="size-[18px] shrink-0" /><span className="truncate">{p.label}</span><Badge n={pageBadge(p, overview)} tone={p.item.tone} />
    </Link>
  )
}

/** 一个二级分组：小标题不可点，只管展开 / 收起；当前页在组里时锁定展开 */
function SideGroup({ g, activeId, open, onToggle, overview }: { g: NavGroup; activeId?: string; open: boolean; onToggle: () => void; overview?: Overview }) {
  const id = useId()
  const locked = g.pages.some((p) => p.id === activeId)
  const list = (
    <div id={id} hidden={!open} className="flex flex-col gap-0.5">
      {g.pages.map((p) => <SideLink key={p.id} p={p} active={p.id === activeId} overview={overview} />)}
    </div>
  )
  if (!g.label) return <div className="mb-2 last:mb-0">{list}</div>
  // 组就是一个有子页面的模块（客户与跟进、小红书）：模块的角标显示在组名旁边
  const module = groupModule(g)
  const badge = module && overview ? module.badge?.(overview) : undefined
  const pending = overview ? sectionCount(g.items, overview) : 0
  return (
    <div className="mt-3 first:mt-0">
      <button type="button" onClick={onToggle} disabled={locked} aria-expanded={open} aria-controls={id} title={locked ? '当前页面在这一组' : undefined}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2.5 text-[12px] tracking-wide text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:cursor-default disabled:hover:text-muted-foreground">
        <span className="truncate">{g.label}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {badge ? <Badge n={badge} tone={module?.tone} /> : !open && pending > 0 ? <span className="size-1.5 rounded-full bg-warn" aria-label={`${pending} 项要处理`} /> : null}
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90', locked ? 'opacity-25' : 'opacity-60')} />
        </span>
      </button>
      {list}
    </div>
  )
}

/** 图标栏的一项：一个页面一个图标（子页面各有图标），悬停或聚焦出“组名 › 页面名”；触屏点一下直接进这一页（不靠悬停弹子菜单，iOS Safari 点链接不给焦点） */
function IconPage({ p, group, activeId, overview }: { p: NavPage; group: string | null; activeId?: string; overview?: Overview }) {
  const on = p.id === activeId
  // 有子页面的模块：它的角标挂在模块首页那个图标上；别的页面用自己的角标
  const n = p.item
  const badge = overview && (n.children?.length ? (p.to === n.to ? n.badge?.(overview) : undefined) : pageBadge(p, overview))
  const name = group && group !== p.label ? `${group} › ${p.label}` : p.label
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={p.to} aria-label={name} aria-current={on ? 'page' : undefined} className={cn(itemCls(on), 'justify-center px-0')}>
          <p.icon className="size-[18px]" />{badge ? <span className={cn('absolute top-1 right-1.5 size-1.5 rounded-full', n.tone === 'warn' ? 'bg-warn' : 'bg-muted-foreground/50')} /> : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  )
}

function SideBar({ section, activeId, overview, collapsed, onToggle }: { section: NavSection; activeId?: string; overview?: Overview; collapsed: boolean; onToggle: () => void }) {
  const [shut, setShut] = useState(readGroups)
  const toggleGroup = (label: string) => setShut((prev) => {
    const id = `${section.key}/${label}`
    const next = { ...prev, [id]: !prev[id] }
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)) } catch { /* 隐私模式 */ }
    return next
  })
  return (
    <aside className={cn('hidden min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex', collapsed ? 'w-16' : 'w-16 lg:w-[212px]')}>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label={`${section.label}的页面`}>
        {/* 宽栏：分组小标题 + 页面 */}
        <div className={collapsed ? 'hidden' : 'hidden lg:block'}>
          {section.groups.map((g, i) => (
            <SideGroup key={g.label ?? `_${i}`} g={g} activeId={activeId} overview={overview} onToggle={() => g.label && toggleGroup(g.label)}
              open={!g.label || g.pages.some((p) => p.id === activeId) || !shut[`${section.key}/${g.label}`]} />
          ))}
        </div>
        {/* 图标栏：不显示小标题，每页一个图标，组之间一条细线 */}
        <div className={cn('flex flex-col gap-0.5', collapsed ? '' : 'lg:hidden')}>
          {section.groups.map((g, i) => (
            <Fragment key={g.label ?? `_${i}`}>
              {i > 0 && <span className="mx-3 my-1.5 h-px bg-sidebar-border" aria-hidden />}
              {g.pages.map((p) => <IconPage key={p.id} p={p} group={g.label} activeId={activeId} overview={overview} />)}
            </Fragment>
          ))}
        </div>
      </nav>
      <div className={cn('flex items-center border-t border-sidebar-border px-3 py-2.5', collapsed ? 'justify-center' : 'justify-center lg:justify-between')}>
        {!collapsed && <span className="hidden text-[12px] opacity-60 lg:inline">v0.2 · 本机</span>}
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={collapsed ? '展开左栏' : '收起左栏'} className="hidden lg:inline-flex">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
      </div>
    </aside>
  )
}

export function DualShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(read)
  const [searchOpen, setSearchOpen] = useState(false)
  useHotkeys(() => setSearchOpen(true))
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* 隐私模式 */ } return !c })
  const { sections, top } = useNav()
  const { section, page } = resolveNav(pathname, sections)
  const hasSide = !!section && section.pages.length > 1
  const business = settings?.business ?? '工作台'
  const todayCount = overview?.todos.today.length ?? 0
  return (
    <div className="flex h-dvh flex-col">
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur-md md:gap-3 md:px-5">
        {settings?.mobile_nav === 'drawer' && <MobileMenuButton overview={overview} business={business} />}
        <Link to="/" aria-label="回到今日" className="mr-1 shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:mr-2"><span className="hidden xl:block"><Brand name={business} /></span><span className="xl:hidden"><Brand name={business} compact /></span></Link>
        <SectionTabs sections={top} current={section} overview={overview} />
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <span className="hidden xl:flex"><SearchButton wide onClick={() => setSearchOpen(true)} /></span>
          <span className="xl:hidden"><SearchButton onClick={() => setSearchOpen(true)} /></span>
          <span className="hidden 2xl:inline-flex"><LiveDot state={live} /></span>
          <span className="2xl:hidden"><LiveDot state={live} compact /></span>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" asChild><Link to="/todos" aria-label="今天要做"><Bell />{todayCount > 0 && <span className="num absolute -mt-4 ml-4 rounded-full bg-warn px-1 text-[12px] leading-4 text-white">{todayCount}</span>}</Link></Button></TooltipTrigger><TooltipContent>今天要做 {todayCount} 件</TooltipContent></Tooltip>
          <span className="hidden sm:inline-flex"><QuickCreate /></span><span className="sm:hidden"><QuickCreate compact /></span>
          <span className="hidden md:inline-flex"><SettingsButton /></span>
          <span className="hidden md:inline-flex"><UserMenu settings={settings} compact /></span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {hasSide && <SideBar key={section.key} section={section} activeId={page?.id} overview={overview} collapsed={collapsed} onToggle={toggle} />}
        {/* 分区只有一页、没有左栏时正文居中（2026-10-17） */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto"><PageCenterContext.Provider value={!hasSide}><div className={cn(!hasSide && 'mx-auto max-w-[1400px]')}><Outlet /></div></PageCenterContext.Provider></main>
      </div>
      {settings?.mobile_nav !== 'drawer' && <MobileTabs overview={overview} />}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
