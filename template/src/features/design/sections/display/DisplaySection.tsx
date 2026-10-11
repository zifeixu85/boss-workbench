// 6. 展示方式：卡片的几种 + 同一批客户用 6 种方式展示（表格 / 卡片 / 看板 / 清单 / 时间线 / 日历）
import { Info } from 'lucide-react'
import { Panel, Stat } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Code, Example, Rules, Section, Sub } from '../../parts'
import { CLIENTS } from './data'
import { MetaRow } from '@/components/data-view'
import { addDays, relDay, todayStr, wan } from '@/lib/format'
import { BoardView, CardsView, ClientCard, TableView } from './views'
import { ChecklistView, MonthView, TimelineView } from './views-time'

const GUIDE: { name: string; fit: string; unfit: string; where: string }[] = [
  { name: '表格', fit: '字段多、要横向比较、要排序', unfit: '手机上主要看；每条只有一两个字段', where: '客户列表、应收款、收支流水' },
  { name: '卡片', fit: '一眼看一个人或一件事的全貌；手机', unfit: '要逐列比较数字', where: '客户卡片、风险项目' },
  { name: '看板', fit: '有先后阶段，要看卡在哪一步；拖动改阶段', unfit: '没有阶段，或阶段超过 6 个', where: '商机看板、待办状态' },
  { name: '清单', fit: '要一条条处理、打勾', unfit: '要看很多字段', where: '待办、随手记、该跟进' },
  { name: '时间线', fit: '按时间发生的记录，看来龙去脉', unfit: '要按别的条件排序或筛选', where: '跟进记录、最近改动' },
  { name: '日历', fit: '按日期安排的事', unfit: '没有日期的数据', where: '日程、跟进日期' },
]

export function DisplaySection() {
  return (
    <Section title="展示方式" desc="先想“看的人要做什么”，再选展示方式。下面 6 种用的是同一批示例客户（虚构数据）。同一页可以用 ViewTabs 在其中 2–3 种之间切换。">
      <div className="overflow-hidden rounded-xl border bg-card shadow-paper">
        <div className="hidden grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-4 border-b bg-surface-2 px-5 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>方式</span><span>适合</span><span>不适合</span><span>工作台里</span>
        </div>
        <ul className="divide-y">
          {GUIDE.map((g) => (
            <li key={g.name} className="grid gap-x-4 gap-y-0.5 px-5 py-2.5 text-[13px] md:grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
              <span className="font-semibold">{g.name}</span>
              <span>{g.fit}</span>
              <span className="text-muted-foreground"><span className="md:hidden">不适合：</span>{g.unfit}</span>
              <span className="text-muted-foreground"><span className="md:hidden">例子：</span>{g.where}</span>
            </li>
          ))}
        </ul>
      </div>

      <Sub title="卡片的 4 种" desc="都是白底细边、圆角、浅阴影；区别在里面装什么。">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Panel title="面板" desc="Panel：标题 + 一块内容" className="min-w-0">
            <p className="text-[13px] leading-relaxed text-muted-foreground">页面上的一块区域：图表、列表、表单都装在面板里。右上角可放一个操作。</p>
          </Panel>
          <Stat label="指标卡 · 昨天成交" value="2.6" unit="万" delta={-0.4} hint="比前天" />
          <ClientCard c={CLIENTS[0]} />
          <Alert className="border-primary/30 bg-accent/50 px-4 py-3">
            <Info />
            <AlertTitle>提示块</AlertTitle>
            <AlertDescription className="text-[12.5px]">临时提醒、说明，用 Alert。不要拿彩色大色块做装饰。</AlertDescription>
          </Alert>
        </div>
      </Sub>

      <Example title="表格" tag="<StickyTable />" desc="15 行示例。往下滚，表头一直钉在上面；手机上整张表在框里横向滑动，页面本身不横滚。"
        use="字段多、要横向比较：客户、应收、项目。点名字打开右侧抽屉。" avoid="不要把整行做成只能鼠标点的区域；列太多时先砍列，别缩小字号。" bodyClass="p-3 sm:p-4">
        <TableView />
      </Example>

      <Example title="卡片网格" desc="手机一列、平板两列、宽屏三列。卡片里只放最重要的 3–4 个信息。"
        use="一眼看全貌、手机上浏览。" avoid="不要在卡片里塞表格式的一排数字。">
        <CardsView />
      </Example>

      <Example title="看板" tag="<BoardColumn /> + <DndBoard />" desc="每列一个阶段，列标题吸顶，列内自己滚动；改阶段只靠拖到别的列（拖放用 dnd-board.tsx），或者点开抽屉里改。卡片上不放改状态的下拉。"
        use="有先后阶段：商机、待办状态。列标题写数量和合计金额。" avoid="阶段超过 6 个、或者没有顺序时不要用看板。">
        <BoardView />
      </Example>

      <div className="grid gap-5 xl:grid-cols-2">
        <Example title="清单" desc="勾选框 + 一行标题 + 第二行说明；过期的日期用 danger 色加粗。"
          use="要一条条处理、打勾：待办、该跟进。" avoid="不要把勾选当作删除；完成的放到折叠的“已完成”组里。">
          <ChecklistView />
        </Example>
        <Example title="时间线" desc="按天分组，新的在上；每条写谁、什么方式、说了什么。"
          use="跟进记录、最近改动。" avoid="不要用来展示没有时间先后的数据。">
          <TimelineView />
        </Example>
      </div>

      <Example title="日历" tag="<Calendar /> / FullCalendar" desc="小月历用 shadcn Calendar，有安排的日子带圆点；完整的月 / 周 / 日视图用日程页的 FullCalendar。"
        use="按日期安排的事：日程、跟进日期。" avoid="不要为了“好看”把没有日期的东西放进日历。">
        <MonthView />
      </Example>

      <WrapRulesDemo />
      <Rules title="吸顶与滚动" items={[
        <>长表格一律用 <Code>StickyTable</Code>：自带滚动框，表头吸顶。不要让整页滚到看不见表头。</>,
        <>看板用 <Code>BoardColumn</Code>：每列自己滚动，列标题吸顶。</>,
        <>页面里其他要吸顶的东西（分组标题、右栏）用 <Code>top-(--sticky-top)</Code>，顶部导航布局下会自动让出导航栏的高度。</>,
        '手机上（375 宽）页面不能横向滚动；宽内容（表格、看板）在自己的框里滑动。',
        '列表为空时写清楚“为什么空、下一步做什么”，见“空 / 加载 / 出错”。',
      ]} />
    </Section>
  )
}

/** 窄空间换行：同一张卡片放在 200px 和 320px 宽里对比 */
function WrapRulesDemo() {
  const card = (w: number) => (
    <div style={{ width: w }} className="min-w-0 shrink-0 rounded-lg border bg-card p-3 shadow-paper">
      <div className="flex min-w-0 items-baseline gap-1.5"><span className="shrink-0 text-sm font-medium">禾木瑜伽</span><span className="truncate text-xs text-muted-foreground">瑜伽馆 · 3 家店 · 会员年卡礼</span></div>
      <MetaRow className="mt-2.5">
        <span className="num font-medium text-foreground">{wan(3.2)}</span>
        <span>跟进 <span className="font-medium text-danger">{relDay(addDays(todayStr(), -2))}</span></span>
        <span>来源 小红书</span>
      </MetaRow>
    </div>
  )
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div><div className="mb-1 text-[11px] text-muted-foreground">放在 200px 宽里：金额、跟进、来源整块换行</div>{card(200)}</div>
        <div><div className="mb-1 text-[11px] text-muted-foreground">放在 320px 宽里：一行放下</div>{card(320)}</div>
      </div>
    <Rules title="窄空间的换行规则" items={[
      <>数字和单位不拆行：金额、天数用 <Code>wan()</Code>、<Code>relDay()</Code>，它们自带不换行空格。</>,
      <>一行几个小信息放进 <Code>MetaRow</Code>：每项自己不换行，放不下整项掉到下一行，不超出卡片。</>,
      <>名字一行放不下用省略号，说明最多两三行；外层要有 <Code>min-w-0</Code>。称呼不缩，补充说明省略。</>,
      <>看板用 <Code>Board</Code> 包住各列：列最小 228px，放不下整块左右滑，不把列挤扁；列标题的数量合计窄了换到第二行。</>,
    ]} />
    </div>
  )
}
