// 3. 导航：三层各管一件事（分区 → 页面 → 页内 Tab）；电脑上 3 种布局、手机上 2 种，都画成示意图；以及导航规则
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

/** 三层：每层一张卡，写清管什么、长什么样、在 nav.ts 里怎么写 */
const LAYERS: { n: string; name: string; job: string; looks: ReactNode; how: ReactNode }[] = [
  { n: '1', name: '分区', job: '这是哪一摊事',
    looks: '今日 / 客户 / 经营 / 内容 / 数据 / 资料。复杂导航在顶栏做页签（带要处理的数），顶部导航做下拉，简单导航做分段。设置、组件规范在“系统”，从头像菜单进。',
    how: <>每项写 <Code>section</Code>；一个分区的模块都拿掉了，分区自动不显示。</> },
  { n: '2', name: '页面', job: '去哪一页',
    looks: '左栏只列当前分区的页面。页面多了分组：组名是不可点的小标题（经营里的“渠道”）；有子页面的模块，模块名就是组名。',
    how: <>分组写 <Code>sub</Code>，子页面写 <Code>children</Code>。地址不同就是不同页面。</> },
  { n: '3', name: '页内 Tab', job: '同一页换个看法',
    looks: '表格 / 看板、月 / 周 / 日、近 6 / 12 个月、按状态分类。一页最多一排。',
    how: <>用 <Code>ViewTabs</Code>，选中的写进地址栏（<Code>?view=board</Code>）。不拿它跳到别的页面。</> },
]

function Layers() {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {LAYERS.map((l) => (
        <li key={l.n} className="min-w-0 rounded-xl border bg-card p-4 shadow-paper">
          <div className="flex items-baseline gap-2">
            <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">{l.n}</span>
            <span className="text-[15px] font-semibold">{l.name}</span>
            <span className="text-xs text-muted-foreground">管：{l.job}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed">{l.looks}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.how}</p>
        </li>
      ))}
    </ol>
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
/** 示意图里不可点的小标题（分区名、组名） */
const Label = ({ className }: { className?: string }) => <span className={cn('mt-1 h-1 w-5 rounded-full bg-muted-foreground/30', className)} />

function SimpleLayout() {
  return (
    <div className="flex h-full">
      <div className="flex w-[28%] flex-col gap-1.5 border-r bg-sidebar p-2">
        <Logo />
        <Bar className="w-3/5 bg-primary/70" /><Bar className="w-1/2" />
        <Label /><Bar className="w-4/5" />
        <Label /><Bar className="w-2/3" /><Bar className="w-1/2" />
        <Label /><Bar className="w-3/5" />
      </div>
      <Content tabs />
    </div>
  )
}

function ComplexLayout() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-6 shrink-0 items-center gap-1.5 border-b bg-card px-2">
        <span className="size-2.5 rounded-[3px] bg-primary" />
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1 w-5 rounded-full', i === 2 ? 'bg-primary/70' : 'bg-foreground/20')} />)}
        <span className="ml-auto flex h-3 w-10 items-center rounded-full border bg-background px-1"><Search className="size-2 text-muted-foreground" /></span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[26%] flex-col gap-1.5 border-r bg-sidebar p-2">
          <Bar className="w-3/5" />
          <Label /><Bar className="w-2/3 bg-primary/70" /><Bar className="w-1/2" /><Bar className="w-3/5" />
          <Label /><Bar className="w-1/2" /><Bar className="w-2/3" />
        </div>
        <Content />
      </div>
    </div>
  )
}

function TopLayout() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-7 items-center gap-2 border-b bg-card px-2">
        <span className="size-2.5 rounded-[3px] bg-primary" />
        {[0, 1, 2, 3].map((i) => <span key={i} className="flex items-center gap-0.5"><Bar className={cn('h-1 w-6', i === 2 && 'bg-primary/70')} /><ChevronDown className="size-2 text-muted-foreground" /></span>)}
        <span className="ml-auto h-3 w-10 rounded-full border bg-background" />
      </div>
      <div className="mx-auto flex w-[84%] flex-1"><Content /></div>
      {/* 打开的分区下拉：组名小标题 + 页面 */}
      <div className="absolute top-7 left-[44%] flex w-[30%] flex-col gap-1 rounded-md border bg-popover p-1.5 shadow-float">
        <Bar className="h-1 w-3/5" /><Label className="mt-0.5" /><Bar className="h-1 w-2/3 bg-primary/60" /><Bar className="h-1 w-1/2" /><Label className="mt-0.5" /><Bar className="h-1 w-3/5" />
      </div>
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
        <Label /><Bar className="w-4/5 bg-primary/70" /><Bar className="w-3/5" />
        <Label /><Bar className="w-2/3" /><Bar className="w-1/2" />
        <Label /><Bar className="w-3/5" />
      </div>
    </div>
  )
}

export function NavSection() {
  return (
    <Section title="导航" desc="菜单只有一个来源：src/app/nav.ts。三层各管一件事：分区 → 页面 → 页内 Tab，不嵌第四层。三种电脑布局、两种手机布局都从它生成，老板在设置里随时切换，页面代码不用跟着改。">
      <Sub title="三层各管一件事" desc="分组只是小标题，不能点，不算一层。位置只画一层：顶栏不画面包屑，页头上方的小字就是那一层。">
        <Layers />
      </Sub>
      <Sub title="电脑：3 种布局">
        <div className="grid gap-4 md:grid-cols-3">
          <Frame title="复杂（默认）" desc="顶栏是分区页签，带这个分区要处理的数；左栏只列当前分区的分组和页面，可收成图标栏（每个页面一个图标，悬停或聚焦出名字）。" fit="模块多、每天来回切换。"><ComplexLayout /></Frame>
          <Frame title="简单" desc="一列菜单，按分区分段，只列模块；中等宽度只剩图标。子页面用页内的下划线 Tab（SubTabs）切换。" fit="模块不多（8 个以内）、刚开始用。"><SimpleLayout /></Frame>
          <Frame title="顶部" desc="分区放在页面上方，点开下拉选页面（下拉里按分组排）；内容区居中，左右留白。" fit="喜欢宽屏看内容、模块不多。"><TopLayout /></Frame>
        </div>
      </Sub>
      <Sub title="手机：2 种">
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <Frame phone title="底部标签" desc="每个分区一个入口（今日 / 客户 / 经营 / 内容），在分区里任何一页都亮它；“更多”里按分区分段列出全部页面。" fit="大多数人。入口在 nav.ts 的 MOBILE_TABS 里定；模块拿掉或关掉了，空位先给还没有入口的分区。"><PhoneTabs /></Frame>
          <Frame phone title="汉堡菜单" desc="左上角按钮拉出完整菜单：分区 → 分组小标题 → 页面，底下不占位置。" fit="模块多、底栏放不下，或页面底部本身有操作条。"><PhoneDrawer /></Frame>
        </div>
      </Sub>
      <Rules title="导航规则" items={[
        <><b>三层各管一件事，不嵌第四层：</b>分区（哪一摊事）→ 页面（去哪一页）→ 页内 Tab（同一页换个看法）。分组小标题不能点；页面里不再放一排跳到别的页面的 Tab。</>,
        <><b>左侧导航有子页面时，页内不再放 Tab。</b>比如“客户与跟进”下面的客户列表 / 跟进看板 / 跟进清单，左栏里已经列出，页面里不再重复一排。</>,
        <>简单导航只列模块，所以只有它会显示页内子页面 Tab：用 <Code>{'<SubTabs />'}</Code>，它在复杂 / 顶部导航里自动隐藏。</>,
        <>加一个模块 = <Code>app/nav.ts</Code> 加一项（写上 <Code>section</Code>，有模块开关时再写 <Code>module</Code>）+ <Code>app/router.tsx</Code> 登记页面。外壳从 <Code>useNav()</Code>（<Code>app/nav-sections.ts</Code>）取菜单，不要在别处手写菜单，当前在哪一页一律用 <Code>resolveNav</Code> 算。</>,
        <>菜单角标只放“要你处理”的数（逾期、该跟进），用 warn 色；单纯的数量用安静的灰色。分区页签上的数是分区里 warn 角标的合计。</>,
      ]} />
    </Section>
  )
}
