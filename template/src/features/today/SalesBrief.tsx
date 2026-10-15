// 老板早上最想看的第 1 件：各平台昨天卖得怎么样、哪里不对劲（数据来自经营模块 summary()）
import { Link } from 'react-router'
import type { Alert, SalesSummary } from '@/lib/types'
import { shortDate, thousands, weekday, yuan } from '@/lib/format'
import { Panel } from '@/components/page'
import { ChartNote, EmptyNote } from '@/components/chart-kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Delta, GoLink } from './parts'

const FLAG: Record<string, string> = { 退款: '退款率偏高', 推广: '推广 ROI 掉了一半', 库存: '有货快卖断了' }

export function SalesBrief({ sales, alerts }: { sales: SalesSummary | null; alerts: Alert[] }) {
  if (!sales) {
    return <Panel title="各平台昨天卖得怎么样"><EmptyNote>经营数据还没导进来。到“数据源”看看哪个平台的文件没到。</EmptyNote></Panel>
  }
  const t = sales.total
  const flags = (id: string) => alerts.filter((a) => a.module === 'biz' && a.channel_id === id)
  return (
    <Panel title="各平台昨天卖得怎么样" desc={`${shortDate(sales.date)} ${weekday(sales.date)} · ${sales.channels.length} 个渠道，大客户订单另算`} action={<GoLink to="/biz">经营汇总</GoLink>} bodyClass="p-0">
      <div className="grid grid-cols-[1.4fr_1fr_1fr] divide-x border-b">
        <div className="min-w-0 px-3.5 py-3 sm:px-5 sm:py-3.5">
          <div className="text-xs text-muted-foreground">合计成交</div>
          <div className="num mt-1 font-heading text-[20px] leading-none font-semibold sm:text-[24px]">{yuan(t.gmv)}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground"><span className="whitespace-nowrap">比前天 <Delta value={t.vs_prev} /></span><span className="whitespace-nowrap">比上周同日 <Delta value={t.vs_last_week} /></span></div>
        </div>
        <div className="min-w-0 px-3.5 py-3 sm:px-5 sm:py-3.5">
          <div className="text-xs text-muted-foreground">订单</div>
          <div className="num mt-1 font-heading text-[20px] leading-none font-semibold sm:text-[24px]">{thousands(t.orders)}<span className="ml-1 font-sans text-sm font-normal text-muted-foreground">单</span></div>
          <div className="mt-1.5 text-xs text-muted-foreground">客单价 <span className="num text-foreground">{t.orders && t.gmv !== null ? yuan(t.gmv / t.orders) : '—'}</span></div>
        </div>
        <div className="min-w-0 px-3.5 py-3 sm:px-5 sm:py-3.5">
          <div className="text-xs text-muted-foreground">退款率</div>
          <div className="num mt-1 font-heading text-[20px] leading-none font-semibold sm:text-[24px]">{t.refund_rate ?? '—'}<span className="ml-0.5 font-sans text-sm font-normal text-muted-foreground">%</span></div>
          <div className="mt-1.5 text-xs text-muted-foreground">推广 ROI <span className="num text-foreground">{t.roi === null ? '—' : t.roi.toFixed(1)}</span></div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4 sm:pl-5">渠道</TableHead>
            <TableHead className="text-right">成交额</TableHead>
            <TableHead className="hidden text-right sm:table-cell">比前天</TableHead>
            <TableHead className="text-right">退款率</TableHead>
            <TableHead className="pr-4 text-right sm:pr-5">ROI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.channels.map((c) => {
            const f = flags(c.id)
            const bad = (kind: string) => f.some((x) => x.kind === kind)
            return (
              <TableRow key={c.id}>
                <TableCell className="pl-4 sm:pl-5">
                  <Link to={`/channel/${c.id}`} className="font-medium hover:text-primary hover:underline">{c.name}</Link>
                  {f.length > 0 && <div className="text-[12px] font-medium text-danger">{f.map((x) => FLAG[x.kind] ?? x.kind).join('、')}</div>}
                </TableCell>
                <TableCell className="num text-right">{yuan(c.gmv)}<div className="text-[12px] sm:hidden"><Delta value={c.vs_prev} /></div></TableCell>
                <TableCell className="hidden text-right text-xs sm:table-cell"><Delta value={c.vs_prev} /></TableCell>
                <TableCell className={cn('num text-right', bad('退款') && 'font-semibold text-danger')}>{c.refund_rate === null ? '—' : `${c.refund_rate}%`}</TableCell>
                <TableCell className={cn('num pr-4 text-right sm:pr-5', bad('推广') && 'font-semibold text-danger')}>{c.roi === null ? '—' : c.roi.toFixed(1)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="px-5 pb-4"><ChartNote>{t.coverage.note && `${t.coverage.note} · `}截至 {shortDate(sales.date)} · 来源：各平台导出文件、门店日报（飞书多维表格），每天早上 8 点前导完</ChartNote></div>
    </Panel>
  )
}
