// 2. 文字：标题字体 vs 正文字体，全站用到的几档字号
import { Markdown } from '@/components/markdown'
import { Code, Example, Rules, Section } from '../parts'
import { useIdentity } from '@/lib/identity'

const SIZES: { name: string; cls: string; sample: string; where: string }[] = [
  { name: '页面标题', cls: 'font-heading text-[26px] font-semibold', sample: '客户与跟进', where: 'PageHeader 的标题；文章标题' },
  { name: '大数字', cls: 'num font-heading text-[26px] font-semibold', sample: '25,559 元', where: 'Stat 指标卡的数值' },
  { name: '分节标题', cls: 'font-heading text-[18px] font-semibold', sample: '这周卖得怎么样', where: '正文里的 ## 小标题、本页的分节' },
  { name: '面板标题', cls: 'text-[15px] font-semibold', sample: '各平台昨天卖得怎么样？', where: 'Panel 的标题、抽屉里的分组名' },
  { name: '正文', cls: 'text-[14px]', sample: '客户说春节可能还要，11 月再聊。', where: '列表、表格、表单（body 默认 14px）' },
  { name: '小字', cls: 'text-[13px] text-muted-foreground', sample: '上次联系：10月16日 · 电话', where: '列表第二行、说明文字' },
  { name: '注释', cls: 'text-xs text-muted-foreground', sample: '截至 10月26日 · 来源：各平台导出文件', where: '图表下的截至日期和来源、眉题、提示' },
  { name: '标签字', cls: 'text-[11.5px] font-medium', sample: '已签约', where: 'StatusBadge、角标' },
]

const SAMPLE_MD = `## 卡在哪

- **春节礼盒**：包装报价还没回，10/30 定方案可能要往后推
- **新品上市**：视频号小店审核慢，要提前两天提交

> 正文行宽控制在 72 个字左右，行距放宽，读起来不累。`

export function TypeSection() {
  const { shop } = useIdentity()
  return (
    <Section title="文字" desc="只用系统黑体（苹方 / 微软雅黑），标题和正文靠字号、粗细区分；网页里不用宋体（10/10 定）。都不用联网下载字体。">
      <div className="grid gap-5 lg:grid-cols-2">
        <Example title="标题字体" tag="font-heading" desc="页面标题、文章标题、大数字。所有风格都是黑体（苹方 / 微软雅黑），靠字号和粗细拉开层次。"
          use="每屏只有少数几处：页面标题、指标数值、文章标题。" avoid="不要用在按钮、表格、长段正文里。">
          <div className="font-heading text-[30px] leading-tight font-semibold">{shop}</div>
          <div className="mt-1 font-heading text-[18px]">当前风格的标题字体 · 0123456789</div>
        </Example>
        <Example title="正文字体" tag="font-sans" desc="其余一切。数字要上下对齐的地方（表格、金额、日期）加 num 类，用等宽数字。"
          use="列表、表格、表单、说明。" avoid="不要引入网络字体，不要在同一页再加第三种字体。">
          <div className="text-[18px] font-semibold">苹方 / 微软雅黑</div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">不加 num</div><div className="w-24 text-right">111.1 万<br />88.8 万<br />1,204.5 万</div></div>
            <div><div className="text-xs text-muted-foreground">加 num（表格里用）</div><div className="num w-24 text-right">111.1 万<br />88.8 万<br />1,204.5 万</div></div>
          </div>
        </Example>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-paper">
        <div className="border-b px-5 pt-4 pb-3 text-[15px] font-semibold">字号一共这几档</div>
        <ul className="divide-y">
          {SIZES.map((s) => (
            <li key={s.name} className="grid gap-x-4 gap-y-1 px-5 py-3 md:grid-cols-[96px_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
              <span className="text-xs text-muted-foreground">{s.name}</span>
              <span className={`${s.cls} min-w-0 leading-snug`}>{s.sample}</span>
              <span className="min-w-0 text-xs leading-relaxed text-muted-foreground"><Code>{s.cls}</Code><span className="mt-0.5 block">{s.where}</span></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Example title="长文排版" tag="<Markdown />" desc="知识库文档、周报正文、客户背景都用同一个 Markdown 组件显示。">
          <Markdown source={SAMPLE_MD} className="max-w-[72ch] text-[15px] leading-[1.9]" />
        </Example>
        <Rules items={[
          '字号只用上面这几档，不要随手写 17px、19px。',
          '颜色只分三层：正文 text-foreground、次要 text-muted-foreground、强调 text-primary。',
          '中文和数字、英文之间留一个空格：“3 个客户”“周报 W41”。',
          '万元记的钱写“万”，保留 1 位小数（wan()）；按元记的经营、订单用 yuan()（一万以上自动写成“万”）；日期写“10月6日”（shortDate()）。',
          '空值写“—”或“暂无”，不要写 0；0 只表示真的是零。',
        ]} />
      </div>
    </Section>
  )
}
