// 两种导航外壳共用的零件：品牌、实时状态、新建菜单、全局搜索、手机底栏、用户菜单
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { CalendarPlus, ChevronDown, Inbox, ListPlus, Menu, MessageSquarePlus, Plus, Search, UserPlus, Check } from 'lucide-react'
import { api, useApi, useWrite, type LiveState } from '@/lib/api'
import type { Overview, SearchHit, Settings } from '@/lib/types'
import { NAV, MOBILE_TABS, GROUP_LABEL, isActivePath, navFor, type NavItem, type NavGroup } from './nav'
import { useOverlay } from './overlay'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
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
      {!compact && <div className="min-w-0"><div className="truncate font-heading text-[15px] leading-tight font-semibold">{name}</div><div className="text-[10.5px] tracking-[0.2em] opacity-60">LOCAL · 本机</div></div>}
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
  return <span className={cn('num ml-auto min-w-5 rounded-full px-1.5 text-center text-[10.5px] leading-5 font-medium', tone === 'warn' ? 'bg-warn text-white' : 'bg-current/12 opacity-75')}>{n}</span>
}

export function QuickCreate({ compact }: { compact?: boolean }) {
  const ov = useOverlay()
  const items = [
    { k: 'todo', label: '待办', icon: ListPlus, key: 'T' }, { k: 'event', label: '日程', icon: CalendarPlus, key: 'E' },
    { k: 'log', label: '记一笔跟进', icon: MessageSquarePlus, key: 'L' }, { k: 'client', label: '客户', icon: UserPlus, key: 'C' },
    { k: 'inbox', label: '随手记', icon: Inbox, key: 'N' },
  ] as const
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? <Button size="icon" aria-label="新建"><Plus /></Button> : <Button><Plus />新建<ChevronDown className="opacity-60" /></Button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((i) => <DropdownMenuItem key={i.k} onSelect={() => ov.openNew(i.k)}><i.icon />{i.label}<DropdownMenuShortcut>{i.key}</DropdownMenuShortcut></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 全局快捷键：⌘K 搜索；不在输入框时按 T/E/L/C/N 新建 */
export function useHotkeys(openSearch: () => void) {
  const ov = useOverlay()
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return }
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input,textarea,[contenteditable],[role=dialog],[role=menu]')) return
      const map: Record<string, Parameters<typeof ov.openNew>[0]> = { t: 'todo', e: 'event', l: 'log', c: 'client', n: 'inbox' }
      const k = map[e.key.toLowerCase()]
      if (k) { e.preventDefault(); ov.openNew(k) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [ov, openSearch])
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
  const go = (fn: () => void) => { onOpenChange(false); setQ(''); fn() }
  const LABEL = { client: '客户', project: '项目', todo: '待办', event: '日程' }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="搜索" description="搜客户、项目、待办、日程，或跳转到某个页面">
      <CommandInput placeholder="输入客户名、项目、关键词…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>没找到。试试客户名字或联系人，比如“澜拓”“周明远”。</CommandEmpty>
        {(['client', 'project', 'todo', 'event'] as const).map((t) => {
          const xs = hits.filter((h) => h.type === t)
          return xs.length ? (
            <CommandGroup key={t} heading={LABEL[t]}>
              {xs.map((h) => <CommandItem key={h.id} value={`${h.title} ${h.id}`} onSelect={() => go(() => ov.openDetail(t, h.id))}>{h.title}<span className="ml-auto text-xs text-muted-foreground">{h.sub}</span></CommandItem>)}
            </CommandGroup>
          ) : null
        })}
        <CommandGroup heading="页面">
          {NAV.map((n) => <CommandItem key={n.key} value={`页面 ${n.label}`} onSelect={() => go(() => nav(n.to))}><n.icon />{n.label}</CommandItem>)}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

export function UserMenu({ settings, compact }: { settings?: Settings; compact?: boolean }) {
  const save = useWrite((b: Partial<Settings>) => api.patch('/settings', b), '导航样式已切换')
  const name = settings?.owner ?? '老板'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-foreground/5">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-xs font-medium text-accent-foreground">{name.slice(0, 1)}</span>
          {!compact && <><span>{name}</span><ChevronDown className="size-3.5 opacity-60" /></>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>导航样式</DropdownMenuLabel>
        {([['simple', '简单：一列平铺'], ['complex', '复杂：分组 + 二级菜单'], ['top', '顶部导航：菜单在上方']] as const).map(([m, label]) => (
          <DropdownMenuItem key={m} onSelect={() => save.mutate({ nav_mode: m })}>{settings?.nav_mode === m ? <Check /> : <span className="size-4" />}{label}</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><NavLink to="/settings">设置</NavLink></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 手机汉堡菜单：左上角按钮，左侧滑出完整分组菜单（设置里可选“底部标签”或“汉堡菜单”） */
export function MobileMenuButton({ overview, business }: { overview?: Overview; business: string }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  const groups = [...new Set(NAV.map((n) => n.group))] as NavGroup[]
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="打开菜单" onClick={() => setOpen(true)} className="md:hidden"><Menu /></Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[82vw] max-w-[320px] gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="border-b border-sidebar-border px-4 py-4"><SheetTitle asChild><div><Brand name={business} /></div></SheetTitle></SheetHeader>
          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="全部菜单">
            {groups.map((g) => (
              <div key={g} className="mb-3">
                {GROUP_LABEL[g] && <div className="px-2 pb-1 text-[11px] tracking-wide opacity-60">{GROUP_LABEL[g]}</div>}
                {NAV.filter((n) => n.group === g).map((n) => (
                  <div key={n.key}>
                    <NavLink to={n.to} end={n.to === '/'} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[15px]', isActivePath(loc.pathname, n.to) ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60')}>
                      <n.icon className="size-[18px]" />{n.label}<Badge n={overview && n.badge?.(overview)} tone={n.tone} />
                    </NavLink>
                    {n.children?.map((c) => (
                      <NavLink key={c.to} to={c.to} end={c.end} className={cn('flex h-9 items-center rounded-md pl-[38px] text-sm', isActivePath(loc.pathname, c.to, c.end) ? 'font-semibold text-sidebar-primary' : 'opacity-75')}>{c.label}</NavLink>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** 手机底栏：4 个常用 + 更多（抽屉里是全部菜单） */
export function MobileTabs({ overview }: { overview?: Overview }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  const tabs = MOBILE_TABS.map((k) => NAV.find((n) => n.key === k)!)
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="常用">
        {tabs.map((n) => {
          // 同一分组的页面都算这个标签（渠道页 /channel/… 属于“经营”，原来只认 /biz）
          const isActive = n.to === '/' ? loc.pathname === '/' : navFor(loc.pathname)?.group === n.group
          return (
            <NavLink key={n.key} to={n.to} end={n.to === '/'} aria-current={isActive ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-primary' : 'text-muted-foreground')}>
              {isActive && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-primary" />}<n.icon className="size-5" />{n.short ?? n.label}{overview && n.badge?.(overview) ? <span className="absolute top-1 right-[calc(50%-18px)] size-1.5 rounded-full bg-warn" /> : null}
            </NavLink>
          )
        })}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"><Menu className="size-5" />更多</button>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          <SheetHeader><SheetTitle>全部功能</SheetTitle></SheetHeader>
          <div className="grid grid-cols-4 gap-2 px-4 pb-6">
            {NAV.map((n) => (
              <NavLink key={n.key} to={n.to} className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs hover:bg-muted">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><n.icon className="size-5" /></span>{n.label}
              </NavLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
