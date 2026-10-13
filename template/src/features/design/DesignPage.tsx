// 组件规范：活的样式指南。左边目录、右边一次看一节，地址栏 ?s=charts 指定哪一节。
// 每个示例都直接用真正的共用组件画出来；文字版规范在 工作台/程序/规范/，AI 改模块前要先读。
import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, ChartColumn, CircleDashed, LayoutGrid, MousePointerClick, Palette, PanelRight, PanelsTopLeft, ToggleLeft, Type, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/page'
import { ThemePreviewProvider } from './theme-preview'
import { THEMES, readThemeTokens, scopeStyle, useThemePreview } from './theme-tokens'
import { StyleSection } from './sections/StyleSection'
import { TypeSection } from './sections/TypeSection'
import { NavSection } from './sections/NavSection'
import { TabsSection } from './sections/TabsSection'
import { ButtonsSection } from './sections/ButtonsSection'
import { DisplaySection } from './sections/display/DisplaySection'
import { DetailSection } from './sections/DetailSection'
import { ChartsSection } from './sections/charts/ChartsSection'
import { StatesSection } from './sections/StatesSection'

const SECTIONS: { id: string; label: string; icon: LucideIcon; C: () => React.JSX.Element }[] = [
  { id: 'style', label: '风格与颜色', icon: Palette, C: StyleSection },
  { id: 'type', label: '文字', icon: Type, C: TypeSection },
  { id: 'nav', label: '导航', icon: PanelsTopLeft, C: NavSection },
  { id: 'tabs', label: 'Tab 与切换', icon: ToggleLeft, C: TabsSection },
  { id: 'buttons', label: '按钮与标签', icon: MousePointerClick, C: ButtonsSection },
  { id: 'display', label: '展示方式', icon: LayoutGrid, C: DisplaySection },
  { id: 'detail', label: '详情与表单', icon: PanelRight, C: DetailSection },
  { id: 'charts', label: '图表', icon: ChartColumn, C: ChartsSection },
  { id: 'states', label: '空 / 加载 / 出错', icon: CircleDashed, C: StatesSection },
]

export default function DesignPage() {
  return (
    <ThemePreviewProvider>
      <DesignBody />
    </ThemePreviewProvider>
  )
}

function DesignBody() {
  const [sp] = useSearchParams()
  const index = Math.max(0, SECTIONS.findIndex((s) => s.id === sp.get('s')))
  const section = SECTIONS[index]
  const topRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLElement>(null)

  // 换了一节：如果已经往下滚过，回到这一节的开头；手机上把目录里选中的那项滑到看得见的地方
  useEffect(() => {
    const el = topRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
    const toc = tocRef.current
    const on = toc?.querySelector<HTMLElement>('[aria-current="true"]')
    if (toc && on && toc.scrollWidth > toc.clientWidth) toc.scrollLeft = on.offsetLeft - 16
  }, [index])

  return (
    <>
      <PageHeader eyebrow="系统" title="组件规范" desc="AI 加模块、改页面时只能用这里的积木。每个示例都是真组件画出来的；文字版在 工作台/程序/规范/。" actions={<ThemeDots />} />
      <PageBody>
        <div className="grid gap-5 lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-8">
          <nav ref={tocRef} aria-label="规范目录" className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-[calc(var(--sticky-top)+1rem)] lg:mx-0 lg:block lg:self-start lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map((s, i) => <TocLink key={s.id} s={s} n={i + 1} on={i === index} />)}
          </nav>
          <div ref={topRef} className="min-w-0 scroll-mt-[calc(var(--sticky-top)+1rem)]">
            <section.C />
            <PrevNext index={index} />
          </div>
        </div>
      </PageBody>
    </>
  )
}

function TocLink({ s, n, on }: { s: (typeof SECTIONS)[number]; n: number; on: boolean }) {
  return (
    <Link
      to={{ search: `?s=${s.id}` }}
      replace
      preventScrollReset
      aria-current={on ? 'true' : undefined}
      className={cn(
        'relative flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mb-0.5 lg:border-transparent lg:py-2',
        on ? 'border-primary bg-accent font-semibold text-accent-foreground lg:before:absolute lg:before:top-2 lg:before:bottom-2 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-full lg:before:bg-primary' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground lg:bg-transparent',
      )}
    >
      <span className="num hidden w-3.5 text-[12px] opacity-60 lg:inline">{n}</span>
      <s.icon className="size-4 shrink-0" aria-hidden />
      {s.label}
    </Link>
  )
}

function PrevNext({ index }: { index: number }) {
  const prev = SECTIONS[index - 1]
  const next = SECTIONS[index + 1]
  const cls = 'flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border bg-card px-4 py-3 text-sm shadow-paper outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50'
  return (
    <nav aria-label="上一节和下一节" className="mt-10 flex gap-3 border-t pt-6">
      {prev ? <Link to={{ search: `?s=${prev.id}` }} replace className={cls}><span className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="size-3" />上一节</span><span className="font-medium">{prev.label}</span></Link> : <span className="flex-1" />}
      {next ? <Link to={{ search: `?s=${next.id}` }} replace className={cn(cls, 'items-end text-right')}><span className="flex items-center gap-1 text-xs text-muted-foreground">下一节<ArrowRight className="size-3" /></span><span className="font-medium">{next.label}</span></Link> : <span className="flex-1" />}
    </nav>
  )
}

/** 页头右边：5 个小色点，点一下整页临时换风格（离开本页自动恢复） */
function ThemeDots() {
  const { active, preview } = useThemePreview()
  const tokens = useMemo(() => readThemeTokens(), [])
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card py-1 pr-1.5 pl-3 shadow-paper" role="group" aria-label="临时预览风格">
      <span className="text-xs text-muted-foreground">预览风格</span>
      {THEMES.map((t) => {
        const on = active === t.id
        return (
          <button key={t.id} type="button" onClick={() => preview(t.id)} aria-pressed={on} aria-label={`预览${t.name}风格`} title={t.name}
            className={cn('grid size-7 place-items-center rounded-full outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50', on ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-border')}>
            <span aria-hidden style={tokens ? scopeStyle(tokens[t.id]) : undefined} className="grid size-5 place-items-center rounded-full border">
              <span className="size-2.5 rounded-full bg-primary" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
