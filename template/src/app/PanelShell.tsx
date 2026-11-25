// Codex 右边面板里的工作台（地址带 ?embed=1）：不搬整套导航，左上角一个汉堡按钮，点开是和手机版一样的抽屉菜单（分区和页面），
// 选了就在面板里换页；菜单底部“在浏览器里打开完整版”（2026-11-26 A梦 定：“汉堡菜单……不会喧宾夺主”）。
// 整页撑满面板高度：顶上一条窄条，下面内容区自己滚；看板、表格在嵌入模式下不再自己限高（见 lib/embed.ts）。
import { useLocation } from 'react-router'
import { ExternalLink } from 'lucide-react'
import { EmbedContext } from '@/lib/embed'
import { MobileMenuButton, useShellData } from './shell-parts'
import { pageTrail, resolveNav } from './nav'
import { useNav } from './nav-sections'

/** 当前这一页的完整版地址：去掉 embed，再带上 embed=0（新标签页不沿用嵌入模式） */
function fullUrl(pathname: string, search: string) {
  const sp = new URLSearchParams(search)
  sp.set('embed', '0')
  return `${pathname}?${sp.toString()}`
}

export function PanelShell({ children }: { children: React.ReactNode }) {
  const { settings, overview } = useShellData()
  const { pathname, search } = useLocation()
  const { sections } = useNav()
  const page = resolveNav(pathname, sections).page
  const business = settings?.business ?? '工作台'
  const footer = (
    <a href={fullUrl(pathname, search)} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground">
      <ExternalLink className="size-4" />在浏览器里打开完整版
    </a>
  )
  return (
    <EmbedContext.Provider value>
      <div className="flex h-dvh min-w-0 flex-col bg-background">
        <header className="flex h-10 shrink-0 items-center gap-1 border-b bg-background/95 px-1.5 backdrop-blur">
          <MobileMenuButton always overview={overview} business={business} footer={footer} />
          <span className="min-w-0 truncate text-[13px] text-muted-foreground">{page ? pageTrail(page) : business}</span>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </EmbedContext.Provider>
  )
}
