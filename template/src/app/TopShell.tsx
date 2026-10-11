// 顶部导航：菜单放在页面上方，按分组做下拉；内容区居中。适合模块不多、喜欢宽屏看内容的老板
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { NAV, GROUP_LABEL, isActivePath, type NavGroup } from './nav'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, UserMenu, useHotkeys, useShellData } from './shell-parts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { LiveState } from '@/lib/api'
import { cn } from '@/lib/utils'

const itemCls = (active: boolean) => cn('relative inline-flex h-14 items-center gap-1.5 px-3 text-sm transition-colors',
  active ? 'font-semibold text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')

export function TopShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const [searchOpen, setSearchOpen] = useState(false)
  const { pathname } = useLocation()
  const go = useNavigate()
  useHotkeys(() => setSearchOpen(true))
  const groups = [...new Set(NAV.map((n) => n.group))] as NavGroup[]
  const business = settings?.business ?? '工作台'
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 md:px-6">
          {settings?.mobile_nav === 'drawer' && <MobileMenuButton overview={overview} business={business} />}
          <span className="mr-4 shrink-0"><span className="hidden lg:block"><Brand name={business} /></span><span className="lg:hidden"><Brand name={business} compact /></span></span>
          <nav className="hidden min-w-0 items-center md:flex" aria-label="主导航">
            {groups.map((g) => {
              const items = NAV.filter((n) => n.group === g)
              if (items.length === 1 && !items[0].children) {
                const n = items[0]
                return <NavLink key={g} to={n.to} end={n.to === '/'} className={itemCls(isActivePath(pathname, n.to))}>{n.label}</NavLink>
              }
              const active = items.some((n) => isActivePath(pathname, n.to))
              const count = overview ? items.reduce((a, n) => a + (n.tone === 'warn' ? n.badge?.(overview) ?? 0 : 0), 0) : 0
              return (
                <DropdownMenu key={g}>
                  <DropdownMenuTrigger className={itemCls(active)}>
                    {GROUP_LABEL[g] ?? items[0].label}{count > 0 && <span className="num rounded-full bg-warn px-1.5 text-[10px] leading-4 text-white">{count}</span>}<ChevronDown className="size-3.5 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {items.map((n, i) => (
                      <div key={n.key}>
                        {i > 0 && n.children && <DropdownMenuSeparator />}
                        <DropdownMenuItem onSelect={() => go(n.to)} className={cn(isActivePath(pathname, n.to) && 'font-semibold text-primary')}>
                          <n.icon />{n.label}<Badge n={overview && n.badge?.(overview)} tone={n.tone} />
                        </DropdownMenuItem>
                        {n.children?.map((c) => (
                          <DropdownMenuItem key={c.to} onSelect={() => go(c.to)} className={cn('pl-9 text-[13px]', isActivePath(pathname, c.to, c.end) ? 'font-semibold text-primary' : 'text-muted-foreground')}>{c.label}</DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden xl:flex"><SearchButton wide onClick={() => setSearchOpen(true)} /></span>
            <span className="xl:hidden"><SearchButton onClick={() => setSearchOpen(true)} /></span>
            <LiveDot state={live} compact />
            <span className="hidden sm:inline-flex"><QuickCreate /></span><span className="sm:hidden"><QuickCreate compact /></span>
            <span className="hidden md:inline-flex"><UserMenu settings={settings} compact /></span>
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1400px] [--sticky-top:56px]"><Outlet /></main>
      {settings?.mobile_nav !== 'drawer' && <MobileTabs overview={overview} />}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
