// 3. 导航：电脑上 3 种布局、手机上 2 种，都画成示意图；以及 Tab 和左侧导航的分工
import type { ReactNode } from 'react'
import { ChevronDown, Menu, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Bar, Code, Rules, Section, Sub } from '../parts'

function Frame({ title, desc, fit, children, phone }: { title: string; desc: string; fit: string; children: ReactNode; phone?: boolean }) {
  return (
    <figure className="flex min-w-0 flex-col rounded-xl border bg-card p-3 shadow-paper">
      <div aria-hidden className={cn('overflow-hidden rounded-lg border bg-background', phone ? 'mx-auto h-52 w-28 rounded-2xl' : 'h-40')}>{children}</div>
      <figcaption className="mt-3 px-0.5">
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed"><span className="text-muted-foreground">适合：</span>{fit}</p>
      </figcaption>
    </figure>
  )
}

/** 内容区：页头 + 几块卡片 */
function Content({ tabs }: { tabs?: boolean }) {
  return (
    <div className="min-w-0 flex-1 p-2.5">
      <Bar className="w-2/5 bg-foreground/35" />
      {tabs && (
        <div className="mt-2 flex gap-2 border-b pb-1">
          <span className="h-1 w-6 rounded-full bg-primary" /><Bar className="h-1 w-6" /><Bar className="h-1 w-6" />
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-6 rounded-md border bg-card" />)}</div>
      <div className="mt-1.5 grid grid-cols-[2fr_1fr] gap-1.5"><span className="h-12 rounded-md border bg-card" /><span className="h-12 rounded-md border bg-card" /></div>
    </div>
  )
}

const Logo = () => <span className="mb-1 flex items-center gap-1"><span className="size-2.5 rounded-[3px] bg-primary" /><Bar className="w-7 bg-foreground/30" /></span>

function SimpleLayout() {
  return (
    <div className="flex h-full">
      <div className="flex w-[28%] flex-col gap-1.5 border-r bg-sidebar p-2">
        <Logo />
        {['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/5', 'w-2/3', 'w-1/2'].map((w, i) => <Bar key={i} className={cn(w, i === 2 && 'bg-primary/70')} />)}
      </div>
      <Content tabs />
    </div>
  )
}

function ComplexLayout() {
  const label = 'mt-1 h-1 w-5 rounded-full bg-muted-foreground/30'
  return (
    <div className="flex h-full">
      <div className="flex w-[28%] flex-col gap-1.5 border-r bg-sidebar p-2">
        <Logo />
        <Bar className="w-3/5" /><span className={label} /><Bar className="w-2/3" /><Bar className="w-1/2" /><span className={label} />
        <Bar className="w-3/4 bg-primary/70" />
        <span className="ml-1 grid gap-1 border-l border-foreground/15 pl-1.5"><Bar className="h-1 w-3/5 bg-primary/50" /><Bar className="h-1 w-1/2" /></span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-6 items-center gap-1 border-b px-2">
          <Bar className="h-1 w-5" /><span className="text-[8px] leading-none text-muted-foreground">/</span><Bar className="h-1 w-7 bg-foreground/35" />
          <span className="ml-auto flex h-3 w-12 items-center rounded-full border bg-card px-1"><Search className="size-2 text-muted-foreground" /></span>
        </div>
        <Content />
      </div>
    </div>
  )
}

function TopLayout() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 items-center gap-2 border-b bg-card px-2">
        <span className="size-2.5 rounded-[3px] bg-primary" />
        {[0, 1, 2, 3].map((i) => <span key={i} className="flex items-center gap-0.5"><Bar className={cn('h-1 w-6', i === 1 && 'bg-primary/70')} />{i > 0 && <ChevronDown className="size-2 text-muted-foreground" />}</span>)}
        <span className="ml-auto h-3 w-10 rounded-full border bg-background" />
      </div>
      <div className="mx-auto flex w-[84%] flex-1"><Content /></div>
    </div>
  )
}

function PhoneTabs() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-6 items-center border-b bg-card px-2"><span className="size-2.5 rounded-[3px] bg-primary" /><Bar className="ml-auto h-1 w-6" /></div>
      <div className="flex-1 p-2"><Bar className="w-1/2 bg-foreground/35" /><span className="mt-2 block h-10 rounded-md border bg-card" /><span className="mt-1.5 block h-14 rounded-md border bg-card" /></div>
      <div className="grid h-8 grid-cols-5 items-center border-t bg-card px-1">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn('mx-auto size-2.5 rounded-[3px]', i === 0 ? 'bg-primary' : 'bg-foreground/20')} />)}
      </div>
    </div>
  )
}

function PhoneDrawer() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-6 items-center gap-1 border-b bg-card px-2"><Menu className="size-2.5 text-foreground" /><span className="size-2.5 rounded-[3px] bg-primary" /></div>
      <div className="flex-1 p-2"><Bar className="w-1/2 bg-foreground/35" /><span className="mt-2 block h-10 rounded-md border bg-card" /><span className="mt-1.5 block h-14 rounded-md border bg-card" /></div>
      <div className="absolute inset-y-0 left-0 flex w-[62%] flex-col gap-1.5 border-r bg-sidebar p-2 shadow-float">
        <Logo />
        {['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/5', 'w-2/3'].map((w, i) => <Bar key={i} className={cn(w, i === 0 && 'bg-primary/70')} />)}
      </div>
    </div>
  )
}

export function NavSection() {
  return (
    <Section title="导航" desc="菜单只有一个来源：src/app/nav.ts。三种电脑布局、两种手机布局都从它生成，老板在设置里随时切换，页面代码不用跟着改。">
      <Sub title="电脑：3 种布局">
        <div className="grid gap-4 md:grid-cols-3">
          <Frame title="简单" desc="一列菜单平铺，不分组；中等宽度只剩图标。子页面用页内的下划线 Tab（SubTabs）切换。" fit="模块不多（10 个以内）、刚开始用。"><SimpleLayout /></Frame>
          <Frame title="复杂" desc="侧栏按“日常 / 客户 / 经营 / 内容 / 数据…”分组，带二级菜单，可收成图标栏；顶栏有位置提示和搜索。" fit="模块多、每天来回切换。"><ComplexLayout /></Frame>
          <Frame title="顶部" desc="菜单放在页面上方，按分组做下拉；内容区居中，左右留白。" fit="喜欢宽屏看内容、模块不多。"><TopLayout /></Frame>
        </div>
      </Sub>
      <Sub title="手机：2 种">
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <Frame phone title="底部标签" desc="最常用的 4 个模块放底栏，其余在“更多”里。" fit="大多数人。常用的 4 个在 nav.ts 的 MOBILE_TABS 里定。"><PhoneTabs /></Frame>
          <Frame phone title="汉堡菜单" desc="左上角按钮拉出完整菜单，底下不占位置。" fit="模块多、底栏放不下，或页面底部本身有操作条。"><PhoneDrawer /></Frame>
        </div>
      </Sub>
      <Rules title="导航规则" items={[
        <><b>左侧导航有子页面时，页内不再放 Tab。</b>比如“客户与跟进”下面有客户列表 / 跟进清单 / 商机看板，菜单里已经列出，页面里不再重复一排 Tab。</>,
        <><b>Tab 只切换当前页的视图</b>（表格 / 卡片 / 看板、月 / 周 / 日、近 6 / 12 个月），不拿来跳到别的页面。</>,
        <>简单导航没有二级菜单，所以只有它会显示页内子页面 Tab：用 <Code>{'<SubTabs />'}</Code>，它在复杂 / 顶部导航里自动隐藏。</>,
        <>加一个模块 = <Code>app/nav.ts</Code> 加一项 + <Code>app/router.tsx</Code> 登记页面。不要在别处手写菜单。</>,
        <>菜单角标只放“要你处理”的数（逾期、该跟进），用 warn 色；单纯的数量用安静的灰色。</>,
      ]} />
    </Section>
  )
}
