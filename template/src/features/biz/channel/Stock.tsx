// 渠道页：库存提醒（这个渠道卖的货在仓库里还能卖几天），以及抖店云仓的“最晚哪天要约入仓”和入仓预约。
// 状态：告急（不到日报设置的天数、没有在途）红；7 天内 黄；颜色和文字一致。
import { AlertTriangle, Truck } from 'lucide-react'
import { Panel } from '@/components/page'
import { ChartNote, EmptyNote } from '@/components/chart-kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { daysFromToday, md, shortDate, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge } from '../parts'
import type { ChannelData, InventoryRow } from '../types'

const BAR: Record<string, string> = { 告急: 'bg-danger', '7 天内': 'bg-warn', 正常: 'bg-primary/60' }

/** 可售天数的小条：30 天为满格，颜色跟着状态走 */
function DaysBar({ days, level }: { days: number | null; level: string }) {
  if (days === null) return <span className="text-xs whitespace-nowrap text-muted-foreground">{level}</span>
  const pct = Math.min(100, (days / 30) * 100)
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', BAR[level] ?? 'bg-primary/60')} style={{ width: `${Math.max(4, pct)}%` }} /></span>
      <span className={cn('num w-12 text-right', level === '告急' && 'font-semibold text-danger')}>{days.toFixed(1)} 天</span>
    </span>
  )
}

export function InventoryPanel({ d, limit = 6 }: { d: ChannelData; limit?: number }) {
  const all = d.inventory.rows
  const rows: InventoryRow[] = all.slice(0, limit)
  const tight = all.filter((x) => x.level === '告急' || x.level === '7 天内')
  const wh = d.channel.warehouse_name ?? '仓库'
  const shared = d.inventory.shared_with.length ? ` · 和${d.inventory.shared_with.join('、')}共用` : ''
  return (
    <Panel title="哪个货快断了？" desc={`${wh}${shared}；只列${d.channel.name}这段时间卖过的，${tight.length ? `${tight.length} 款一周内会卖完` : all.some(x => x.days_left === null) ? '部分商品暂不能估算可售天数' : all.length ? '都够卖一周以上' : '暂无库存数据'}`} bodyClass="p-0">
      {rows.length ? (
        <Table containerClassName="overflow-x-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">商品</TableHead>
              <TableHead className="text-right">库存</TableHead>
              <TableHead className="text-right">在途</TableHead>
              <TableHead className="text-right whitespace-nowrap">每天卖（件）</TableHead>
              <TableHead>还能卖</TableHead>
              <TableHead className="pr-5 text-right">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.warehouse_id + x.sku_id} className={cn(x.level === '告急' && 'bg-danger-soft/30')}>
                <TableCell className="pl-5 font-medium whitespace-nowrap">{x.sku_name}</TableCell>
                <TableCell className="num text-right">{thousands(x.stock)}</TableCell>
                <TableCell className="num text-right text-muted-foreground">{x.in_transit ? thousands(x.in_transit) : '—'}</TableCell>
                <TableCell className="num text-right">{x.avg_daily === null ? '未知' : x.avg_daily.toFixed(1)}</TableCell>
                <TableCell><DaysBar days={x.days_left} level={x.level} /></TableCell>
                <TableCell className="pr-5 text-right"><BizBadge value={x.level} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : <div className="p-5"><EmptyNote>这个仓库还没有库存数据。</EmptyNote></div>}
      <div className="px-5 pb-4"><ChartNote>可售天数 = 库存 ÷ 近 7 天每天卖的件数（{wh}发货的渠道一起算）· 少于 7 天标黄，不到日报设置的天数又没有在途的标红 · 缺渠道或日期不按零销量算 · {all.length > limit ? `只列最紧的 ${limit} 款，共 ${all.length} 款` : `共 ${all.length} 款`}</ChartNote></div>
    </Panel>
  )
}

/** “11/8（还有 12 天）”“10/24 · 已过 3 天” */
function bookText(date: string) {
  const n = daysFromToday(date)
  return n < 0 ? `${md(date)} · 已过 ${-n} 天` : n === 0 ? `${md(date)}（今天）` : `${md(date)}（还有 ${n} 天）`
}

export function CloudPanel({ d }: { d: ChannelData }) {
  const c = d.extras.cloud
  if (!c) return null
  const late = c.stock.filter((x) => x.too_late)
  return (
    <Panel title="抖店云仓：什么时候该约入仓？" desc={`云仓入仓要提前 ${c.lead_days} 天约，今天约最早 ${shortDate(c.earliest)} 到。“最晚哪天约”= 卖完那天往前推 ${c.lead_days} 天`} className={cn(late.length && 'border-danger/30')} bodyClass="p-0">
      {late.length > 0 && (
        <div className="flex gap-2.5 border-b bg-danger-soft/40 px-5 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <span>{late.map((x) => `「${x.sku_name}」最晚 ${md(x.book_by)} 就该约，已经晚了；现在约，到货前会断货约 ${Math.max(1, c.lead_days - Math.floor(x.days_left ?? 0))} 天`).join('；')}。</span>
        </div>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:divide-x">
        <Table containerClassName="overflow-x-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">商品</TableHead>
              <TableHead className="whitespace-nowrap">最晚哪天约</TableHead>
              <TableHead>还能卖</TableHead>
              <TableHead className="pr-5 text-right whitespace-nowrap">云仓库存</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.stock.slice(0, 6).map((x) => (
              <TableRow key={x.sku_id} className={cn(x.too_late && 'bg-danger-soft/30')}>
                <TableCell className="pl-5 font-medium whitespace-nowrap">{x.sku_name}</TableCell>
                <TableCell className={cn('num whitespace-nowrap', x.too_late && 'font-semibold text-danger')}>{x.book_by ? bookText(x.book_by) : '—'}</TableCell>
                <TableCell><DaysBar days={x.days_left} level={x.level} /></TableCell>
                <TableCell className="num pr-5 text-right whitespace-nowrap">{thousands(x.stock)}{x.in_transit ? <span className="ml-1 text-xs text-muted-foreground">+{x.in_transit} 在途</span> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-5 py-4 lg:border-t-0">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><Truck className="size-4 text-primary" aria-hidden />入仓预约</div>
          <ol className="relative grid gap-2.5 border-l pl-4">
            {c.inbound.map((x) => (
              <li key={x.id} className="relative text-[13px]">
                <span aria-hidden className={cn('absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-card', x.status === '已入仓' ? 'bg-muted-foreground/50' : 'bg-info')} />
                <div className="flex flex-wrap items-center gap-x-2"><span className="num font-medium">{md(x.arrive_date)}</span><span>{x.sku_name} {x.qty} 件</span><BizBadge value={x.status} /></div>
                <div className="text-xs text-muted-foreground">{x.booked_at ? `${md(x.booked_at)} ${x.who ?? ''}约的` : '没记哪天约'}{x.note ? ` · ${x.note}` : ''}</div>
              </li>
            ))}
          </ol>
          {late.map((x) => {
            const mine = c.inbound.filter((i) => i.sku_id === x.sku_id)
            const done = mine.filter((i) => i.status === '已入仓')[0]
            const pending = mine.some((i) => i.status !== '已入仓')
            return <p key={x.sku_id} className="mt-3 text-xs text-danger">{x.sku_name}{done ? `最近一次是 ${md(done.arrive_date)} 入仓 ${done.qty} 件` : '没有入仓记录'}，{pending ? '下一批已约' : '之后没有这款的预约'}。</p>
          })}
        </div>
      </div>
      <div className="px-5 pb-4"><ChartNote>来源：库存表（每天 07:00 同步）、抖店云仓入仓预约记录（阿杰在后台约好后登记）</ChartNote></div>
    </Panel>
  )
}
