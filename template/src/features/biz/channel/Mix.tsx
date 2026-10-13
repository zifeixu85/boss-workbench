// 渠道页：人从哪来（环形，旁边写占比和比上一段的变化）、哪个商品卖得好（前 5，带每天件数的小线）。
// 来源用这个渠道自己的颜色由深到浅（顺序固定，不按大小换色），不借别的渠道的颜色。
import { Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { ChartNote, EmptyNote, UnitTip } from '@/components/chart-kit'
import { Panel } from '@/components/page'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NBSP, shortDate, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Delta, Spark } from '../parts'
import { channelColor, p1, yuanNum } from '../fmt'
import type { ChannelData } from '../types'

const RAMP = [1, 0.74, 0.52, 0.34, 0.2]

const STORE_NOTE = '门店按宋姐日报里的来源分：路过进店、会员复购、朋友介绍、线上引流'

/** 来源的顺序固定（颜色跟着来源走，不按大小排名换色） */
const ORDER = ['直播', '短视频', '商城', '搜索', '推荐', '推广', '会员', '笔记', '店铺', '私域', '路过进店', '会员复购', '朋友介绍', '线上引流']
const rank = (s: string) => { const i = ORDER.indexOf(s); return i < 0 ? 99 : i }

export function TrafficPanel({ d, source }: { d: ChannelData; source: string }) {
  const rows = [...d.traffic].sort((a, b) => rank(a.source) - rank(b.source)).slice(0, 5)
  const total = rows.reduce((a, r) => a + r.visitors, 0)
  if (!rows.length) return <Panel title="人从哪来？"><EmptyNote>这段时间没有流量来源的数据。</EmptyNote></Panel>
  const color = channelColor(d.channel.id)
  const config = Object.fromEntries(rows.map((r, i) => [`s${i}`, { label: r.source, color }])) satisfies ChartConfig
  const hasPrev = d.has_prev && rows.some((r) => r.prev_share !== null)
  const data = rows.map((r, i) => ({ key: `s${i}`, value: r.visitors, fill: color, fillOpacity: RAMP[i] ?? 0.2 }))
  const top = [...rows].sort((a, b) => b.visitors - a.visitors)[0]
  const moved = [...rows].filter((r) => r.prev_share !== null && r.share !== null).sort((a, b) => Math.abs((b.share ?? 0) - (b.prev_share ?? 0)) - Math.abs((a.share ?? 0) - (a.prev_share ?? 0)))[0]
  const mv = moved && moved.prev_share ? Math.round(((moved.share ?? 0) - moved.prev_share) * 10) / 10 : null
  return (
    <Panel title={d.channel.id === 'store' ? '进店的人从哪来？' : '人从哪来？'} desc={`${top.source}占 ${p1(top.share ?? 0)}%${hasPrev && mv && Math.abs(mv) >= 2 ? `；${moved.source}比前 ${d.days} 天${mv > 0 ? '多' : '少'} ${p1(Math.abs(mv))} 个点` : ''}`} className="flex flex-col" bodyClass="flex flex-1 flex-col justify-between">
      <div className="grid items-center gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-[150px]">
          <ChartContainer config={config} className="aspect-square w-full">
            <PieChart>
              <ChartTooltip content={<UnitTip config={config} unit=" 人" nameKey="key" hideLabel />} />
              <Pie data={data} dataKey="value" nameKey="key" innerRadius="62%" outerRadius="100%" stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false} />
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="num text-[17px] leading-none font-semibold">{thousands(total)}</span>
            <span className="mt-1 text-[12px] text-muted-foreground">{d.channel.id === 'store' ? '进店人次' : '访客'}</span>
          </div>
        </div>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="pb-1 font-normal">来源</th><th className="pb-1 text-right font-normal">占比</th>{hasPrev && <th className="pb-1 text-right font-normal">比前 {d.days} 天</th>}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.source}>
                <td className="py-1"><span className="flex items-center gap-2 whitespace-nowrap"><span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color, opacity: RAMP[i] ?? 0.2 }} />{r.source}</span></td>
                <td className="num py-1 text-right">{p1(r.share ?? 0)}%</td>
                {hasPrev && <td className="py-1 text-right text-xs"><Delta value={r.prev_share !== null && r.share !== null && r.prev_share ? Math.round((r.share - r.prev_share) * 10) / 10 : null} suffix={`${NBSP}个点`} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ChartNote>{d.channel.id === 'store' ? `${STORE_NOTE} · ` : ''}截至 {shortDate(d.to)} · 来源：{source}</ChartNote>
    </Panel>
  )
}

export function ProductsPanel({ d, source }: { d: ChannelData; source: string }) {
  const rows = d.products
  const hot = rows.find((r) => (r.vs_prev ?? 0) >= 40)
  const hasPrev = d.has_prev && rows.some((r) => r.vs_prev !== null)
  return (
    <Panel title="哪几个商品卖得好？" desc={rows.length ? `前 5 个占这个渠道成交的 ${Math.round(rows.reduce((a, r) => a + (r.share ?? 0), 0))}%${hot && hasPrev ? `；${hot.name}比前 ${d.days} 天多卖了 ${Math.round(hot.vs_prev ?? 0)}%` : ''}` : undefined} bodyClass="p-0">
      {rows.length ? (
        <Table containerClassName="overflow-x-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 pl-5">#</TableHead>
              <TableHead>商品</TableHead>
              <TableHead className="text-right">件数</TableHead>
              <TableHead className="text-right whitespace-nowrap">成交额（元）</TableHead>
              <TableHead className="text-right">占比</TableHead>
              {hasPrev && <TableHead className="text-right">比前 {d.days} 天</TableHead>}
              <TableHead className="w-[112px] pr-5">每天件数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.sku_id} className={cn(hot?.sku_id === r.sku_id && 'bg-warn-soft/30')}>
                <TableCell className="num pl-5 text-muted-foreground">{i + 1}</TableCell>
                <TableCell><div className="font-medium">{r.name}</div><div className="text-[12px] text-muted-foreground">{r.category} · 零售价 {r.price} 元</div></TableCell>
                <TableCell className="num text-right">{thousands(r.units)}</TableCell>
                <TableCell className="num text-right">{yuanNum(r.gmv)}</TableCell>
                <TableCell className="num text-right text-muted-foreground">{p1(r.share ?? 0)}%</TableCell>
                {hasPrev && <TableCell className="text-right text-xs"><Delta value={r.vs_prev} /></TableCell>}
                <TableCell className="pr-5"><Spark values={r.spark} height={28} color={channelColor(d.channel.id)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : <div className="p-5"><EmptyNote>这段时间没有商品销售的数据。</EmptyNote></div>}
      <div className="px-5 pb-4"><ChartNote>按成交额排{hasPrev ? '' : ' · 9 月 27 日以前没有数据，选近 7 天或 14 天能和上一段比'} · 截至 {shortDate(d.to)} · 来源：{source}（商品表）</ChartNote></div>
    </Panel>
  )
}
