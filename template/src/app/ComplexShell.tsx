// 复杂导航（2026-10-17 改成侧栏三级，参照 A梦 自己的工作台）：侧栏列出全部分区（小标题）→ 二级分组（可收起）→ 页面。
// 二级分组就是有子页面的模块（客户与跟进、小红书）或写了 sub 的一组（经营里的“渠道”）；当前页所在的组锁定展开，其余的收起状态存本机。
// 侧栏可收起成图标栏：每个页面一个图标（分区之间一条细线），悬停或聚焦出“分区 › 页面”；触屏点一下直接进那一页，不靠悬停弹子菜单。
// 顶上一条窄顶栏（和 A梦 的工作台一样）：左边是位置（分区 › 分组 › 页面），右上角是工具（搜索、同步、今天要做、新建、设置、头像）；
// 侧栏只放品牌和菜单；收起 / 展开的按钮在侧栏左下角（和 A梦 的工作台一样），收起后居中。
// 顶栏写了位置，页头上方的分区名在电脑上就不再重复（components/page.tsx）。
// 原来“顶栏分区页签 + 左栏当前分区”的那种改叫“双层”（DualShell.tsx）。菜单都来自 nav.ts（经 useNav：关掉的模块不出现）。
import { Fragment, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { Bell, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { groupModule, pageBadge, resolveNav, sectionCount, type NavGroup, type NavPage, type NavSection } from './nav'
import { useNav } from './nav-sections'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, SettingsButton, UserMenu, sideItemCls, useHotkeys, useShellData } from './shell-parts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import type { LiveState } from '@/lib/api'
import type { Overview } from '@/lib/types'
import { cn } from '@/lib/utils'

const KEY = 'wb.sidebar.collapsed'
const GROUPS_KEY = 'wb.nav.groups'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
/** 收起了哪些二级分组（存本机，坏数据当没有）；和双层导航共用一份 */
const readGroups = (): Record<string, boolean> => {
  try { const v: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, boolean> : {} } catch { return {} }
}

/** 一页：分组里的页面往里缩一格 */
function PageLink({ p, active, overview, nested }: { p: NavPage; active: boolean; overview?: Overview; nested?: boolean }) {
  return (
    <Link to={p.to} aria-current={active ? 'page' : undefined} className={sideItemCls(active, cn('py-1.5', nested && 'pl-8 text-[14px]'))}>
      {!nested && <p.icon className="size-[18px] shrink-0 opacity-85" />}<span className="truncate">{p.label}</span><Badge n={pageBadge(p, overview)} tone={p.item.tone} />
    </Link>
  )
}

/** 二级分组：一行（模块图标 + 组名 + 箭头），点开 / 收起；当前页在组里时锁定展开 */
function Group({ g, sectionKey, activeId, overview, shut, onToggle }: { g: NavGroup; sectionKey: string; activeId?: string; overview?: Overview; shut: Record<string, boolean>; onToggle: (id: string) => void }) {
  const id = `${sectionKey}/${g.label}`
  const inside = g.pages.some((p) => p.id === activeId)
  const open = inside || !shut[id]
  const module = groupModule(g)
  const Icon = module?.icon ?? g.items[0]?.icon
  const badge = module && overview ? module.badge?.(overview) : undefined
  const pending = overview ? sectionCount(g.items, overview) : 0
  return (
    <div>
      <button type="button" onClick={() => onToggle(id)} disabled={inside} aria-expanded={open} title={inside ? '当前页面在这一组' : undefined}
        className={sideItemCls(false, cn('py-1.5 disabled:cursor-default disabled:hover:bg-transparent', inside && 'font-semibold'))}>
        {Icon && <Icon className="size-[18px] shrink-0 opacity-85" />}<span className="truncate">{g.label}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {badge ? <Badge n={badge} tone={module?.tone} /> : !open && pending > 0 ? <span className="size-1.5 rounded-full bg-warn" aria-label={`${pending} 项要处理`} /> : null}
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90', inside ? 'opacity-25' : 'opacity-60')} />
        </span>
      </button>
      {open && <div className="mt-0.5 flex flex-col gap-0.5">{g.pages.map((p) => <PageLink key={p.id} p={p} active={p.id === activeId} overview={overview} nested />)}</div>}
    </div>
  )
}

/** 宽栏的一个分区：小标题（和第一页同名时不写，比如“今日”）+ 不分组的页面 + 可收起的分组 */
function SectionBlock({ s, activeId, overview, shut, onToggle }: { s: NavSection; activeId?: string; overview?: Overview; shut: Record<string, boolean>; onToggle: (id: string) => void }) {
  const showLabel = s.label !== s.pages[0]?.label // 分区名和第一页同名（今日）时不写小标题，和简单导航一样
  return (
    <div className="mt-4 first:mt-0">
      {showLabel && <div className="px-2.5 pb-1 text-[12px] tracking-wide text-muted-foreground">{s.label}</div>}
      <div className="flex flex-col gap-0.5">
        {s.groups.map((g, i) => g.label
          ? <Group key={g.label} g={g} sectionKey={s.key} activeId={activeId} overview={overview} shut={shut} onToggle={onToggle} />
          : g.pages.map((p) => <PageLink key={`${i}-${p.id}`} p={p} active={p.id === activeId} overview={overview} />))}
      </div>
    </div>
  )
}

/** 图标栏的一项：一个页面一个图标，悬停或聚焦出“分区 › 分组 › 页面”；触屏点一下直接进这一页 */
function IconPage({ p, trail, active, overview }: { p: NavPage; trail: string; active: boolean; overview?: Overview }) {
  const n = p.item
  const badge = overview && (n.children?.length ? (p.to === n.to ? n.badge?.(overview) : undefined) : pageBadge(p, overview))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={p.to} aria-label={trail} aria-current={active ? 'page' : undefined} className={sideItemCls(active, 'justify-center px-0 py-1.5')}>
          <p.icon className="size-[18px]" />{badge ? <span aria-hidden className={cn('absolute top-1 right-2 size-1.5 rounded-full', n.tone === 'warn' ? 'bg-warn' : 'bg-muted-foreground/50')} /> : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{trail}</TooltipContent>
    </Tooltip>
  )
}

/** 图标栏的一个分区：分区里每页一个图标 */
function SectionIcons({ s, activeId, overview }: { s: NavSection; activeId?: string; overview?: Overview }) {
  return (
    <>
      {s.groups.map((g) => g.pages.map((p) => {
        const trail = [s.label, g.label, p.label].filter((x, i, a) => x && a.indexOf(x) === i).join(' › ')
        return <IconPage key={p.id} p={p} trail={trail} active={p.id === activeId} overview={overview} />
      }))}
    </>
  )
}

/** 顶栏左边的位置：分区 › 分组 › 页面（重复的名字只写一次，比如“今日 › 今日”只写“今日”） */
function Crumbs({ section, page, groups }: { section?: NavSection; page?: NavPage; groups: NavGroup[] }) {
  if (!section || !page) return null
  const group = groups.find((g) => g.pages.some((p) => p.id === page.id))?.label
  const parts = [section.label, group, page.label].filter((x, i, a): x is string => !!x && a.indexOf(x) === i)
  return (
    <nav aria-label="位置" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      {parts.map((x, i) => (
        <span key={x} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-50" />}
          {i < parts.length - 1 ? (i === 0 ? <Link to={section.to} className="truncate hover:text-foreground">{x}</Link> : <span className="truncate">{x}</span>) : <span aria-current="page" className="truncate font-medium text-foreground">{x}</span>}
        </span>
      ))}
    </nav>
  )
}

export function ComplexShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(read)
  const [shut, setShut] = useState(readGroups)
  const [searchOpen, setSearchOpen] = useState(false)
  useHotkeys(() => setSearchOpen(true))
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* 隐私模式 */ } return !c })
  const toggleGroup = (id: string) => setShut((prev) => {
    const next = { ...prev, [id]: !prev[id] }
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)) } catch { /* 隐私模式 */ }
    return next
  })
  const { sections, top } = useNav()
  const { section, page } = resolveNav(pathname, sections)
  const business = settings?.business ?? '工作台'
  const todayCount = overview?.todos.today.length ?? 0
  // 宽栏：lg 以上且没收起；否则是图标栏（md 到 lg 之间一直是图标栏）
  const wide = collapsed ? 'hidden' : 'hidden lg:block'
  const icons = collapsed ? 'block' : 'lg:hidden'
  return (
    <div className={cn('grid h-dvh grid-cols-1 grid-rows-[48px_minmax(0,1fr)]', collapsed ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]')}>
      <aside className="row-span-2 hidden min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {/* 品牌这一行和顶栏一样高；logo 和下面菜单的图标左边对齐，图标栏时居中 */}
        <div className={cn('flex h-12 shrink-0 items-center border-b border-sidebar-border', collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:px-5')}>
          <Link to="/" aria-label="回到今日" className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <span className={icons}><Brand name={business} compact /></span><span className={wide}><Brand name={business} /></span>
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3" aria-label="主导航">
          <div className={wide}>
            {top.map((s) => <SectionBlock key={s.key} s={s} activeId={page?.id} overview={overview} shut={shut} onToggle={toggleGroup} />)}
          </div>
          <div className={cn('flex flex-col gap-0.5', icons)}>
            {top.map((s, i) => <Fragment key={s.key}>{i > 0 && <span className="mx-3 my-1.5 h-px bg-sidebar-border" aria-hidden />}<SectionIcons s={s} activeId={page?.id} overview={overview} /></Fragment>)}
          </div>
        </nav>
        {/* 左下角：收起 / 展开（md 到 lg 之间一直是图标栏，不显示这个按钮） */}
        <div className={cn('flex shrink-0 items-center border-t border-sidebar-border px-3 py-2.5', collapsed ? 'justify-center' : 'justify-center lg:justify-between lg:px-5')}>
          {!collapsed && <span className="hidden text-[12px] text-muted-foreground lg:inline">本机 · 127.0.0.1</span>}
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? '展开侧栏' : '收起侧栏'} title={collapsed ? '展开侧栏' : '收起侧栏'} className="hidden lg:inline-flex">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        </div>
      </aside>
      {/* 窄顶栏：左边位置，右上角工具 */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur-md md:px-5">
        <span className="flex min-w-0 items-center gap-1 md:hidden">{settings?.mobile_nav === 'drawer' && <MobileMenuButton overview={overview} business={business} />}<Brand name={business} compact /></span>
        <div className="hidden min-w-0 md:block"><Crumbs section={section} page={page} groups={section?.groups ?? []} /></div>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <span className="hidden xl:flex"><SearchButton wide onClick={() => setSearchOpen(true)} /></span>
          <span className="xl:hidden"><SearchButton onClick={() => setSearchOpen(true)} /></span>
          <LiveDot state={live} compact />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" asChild><Link to="/todos" aria-label="今天要做"><Bell />{todayCount > 0 && <span className="num absolute -mt-4 ml-4 rounded-full bg-warn px-1 text-[12px] leading-4 text-white">{todayCount}</span>}</Link></Button></TooltipTrigger><TooltipContent>今天要做 {todayCount} 件</TooltipContent></Tooltip>
          <span className="hidden sm:inline-flex"><QuickCreate /></span><span className="sm:hidden"><QuickCreate compact /></span>
          <span className="hidden md:inline-flex"><SettingsButton /></span>
          <span className="hidden md:inline-flex"><UserMenu settings={settings} compact /></span>
        </div>
      </header>
      <main className="min-h-0 min-w-0 overflow-y-auto"><Outlet /></main>
      {settings?.mobile_nav !== 'drawer' && <MobileTabs overview={overview} />}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
