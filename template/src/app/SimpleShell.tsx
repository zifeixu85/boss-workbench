// 简单导航：一列平铺、不分组；宽屏图标+文字，中屏只剩图标，手机底栏
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { NAV, isActivePath } from './nav'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, UserMenu, useHotkeys, useShellData } from './shell-parts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LiveState } from '@/lib/api'
import { cn } from '@/lib/utils'

export function SimpleShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const [searchOpen, setSearchOpen] = useState(false)
  const { pathname } = useLocation()
  useHotkeys(() => setSearchOpen(true))
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-3.5 pt-5 pb-4 text-sidebar-foreground md:flex">
        <div className="mb-5 px-1 lg:px-1.5"><span className="lg:hidden"><Brand name={settings?.business ?? '工作台'} compact /></span><span className="hidden lg:block"><Brand name={settings?.business ?? '工作台'} /></span></div>
        <div className="mb-4 flex gap-2 lg:px-0.5">
          <span className="hidden flex-1 lg:block"><QuickCreate /></span><span className="lg:hidden"><QuickCreate compact /></span>
          <span className="hidden lg:block"><SearchButton onClick={() => setSearchOpen(true)} /></span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="主导航">
          {NAV.map((n) => (
            <Tooltip key={n.key}>
              <TooltipTrigger asChild>
                <NavLink to={n.to} end={n.to === '/'}
                  className={cn('relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[14.5px] transition-colors md:justify-center lg:justify-start',
                    isActivePath(pathname, n.to) ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-paper before:absolute before:top-2 before:bottom-2 before:-left-3.5 before:w-1 before:rounded-r before:bg-primary' : 'hover:bg-sidebar-accent/60')}>
                  <n.icon className="size-[18px] shrink-0 opacity-85" />
                  <span className="hidden truncate lg:inline">{n.label}</span>
                  <span className="hidden lg:contents"><Badge n={overview && n.badge?.(overview)} tone={n.tone} /></span>
                  {overview && n.badge?.(overview) ? <span className={cn('absolute top-1.5 right-2 size-1.5 rounded-full lg:hidden', n.tone === 'warn' ? 'bg-warn' : 'bg-muted-foreground/50')} /> : null}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="lg:hidden">{n.label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-1 pt-4 lg:px-1.5">
          <LiveDot state={live} compact={false} />
          <div className="hidden lg:block"><UserMenu settings={settings} /></div>
          <div className="lg:hidden"><UserMenu settings={settings} compact /></div>
        </div>
      </aside>
      <main className="min-w-0">
        <div className="flex items-center justify-between border-b bg-card/80 px-4 py-2.5 backdrop-blur md:hidden">
          <div className="flex items-center gap-1">{settings?.mobile_nav === 'drawer' && <MobileMenuButton overview={overview} business={settings.business} />}<Brand name={settings?.business ?? '工作台'} compact /></div>
          <div className="flex items-center gap-1"><LiveDot state={live} compact /><SearchButton onClick={() => setSearchOpen(true)} /><QuickCreate compact /></div>
        </div>
        <Outlet />
      </main>
      {settings?.mobile_nav !== 'drawer' && <MobileTabs overview={overview} />}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
