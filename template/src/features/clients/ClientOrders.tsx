// 订单与消费页签：四个数 + 一张图 + 订单表。口径：只算“已完成”、日期不晚于今天的订单；0 元的补发单、门店包间费不算。归属：大客户模块
// 第二轮：企业茶礼看“买过几次、平均每份”；“买得最多”按商品写（不写“日常”）；表里金额一律写元。
// 第三轮（产品评审 #13、数据评审 #18）：满 3 年的才按年画；不满一年的那几根（第一年、今年）浅色画、柱下注明“几月起 / 到今天”，不再看着像涨了 8 倍；
//   不满 3 年、单子多的（老茶客）看近 12 个月每月花多少（复购节奏）；单子少的（企业茶礼）看每次买了多少。纵轴零写“0”。
//   包间费照样列在表里，标“不算消费”。
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, ChartNote, EmptyNote, GRID_STROKE, LABEL_STYLE, UnitTip } from '@/components/chart-kit'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StickyTable } from '@/components/data-view'
import { StatusBadge } from '@/components/status'
import { daysFromToday, NBSP, shortDate, thousands, todayStr, wan, wanNum } from '@/lib/format'
import { yuanToWan } from '@/features/crm/parts'
import type { ClientProfile } from '@/features/crm/types'

const config = { wan: { label: '成交', color: 'var(--chart-1)' } } satisfies ChartConfig
const yuanText = (n: number | null | undefined) => (n == null ? '—' : `${thousands(n)}${NBSP}元`)
const tickWan = (v: number) => (v === 0 ? '0' : `${wanNum(v)}万`)

function Box({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[11.5px] whitespace-nowrap text-muted-foreground">{label}</div>
      <div className="num mt-0.5 font-heading text-lg leading-tight font-semibold whitespace-nowrap">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  )
}

type Row = { label: string; wan: number; sub: string; light?: boolean }

export function ClientOrders({ d }: { d: ClientProfile }) {
  if (!d.orders.length) return <EmptyNote>还没有订单。{d.deals.some((x) => !['已签约', '没成'].includes(x.stage)) ? '在谈的单签下来后在这里记，累计消费会自动算。' : '签单后在这里记一笔，累计消费会自动算。'}</EmptyNote>
  const s = d.stats
  const t = todayStr()
  const done = d.orders.filter((o) => o.status === '已完成' && o.amount > 0 && o.date <= t && !o.room_fee)
  const gift = d.client.segment === '企业茶礼' || (s.units > 0 && s.units >= done.reduce((a, o) => a + o.qty, 0) * 0.8)
  const pending = d.orders.filter((o) => o.status === '进行中')
  const lastAgo = s.last_order ? -daysFromToday(s.last_order) : null
  const top = s.by_item[0]
  const occasions = [...new Set(done.map((o) => o.occasion).filter(Boolean))] as string[]

  // 画什么：满 3 年按年；不满 3 年、单子多（老茶客）看近 12 个月每月；单子少（企业茶礼）看每一次
  const mode: 'year' | 'each' | 'month' = s.by_year.length >= 3 ? 'year' : done.length <= 8 ? 'each' : 'month'
  const rows: Row[] = mode === 'year'
    ? s.by_year.map((y) => ({
      label: y.partial === 'now' ? `${y.year}（到今天）` : y.partial === 'first' ? `${y.year}（${y.from_month} 月起）` : y.year,
      wan: yuanToWan(y.amount), sub: `${y.orders} 单`, light: !!y.partial,
    }))
    : mode === 'each'
      ? [...s.each].reverse().map((o) => ({ label: `${shortDate(o.date)}${o.occasion ? ` ${o.occasion}` : ''}`, wan: yuanToWan(o.amount), sub: `${thousands(o.qty)}${o.unit}${o.unit_price ? ` × ${thousands(o.unit_price)}` : ''}` }))
      : s.by_month.map((m) => ({ label: `${Number(m.month.slice(5, 7))}月`, wan: yuanToWan(m.amount), sub: `${m.orders} 单`, light: m.month === t.slice(0, 7) }))
  const title = mode === 'year' ? '每年在我们这儿花了多少？' : mode === 'each' ? '每次节点买了多少？' : '近 12 个月，每个月花了多少？'
  const full = rows.filter((r) => !r.light)
  const say = mode === 'each'
    ? rows.map((r) => `${r.label} ${r.sub}，${wan(r.wan)}`).join('；')
    : mode === 'year'
      ? `整年的：${full.map((r) => `${r.label} ${wan(r.wan)}`).join('、') || '还没有'}${rows.some((r) => r.light) ? '；浅色是不满一年的' : ''}`
      : `有 ${rows.filter((r) => r.wan > 0).length} 个月来买过，一个月最多 ${wan(Math.max(...rows.map((r) => r.wan)))}`

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="累计" value={wan(yuanToWan(s.total_spent))} sub={s.first_order ? `${shortDate(s.first_order)}起 · ${s.order_count} 单${s.room_fees ? ' · 包间费另算' : ''}` : undefined} />
        {gift
          ? <Box label="买过几次" value={`${s.order_count}${NBSP}次`} sub={occasions.length ? occasions.join('、') : undefined} />
          : <Box label={`${t.slice(0, 4)} 年`} value={s.spent_year ? wan(yuanToWan(s.spent_year)) : '—'} sub={`近 12 个月 ${wan(yuanToWan(s.spent_12m))}`} />}
        {gift && s.units
          ? <Box label="平均每份" value={yuanText(Math.round(s.total_spent / s.units))} sub={`一共 ${thousands(s.units)} 份`} />
          : <Box label="平均一单" value={yuanText(s.avg_order)} sub={top ? `买得最多：${top.item}（${top.times} 次 · ${thousands(top.qty)}${top.unit}）` : undefined} />}
        <Box label="上次下单" value={lastAgo === null ? '—' : lastAgo === 0 ? '今天' : `${lastAgo}${NBSP}天前`} sub={s.last_order ? `${shortDate(s.last_order)}${pending.length ? ` · 还有 ${pending.length} 单在做` : ''}` : pending.length ? `${pending.length} 单在做，做完才算` : undefined} />
      </div>
      {rows.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{say}</p>
          {mode === 'each' ? (
            <ChartContainer config={config} className="mt-2 aspect-auto w-full" style={{ height: Math.max(90, rows.length * 44 + 16) }}>
              <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" {...AXIS} width={112} tick={{ fontSize: 12 }} />
                <ChartTooltip cursor={CURSOR} content={<UnitTip config={config} unit=" 万" />} />
                <Bar dataKey="wan" fill="var(--color-wan)" radius={[0, 4, 4, 0]} barSize={22}>
                  <LabelList dataKey="wan" position="right" style={LABEL_STYLE} formatter={(v: unknown) => `${wanNum(Number(v))}${NBSP}万`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartContainer config={config} className="mt-2 aspect-auto h-[200px] w-full">
              <BarChart accessibilityLayer data={rows} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" {...AXIS} interval={0} tick={{ fontSize: mode === 'month' ? 11 : 12 }} />
                <YAxis {...AXIS} width={44} tickFormatter={tickWan} />
                <ChartTooltip cursor={CURSOR} content={<UnitTip config={config} unit=" 万" />} />
                <Bar dataKey="wan" fill="var(--color-wan)" radius={[4, 4, 0, 0]} barSize={mode === 'month' ? 18 : 32}>
                  {rows.map((r) => <Cell key={r.label} fill="var(--color-wan)" fillOpacity={r.light ? 0.4 : 1} />)}
                  {mode === 'year' && <LabelList dataKey="wan" position="top" style={LABEL_STYLE} formatter={(v: unknown) => `${wanNum(Number(v))}${NBSP}万`} />}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
          <ChartNote>
            截至 {shortDate(t)} · 只算已经完成的单{s.room_fees ? '，包间费不算' : ''}
            {mode === 'year' && rows.some((r) => r.light) ? '；浅色的柱子不满一年（第一年从几月开始、今年还没过完），别和整年比' : ''}
            {mode === 'month' ? '；浅色是这个月（还没过完）' : ''}
          </ChartNote>
        </section>
      )}
      <StickyTable maxHeight="420px">
        <TableHeader><TableRow className="bg-surface-2/60 hover:bg-surface-2/60">
          <TableHead className="pl-4">日期</TableHead><TableHead>场合</TableHead><TableHead>买了什么</TableHead>
          <TableHead className="text-right">数量</TableHead><TableHead className="text-right">单价</TableHead><TableHead className="text-right">金额</TableHead><TableHead className="pr-4">状态</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {d.orders.map((o) => (
            <TableRow key={o.id} className={o.room_fee ? 'text-muted-foreground' : undefined}>
              <TableCell className="num pl-4 whitespace-nowrap">{shortDate(o.date)}</TableCell>
              <TableCell>{o.occasion ? <StatusBadge value={o.occasion} tone="neutral" /> : '—'}</TableCell>
              <TableCell className="max-w-[240px]"><div className="truncate">{o.item}</div>{(o.note || o.room_fee) && <div className="truncate text-xs text-muted-foreground">{o.room_fee ? `包间费，不算消费${o.note ? ` · ${o.note}` : ''}` : o.note}</div>}</TableCell>
              <TableCell className="num text-right whitespace-nowrap">{thousands(o.qty)} {o.unit}</TableCell>
              <TableCell className="num text-right whitespace-nowrap">{yuanText(o.unit_price)}</TableCell>
              <TableCell className="num text-right font-medium whitespace-nowrap">{o.amount ? yuanText(o.amount) : '不收钱'}</TableCell>
              <TableCell className="pr-4"><StatusBadge value={o.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </StickyTable>
    </div>
  )
}
