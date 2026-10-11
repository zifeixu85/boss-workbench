// 5. 按钮与标签：Button 的样式和大小、StatusBadge 全部取值、Dot、快捷键
import { CalendarPlus, Download, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dot, StatusBadge, EVENT_COLORS } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Code, Example, Rules, Section, Sub } from '../parts'

const VARIANTS = [
  { v: 'default', label: '新建待办', icon: ListPlus, use: '主操作。每块区域最多一个' },
  { v: 'outline', label: '编辑', icon: Pencil, use: '次要操作：编辑、导出、筛选' },
  { v: 'secondary', label: '稍后再说', icon: null, use: '和主按钮并排的“另一个选择”' },
  { v: 'ghost', label: '取消', icon: null, use: '取消、关闭、工具栏里的图标按钮' },
  { v: 'destructive', label: '删除', icon: Trash2, use: '删除；点了一定要二次确认' },
  { v: 'link', label: '在知识库里打开', icon: null, use: '文字链接式的跳转' },
] as const

/** 状态词按业务分组，和 src/components/status.tsx 的对照表一致 */
const BADGES: { group: string; values: string[] }[] = [
  { group: '待办状态', values: ['待办', '进行中', '等别人', '完成', '取消'] },
  { group: '优先级', values: ['紧急', '重要', '普通'] },
  { group: '客户阶段', values: ['新线索', '需求确认', '方案中', '报价中', '待签约', '交付中', '售后', '待复购', '合作中', '维护中', '暂停', '流失', '大客户'] },
  { group: '商机', values: ['已签约', '没成'] },
  { group: '项目 / 里程碑', values: ['筹备', '进行中', '收尾', '已完成', '未开始', '完成', '延期'] },
  { group: '库存', values: ['告急', '偏紧', '正常', '待上线'] },
  { group: '小红书', values: ['已发布', '待发布', '草稿', '选题', '待定', '写作中', '待林总看', '已定稿'] },
  { group: '数据源', values: ['正常', '超时', '失败', '成功', '部分成功', 'AI 建议', '已确认', '未匹配'] },
  { group: '应收款', values: ['未到期', '7天内到期', '逾期', '部分收款', '已收清'] },
  { group: '风险', values: ['高', '中'] },
]

export function ButtonsSection() {
  return (
    <Section title="按钮与标签" desc="按钮用 shadcn 的 Button，样式只从下面 6 种里选；状态一律用 StatusBadge，颜色由状态词决定。">
      <Example title="按钮样式" tag="<Button variant=… />" desc="同一行里主按钮放最右（或最前），最多一个。"
        use="图标在文字前；只有图标的按钮必须写 aria-label。" avoid="不要自己给按钮配颜色；不要一行放两个主按钮。">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {VARIANTS.map((b) => (
            <li key={b.v} className="flex min-w-0 items-center gap-3">
              <Button variant={b.v} onClick={() => toast(`示例按钮：${b.label}`)}>{b.icon && <b.icon />}{b.label}</Button>
              <span className="min-w-0 text-xs leading-snug text-muted-foreground"><Code>{b.v}</Code><span className="block">{b.use}</span></span>
            </li>
          ))}
        </ul>
      </Example>

      <Example title="按钮大小" tag="size=…" desc="页头和弹窗底部用默认大小；表格行内、卡片里用 sm；只放图标用 icon / icon-sm。">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="lg"><Plus />lg 页面主操作</Button>
          <Button><CalendarPlus />default</Button>
          <Button size="sm" variant="outline"><Download />sm 行内</Button>
          <Button size="xs" variant="outline">xs 标签旁</Button>
          <Button size="icon" variant="outline" aria-label="新建"><Plus /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="编辑"><Pencil /></Button>
        </div>
      </Example>

      <Sub title="状态标签" desc="下面是对照表里的全部状态词。新词先加进 status.tsx，否则会显示成灰色。">
        <div className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-5 shadow-paper md:grid-cols-2">
          {BADGES.map((b) => (
            <div key={b.group} className="grid min-w-0 gap-1.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
              <span className="text-xs text-muted-foreground">{b.group}</span>
              <span className="flex flex-wrap gap-1">{b.values.map((v) => <StatusBadge key={v} value={v} />)}</span>
            </div>
          ))}
        </div>
      </Sub>

      <div className="grid gap-5 lg:grid-cols-3">
        <Example title="小圆点" tag="<Dot tone=… />" desc="列表里地方不够写标签时，圆点 + 文字。">
          <ul className="grid gap-1.5 text-[13px]">
            <li className="flex items-center gap-2"><Dot tone="danger" />逾期 12 天</li>
            <li className="flex items-center gap-2"><Dot tone="warn" />3 天后到期</li>
            <li className="flex items-center gap-2"><Dot tone="ok" />已收清</li>
            <li className="flex items-center gap-2"><Dot />没定日期</li>
          </ul>
        </Example>
        <Example title="日程类型色" tag="EVENT_COLORS" desc="日历和列表共用，同一类型同一颜色。">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(EVENT_COLORS).map(([k, c]) => (
              <span key={k} className="inline-flex h-6 items-center rounded-md border-l-[3px] px-2 text-xs font-medium" style={{ background: c.bg, borderColor: c.border, color: c.text }}>{k}</span>
            ))}
          </div>
        </Example>
        <Example title="快捷键提示" tag="<Kbd />" desc="按钮旁、菜单里提示快捷键。">
          <ul className="grid gap-1.5 text-[13px]">
            <li className="flex items-center justify-between">搜索<KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup></li>
            <li className="flex items-center justify-between">新建待办<Kbd>T</Kbd></li>
            <li className="flex items-center justify-between">保存正文<KbdGroup><Kbd>⌘</Kbd><Kbd>↵</Kbd></KbdGroup></li>
          </ul>
        </Example>
      </div>

      <Rules items={[
        '按钮上的字是动词：新建待办、记一笔跟进、登记回款。不要写“确定”“提交”。',
        '危险操作（删除、清空）用 destructive，并弹出 AlertDialog 二次确认。',
        <>标签只用 <Code>StatusBadge</Code>；不要用 shadcn 的 Badge 自己配色，否则同一个词在两处颜色不一样。</>,
        '颜色之外一定有文字。只有颜色没有字的小圆点，旁边要跟说明。',
      ]} />
    </Section>
  )
}
