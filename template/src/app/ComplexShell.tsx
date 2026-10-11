// 复杂导航：侧栏分组 + 二级菜单（手风琴），可收起成图标栏（悬停弹出子菜单）；顶栏有面包屑、搜索、新建
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Bell } from 'lucide-react'
import { NAV, GROUP_LABEL, navFor, isActivePath, type NavGroup, type NavItem } from './nav'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, UserMenu, useHotkeys, useShellData } from './shell-parts'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import type { LiveState } from '@/lib/api'
import type { Overview } from '@/lib/types'
import { cn } from '@/lib/utils'

const KEY = 'wb.sidebar.collapsed'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

function itemCls(active: boolean, strong = false) {
  return cn('relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
    active ? 'border border-sidebar-border bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-paper before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[3px] before:rounded-r before:bg-primary'
      : strong ? 'font-semibold hover:bg-sidebar-accent/60' : 'hover:bg-sidebar-accent/60')
}

function Item({ n, collapsed, overview }: { n: NavItem; collapsed: boolean; overview?: Overview }) {
  const loc = useLocation()
  const inside = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)
  const [open, setOpen] = useState(inside)
  useEffect(() => { if (inside) setOpen(true) }, [inside])
  const badge = overview && n.badge?.(overview)
  if (collapsed) {
    const link = (
      <NavLink to={n.to} end={n.to === '/'} className={cn(itemCls(inside), 'justify-center px-0')} aria-label={n.label}>
        <n.icon className="size-[18px]" />{badge ? <span className={cn('absolute top-1 right-1.5 size-1.5 rounded-full', n.tone === 'warn' ? 'bg-warn' : 'bg-muted-foreground/50')} /> : null}
      </NavLink>
    )
    if (!n.children) return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{n.label}</TooltipContent></Tooltip>
    return (
      <HoverCard openDelay={60} closeDelay={160}>
        <HoverCardTrigger asChild>{link}</HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-44 p-1.5">
          <div className="px-2 py-1 text-xs text-muted-foreground">{n.label}</div>
          {n.children.map((c) => <NavLink key={c.to} to={c.to} end={c.end} className={cn('block rounded-md px-2 py-1.5 text-sm', isActivePath(loc.pathname, c.to, c.end) ? 'bg-accent font-medium' : 'hover:bg-muted')}>{c.label}</NavLink>)}
        </HoverCardContent>
      </HoverCard>
    )
  }
  if (!n.children) {
    return <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => itemCls(isActive)}><n.icon className="size-[18px] shrink-0" /><span className="truncate">{n.label}</span><Badge n={badge} tone={n.tone} /></NavLink>
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(itemCls(false, inside), 'w-full')}>
        <n.icon className={cn('size-[18px] shrink-0', inside && 'text-sidebar-primary')} /><span className="truncate">{n.label}</span>
        {badge ? <Badge n={badge} tone={n.tone} /> : <span className="ml-auto" />}
        <ChevronRight className={cn('size-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 flex flex-col gap-0.5">
        {n.children.map((c) => (
          <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => cn('flex h-[30px] items-center rounded-md pl-[38px] text-[13px]', isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-paper' : 'opacity-70 hover:bg-sidebar-accent/60 hover:opacity-100')}>{c.label}</NavLink>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function Crumbs() {
  const loc = useLocation()
  const n = navFor(loc.pathname)
  const child = n?.children?.slice().sort((a, b) => b.to.length - a.to.length).find((c) => loc.pathname.startsWith(c.to))
  const detail = /^\/clients\/(?!(pipeline|follow|key|receivables|care|extract)(\/|$))[^/]+/.test(loc.pathname)
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink asChild><NavLink to="/">工作台</NavLink></BreadcrumbLink></BreadcrumbItem>
        {n && n.to !== '/' && <><BreadcrumbSeparator /><BreadcrumbItem>{child || detail ? <BreadcrumbLink asChild><NavLink to={n.to}>{n.label}</NavLink></BreadcrumbLink> : <BreadcrumbPage>{n.label}</BreadcrumbPage>}</BreadcrumbItem></>}
        {child && !child.end && <><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{child.label}</BreadcrumbPage></BreadcrumbItem></>}
        {detail && <><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>客户详情</BreadcrumbPage></BreadcrumbItem></>}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function ComplexShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const [collapsed, setCollapsed] = useState(read)
  const [searchOpen, setSearchOpen] = useState(false)
  useHotkeys(() => setSearchOpen(true))
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* 隐私模式 */ } return !c })
  const groups = [...new Set(NAV.map((n) => n.group))] as NavGroup[]
  const todayCount = overview?.todos.today.length ?? 0
  return (
    <div className={cn('grid h-dvh grid-cols-1 grid-rows-[56px_minmax(0,1fr)]', collapsed ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[208px_minmax(0,1fr)]')}>
      <aside className="row-span-2 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className={cn('flex h-14 items-center border-b border-sidebar-border px-3', collapsed ? 'justify-center' : 'lg:px-4')}>
          <span className={cn(collapsed ? '' : 'lg:hidden')}><Brand name={settings?.business ?? '工作台'} compact /></span>
          {!collapsed && <span className="hidden lg:block"><Brand name={settings?.business ?? '工作台'} /></span>}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="主导航">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              {GROUP_LABEL[g] && <div className={cn('px-2.5 pb-1 text-[11px] tracking-wide opacity-55', collapsed ? 'hidden' : 'hidden lg:block')}>{GROUP_LABEL[g]}</div>}
              <div className="flex flex-col gap-0.5">
                {NAV.filter((n) => n.group === g).map((n) => (
                  <span key={n.key} className="contents">
                    <span className={cn(collapsed ? 'hidden' : 'hidden lg:contents')}><Item n={n} collapsed={false} overview={overview} /></span>
                    <span className={cn(collapsed ? 'contents' : 'contents lg:hidden')}><Item n={n} collapsed overview={overview} /></span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className={cn('flex items-center border-t border-sidebar-border px-3 py-2.5', collapsed ? 'justify-center' : 'justify-center lg:justify-between')}>
          {!collapsed && <span className="hidden text-[11px] opacity-60 lg:inline">v0.2 · 本机</span>}
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? '展开侧栏' : '收起侧栏'} className="hidden lg:inline-flex">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md md:px-6">
        <span className="flex items-center gap-1 md:hidden">{settings?.mobile_nav === 'drawer' && <MobileMenuButton overview={overview} business={settings.business} />}<Brand name={settings?.business ?? '工作台'} compact /></span>
        <div className="hidden min-w-0 md:block"><Crumbs /></div>
        <div className="ml-auto flex flex-1 items-center justify-end gap-2">
          <span className="hidden flex-1 justify-end lg:flex"><SearchButton wide onClick={() => setSearchOpen(true)} /></span>
          <span className="lg:hidden"><SearchButton onClick={() => setSearchOpen(true)} /></span>
          <span className="hidden sm:inline-flex"><LiveDot state={live} /></span>
          <span className="sm:hidden"><LiveDot state={live} compact /></span>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" asChild><NavLink to="/todos" aria-label="今天要做"><Bell />{todayCount > 0 && <span className="num absolute -mt-4 ml-4 rounded-full bg-warn px-1 text-[10px] leading-4 text-white">{todayCount}</span>}</NavLink></Button></TooltipTrigger><TooltipContent>今天要做 {todayCount} 件</TooltipContent></Tooltip>
          <span className="hidden sm:inline-flex"><QuickCreate /></span><span className="sm:hidden"><QuickCreate compact /></span>
          <span className="hidden md:inline-flex"><UserMenu settings={settings} /></span>
        </div>
      </header>
      <main className="min-h-0 min-w-0 overflow-y-auto"><Outlet /></main>
      {settings?.mobile_nav !== 'drawer' && <MobileTabs overview={overview} />}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
