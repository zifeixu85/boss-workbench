// 简单导航：一列菜单，按分区（今日 / 客户 / 经营 / 内容 / 数据 / 资料）分段，只列模块不列子页面（子页面用页内的 SubTabs）；
// 宽屏图标+文字、分段有小标题，中屏只剩图标、分段之间一条细线；手机底栏。
// 2026-10-17：新建、头像整行宽；底下的“设置”和菜单项同一种样式（shell-parts 的 sideItemCls）
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { resolveNav } from './nav'
import { useNav } from './nav-sections'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, SideSettingsLink, UserMenu, sideItemCls, useHotkeys, useShellData } from './shell-parts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LiveState } from '@/lib/api'
import { cn } from '@/lib/utils'

export function SimpleShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const [searchOpen, setSearchOpen] = useState(false)
  const { pathname } = useLocation()
  useHotkeys(() => setSearchOpen(true))
  // 菜单经 useNav 取：关掉的模块不出现，空了的分区不显示
  const { sections, top } = useNav()
  const activeItem = resolveNav(pathname, sections).page?.item
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-3.5 pt-5 pb-4 text-sidebar-foreground md:flex">
        <div className="mb-5 px-1 lg:px-1.5"><span className="lg:hidden"><Brand name={settings?.business ?? '工作台'} compact /></span><span className="hidden lg:block"><Brand name={settings?.business ?? '工作台'} /></span></div>
        <div className="mb-4 flex items-center gap-2">
          <div className="hidden min-w-0 flex-1 lg:block"><QuickCreate wide /></div><span className="mx-auto lg:hidden"><QuickCreate compact /></span>
          <span className="hidden lg:block"><SearchButton onClick={() => setSearchOpen(true)} /></span>
        </div>
        <nav className="-mx-3.5 min-h-0 flex-1 overflow-y-auto px-3.5" aria-label="主导航">
          {top.map((s, i) => (
            <div key={s.key} className={cn(i > 0 && 'mt-3')}>
              {i > 0 && <span className="mx-2 mb-3 block h-px bg-sidebar-border lg:hidden" aria-hidden />}
              {/* 分区名和第一项同名（今日）时不写小标题 */}
              {s.label !== s.items[0].label && <div className="hidden px-2.5 pb-1 text-[12px] tracking-wide text-muted-foreground lg:block">{s.label}</div>}
              <div className="flex flex-col gap-0.5">
                {s.items.map((n) => {
                  const active = n === activeItem
                  const badge = overview && n.badge?.(overview)
                  return (
                    <Tooltip key={n.key}>
                      <TooltipTrigger asChild>
                        <Link to={n.to} aria-current={active ? 'page' : undefined}
                          className={sideItemCls(active, 'md:justify-center lg:justify-start')}>
                          <n.icon className="size-[18px] shrink-0 opacity-85" />
                          <span className="hidden truncate lg:inline">{n.label}</span>
                          <span className="hidden lg:contents"><Badge n={badge || undefined} tone={n.tone} /></span>
                          {badge ? <span className={cn('absolute top-1.5 right-2 size-1.5 rounded-full lg:hidden', n.tone === 'warn' ? 'bg-warn' : 'bg-muted-foreground/50')} /> : null}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="lg:hidden">{s.label} › {n.label}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 pt-4">
          <div className="px-1 pb-1"><LiveDot state={live} compact={false} /></div>
          <div className="hidden lg:block"><SideSettingsLink /></div>
          <div className="lg:hidden"><SideSettingsLink compact /></div>
          <div className="hidden lg:block"><UserMenu settings={settings} wide /></div>
          <div className="flex justify-center lg:hidden"><UserMenu settings={settings} compact /></div>
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
