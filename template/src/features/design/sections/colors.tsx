// 颜色令牌：界面色、状态色、涨跌色、图表色。色块直接用令牌画，旁边的色值是当前风格下读出来的
import { Stat } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { Code, Example, Rules, Sub } from '../parts'
import { useTokenValue } from '../theme-tokens'

const SEMANTIC: { token: string; cls: string; use: string }[] = [
  { token: '--background', cls: 'bg-background', use: '页面底色' },
  { token: '--surface-2', cls: 'bg-surface-2', use: '第二层底：表头、看板列、分组标题' },
  { token: '--card', cls: 'bg-card', use: '卡片、抽屉、弹窗' },
  { token: '--foreground', cls: 'text-foreground', use: '正文文字' },
  { token: '--muted-foreground', cls: 'text-muted-foreground', use: '次要文字、说明、坐标轴' },
  { token: '--muted', cls: 'bg-muted', use: '弱底色：中性标签、代码、骨架屏' },
  { token: '--primary', cls: 'bg-primary', use: '主色：主按钮、选中、链接，每块最多一处大面积' },
  { token: '--accent', cls: 'bg-accent', use: '主色浅底：选中行、提示块' },
  { token: '--border', cls: 'border-border', use: '边框和分隔线，一律细线' },
  { token: '--sidebar', cls: 'bg-sidebar', use: '侧栏底色（墨蓝风格是深色侧栏）' },
]

function Swatch({ token, title, sub }: { token: string; title: string; sub?: string }) {
  const value = useTokenValue(token)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="size-10 shrink-0 rounded-lg border shadow-paper" style={{ background: `var(${token})` }} />
      <div className="min-w-0 text-[12.5px] leading-snug">
        <div className="font-medium">{title}</div>
        <div className="font-mono text-[12px] text-muted-foreground">{token} · {value || '—'}</div>
        {sub && <div className="text-[12px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}

export function SemanticColors() {
  return (
    <Sub title="界面色" desc="写类名时用右边的令牌名，例如 bg-card、text-muted-foreground、border-border。色值随风格变，示例显示的是当前风格。">
      <div className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 shadow-paper sm:grid-cols-2 xl:grid-cols-3">
        {SEMANTIC.map((s) => <Swatch key={s.token} token={s.token} title={s.cls} sub={s.use} />)}
      </div>
    </Sub>
  )
}

const STATUS: { tone: 'ok' | 'warn' | 'danger' | 'info'; name: string; mean: string; samples: string[] }[] = [
  { tone: 'ok', name: 'ok 好', mean: '完成了、收到了、签下了', samples: ['已签约', '已收清', '已发布'] },
  { tone: 'warn', name: 'warn 要注意', mean: '快到期、在等、还没定', samples: ['待签约', '7天内到期', '超时'] },
  { tone: 'danger', name: 'danger 有问题', mean: '逾期、风险高、紧急', samples: ['逾期', '紧急', '高'] },
  { tone: 'info', name: 'info 进行中', mean: '正在推进的中间状态', samples: ['进行中', '需求确认', '部分收款'] },
]

export function StatusColors() {
  return (
    <Sub title="状态色" desc="只表示状态。一个词在全站永远是同一个颜色，由 status.tsx 统一决定。">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS.map((s) => (
          <div key={s.tone} className="min-w-0 rounded-xl border bg-card p-4 shadow-paper">
            <div className="flex gap-2">
              <span aria-hidden className="h-9 flex-1 rounded-md" style={{ background: `var(--${s.tone})` }} />
              <span aria-hidden className="h-9 flex-1 rounded-md border" style={{ background: `var(--${s.tone}-soft)` }} />
            </div>
            <div className="mt-2.5 text-[13px] font-semibold">{s.name}</div>
            <p className="text-xs text-muted-foreground">{s.mean}</p>
            <div className="mt-2 flex flex-wrap gap-1">{s.samples.map((v) => <StatusBadge key={v} value={v} />)}</div>
          </div>
        ))}
      </div>
      <Rules items={[
        <>状态色<b>只表示状态</b>：不拿来当图表系列色，不拿来做装饰色块。</>,
        <>颜色之外<b>一定有文字</b>（标签里的字、图标旁的说明），色弱的人也能看懂。</>,
        <>新状态词先加到 <Code>src/components/status.tsx</Code> 的对照表里，再在页面里用 <Code>{'<StatusBadge value="…" />'}</Code>，不要在页面里自己配色。</>,
      ]} />
    </Sub>
  )
}

export function RiseFall() {
  return (
    <Example title="涨跌色：红涨绿跌" tag="text-rise / text-fall" desc="按中国习惯，红色表示涨、绿色表示跌。只说方向，不说好坏。"
      use="指标卡的环比、表格里的增减。好坏用文字说，比如“成本 ▲ 3 万，偏高”。"
      avoid="不要把“涨”当成“好”染绿；也不要拿状态色（ok / danger）表示涨跌。">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="昨天成交" value="2.6" unit="万" delta={-0.4} hint="比前天" />
        <Stat label="小红书店退款率" value="11.0" unit="%" delta={8.4} hint="比前两周" />
      </div>
    </Example>
  )
}

const CHART_NAMES = ['绿', '橙', '蓝', '玫', '橄榄']
const RAMP = [0.34, 0.5, 0.66, 0.83, 1] // 与 chart-kit 的 RampBar 一致

export function ChartPalette() {
  return (
    <Example title="图表色：5 色，固定顺序" tag="--chart-1 … --chart-5" desc="已用色盲模拟校验。第 1 个系列永远用 1 号色，第 2 个用 2 号色，不跳、不循环。"
      use="多个系列的折线、分组柱、堆叠柱、饼图。超过 5 个系列合并成“其他”，或拆成几张小图。"
      avoid="不要按大小排名上色（筛选后颜色会乱跳）；有先后的分组（账龄、漏斗阶段）不用 5 色，用同一色由浅到深。">
      <div className="grid grid-cols-5 gap-2">
        {CHART_NAMES.map((n, i) => (
          <div key={n} className="min-w-0 text-center">
            <span aria-hidden className="block h-10 rounded-md" style={{ background: `var(--chart-${i + 1})` }} />
            <span className="mt-1 block text-[12px] text-muted-foreground"><span className="num">{i + 1}</span> {n}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-muted-foreground">由浅到深（RampBar，用于账龄、漏斗）：</div>
      <div className="mt-1.5 flex gap-1">
        {RAMP.map((o) => <span key={o} aria-hidden className="h-4 flex-1 first:rounded-l-md last:rounded-r-md" style={{ background: 'var(--chart-1)', opacity: o }} />)}
      </div>
    </Example>
  )
}
