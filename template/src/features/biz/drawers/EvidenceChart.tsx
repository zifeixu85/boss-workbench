// 异常抽屉里的证据图：每天的退款率 / ROI / 成交，标出异常线、从哪天开始、当时做了什么（编号 ①②③ 和下面运营记录时间线一致）；
// 库存是“过去 14 天实际（实线）+ 往后推（虚线）”，到货那天画竖线，断货那几天涂阴影。
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { AXIS, ChartNote, EmptyNote, GRID_STROKE, UnitTip } from '@/components/chart-kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { md, shortDate, weekday } from '@/lib/format'
import { channelColor, circled, dateTicks, moneyAxis, NEUTRAL, numAxis } from '../fmt'
import { Legend } from '../parts'
import type { Evidence } from '../types'

export function EvidenceChart({ ev, channel, opNo }: { ev: Evidence; channel: string | null; opNo: (opId: string | null) => number | null }) {
  if (!ev.series.length) return <EmptyNote>证据数据没取到：{ev.desc}</EmptyNote>
  const color = channelColor(channel ?? '')
  const stock = ev.shape === 'stock'
  const config = {
    value: { label: stock ? '实际库存' : ev.label, color },
    proj: { label: '往后推', color },
    base: { label: ev.base_label ?? '对比', color: NEUTRAL },
  } satisfies ChartConfig
  const data = ev.series.map((p) => ({ ...p, label: md(p.date) }))
  const labels = data.map((d) => d.label)
  const last = data.filter((d) => d.value !== null).at(-1)?.label
  const since = ev.since && data.some((d) => d.date === ev.since) ? md(ev.since) : null
  const unit = ev.unit === '元' ? ' 元' : ev.unit === '件' ? ' 件' : ev.unit
  const marks = ev.marks.filter((m) => data.some((d) => d.date === m.date))
  const max = Math.max(...data.flatMap((d) => [d.value ?? 0, d.proj ?? 0, d.base ?? 0]), ev.threshold ?? 0)
  const axis = ev.unit === '元' ? moneyAxis(max) : numAxis(max, 4, ev.unit === '%' ? '%' : '')
  // 参考线的字放在左边、避开左半边的线：左边的数在线上方就写在线下面
  const leftVals = data.slice(0, Math.ceil(data.length / 3)).map((d) => d.value).filter((v): v is number => v !== null)
  const leftAbove = ev.threshold !== null && leftVals.length > 0 && leftVals.reduce((a, v) => a + v, 0) / leftVals.length > ev.threshold
  return (
    <div>
      <div className="text-[13px] font-semibold">{ev.title}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{ev.desc}</p>
      <ChartContainer config={config} className="mt-3 aspect-auto h-[220px] w-full">
        <LineChart accessibilityLayer data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" {...AXIS} ticks={dateTicks(labels)} interval={0} />
          <YAxis {...AXIS} width={44} ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.fmt} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<UnitTip config={config} unit={unit} labelFormatter={(_, p) => { const r = p?.[0]?.payload as { date?: string } | undefined; return r?.date ? `${shortDate(r.date)} ${weekday(r.date)}` : '' }} />} />
          {since && last && <ReferenceArea x1={since} x2={last} fill="var(--danger)" fillOpacity={0.06} ifOverflow="extendDomain" />}
          {ev.bands.map((b) => <ReferenceArea key={b.from} x1={md(b.from)} x2={md(b.to)} fill="var(--danger)" fillOpacity={0.1} ifOverflow="extendDomain"
            label={{ value: b.label, position: 'insideTop', fill: 'var(--danger)', fontSize: 11, fontWeight: 600 }} />)}
          {ev.threshold !== null && <ReferenceLine y={ev.threshold} stroke="var(--danger)" strokeDasharray="5 4" strokeOpacity={0.8}
            label={{ value: ev.threshold_label ?? '', position: leftAbove ? 'insideBottomLeft' : 'insideTopLeft', fill: 'var(--danger)', fontSize: 11 }} />}
          {marks.map((m, i) => {
            const n = opNo(m.op_id)
            return <ReferenceLine key={`${m.date}-${i}`} x={md(m.date)} stroke={m.op_id ? 'var(--muted-foreground)' : color} strokeDasharray={m.op_id ? '2 3' : undefined} strokeWidth={m.op_id ? 1 : 1.5}
              label={{ value: n ? circled(n) : '到货', position: 'top', fill: m.op_id ? 'var(--muted-foreground)' : color, fontSize: 12, fontWeight: 600 }} />
          })}
          {ev.base_label && <Line dataKey="base" type="monotone" stroke="var(--color-base)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />}
          {stock && <Line dataKey="proj" type="linear" stroke="var(--color-proj)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />}
          <Line dataKey="value" type={stock ? 'linear' : 'monotone'} stroke="var(--color-value)" strokeWidth={2} connectNulls={false} dot={{ r: 2.5, fill: 'var(--color-value)', strokeWidth: 0 }} />
        </LineChart>
      </ChartContainer>
      <Legend className="mt-1.5" items={[
        { label: stock ? '实际库存' : ev.label, color },
        ...(stock ? [{ label: '往后推（估计）', color, dashed: true }] : []),
        ...(ev.base_label ? [{ label: ev.base_label, color: NEUTRAL, dashed: true }] : []),
        ...(since ? [{ label: `${since} 起`, color: 'var(--danger)', opacity: 0.25 }] : []),
        ...(ev.bands.length ? [{ label: ev.bands[0].label, color: 'var(--danger)', opacity: 0.3 }] : []),
      ]} />
      {marks.some((m) => !m.op_id) && <p className="mt-1.5 text-xs text-muted-foreground">实线竖线：{marks.filter((m) => !m.op_id).map((m) => `${md(m.date)} ${m.label}`).join('；')}；虚线竖线的编号对着下面“同一段时间的运营记录”。</p>}
      {ev.table && (
        <div className="mt-4 overflow-hidden rounded-lg border">
          <div className="border-b bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">{ev.table.title}</div>
          <Table containerClassName="overflow-x-auto">
            <TableHeader><TableRow className="hover:bg-transparent">{ev.table.columns.map((c, i) => <TableHead key={c} className={i ? 'text-right whitespace-nowrap' : 'pl-3'}>{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {ev.table.rows.map((r, i) => (
                <TableRow key={i}>{r.map((v, j) => <TableCell key={j} className={j ? 'num text-right whitespace-nowrap' : 'pl-3 whitespace-nowrap'}>{typeof v === 'number' ? v.toLocaleString('zh-CN') : v ?? '—'}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ChartNote>{ev.note}</ChartNote>
    </div>
  )
}
