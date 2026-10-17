// 四种导航外壳共用的零件：品牌、实时状态、新建菜单、全局搜索、手机底栏和“更多”、汉堡菜单、用户菜单
// 2026-10-17：侧栏里的新建、头像整行宽（wide），设置用和菜单项同一种样式（SideSettingsLink、sideItemCls）
// 2026-10-13 分区 + 二级分组：搜索里的页面写成“分区 › 页面”；“更多”和汉堡菜单按分区分段；设置、组件规范从用户菜单进。
// 菜单一律经 useNav（nav-sections.ts）取：模块开关关掉的模块不出现在搜索、底栏、“更多”、汉堡菜单里
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { CalendarPlus, ChevronDown, Inbox, ListPlus, Menu, MessageSquarePlus, Plus, Search, UserPlus, UserRound, Check, Settings as SettingsIcon } from 'lucide-react'
import { api, useApi, useWrite, type LiveState } from '@/lib/api'
import type { Overview, SearchHit, Settings } from '@/lib/types'
import { activeTab, groupModule, mobileTabs, pageBadge, pageTrail, resolveNav, type NavItem } from './nav'
import { useModules } from '@/lib/modules'
import { useNav } from './nav-sections'
import { NAV_MODES } from './nav-mode'
import { useOverlay } from './overlay'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

export function useShellData() {
  const settings = useApi<Settings>('/settings')
  const overview = useApi<Overview>('/overview')
  return { settings: settings.data, overview: overview.data }
}

export function Brand({ name, compact }: { name: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-heading text-[15px] font-bold text-primary-foreground">{name.slice(0, 1)}</div>
      {!compact && <div className="min-w-0"><div className="truncate font-heading text-[15px] leading-tight font-semibold">{name}</div><div className="text-[12px] tracking-[0.2em] opacity-60">LOCAL · 本机</div></div>}
    </div>
  )
}

export function LiveDot({ state, compact }: { state: LiveState; compact?: boolean }) {
  const map = { live: ['bg-ok', '实时同步中'], connecting: ['bg-warn', '连接中'], offline: ['bg-danger', '本地服务断开'] } as const
  const [cls, label] = map[state]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <span className={cn('relative inline-flex size-2 rounded-full', cls)}>{state === 'live' && <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-40" />}</span>
      {!compact && label}
    </span>
  )
}

export function Badge({ n, tone }: { n?: number; tone?: NavItem['tone'] }) {
  if (!n) return null
  return <span className={cn('num ml-auto min-w-5 rounded-full px-1.5 text-center text-[12px] leading-5 font-medium', tone === 'warn' ? 'bg-warn text-white' : 'bg-current/12 opacity-75')}>{n}</span>
}

/** 新建菜单和快捷键：每一项归哪个模块；模块收起来了，这一项和它的快捷键都不出现（模块开关，shared/modules.ts） */
const QUICK = [
  { k: 'todo', label: '待办', icon: ListPlus, key: 'T', module: 'tasks' }, { k: 'event', label: '日程', icon: CalendarPlus, key: 'E', module: 'tasks' },
  { k: 'log', label: '记一笔跟进', icon: MessageSquarePlus, key: 'L', module: 'clients' }, { k: 'client', label: '客户', icon: UserPlus, key: 'C', module: 'clients' },
  { k: 'inbox', label: '随手记', icon: Inbox, key: 'N', module: 'inbox' },
] as const

/** 侧栏里一行的样式：菜单项、设置、头像都用它，悬停和选中的样子一样 */
export function sideItemCls(active: boolean, extra?: string) {
  return cn('relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14.5px] text-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
    active ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-paper before:absolute before:top-2 before:bottom-2 before:-left-3.5 before:w-1 before:rounded-r before:bg-primary' : 'hover:bg-sidebar-accent/60', extra)
}

/** 侧栏底部的设置：和菜单项一样的一行（compact = 只有图标，窄栏用） */
export function SideSettingsLink({ compact }: { compact?: boolean }) {
  const { pathname } = useLocation()
  const active = pathname.startsWith('/settings')
  return (
    <Link to="/settings" aria-label="设置" aria-current={active ? 'page' : undefined} title={compact ? '设置' : undefined} className={sideItemCls(active, compact ? 'justify-center px-0' : undefined)}>
      <SettingsIcon className="size-[18px] shrink-0 opacity-85" />{!compact && <span className="truncate">设置</span>}
    </Link>
  )
}

export function QuickCreate({ compact, wide }: { compact?: boolean; wide?: boolean }) {
  const ov = useOverlay()
  const { on } = useModules()
  const items = QUICK.filter((i) => on(i.module))
  if (!items.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? <Button size="icon" aria-label="新建"><Plus /></Button> : <Button className={cn(wide && 'w-full justify-start')}><Plus />新建<ChevronDown className={cn('opacity-60', wide && 'ml-auto')} /></Button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={wide ? 'start' : 'end'} className={wide ? 'w-(--radix-dropdown-menu-trigger-width) min-w-48' : 'w-48'}>
        {items.map((i) => <DropdownMenuItem key={i.k} onSelect={() => ov.openNew(i.k)}><i.icon />{i.label}<DropdownMenuShortcut>{i.key}</DropdownMenuShortcut></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 全局快捷键：⌘K 搜索；不在输入框时按 T/E/L/C/N 新建 */
export function useHotkeys(openSearch: () => void) {
  const ov = useOverlay()
  const { list } = useModules()
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return }
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input,textarea,[contenteditable],[role=dialog],[role=menu]')) return
      const hit = QUICK.find((i) => i.key.toLowerCase() === e.key.toLowerCase() && list.includes(i.module))
      if (hit) { e.preventDefault(); ov.openNew(hit.k) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [ov, openSearch, list])
}

export function SearchButton({ onClick, wide }: { onClick: () => void; wide?: boolean }) {
  if (!wide) return <Button variant="ghost" size="icon" aria-label="搜索" onClick={onClick}><Search /></Button>
  return (
    <button onClick={onClick} className="flex h-8 w-full max-w-[320px] items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground hover:border-primary/40">
      <Search className="size-4" /><span className="flex-1 text-left">搜客户、项目、待办…</span><Kbd>⌘K</Kbd>
    </button>
  )
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const ov = useOverlay()
  const { data: hits = [] } = useApi<SearchHit[]>(q.trim() ? `/search?q=${encodeURIComponent(q)}` : null)
  const { sections } = useNav()
  const go = (fn: () => void) => { onOpenChange(false); setQ(''); fn() }
  const LABEL = { client: '客户', project: '项目', todo: '待办', event: '日程' }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="搜索" description="搜客户、项目、待办、日程，或跳转到某个页面">
      {/* CommandDialog 不自带 <Command>：输入框和列表要包在 Command 里，不然一打开搜索整页报错（reading 'subscribe'） */}
      <Command>
        <CommandInput placeholder="输入客户名、项目、关键词…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>没找到。试试客户名字或联系人，比如“澜拓”“周明远”。</CommandEmpty>
          {(['client', 'project', 'todo', 'event'] as const).map((t) => {
            const xs = hits.filter((h) => h.type === t)
            return xs.length ? (
              <CommandGroup key={t} heading={LABEL[t]}>
                {xs.map((h) => <CommandItem key={h.id} value={`${h.title} ${h.id}`} keywords={[q]} onSelect={() => go(() => ov.openDetail(t, h.id))}>{h.title}<span className="ml-auto text-xs text-muted-foreground">{h.sub}</span></CommandItem>)}
              </CommandGroup>
            ) : null
          })}
          <CommandGroup heading="页面">
            {sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((p) => (
              <CommandItem key={p.id} value={`页面 ${pageTrail(p)} ${g.label ?? ''} ${p.id}`} onSelect={() => go(() => nav(p.to))}>
                <p.icon />{pageTrail(p)}{g.label && <span className="ml-auto text-xs text-muted-foreground">{g.label}</span>}
              </CommandItem>
            ))))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

/** 设置入口：一个齿轮按钮，四种导航都放在看得见的地方（不只藏在头像菜单里） */
export function SettingsButton({ label }: { label?: boolean }) {
  const { pathname } = useLocation()
  const active = pathname.startsWith('/settings')
  return (
    <Button variant="ghost" size={label ? 'sm' : 'icon'} asChild className={cn(label && 'justify-start gap-2.5 px-2.5 text-[14.5px] font-normal', active && 'bg-sidebar-accent font-semibold')}>
      <Link to="/settings" aria-label="设置" aria-current={active ? 'page' : undefined}><SettingsIcon className="size-[18px] opacity-85" />{label && "设置"}</Link>
    </Button>
  )
}

/** 头像菜单。wide = 侧栏底部整行宽（名字 + 箭头），菜单往上开；compact = 只有头像 */
export function UserMenu({ settings, compact, wide }: { settings?: Settings; compact?: boolean; wide?: boolean }) {
  const save = useWrite((b: Partial<Settings>) => api.patch('/settings', b), '导航样式已切换')
  const name = settings?.owner ?? '老板'
  const system = useNav().sections.find((s) => s.key === '系统')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={wide ? sideItemCls(false, 'py-1.5') : 'flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-foreground/5'} aria-label={compact ? `${name}：导航样式、设置` : undefined}>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-medium text-accent-foreground">{name.slice(0, 1)}</span>
          {!compact && <><span className="truncate">{name}</span><ChevronDown className={cn('size-3.5 shrink-0 opacity-60', wide && 'ml-auto')} /></>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={wide ? 'start' : 'end'} side={wide ? 'top' : 'bottom'} className={wide ? 'w-(--radix-dropdown-menu-trigger-width) min-w-56' : 'w-56'}>
        <DropdownMenuItem asChild><Link to="/settings#profile"><UserRound />我的资料</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>导航样式</DropdownMenuLabel>
        {NAV_MODES.map(([m, label]) => (
          <DropdownMenuItem key={m} onSelect={() => save.mutate({ nav_mode: m })}>{settings?.nav_mode === m ? <Check /> : <span className="size-4" />}{label}</DropdownMenuItem>
        ))}
        {/* 系统分区（设置、组件规范）不占顶栏，从这里进 */}
        {system && <DropdownMenuSeparator />}
        {system?.pages.map((p) => <DropdownMenuItem key={p.id} asChild><Link to={p.to}><p.icon />{p.label}</Link></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 手机汉堡菜单：左上角按钮，左侧滑出完整菜单（分区 → 分组小标题 → 页面）；设置里可选“底部标签”或“汉堡菜单” */
export function MobileMenuButton({ overview, business }: { overview?: Overview; business: string }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  const { sections } = useNav()
  const activeId = resolveNav(pathname, sections).page?.id
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="打开菜单" onClick={() => setOpen(true)} className="md:hidden"><Menu /></Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[82vw] max-w-[320px] gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="border-b border-sidebar-border px-4 py-4"><SheetTitle asChild><div><Brand name={business} /></div></SheetTitle></SheetHeader>
          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="全部菜单">
            {sections.map((s) => (
              <div key={s.key} className="mb-4">
                <div className="px-2 pb-1 text-[13px] font-semibold">{s.label}</div>
                {s.groups.map((g, i) => {
                  const module = groupModule(g)
                  return (
                    <div key={g.label ?? `_${i}`}>
                      {g.label && <div className="flex items-center gap-2 px-2.5 pt-2 pb-0.5 text-[12px] text-muted-foreground">{g.label}<Badge n={module && overview ? module.badge?.(overview) : undefined} tone={module?.tone} /></div>}
                      {g.pages.map((p) => {
                        const on = p.id === activeId
                        return (
                          <Link key={p.id} to={p.to} aria-current={on ? 'page' : undefined} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[15px]', on ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60')}>
                            <p.icon className="size-[18px]" />{p.label}<Badge n={pageBadge(p, overview)} tone={p.item.tone} />
                          </Link>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** 手机底栏：每个分区一个入口（今日 / 客户 / 经营 / 内容，nav.ts 的 MOBILE_TABS）+ 更多（按分区分段列出全部页面）。
 *  在分区里任何一页，这个分区的入口都亮；当前页不在底栏的分区里（知识库、设置）时亮“更多” */
export function MobileTabs({ overview }: { overview?: Overview }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  const { nav, sections } = useNav()
  const r = resolveNav(pathname, sections)
  const tabs = mobileTabs(nav)
  const current = activeTab(tabs, r)
  const moreOn = !current && !!r.section
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }} aria-label="常用">
        {tabs.map((n: NavItem) => {
          const on = n === current
          return (
            <Link key={n.key} to={n.to} aria-current={on ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[12px]', on ? 'text-primary' : 'text-muted-foreground')}>
              {on && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-primary" />}<n.icon className="size-5" />{n.short ?? n.label}{overview && n.badge?.(overview) ? <span className="absolute top-1 right-[calc(50%-18px)] size-1.5 rounded-full bg-warn" /> : null}
            </Link>
          )
        })}
        <button onClick={() => setOpen(true)} className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[12px]', moreOn ? 'text-primary' : 'text-muted-foreground')}>
          {moreOn && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-primary" />}<Menu className="size-5" />更多
        </button>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] gap-0 rounded-t-2xl">
          <SheetHeader><SheetTitle>全部功能</SheetTitle></SheetHeader>
          <nav className="min-h-0 overflow-y-auto px-4 pb-6" aria-label="全部功能">
            {sections.map((s) => (
              <section key={s.key} className="mb-3 last:mb-0">
                <h3 className="px-1 pb-1 text-[12px] font-medium tracking-wide text-muted-foreground">{s.label}</h3>
                <div className="grid grid-cols-4 gap-1">
                  {s.pages.map((p) => {
                    const on = p.id === r.page?.id
                    return (
                      <Link key={p.id} to={p.to} aria-current={on ? 'page' : undefined} className={cn('flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-2 text-xs', on ? 'font-medium text-primary' : 'hover:bg-muted')}>
                        <span className={cn('grid size-10 place-items-center rounded-xl', on ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground')}><p.icon className="size-5" /></span>
                        <span className="w-full truncate text-center">{p.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
