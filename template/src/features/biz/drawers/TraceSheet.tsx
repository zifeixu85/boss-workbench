// “这个数是怎么来的”（右侧抽屉）：怎么算、哪几个渠道、每天的原始数、来自哪几次导入。任何一个经营数字点开都是它。
// 标题和点开它的卡片写法一样（25,559 元）；单一的数（成交额、订单……）不重复列“原始数”和“结果”两列；比率才写“先加总再相除”。
import { Calculator, FileSpreadsheet } from 'lucide-react'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApi } from '@/lib/api'
import { addDays, md, shortDate, thousands, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge } from '../parts'
import { bigNumber, fmtMetric, hhmm, pct, roi1 } from '../fmt'
import { BizError } from '../errors'
import { useBizOverlay, type TraceQuery } from '../state'
import type { Metric, Trace } from '../types'

const INPUT_STATE: Record<string,string> = {provided:'本次表格提供（0 为已知值）',derived:'按口径计算',empty:'空单元格，未知',absent:'缺列，未知',kept_empty:'空单元格，沿用旧值',kept_absent:'缺列，沿用旧值'}
const RAW_LABEL: Record<string,string> = {gmv:'成交额',orders:'订单数',visitors:'访客数',refund_amount:'退款金额',refund_orders:'退款单数',ad_spend:'推广花费',ad_gmv:'推广成交额',new_buyers:'新客数',old_buyers:'老客数'}
const MONEY = ['gmv', 'refund_amount', 'ad_spend', 'ad_gmv']
const partFmt = (key: string, v: number | null | undefined) => (v == null ? '—' : MONEY.includes(key) ? Math.round(v).toLocaleString('zh-CN') : thousands(v))
/** 表格里一格：比率按指标的写法，金额人数写千分位 */
const cell = (metric: string, v: number) => (metric === 'roi' ? roi1(v) : metric === 'conv_rate' || metric === 'refund_rate' ? pct(v) : Math.round(v).toLocaleString('zh-CN'))
/** 标题：和指标卡的大数字一样（25,559 元） */
const headline = (metric: Metric, v: number | null) => { const n = bigNumber(metric, v); return `${n.value}${n.unit ? (n.unit === '%' ? '%' : ` ${n.unit}`) : ''}` }

export function TraceSheet({ q, onClose }: { q: TraceQuery; onClose: () => void }) {
  const ov = useBizOverlay()
  const url = `/biz/trace?metric=${q.metric}${q.channel ? `&channel=${q.channel}` : ''}&from=${q.from}&to=${q.to}`
  const { data: t, isError, error, refetch } = useApi<Trace>(url)
  const one = q.from === q.to
  const range = one ? `${shortDate(q.from)} ${weekday(q.from)}` : `${md(q.from)}—${md(q.to)}`
  const multi = (t?.channels.length ?? 0) > 1
  const presets: [string, string][] = [['当天', q.to], ['近 7 天', addDays(q.to, -6)], ['近 30 天', addDays(q.to, -29)]]
  const preset = presets.some(([, from]) => from === q.from)
  // 只有一个原始数、而且就是这个指标本身（成交额、订单、访客、推广花费）：表里不再单列“结果”
  const single = !!t && !t.ratio && t.parts.length === 1 && t.parts[0].key === t.metric
  return (
    <DetailSheet wide open onClose={onClose} eyebrow="这个数是怎么来的" title={isError ? '这个数没算出来' : t ? `${t.label} ${headline(t.metric, t.total.value)}` : undefined}
      meta={t && <>
        <span>{range}{one ? '' : `（${t.days} 天）`}</span>
        <span>· {t.channels.length === 1 ? t.channels[0].name : `${t.channels.length} 个渠道合计`}</span>
        {t.excluded && <span>· 不含{t.excluded}</span>}
      </>}
      actions={<div className="flex flex-wrap items-center gap-1.5">
        {presets.map(([label, from]) => (
          <button key={label} type="button" onClick={() => ov.openTrace({ ...q, from })}
            className={cn('rounded-md border px-2.5 py-1 text-xs outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring', q.from === from && 'border-primary bg-accent text-accent-foreground')}>{label}</button>
        ))}
        {!preset && <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">{md(q.from)}—{md(q.to)}</span>}
      </div>}>
      {isError ? <BizError error={error} onRetry={() => refetch()} /> : !t ? <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-40" /><Skeleton className="h-32" /></div> : (
        <>
          <SheetSection title="怎么算">
            <div className="flex gap-3 rounded-lg bg-surface-2/70 px-4 py-3">
              <Calculator className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="text-[13.5px] leading-relaxed">
                <div className="font-medium">{t.label} = {t.formula}</div>
                {t.ratio && <div className="num mt-1 text-muted-foreground">{t.parts.map((p) => `${p.label} ${partFmt(p.key, t.total.parts[p.key])}`).join(' ÷ ')} = {fmtMetric(t.metric, t.total.value)}</div>}
                {t.total.coverage.note && <div className="mt-1 text-xs text-muted-foreground">{t.total.coverage.note}</div>}
                <div className="mt-1 text-xs text-muted-foreground">{t.note}。口径见知识库“数据口径”</div>
              </div>
            </div>
          </SheetSection>

          {multi && (
            <SheetSection title="按渠道">
              <div className="overflow-hidden rounded-lg border">
                <Table containerClassName="overflow-x-auto">
                  <TableHeader><TableRow className="bg-surface-2/60 hover:bg-surface-2/60">
                    <TableHead className="pl-3">渠道</TableHead>
                    {t.ratio && t.parts.map((p) => <TableHead key={p.key} className="text-right whitespace-nowrap">{p.label}</TableHead>)}
                    <TableHead className="text-right whitespace-nowrap">{t.label}</TableHead>
                    <TableHead className="pr-3">来源</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {t.channels.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-3"><button type="button" className="whitespace-nowrap hover:text-primary hover:underline" onClick={() => ov.openTrace({ ...q, channel: c.id })}>{c.name}</button></TableCell>
                        {t.ratio && t.parts.map((p) => <TableCell key={p.key} className="num text-right">{partFmt(p.key, c.parts[p.key])}</TableCell>)}
                        <TableCell className="num text-right font-medium whitespace-nowrap">{fmtMetric(t.metric, c.value)}</TableCell>
                        <TableCell className="pr-3 text-xs text-muted-foreground">{c.source_name ?? '—'}{c.coverage.note && <div>{c.coverage.note}</div>}{c.late && <span className="ml-1 text-warn">（没按时到）</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SheetSection>
          )}

          <SheetSection title={one ? '原始数' : '每天的原始数'}>
            <div className="overflow-hidden rounded-lg border">
              <Table containerClassName="max-h-[320px] overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead_th]:bg-surface-2 [&_tfoot]:sticky [&_tfoot]:bottom-0 [&_tfoot_td]:bg-surface-2">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-3">日期</TableHead>
                    {!single && t.parts.map((p) => <TableHead key={p.key} className="text-right whitespace-nowrap">{p.label}</TableHead>)}
                    {multi && t.channels.map((c) => <TableHead key={c.id} className="text-right text-[12px] whitespace-nowrap">{c.name}</TableHead>)}
                    <TableHead className="pr-3 text-right whitespace-nowrap">{multi && single ? '合计' : t.label}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.daily.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="num pl-3 whitespace-nowrap" title={[d.coverage.note, ...d.provenance.map(p => `${p.channel_id}: ${p.field_states ? Object.entries(p.field_states).filter(([k]) => t.parts.some(part => part.key === k)).map(([k,v])=>`${RAW_LABEL[k] ?? k}：${INPUT_STATE[v] ?? v}`).join('；') : '历史状态未记录'}；${p.note}`)].join('\n')}>{md(d.date)} <span className="text-xs text-muted-foreground">{weekday(d.date)}</span></TableCell>
                      {!single && t.parts.map((p) => <TableCell key={p.key} className="num text-right">{partFmt(p.key, d.parts[p.key])}</TableCell>)}
                      {multi && d.cells.map((v, i) => <TableCell key={i} className="num text-right text-muted-foreground">{v === null ? '暂无' : cell(t.metric, v)}</TableCell>)}
                      <TableCell className="num pr-3 text-right font-medium whitespace-nowrap">{d.value === null ? '暂无' : cell(t.metric, d.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {!one && (
                  <TableFooter><TableRow className="hover:bg-transparent">
                    <TableCell className="pl-3 font-medium">合计</TableCell>
                    {!single && t.parts.map((p) => <TableCell key={p.key} className="num text-right font-medium">{partFmt(p.key, t.total.parts[p.key])}</TableCell>)}
                    {multi && t.channels.map((c) => <TableCell key={c.id} className="num text-right text-muted-foreground">{c.value === null ? '—' : cell(t.metric, c.value)}</TableCell>)}
                    <TableCell className="num pr-3 text-right font-semibold whitespace-nowrap">{t.total.value === null ? '—' : cell(t.metric, t.total.value)}</TableCell>
                  </TableRow></TableFooter>
                )}
              </Table>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t.ratio ? '比率不拿每天的比率求平均，而是先把原始数加起来再相除。' : ''}“暂无”包括未取得数、字段未知或分母为 0；不是数值 0。鼠标停在日期上可看输入状态，沿用旧值不是本次新报。{MONEY.includes(t.metric) ? '金额单位：元。' : ''}</p>
          </SheetSection>

          <SheetSection title={`来自哪几次导入（${t.runs.length} 次）`}>
            {t.runs.length ? (
              <ul className="divide-y rounded-lg border">
                {t.runs.slice(0, 12).map((r) => (
                  <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-[13px]">
                    <span className="flex min-w-0 items-center gap-1.5"><FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{r.file_name?.split('/').pop() ?? r.source_name}</span></span>
                    <BizBadge value={r.status} />
                    <span className="col-span-2 text-xs text-muted-foreground">
                      {r.source_name} · {md(r.started_at)} {hhmm(r.started_at)} 导入 {md(r.data_date)} 的数 · {r.rows_ok ?? '—'} 行 · {r.actor.includes('定时') ? '自动' : r.actor}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">没找到这几天的导入记录（数据源里没有登记）。</p>}
            {t.runs.length > 12 && <p className="mt-1.5 text-xs text-muted-foreground">只列最近 12 次，全部见“数据 ▸ 导入记录”。</p>}
          </SheetSection>
        </>
      )}
    </DetailSheet>
  )
}
