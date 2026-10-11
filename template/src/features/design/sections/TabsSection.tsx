// 4. Tab 与切换：ViewTabs（分段按钮）怎么用；SubTabs（下划线）只在简单导航出现
import { useState } from 'react'
import { CalendarDays, Columns3, LayoutGrid, List, Table2 } from 'lucide-react'
import { NavModeContext } from '@/app/nav-mode'
import { SubTabs } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Code, Example, Rules, Section } from '../parts'

type Look = 'table' | 'cards' | 'board'
type Span = 'month' | 'week' | 'day' | 'list'
type Range = '6' | '12'

export function TabsSection() {
  const [look, setLook] = useState<Look>('table')
  const [span, setSpan] = useState<Span>('month')
  const [range, setRange] = useState<Range>('6')
  const [status, setStatus] = useState('all')
  return (
    <Section title="Tab 与切换" desc="两种 Tab，分工不同：ViewTabs 换“看法”，SubTabs 换“子页面”（只在简单导航里出现）。">
      <div className="grid gap-5 lg:grid-cols-2">
        <Example title="视图切换：带图标和数量" tag="<ViewTabs />" desc="同一批数据换一种看法。数量是当前筛选下的条数。"
          use="表格 / 卡片 / 看板之间切换；选中的视图写进地址栏（?view=board），刷新不丢。" avoid="不要超过 4 个选项；不要用它跳到别的页面。">
          <ViewTabs value={look} onChange={setLook} items={[
            { value: 'table', label: '表格', icon: Table2, count: 15 },
            { value: 'cards', label: '卡片', icon: LayoutGrid, count: 15 },
            { value: 'board', label: '看板', icon: Columns3, count: 5 },
          ]} />
          <p className="mt-3 text-xs text-muted-foreground">现在选的是：{{ table: '表格', cards: '卡片', board: '看板' }[look]}</p>
        </Example>

        <Example title="视图切换：时间粒度" tag="<ViewTabs />" desc="日历、图表的时间范围也用它。文字越短越好。"
          use="月 / 周 / 日 / 列表；近 6 个月 / 近 12 个月。" avoid="不要把客户、负责人这类筛选做成 Tab，用下拉或搜索框（状态分类是例外，见下一个示例）。">
          <div className="flex flex-wrap items-center gap-3">
            <ViewTabs label="日历视图" value={span} onChange={setSpan} items={[
              { value: 'month', label: '月', icon: CalendarDays }, { value: 'week', label: '周' }, { value: 'day', label: '日' }, { value: 'list', label: '列表', icon: List },
            ]} />
            <ViewTabs label="时间范围" value={range} onChange={setRange} items={[{ value: '6', label: '近 6 个月' }, { value: '12', label: '近 12 个月' }]} />
          </div>
        </Example>
      </div>

      <Example title="例外：状态页签" tag="<ViewTabs />" desc="列表按状态分几类时，可以用页签做状态分类（带数量），一点就看到跟进中的。选中的写进地址栏（?status=deal）。"
        use="客户列表：全部 / 线索 / 方案报价 / 交付售后 / 待复购 / 老客户；应收款：逾期 / 7 天内到期…" avoid="状态超过 6 类（改用下拉）；拿它筛客户名、负责人。">
        <ViewTabs label="按状态" value={status} onChange={setStatus} items={[
          { value: 'all', label: '全部', count: 28 }, { value: 'lead', label: '线索', count: 6 }, { value: 'deal', label: '方案报价', count: 4 },
          { value: 'after', label: '交付售后', count: 3 }, { value: 'repeat', label: '待复购', count: 4 }, { value: 'keep', label: '老客户', count: 9 },
        ]} />
      </Example>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Example title="子页面：下划线 Tab" tag="<SubTabs />" desc="写在 PageHeader 里。只有“简单导航”会显示（这里强制按简单导航画出来给你看）。"
          use="一个模块有几个子页面（客户列表 / 商机看板），而侧栏又没有二级菜单时。" avoid="复杂、顶部导航里子页面已在菜单中，SubTabs 自动隐藏，不要另外再画一排。">
          <NavModeContext.Provider value="simple">
            <div className="-mt-4"><SubTabs items={[{ to: '/design', label: '组件规范（本页）', end: true }, { to: '/settings', label: '设置' }]} /></div>
          </NavModeContext.Provider>
          <p className="mt-3 text-xs text-muted-foreground">它是真链接：点“设置”会跳过去。地址变了，选中的那一项跟着变。</p>
        </Example>
        <Rules title="怎么选" items={[
          <>换的是<b>同一批数据的看法</b> → <Code>ViewTabs</Code>。</>,
          <>换的是<b>另一个页面</b>（地址不同） → 放进 <Code>nav.ts</Code> 的 children；简单导航下页面里用 <Code>SubTabs</Code>。</>,
          <>只有两个互斥选项、且是在<b>填表</b>（草稿 / 已定稿） → 也可以用 ViewTabs 的样子，但要写清 label。</>,
          '一页最多一排 Tab。需要两排时，说明页面该拆了。',
          <>例外：列表<b>按状态分类</b>时可以用 ViewTabs 做状态页签（全部 / 线索 / 方案报价…），一点就看到跟进中的；别的筛选条件仍然用下拉。</>,
          '手机上 Tab 放不下时，宁可减少选项，不要横向滚动的 Tab。',
        ]} />
      </div>
    </Section>
  )
}
