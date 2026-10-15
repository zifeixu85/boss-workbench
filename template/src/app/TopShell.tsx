// 顶部导航：分区放在页面上方，点开下拉选页面（下拉里按二级分组排，组名是小标题）；内容区居中。适合模块不多、喜欢宽屏看内容的老板
// 分区只有一页（资料）时直接是链接。位置只画一层：顶栏不画面包屑，页头上方的小字就是那一层。系统页从头像菜单进。
import { Fragment, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { groupModule, pageBadge, resolveNav, sectionCount } from './nav'
import { useNav } from './nav-sections'
import { Brand, Badge, LiveDot, MobileMenuButton, MobileTabs, QuickCreate, SearchButton, SearchDialog, SettingsButton, UserMenu, useHotkeys, useShellData } from './shell-parts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { LiveState } from '@/lib/api'
import { cn } from '@/lib/utils'

const itemCls = (active: boolean) => cn('relative inline-flex h-14 items-center gap-1.5 px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
  active ? 'font-semibold text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')

export function TopShell({ live }: { live: LiveState }) {
  const { settings, overview } = useShellData()
  const [searchOpen, setSearchOpen] = useState(false)
  const { pathname } = useLocation()
  const go = useNavigate()
  useHotkeys(() => setSearchOpen(true))
  // 菜单经 useNav 取：关掉的模块不出现，空了的分区不显示
  const { sections, top } = useNav()
  const { section: current, page } = resolveNav(pathname, sections)
  const business = settings?.business ?? '工作台'
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 md:px-6">
          {settings?.mobile_nav === 'drawer' && <MobileMenuButton overview={overview} business={business} />}
          <Link to="/" aria-label="回到今日" className="mr-4 shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"><span className="hidden lg:block"><Brand name={business} /></span><span className="lg:hidden"><Brand name={business} compact /></span></Link>
          <nav className="hidden min-w-0 items-center md:flex" aria-label="分区">
            {top.map((s) => {
              const on = current?.key === s.key
              if (s.pages.length === 1) return <Link key={s.key} to={s.to} aria-current={on ? 'true' : undefined} className={itemCls(on)}>{s.label}</Link>
              const count = sectionCount(s.items, overview)
              return (
                <DropdownMenu key={s.key}>
                  <DropdownMenuTrigger aria-current={on ? 'true' : undefined} className={itemCls(on)}>
                    {s.label}{count > 0 && <span className="num rounded-full bg-warn px-1.5 text-[12px] leading-4 text-white" aria-label={`${count} 项要处理`}>{count}</span>}<ChevronDown className="size-3.5 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-[70vh] w-56 overflow-y-auto">
                    {s.groups.map((g, i) => {
                      // 组就是一个有子页面的模块（客户与跟进、小红书）：模块的角标挂在组名上
                      const module = groupModule(g)
                      return (
                        <Fragment key={g.label ?? `_${i}`}>
                          {i > 0 && <DropdownMenuSeparator />}
                          {g.label && <DropdownMenuLabel className="flex items-center gap-2 text-[12px] font-normal">{g.label}<Badge n={module && overview ? module.badge?.(overview) : undefined} tone={module?.tone} /></DropdownMenuLabel>}
                          {g.pages.map((p) => {
                            const active = p.id === page?.id
                            return (
                              <DropdownMenuItem key={p.id} onSelect={() => go(p.to)} aria-current={active ? 'page' : undefined} className={cn(active && 'font-semibold text-primary')}>
                                <p.icon />{p.label}<Badge n={pageBadge(p, overview)} tone={p.item.tone} />
                              </DropdownMenuItem>
                            )
                          })}
                        </Fragment>
                      )
                    })}
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
            <span className="hidden md:inline-flex"><SettingsButton /></span>
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
