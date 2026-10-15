// 分渠道对比表：这段时间每个渠道的 12 个数并排比。每个数都能点开看是哪几天、哪次导入的。
// 一列一个单位（表头写单位）：成交额用万（1 位小数），日均、推广花费用元；百分比 1 位小数；没有推广写“—”。
import { Link } from 'react-router'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel } from '@/components/page'
import { ChartNote } from '@/components/chart-kit'
import { shortDate, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Delta, TraceNum } from '../parts'
import { p1, pct, roi1, wan1, yuanNum } from '../fmt'
import { withDays } from '../state'
import type { Board, Metric } from '../types'

export function ChannelTable({ b }: { b: Board }) {
  const flags = (id: string) => b.anomalies.active.filter((a) => a.channel_id === id && a.status !== '已处理')
  const q = (metric: Metric, channel?: string) => ({ metric, channel, from: b.from, to: b.to })
  const t = b.total
  const roiMin = b.config.roi_min
  const R = 'text-right whitespace-nowrap'
  return (
    <Panel title="各渠道放在一起比" desc={`近 ${b.days} 天（${shortDate(b.from)}—${shortDate(b.to)}）。“近 3 天 ROI”和异常规则看的是同一段日子，低于 ${roiMin} 标红`} bodyClass="p-0">
      <Table containerClassName="overflow-x-auto">
        <TableHeader>
          <TableRow className="bg-surface-2/60 hover:bg-surface-2/60">
            <TableHead className="min-w-[132px] pl-5">渠道</TableHead>
            <TableHead className={R}>成交额（万）</TableHead>
            <TableHead className={R}>占比</TableHead>
            {b.has_prev && <TableHead className={R}>比上一段</TableHead>}
            <TableHead className={R}>日均（元）</TableHead>
            <TableHead className={R}>订单</TableHead>
            <TableHead className={R}>访客</TableHead>
            <TableHead className={R}>转化率</TableHead>
            <TableHead className={R}>客单价（元）</TableHead>
            <TableHead className={R}>退款率</TableHead>
            <TableHead className={R}>推广花费（元）</TableHead>
            <TableHead className={R}>ROI</TableHead>
            <TableHead className={cn(R, 'pr-5')}>近 3 天 ROI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {b.table.map((r) => {
            const f = flags(r.id)
            const bad = (k: string) => f.some((x) => x.kind === k)
            const low3 = r.roi_last3 !== null && r.roi_last3 < roiMin
            return (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <Link to={withDays(`/channel/${r.id}`, b.days)} className="font-medium whitespace-nowrap hover:text-primary hover:underline">{r.name}</Link>
                  <div className="text-[12px] whitespace-nowrap text-muted-foreground">{f.length ? <span className="font-medium text-danger">{f.map((x) => x.short ?? x.kind).join('、')}</span> : r.owner}</div>
                </TableCell>
                <TableCell className={R} title={r.coverage.note || undefined}><TraceNum q={q('gmv', r.id)}>{wan1(r.gmv)}</TraceNum></TableCell>
                <TableCell className={cn(R, 'num text-muted-foreground')}>{r.share === null ? '—' : `${p1(r.share)}%`}</TableCell>
                {b.has_prev && <TableCell className={cn(R, 'text-xs')}><Delta value={r.vs_prev_period} /></TableCell>}
                <TableCell className={cn(R, 'num text-muted-foreground')}>{yuanNum(r.daily_gmv)}{r.daily_gmv_days < b.days && <div className="text-[12px]">按有数的 {r.daily_gmv_days} 天算</div>}</TableCell>
                <TableCell className={R}><TraceNum q={q('orders', r.id)}>{thousands(r.orders)}</TraceNum></TableCell>
                <TableCell className={R}><TraceNum q={q('visitors', r.id)}>{thousands(r.visitors)}</TraceNum></TableCell>
                <TableCell className={R}><TraceNum q={q('conv_rate', r.id)}>{pct(r.conv_rate)}</TraceNum></TableCell>
                <TableCell className={R}><TraceNum q={q('aov', r.id)}>{r.aov === null ? '—' : Math.round(r.aov)}</TraceNum></TableCell>
                <TableCell className={cn(R, bad('退款') && 'font-semibold text-danger')}><TraceNum q={q('refund_rate', r.id)}>{pct(r.refund_rate)}</TraceNum></TableCell>
                <TableCell className={R}>{r.ad_spend !== null ? <TraceNum q={q('ad_spend', r.id)}>{yuanNum(r.ad_spend)}</TraceNum> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className={R}>{r.roi === null ? <span className="text-muted-foreground">—</span> : <TraceNum q={q('roi', r.id)}>{roi1(r.roi)}</TraceNum>}</TableCell>
                <TableCell className={cn(R, 'pr-5')}>{r.roi_last3 === null ? <span className="text-muted-foreground">—</span>
                  : <TraceNum q={{ metric: 'roi', channel: r.id, from: b.stacked.at(-3)?.date ?? b.to, to: b.to }} className={cn(low3 && 'font-semibold text-danger')}>{roi1(r.roi_last3)}</TraceNum>}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter className="bg-surface-2/60">
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-5 font-medium">合计</TableCell>
            <TableCell className={cn(R, 'font-medium')}><TraceNum q={q('gmv')}>{wan1(t.gmv)}</TraceNum></TableCell>
            <TableCell className={cn(R, 'num text-muted-foreground')}>{t.gmv !== null && t.gmv > 0 ? '100%' : '—'}</TableCell>
            {b.has_prev && <TableCell className={cn(R, 'text-xs')}><Delta value={t.vs_prev_period} /></TableCell>}
            <TableCell className={cn(R, 'num text-muted-foreground')}>{yuanNum(t.daily_gmv)}{t.daily_gmv_days < b.days && <div className="text-[12px]">按有数的 {t.daily_gmv_days} 天算</div>}</TableCell>
            <TableCell className={R}><TraceNum q={q('orders')}>{thousands(t.orders)}</TraceNum></TableCell>
            <TableCell className={R}><TraceNum q={q('visitors')}>{thousands(t.visitors)}</TraceNum></TableCell>
            <TableCell className={R}><TraceNum q={q('conv_rate')}>{pct(t.conv_rate)}</TraceNum><div className="text-[12px] font-normal text-muted-foreground">只算线上</div></TableCell>
            <TableCell className={R}><TraceNum q={q('aov')}>{t.aov === null ? '—' : Math.round(t.aov)}</TraceNum></TableCell>
            <TableCell className={R}><TraceNum q={q('refund_rate')}>{pct(t.refund_rate)}</TraceNum></TableCell>
            <TableCell className={R}><TraceNum q={q('ad_spend')}>{yuanNum(t.ad_spend)}</TraceNum></TableCell>
            <TableCell className={R}><TraceNum q={q('roi')}>{roi1(t.roi)}</TraceNum></TableCell>
            <TableCell className={cn(R, 'pr-5 text-muted-foreground')}>—</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <div className="px-5 pb-4">
        <ChartNote>
          {t.coverage.note && `${t.coverage.note} · `}截至 {shortDate(b.to)} · “—”是没有数，0 才是真的 0 · 转化率线上平台是“下单的访客占几成”，门店是“进店的人里几成买了”，不放一起比 · 带下划线的数字点开能看到是哪几天、哪次导入的
          {!b.has_prev && ' · 9 月 27 日以前没有数据，选近 7 天或 14 天能和上一段比'}
          {b.prev_holiday_days > 0 && ` · 上一段（${shortDate(b.prev_from)}—${shortDate(b.prev_to)}）含国庆 ${b.prev_holiday_days} 天，偏高，“比上一段”会显得少`}
        </ChartNote>
      </div>
    </Panel>
  )
}
