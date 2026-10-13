// 对照表：表里的每一列 → 工作台字段。拿不准的标黄、能下拉改，Codex 看过的话直接写它的一句理由（“Codex 认为是推广花费：……”，不写百分比）；
// 已经对上、Codex 也这么看的行不再逐行写 Codex（顶上胶囊汇总）；Codex 看法不一样时多一个“改用 Codex 的”。几列争同一个字段的做成一行二选一。
// 宽屏是表格，手机是卡片。归属：数据源与导入模块
import { useState } from 'react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Choice } from '@/components/form'
import { Button } from '@/components/ui/button'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StickyTable } from '@/components/data-view'
import { cn } from '@/lib/utils'
import { Badge, HowChip } from '../parts'
import { FIELD_LABEL } from '../labels'
import type { Analysis, CodexAdvice, Column, FieldKey } from '../types'

const FIELD_OPTIONS = (Object.keys(FIELD_LABEL) as FieldKey[]).map((k) => ({ value: k, label: FIELD_LABEL[k] }))
type Advice = CodexAdvice['columns'][number]
type Group = Analysis['pick_one'][number]
type Props = {
  columns: Column[]; groups: Group[]; codex: CodexAdvice | null; busy: boolean
  onPick: (index: number, field: FieldKey | null, by: '你选的' | 'Codex') => void
  onPickOne: (field: FieldKey, chosen: number, others: number[]) => void
}
const fieldName = (f: FieldKey | null) => (f ? FIELD_LABEL[f] : '不导')
const codexSays = (a: Advice) => (a.field ? `Codex 认为是${FIELD_LABEL[a.field]}` : 'Codex 认为这一列不用导')
/** 这份里的值：只放前两个，宽度够、不截断 */
const samplesText = (xs: string[]) => xs.slice(0, 2).join(' · ')

export function MappingTable(p: Props) {
  const advice = new Map((p.codex?.ok ? p.codex.columns : []).map((c) => [c.index, c]))
  return (
    <>
      <StickyTable maxHeight="none" className="hidden md:block [&_table]:table-fixed">
        <TableHeader><TableRow className="hover:bg-transparent">
          <TableHead className="w-[17%] pl-4">表里的列</TableHead><TableHead className="w-[15%]">这份里的值</TableHead><TableHead className="w-6 px-0" aria-label="对到" />
          <TableHead className="w-[15%]">工作台字段</TableHead><TableHead className="w-[76px]">把握</TableHead><TableHead className="pr-4">怎么对上的</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {p.groups.map((g) => <GroupRow key={g.field} g={g} busy={p.busy} onPickOne={p.onPickOne} />)}
          {p.columns.map((c) => <ColRow key={c.index} c={c} a={advice.get(c.index)} busy={p.busy} onPick={p.onPick} />)}
        </TableBody>
      </StickyTable>
      <ul className="grid gap-2.5 md:hidden">
        {p.groups.map((g) => <li key={g.field}><GroupCard g={g} busy={p.busy} onPickOne={p.onPickOne} /></li>)}
        {p.columns.map((c) => <li key={c.index}><ColCard c={c} a={advice.get(c.index)} busy={p.busy} onPick={p.onPick} /></li>)}
      </ul>
    </>
  )
}

/** 怎么对上的：依据一句话；拿不准的行把 Codex 的理由直接写出来，已对上的只在 Codex 看法不一样时才写 */
function Verdict({ c, a, busy, onPick }: { c: Column; a?: Advice; busy: boolean; onPick: Props['onPick'] }) {
  const unsure = c.state === '拿不准'
  const agrees = !!a && a.field === c.field
  const showCodex = !!a && c.how !== 'Codex' && (unsure || !agrees)
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-1.5">
          <HowChip how={c.how} />
          <p className={cn('min-w-0 text-[12.5px] leading-snug text-muted-foreground', unsure ? 'line-clamp-2' : 'line-clamp-1')} title={c.why}>{c.how === 'Codex' ? '采用了 Codex 的建议' : c.why}</p>
        </div>
        {showCodex && a && (
          <p className="mt-1.5 text-[12.5px] leading-snug" title={a.reason}>
            <Sparkles className="mr-1 inline size-3 -translate-y-px text-info" /><span className="text-info">{codexSays(a)}{a.reason ? '：' : ''}</span><span className="text-foreground/80">{a.reason}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {unsure && c.field && <Button size="sm" variant="outline" className="h-7 bg-card" disabled={busy} onClick={() => onPick(c.index, c.field, '你选的')}><Check />就是它</Button>}
        {a && !agrees && c.how !== 'Codex' && <Button size="sm" variant="outline" className="h-7 bg-card text-info" disabled={busy} onClick={() => onPick(c.index, a.field, 'Codex')}>改用 Codex 的：{fieldName(a.field)}</Button>}
      </div>
    </div>
  )
}

function ColRow({ c, a, busy, onPick }: { c: Column; a?: Advice; busy: boolean; onPick: Props['onPick'] }) {
  const unsure = c.state === '拿不准'
  return (
    <TableRow className={cn('align-top', unsure && 'bg-warn-soft/55 hover:bg-warn-soft/70', c.state === '用不上' && 'text-muted-foreground')}>
      <TableCell className="py-2.5 pl-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {unsure && <span aria-hidden className="size-1.5 rounded-full bg-warn" />}
          <span className={cn('font-medium', c.state !== '用不上' && 'text-foreground')}>{c.header}</span>
          {c.unit && <span className="rounded border px-1 text-[12px] text-muted-foreground">{c.unit}</span>}
        </div>
        <div className="text-[12px] text-muted-foreground">第 {c.index + 1} 列</div>
      </TableCell>
      <TableCell className="py-2.5"><div className="num truncate text-[13px]" title={c.samples.join('、')}>{c.samples.length ? samplesText(c.samples) : <span className="text-muted-foreground">空</span>}</div></TableCell>
      <TableCell className="px-0 py-3"><ArrowRight className="size-3.5 text-muted-foreground" /></TableCell>
      <TableCell className="py-2">
        <Choice value={c.field} allowEmpty emptyLabel="不导（用不上）" options={FIELD_OPTIONS} placeholder="选一个字段"
          className={cn('h-8 bg-card', unsure && 'border-warn/60')} onChange={(v) => onPick(c.index, v as FieldKey | null, '你选的')} />
      </TableCell>
      <TableCell className="py-2.5"><Badge value={c.state} /></TableCell>
      <TableCell className="py-2 pr-4 whitespace-normal"><Verdict c={c} a={a} busy={busy} onPick={onPick} /></TableCell>
    </TableRow>
  )
}

/** 二选一：几列都像同一个字段，只能留一列；默认选工作台更倾向的那列，理由写在下面 */
function useGroup(g: Group) {
  const [chosen, setChosen] = useState(g.suggested)
  const opt = g.options.find((o) => o.index === chosen) ?? g.options[0]
  return { chosen, setChosen, opt }
}

function Radios({ g, chosen, setChosen }: { g: Group; chosen: number; setChosen: (i: number) => void }) {
  return (
    <div role="radiogroup" aria-label={`${g.label}用哪一列`} className="flex flex-wrap gap-2">
      {g.options.map((o) => {
        const on = o.index === chosen
        return (
          <button key={o.index} type="button" role="radio" aria-checked={on} onClick={() => setChosen(o.index)}
            className={cn('flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[13px] transition', on ? 'border-primary bg-card shadow-paper' : 'border-border bg-card/60 hover:border-primary/40')}>
            <span aria-hidden className={cn('grid size-4 shrink-0 place-items-center rounded-full border', on ? 'border-primary' : 'border-muted-foreground/40')}>{on && <span className="size-2 rounded-full bg-primary" />}</span>
            <span className="font-medium">{o.header}</span>
            <span className="num truncate text-xs text-muted-foreground">{o.samples[0] ?? ''}</span>
          </button>
        )
      })}
    </div>
  )
}

function GroupRow({ g, busy, onPickOne }: { g: Group; busy: boolean; onPickOne: Props['onPickOne'] }) {
  const { chosen, setChosen, opt } = useGroup(g)
  return (
    <TableRow className="bg-warn-soft/55 align-top hover:bg-warn-soft/70">
      <TableCell className="py-2.5 pl-4">
        <div className="flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-warn" /><span className="font-medium">{g.label} · 二选一</span></div>
        <div className="text-[12px] text-muted-foreground">第 {g.options.map((o) => o.index + 1).join('、')} 列</div>
      </TableCell>
      <TableCell colSpan={3} className="py-2.5"><Radios g={g} chosen={chosen} setChosen={setChosen} /></TableCell>
      <TableCell className="py-2.5"><Badge value="拿不准" /></TableCell>
      <TableCell className="py-2 pr-4 whitespace-normal">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted-foreground"><span className="text-foreground">选「{opt.header}」：</span>{opt.why}；另一列不导</p>
          <Button size="sm" variant="outline" className="h-7 shrink-0 bg-card" disabled={busy} onClick={() => onPickOne(g.field, chosen, g.options.filter((o) => o.index !== chosen).map((o) => o.index))}><Check />就是它</Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function GroupCard({ g, busy, onPickOne }: { g: Group; busy: boolean; onPickOne: Props['onPickOne'] }) {
  const { chosen, setChosen, opt } = useGroup(g)
  return (
    <div className="rounded-xl border border-warn/40 bg-warn-soft/50 p-3">
      <div className="mb-2 flex items-center gap-2"><span className="font-medium">{g.label} · 二选一</span><Badge value="拿不准" /></div>
      <Radios g={g} chosen={chosen} setChosen={setChosen} />
      <p className="mt-2 text-[12.5px] text-muted-foreground">选「{opt.header}」：{opt.why}；另一列不导</p>
      <Button size="sm" variant="outline" className="mt-2 bg-card" disabled={busy} onClick={() => onPickOne(g.field, chosen, g.options.filter((o) => o.index !== chosen).map((o) => o.index))}><Check />就是它</Button>
    </div>
  )
}

function ColCard({ c, a, busy, onPick }: { c: Column; a?: Advice; busy: boolean; onPick: Props['onPick'] }) {
  const unsure = c.state === '拿不准'
  return (
    <div className={cn('rounded-xl border p-3', unsure ? 'border-warn/40 bg-warn-soft/50' : 'bg-card', c.state === '用不上' && 'text-muted-foreground')}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-medium">{c.header}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
        <Choice value={c.field} allowEmpty emptyLabel="不导" options={FIELD_OPTIONS} placeholder="选字段" className={cn('h-8 min-w-0 flex-1 bg-card', unsure && 'border-warn/60')} onChange={(v) => onPick(c.index, v as FieldKey | null, '你选的')} />
        <Badge value={c.state} />
      </div>
      <div className="num mt-1 truncate text-xs text-muted-foreground">这份里的值：{samplesText(c.samples) || '空'}</div>
      <div className="mt-2"><Verdict c={c} a={a} busy={busy} onPick={onPick} /></div>
    </div>
  )
}
