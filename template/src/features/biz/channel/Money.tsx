// 渠道页：为什么退款（横向条 + 发货批次）、推广花得值不值（花费柱 + ROI 线，ROI 画参考线）、推广计划列表（出价改过的标出来）。
// 颜色：花费用这个渠道自己的颜色；ROI 线、退款原因这类第二个量用中性色。推广的前后对比和异常、早报是同一段日子（之前两周 → 近 3 天）。
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { PackageX } from 'lucide-react'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, CURSOR, ChartNote, EmptyNote, GRID_STROKE, LABEL_STYLE, UnitTip } from '@/components/chart-kit'
import { Panel } from '@/components/page'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { md, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { channelColor, dateTicks, fmtMetric, moneyAxis, NEUTRAL, numAxis, PLATFORM_TOOL, roi1, yuanNum, yuanText, dayLabel } from '../fmt'
import { Spark, TraceNum } from '../parts'
import type { Campaign, ChannelData } from '../types'

const refundConfig = { orders: { label: '退款单数', color: NEUTRAL } } satisfies ChartConfig

export function RefundsPanel({ d, source }: { d: ChannelData; source: string }) {
  const rows = d.refunds.reasons.map((r) => ({ ...r, tag: `${r.orders} 单 · ${yuanNum(r.amount)} 元` }))
  const total = rows.reduce((a, r) => a + r.orders, 0)
  const amount = rows.reduce((a, r) => a + r.amount, 0)
  const top = rows[0]
  return (
    <Panel title="为什么退款？" desc={total ? <>近 {d.days} 天退了 {total} 单、{yuanText(amount)}，退款率 <TraceNum q={{ metric: 'refund_rate', channel: d.channel.id, from: d.from, to: d.to }}>{fmtMetric('refund_rate', d.range.refund_rate)}</TraceNum>；最多的是“{top.reason}”</> : `近 ${d.days} 天没有退款`} className="flex flex-col" bodyClass="flex flex-1 flex-col">
      {rows.length ? (
        <ChartContainer config={refundConfig} className="aspect-auto w-full" style={{ height: Math.max(120, rows.length * 34) }}>
          <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ top: 0, right: 112, left: 0, bottom: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="reason" {...AXIS} width={76} />
            <ChartTooltip cursor={CURSOR} content={<UnitTip config={refundConfig} unit=" 单" />} />
            <Bar dataKey="orders" fill="var(--color-orders)" fillOpacity={0.55} radius={[0, 4, 4, 0]} maxBarSize={18}>
              <LabelList dataKey="tag" position="right" offset={8} {...LABEL_STYLE} fontSize={12} className="whitespace-nowrap" />
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : <EmptyNote>这段时间一单退款都没有。</EmptyNote>}
      {d.refunds.batches.map((b) => (
        <div key={b.batch + b.reason} className="mt-3 flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2.5 text-[13px]">
          <PackageX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <span>“{b.reason}”里有 <b className="num">{b.orders}</b> 单是 {b.batch.replace(' 发货', '')} 发货的<b>{b.sku ?? '同一款'}</b>，退了 <span className="num">{yuanText(b.amount)}</span>。</span>
        </div>
      ))}
      <ChartNote>退款按退款发生的那天算 · 截至 {shortDate(d.to)} · 来源：{source}（售后表）</ChartNote>
    </Panel>
  )
}

export function AdsPanel({ d, source, compact }: { d: ChannelData; source: string; compact?: boolean }) {
  const data = d.daily.map((x) => ({ ...x, label: md(x.date) }))
  const roiLine = d.roi_line
  const spendConfig = { ad_spend: { label: '推广花费', color: channelColor(d.channel.id) } } satisfies ChartConfig
  const roiConfig = { roi: { label: '推广 ROI', color: NEUTRAL } } satisfies ChartConfig
  const tool = PLATFORM_TOOL[d.channel.id] ?? '推广'
  const below = data.filter((x) => x.roi !== null && x.roi < roiLine).length
  const q = (metric: 'ad_spend' | 'roi') => ({ metric, channel: d.channel.id, from: d.from, to: d.to })
  const sAxis = moneyAxis(Math.max(...data.map((x) => x.ad_spend ?? 0)))
  const rAxis = numAxis(Math.max(4, ...data.map((x) => x.roi ?? 0)))
  const ticks = dateTicks(data.map((x) => x.label))
  const s = d.ads_shift
  return (
    <Panel title="推广花得值不值？" desc={<>{tool}近 {d.days} 天花了 <TraceNum q={q('ad_spend')}>{yuanText(d.range.ad_spend)}</TraceNum>，带来 {yuanText(d.range.ad_gmv)} 成交，ROI <TraceNum q={q('roi')}>{roi1(d.range.roi)}</TraceNum>{below ? `；有 ${below} 天低于 ${roiLine}` : `；每天都在 ${roiLine} 以上`}</>}>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5 text-[12.5px]">
          {[[s.base_label, s.base], [s.now_label, s.now]].map(([label, x]) => {
            const w = x as typeof s.base
            return (
              <div key={label as string} className="min-w-0">
                <div className="text-[12px] text-muted-foreground">{label as string}</div>
                <div className="num mt-0.5 whitespace-nowrap">每天 {yuanNum(w.per_day)} 元 · ROI <b className={cn(w.roi !== null && w.roi < roiLine && 'text-danger')}>{roi1(w.roi)}</b></div>
              </div>
            )
          })}
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">每天花了多少（{sAxis.unit}）</div>
          <ChartContainer config={spendConfig} className="mt-1 aspect-auto h-[190px] w-full">
            <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" {...AXIS} ticks={ticks} interval={0} />
              <YAxis {...AXIS} width={44} ticks={sAxis.ticks} domain={sAxis.domain} tickFormatter={sAxis.fmt} />
              <ChartTooltip cursor={CURSOR} content={<UnitTip config={spendConfig} unit=" 元" labelFormatter={dayLabel} />} />
              <Bar dataKey="ad_spend" fill="var(--color-ad_spend)" radius={[4, 4, 0, 0]} maxBarSize={d.days > 14 ? 14 : 22} />
            </BarChart>
          </ChartContainer>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">每天的 ROI（推广成交 ÷ 花费）</div>
          <ChartContainer config={roiConfig} className="mt-1 aspect-auto h-[190px] w-full">
            <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" {...AXIS} ticks={ticks} interval={0} />
              <YAxis {...AXIS} width={28} ticks={rAxis.ticks} domain={rAxis.domain} tickFormatter={rAxis.fmt} />
              <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={roiConfig} unit="" labelFormatter={dayLabel} />} />
              <ReferenceLine y={roiLine} stroke="var(--danger)" strokeDasharray="5 4" strokeOpacity={0.75}
                label={{ value: `参考线 ${roiLine}`, position: 'insideBottomLeft', fill: 'var(--danger)', fontSize: 12 }} />
              <Line dataKey="roi" type="monotone" stroke="var(--color-roi)" strokeWidth={2} connectNulls={false} dot={{ r: 2, fill: 'var(--color-roi)', strokeWidth: 0 }} />
            </LineChart>
          </ChartContainer>
        </div>
      </div>
      {compact && d.campaigns.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="bg-surface-2/60 text-[12px] text-muted-foreground">
              <tr><th className="px-3 py-1.5 text-left font-normal">推广计划</th><th className="px-2 text-right font-normal">出价（元）</th><th className="px-2 text-right font-normal">近 3 天每天花（元）</th><th className="px-3 text-right font-normal">近 3 天 ROI</th></tr>
            </thead>
            <tbody>
              {d.campaigns.map((c) => <CompactRow key={c.campaign} c={c} roiLine={roiLine} />)}
            </tbody>
          </table>
        </div>
      )}
      <ChartNote>ROI 是平台自己算的推广成交 ÷ 推广花费，只和自己的平常比 · 截至 {shortDate(d.to)} · 来源：{source}（{tool}后台）</ChartNote>
    </Panel>
  )
}

function CompactRow({ c, roiLine }: { c: Campaign; roiLine: number }) {
  const r3 = c.shift?.now.roi ?? null
  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-medium">{c.campaign}{c.bid_changed && <span className="ml-1.5 text-[12px] whitespace-nowrap text-danger">{md(c.bid_changed.at)} 改过出价</span>}</td>
      <td className="num px-2 text-right">{c.bid?.toFixed(2) ?? '—'}</td>
      <td className="num px-2 text-right">{yuanNum(c.shift?.now.per_day)}</td>
      <td className={cn('num px-3 text-right', r3 !== null && r3 < roiLine && 'font-semibold text-danger')}>{roi1(r3)}</td>
    </tr>
  )
}

/** 天猫：推广计划表。改过出价的那行标红；“之前两周 → 近 3 天”和异常、早报是同一组数 */
export function CampaignTable({ d }: { d: ChannelData }) {
  const rows = d.campaigns
  const changed = rows.find((c) => c.bid_changed)
  if (!rows.length) return null
  const roiLine = d.roi_line
  const s = d.ads_shift
  const R = 'text-right whitespace-nowrap'
  return (
    <Panel title={`推广计划：${rows.length} 个`} className={cn(changed && 'border-danger/30')}
      desc={changed?.bid_changed && changed.shift
        ? `「${changed.campaign}」${md(changed.bid_changed.at)} ${changed.bid_changed.at.slice(11, 16)} ${changed.bid_changed.who}把出价从 ${changed.bid_changed.from.toFixed(2)} 调到 ${changed.bid_changed.to.toFixed(2)}；${s?.base_label}每天花 ${yuanNum(changed.shift.base.per_day)} 元、ROI ${roi1(changed.shift.base.roi)}，${s?.now_label}每天花 ${yuanNum(changed.shift.now.per_day)} 元、ROI ${roi1(changed.shift.now.roi)}`
        : '这段时间出价都没动过'} bodyClass="p-0">
      <Table containerClassName="overflow-x-auto">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">计划</TableHead>
            <TableHead className={R}>出价（元）</TableHead>
            <TableHead className={R}>每天花（元）<div className="text-[12px] font-normal">之前两周 → 近 3 天</div></TableHead>
            <TableHead className={R}>每次点击实际花费（元）<div className="text-[12px] font-normal">之前两周 → 近 3 天</div></TableHead>
            <TableHead className={R}>ROI<div className="text-[12px] font-normal">近 {d.days} 天</div></TableHead>
            <TableHead className={R}>近 3 天 ROI</TableHead>
            <TableHead className={R}>近 {d.days} 天花费（元）</TableHead>
            <TableHead className="w-[112px] pr-5">每天 ROI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const r3 = c.shift?.now.roi ?? null
            return (
              <TableRow key={c.campaign} className={cn(c.bid_changed && 'bg-danger-soft/30 hover:bg-danger-soft/40')}>
                <TableCell className="pl-5">
                  <div className="font-medium whitespace-nowrap">{c.campaign}</div>
                  {c.bid_changed && <div className="text-[12px] font-medium whitespace-nowrap text-danger">{md(c.bid_changed.at)} {c.bid_changed.at.slice(11, 16)} {c.bid_changed.who}改出价</div>}
                </TableCell>
                <TableCell className={cn(R, 'num')}>{c.bid_changed ? <span className="font-semibold text-danger">{c.bid_changed.from.toFixed(2)} → {c.bid_changed.to.toFixed(2)}</span> : (c.bid?.toFixed(2) ?? '—')}</TableCell>
                <TableCell className={cn(R, 'num')}>{c.shift ? `${yuanNum(c.shift.base.per_day)} → ${yuanNum(c.shift.now.per_day)}` : '—'}</TableCell>
                <TableCell className={cn(R, 'num text-muted-foreground')}>{c.shift ? `${c.shift.base.cpc?.toFixed(2) ?? '—'} → ${c.shift.now.cpc?.toFixed(2) ?? '—'}` : '—'}</TableCell>
                <TableCell className={cn(R, 'num')}>{roi1(c.roi)}</TableCell>
                <TableCell className={cn(R, 'num', r3 !== null && r3 < roiLine && 'font-semibold text-danger')}>{roi1(r3)}</TableCell>
                <TableCell className={cn(R, 'num text-muted-foreground')}>{yuanNum(c.spend)}</TableCell>
                <TableCell className="pr-5"><Spark values={c.spark} height={28} color={channelColor(d.channel.id)} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="px-5 pb-4"><ChartNote>出价是平台里设置的值（改动对着运营记录看）；每次点击实际花费 = 花费 ÷ 点击，一般比出价低 · 近 3 天 ROI 低于 {roiLine} 标红 · 工作台只看不改，出价在平台后台由负责人调</ChartNote></div>
    </Panel>
  )
}
