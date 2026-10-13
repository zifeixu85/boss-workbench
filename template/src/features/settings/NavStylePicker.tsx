// 导航样式：三张可选的大卡片，各带一张示意图。点了马上保存、马上生效。三种都按分区（今日 / 客户 / 经营 / 内容 / 数据 / 资料）组织，见 app/nav.ts
import { Check } from 'lucide-react'
import type { Settings } from '@/lib/types'
import { api, useWrite } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

type Mode = Settings['nav_mode']

const OPTIONS: { value: Mode; title: string; desc: string; ref: string; Preview: () => React.JSX.Element }[] = [
  { value: 'simple', title: '简单', desc: '一列菜单，按分区分段，所有模块一眼看全；子页面在页头切换。模块不多时最顺手。', ref: '模块少', Preview: SimplePreview },
  { value: 'complex', title: '复杂', desc: '顶上是分区（今日、客户、经营、内容、数据、资料），带要处理的数；左边只列这个分区的页面，可以收成图标。模块多了更好找。', ref: '模块多', Preview: ComplexPreview },
  { value: 'top', title: '顶部导航', desc: '分区放在上方，点开下拉选页面；内容区更宽。适合常在大屏上看图表、表格。', ref: '宽屏', Preview: TopPreview },
]

export function NavStylePicker({ value }: { value?: Mode }) {
  const save = useWrite((nav_mode: Mode) => api.patch<Settings>('/settings', { nav_mode }), (o) => `已切换成${{ simple: '简单', complex: '复杂', top: '顶部' }[o.nav_mode]}导航`)
  if (!value) return <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
  return (
    <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label="导航样式">
      {OPTIONS.map((o) => {
        const on = (save.isPending ? save.variables : value) === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={save.isPending}
            onClick={() => !on && save.mutate(o.value)}
            className={cn(
              'group min-w-0 rounded-xl border bg-background/50 p-3 text-left outline-none transition-[border-color,box-shadow,background-color] hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-80',
              on && 'border-primary bg-accent/40 ring-2 ring-primary/25 hover:border-primary',
            )}
          >
            <o.Preview />
            <div className="mt-3 flex items-center gap-2 px-0.5">
              <span className="text-[15px] font-semibold">{o.title}</span>
              {on && <span className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[12px] font-medium text-primary-foreground"><Check className="size-3" />正在用</span>}
              <span className="ml-auto text-[12px] text-muted-foreground">{o.ref}</span>
            </div>
            <p className="mt-1 px-0.5 text-[13px] leading-relaxed text-muted-foreground">{o.desc}</p>
          </button>
        )
      })}
    </div>
  )
}

const bar = 'h-1.5 rounded-full bg-foreground/15'

function Content() {
  return (
    <div className="flex-1 p-2.5">
      <div className="h-2 w-2/5 rounded-full bg-foreground/30" />
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => <div key={i} className="h-7 rounded-md border bg-card" />)}
      </div>
      <div className="mt-1.5 grid grid-cols-[2fr_1fr] gap-1.5">
        <div className="h-14 rounded-md border bg-card" />
        <div className="h-14 rounded-md border bg-card" />
      </div>
    </div>
  )
}

function Logo() {
  return <div className="mb-2 flex items-center gap-1"><div className="size-3 rounded-[3px] bg-primary" /><div className="h-1.5 w-8 rounded-full bg-foreground/30" /></div>
}

function SimplePreview() {
  // 一列，分区之间一个小标题
  const rows: (string | null)[] = ['w-3/5', 'w-1/2', null, 'w-4/5', null, 'w-2/3', 'w-1/2', null, 'w-3/5']
  return (
    <div aria-hidden className="flex h-40 overflow-hidden rounded-lg border bg-background">
      <div className="flex w-[30%] flex-col gap-1.5 border-r bg-sidebar p-2.5">
        <Logo />
        {rows.map((w, i) => (w ? <div key={i} className={cn(bar, w, i === 0 && 'bg-primary/70')} /> : <div key={i} className="mt-1 h-1 w-6 rounded-full bg-muted-foreground/30" />))}
      </div>
      <Content />
    </div>
  )
}

function ComplexPreview() {
  const label = 'mt-1.5 h-1 w-6 rounded-full bg-muted-foreground/30'
  return (
    <div aria-hidden className="flex h-40 flex-col overflow-hidden rounded-lg border bg-background">
      {/* 顶栏：分区页签 */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-card px-2.5">
        <div className="size-3 rounded-[3px] bg-primary" />
        {['w-5', 'w-5', 'w-5 bg-primary/70', 'w-5', 'w-5'].map((w, i) => <div key={i} className={cn('h-1.5 rounded-full bg-foreground/20', w)} />)}
        <div className="ml-auto h-3 w-10 rounded-full border bg-background" />
      </div>
      {/* 左栏：当前分区的分组和页面 */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[26%] flex-col gap-1.5 border-r bg-sidebar p-2.5">
          <div className={cn(bar, 'w-3/5')} />
          <div className={label} />
          <div className={cn(bar, 'w-2/3 bg-primary/70')} />
          <div className={cn(bar, 'w-1/2')} />
          <div className={label} />
          <div className={cn(bar, 'w-3/5')} />
        </div>
        <Content />
      </div>
    </div>
  )
}

function TopPreview() {
  return (
    <div aria-hidden className="flex h-40 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex h-7 items-center gap-2 border-b bg-card px-2.5">
        <div className="size-3 rounded-[3px] bg-primary" />
        {['w-5', 'w-7 bg-primary/70', 'w-6', 'w-8', 'w-5'].map((w, i) => <div key={i} className={cn('h-1.5 rounded-full bg-foreground/20', w)} />)}
        <div className="ml-auto h-3 w-10 rounded-full border bg-card" />
      </div>
      <div className="mx-auto w-[86%]"><Content /></div>
    </div>
  )
}
