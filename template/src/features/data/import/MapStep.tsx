// 第 ② 步：认表 + 对字段。顶上一行写认出来是哪家的哪张表（依据收进“为什么这么认”），右边是渠道、日期格式、金额单位；
// 下面是对照表，拿不准的标黄排最上面。缺了必需的列就红框停下来。Codex 的建议和工作台猜的合在同一行说。
// 有规则、一列不差全对上的表：顶上一张绿色结论卡“可以直接预览”，对照表默认收起。等 Codex 时显示已用几秒、在做哪一步。归属：数据源与导入模块
import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Calculator, CheckCircle2, ChevronDown, History, Info, Loader2, RotateCcw, ScanSearch, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react'
import { useApi } from '@/lib/api'
import { Choice } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ViewTabs } from '@/components/view-tabs'
import { cn } from '@/lib/utils'
import { Note, PendingHint } from '../parts'
import { CHANNEL_NAME, FIELD_LABEL, when } from '../labels'
import { useCodex, useDiscard, usePatchDraft } from '../use-draft'
import { MappingTable } from './MappingTable'
import type { DraftView, FieldKey, Meta } from '../types'

const FILTERS = [{ value: 'all', label: '全部' }, { value: '拿不准', label: '拿不准' }, { value: '已对上', label: '已对上' }, { value: '用不上', label: '用不上' }] as const
type Filter = (typeof FILTERS)[number]['value']

export function MapStep({ v, onNext, onLeave }: { v: DraftView; onNext: () => void; onLeave: () => void }) {
  const a = v.analysis
  const patch = usePatchDraft(v.draft.id)
  const codex = useCodex(v.draft.id)
  const discard = useDiscard(onLeave)
  const { data: meta } = useApi<Meta>('/data/meta')
  const [filter, setFilter] = useState<Filter>('all')
  const grouped = new Set(a.pick_one.flatMap((g) => g.options.map((o) => o.index)))
  // 拿不准的排在最上面，其余按表里的顺序；二选一的几列合成一行放在最上面
  const cols = a.columns.filter((c) => !grouped.has(c.index) && (filter === 'all' || c.state === filter))
    .sort((x, y) => Number(y.state === '拿不准') - Number(x.state === '拿不准') || x.index - y.index)
  const groups = filter === 'all' || filter === '拿不准' ? a.pick_one : []
  const pick = (index: number, field: FieldKey | null, by: '你选的' | 'Codex') => patch.mutate({ columns: { [String(index)]: { field, by } } })
  const pickOne = (field: FieldKey, chosen: number, others: number[]) => patch.mutate({ columns: Object.fromEntries([[String(chosen), { field, by: '你选的' as const }], ...others.map((i) => [String(i), { field: null, by: '你选的' as const }])]) })
  const codexPending = v.codex?.ok ? a.columns.filter((c) => c.state === '拿不准' && v.codex!.columns.some((x) => x.index === c.index)) : []
  const notes = a.target === 'xhs_notes'
  const missing = a.missing[0]
  // 有规则、表头一列没变、没有拿不准的：结论先说，对照表收起
  const ruleClean = !!a.rule && !a.counts.unsure && !a.blocking.length && !a.rule.missing_cols.length && !a.rule.extra_cols.length && !Object.keys(v.choices.columns ?? {}).length
  const [showTable, setShowTable] = useState(false)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Recognized v={v} meta={meta} onPatch={(p) => patch.mutate(p)} />

      {notes ? (
        <Note tone="info" icon={BookOpen} title="这是小红书笔记数据（内容模块用的），不在这里导"
          action={<Button size="sm" asChild><a href="/sources?source=src_xhs_notes">去确认对照<ArrowRight /></a></Button>}>
          平台 10/26 改了笔记数据的列名，对照建议在“数据源 → 小红书 · 笔记数据导出”里等你确认；确认后在那里点“按新规则重新导入”，导进小红书模块的笔记数据。
        </Note>
      ) : (
        <>
          {a.missing.map((m) => (
            <Note key={m.field} tone="danger" icon={ShieldAlert} title={`缺「${m.col ?? m.label}」：${m.label}${m.canAck ? '不能当 0' : '是必须的'}`}
              action={m.canAck && <Button size="sm" variant="outline" className="bg-card" disabled={patch.isPending} onClick={() => patch.mutate({ ack_missing: [...(v.choices.ack_missing ?? []), m.field] })}>这次先不导{m.label}</Button>}>
              {m.why}。{m.canAck ? `最好回平台重新导出、勾上这一列；实在没有，可以“这次先不导”：已经有的日子保留工作台里原来的${m.label}，新的日子不导。` : '回平台重新导出带上这一列，或者在下面的对照里选一列当它。'}
            </Note>
          ))}
          {(v.choices.ack_missing ?? []).length > 0 && (
            <Note tone="warn" icon={TriangleAlert} title={`这次不导：${(v.choices.ack_missing ?? []).map((f) => a.required.find((r) => r.field === f)?.label ?? FIELD_LABEL[f]).join('、')}`}
              action={<Button size="sm" variant="ghost" onClick={() => patch.mutate({ ack_missing: [] })}>撤回</Button>}>
              已经有的日子保留工作台里原来的数；工作台里也没有的日子，这一行不导（不会当成 0）。
            </Note>
          )}
          {ruleClean && a.rule && (
            <Note tone="ok" icon={CheckCircle2} title={`按规则「${a.rule.name}」${a.rule.matched}/${a.rule.total} 列一样，可以直接预览`}
              action={<Button size="sm" onClick={onNext}>直接预览<ArrowRight /></Button>}>
              这种表 {when(a.rule.created)} 存过规则{a.rule.origin === '示例' ? '（预置）' : ''}，表头一列没变，对照照旧：{a.counts.matched} 列要导、{a.counts.unused} 列用不上。想核对就展开看看。
            </Note>
          )}
          {ruleClean && !showTable ? (
            <section className="rounded-xl border bg-card px-4 py-3.5 shadow-paper" aria-label="这份表怎么对的">
              <ul className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
                {a.columns.map((c) => (
                  <li key={c.index} className={cn('flex min-w-0 items-center gap-1.5', !c.field && 'text-muted-foreground')}>
                    <span className="truncate" title={c.header}>{c.header}</span><ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    <span className={cn('shrink-0', c.field && 'font-medium')}>{c.field ? FIELD_LABEL[c.field] : '不导'}</span>
                    <span className="num ml-auto shrink-0 truncate pl-2 text-xs text-muted-foreground">{c.samples[0] ?? ''}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setShowTable(true)} className="mt-2.5 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">看详细对照（每列怎么对上的、能改）<ChevronDown className="size-3.5" /></button>
            </section>
          ) : (<>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <ViewTabs label="按把握" value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ value: f.value, label: f.label, count: f.value === 'all' ? a.columns.length : a.columns.filter((c) => c.state === f.value).length }))} />
            <Tooltip>
              <TooltipTrigger asChild><span className="inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground"><Info className="size-3.5" />怎么自动对的</span></TooltipTrigger>
              <TooltipContent className="max-w-72">依次看：存过的导入规则 → 同一平台停用的旧规则（人确认过、名字没变的列）→ 常见叫法 → 知识库《数据口径》（老板确认过的才算数）。有两种意思、没见过的，一律标黄“拿不准”，不猜。</TooltipContent>
            </Tooltip>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {Object.keys(v.choices.columns ?? {}).length > 0 && <Button size="sm" variant="ghost" disabled={patch.isPending} onClick={() => patch.mutate({ reset: true })}><RotateCcw />恢复自动对的</Button>}
              <CodexBar v={v} pending={codexPending.length} busy={patch.isPending || codex.isPending} running={codex.isPending} onRun={() => codex.mutate()}
                onAcceptAll={() => patch.mutate({ columns: Object.fromEntries(codexPending.map((c) => { const x = v.codex!.columns.find((y) => y.index === c.index)!; return [String(c.index), { field: x.field, by: 'Codex' as const }] })) })} />
            </div>
          </div>
          {codex.isPending && <p className="-mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Info className="size-3.5 shrink-0" />Codex 只看表头和前 5 行，知识库只读不改；等的时候可以先自己确认下面黄色的几列（点“就是它”）。</p>}
          {v.codex && !v.codex.ok && <Note tone="warn" icon={Sparkles} title={`Codex 这次没帮上（${when(v.codex.at)}）`}>{v.codex.reason}</Note>}

          {cols.length || groups.length ? <MappingTable columns={cols} groups={groups} codex={v.codex} busy={patch.isPending} onPick={pick} onPickOne={pickOne} />
            : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">这一类没有列</p>}
          </>)}
        </>
      )}

      <footer className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-background/95 px-4 py-2.5 backdrop-blur md:bottom-0 md:-mx-7 md:px-7">
        <Button variant="ghost" size="sm" disabled={discard.isPending} onClick={() => discard.mutate(v.draft.id)}>放弃这份</Button>
        <div className="min-w-0 flex-1 text-right">
          {notes ? <PendingHint>笔记数据在数据源里导</PendingHint>
            : missing ? <PendingHint tone="danger">还差 1 件：缺{missing.label}（见上方红框）</PendingHint>
            : a.counts.unsure ? <PendingHint>还差 {a.counts.unsure} 列要你点头</PendingHint>
            : a.blocking.length ? <PendingHint>{a.blocking[0]}</PendingHint>
            : <PendingHint tone="ok">对好了：{a.counts.matched} 列要导{a.derived.length ? `，${a.derived.map((d) => d.label).join('、')}按口径算` : ''}，{a.counts.unused} 列用不上</PendingHint>}
        </div>
        <Button disabled={!!a.blocking.length || patch.isPending} onClick={onNext}>下一步：预览<ArrowRight /></Button>
      </footer>
    </div>
  )
}

/** Codex：没看过时“让 Codex 看看”是这一块唯一的实心按钮；看过以后“按 Codex 的来”实心，“再看一次”描边；模型、用时放在悬停提示里 */
/** 等 Codex 时的进度：已用几秒 + 现在大概在做哪一步（读表头 → 查《数据口径》→ 写建议）。一般 30—50 秒 */
function useElapsed(running: boolean) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const id = window.setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => { window.clearInterval(id); setSec(0) }
  }, [running])
  return sec
}
const stageOf = (s: number) => (s < 8 ? '读表头和前 5 行' : s < 25 ? '查知识库《数据口径》' : s < 75 ? '写对照建议' : '快好了，再等一下')

function CodexBar({ v, pending, busy, running, onRun, onAcceptAll }: { v: DraftView; pending: number; busy: boolean; running: boolean; onRun: () => void; onAcceptAll: () => void }) {
  const c = v.codex
  const a = v.analysis
  const sec = useElapsed(running)
  if (running) return <Button size="sm" disabled className="tabular-nums"><Loader2 className="animate-spin" />Codex 正在{stageOf(sec)}… 已用 {sec} 秒（一般 30—50 秒）</Button>
  if (!c?.ok) return <Button size="sm" variant={a.counts.unsure ? 'default' : 'outline'} onClick={onRun}><Sparkles />让 Codex 看看</Button>
  const byIndex = new Map(a.columns.map((y) => [y.index, y]))
  const agree = c.columns.filter((x) => byIndex.get(x.index)?.field === x.field).length
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1.5 rounded-lg border border-info/30 bg-info-soft/60 px-2.5 py-1 text-xs text-info"><Sparkles className="size-3.5" />本机 Codex {when(c.at)} 看过 · 用了 {c.seconds} 秒 · {c.columns.length} 列里 {agree} 列和工作台一样{agree < c.columns.length ? '，不一样的写在那一行' : ''}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">它认为是{c.platform ? `「${c.platform}${c.report ? ` · ${c.report}` : ''}」` : '一张认不出平台的表'}。只看了表头和前 5 行，知识库《数据口径》能读不能改。{c.model ? `模型：${c.model}。` : '用的是这台电脑上 Codex 的默认模型。'}建议点了才算数。</TooltipContent>
      </Tooltip>
      <Button size="sm" variant="outline" disabled={busy} onClick={onRun}>再看一次</Button>
      {pending > 0 && <Button size="sm" disabled={busy} onClick={onAcceptAll}>拿不准的 {pending} 列按 Codex 的来</Button>}
    </>
  )
}

function Recognized({ v, meta, onPatch }: { v: DraftView; meta?: Meta; onPatch: (p: { channel_id?: string | null; date_fmt?: string | null; amount_unit?: '元' | '万元' }) => void }) {
  const a = v.analysis
  const chCol = a.columns.some((c) => c.field === 'channel' && c.state === '已对上')
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border bg-card px-4 py-3 shadow-paper">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <ScanSearch className="size-4 shrink-0 text-primary" />
        <span className="text-[13px] text-muted-foreground">{a.recognized ? '认出来了：' : '认不出是哪家平台的表：'}</span>
        <span className="min-w-0 truncate font-heading text-[16px] font-semibold">{a.recognized ? `${a.recognized.platform} · ${a.recognized.report}` : '按列名一列一列对'}</span>
        <span className="num text-[12.5px] text-muted-foreground">{a.row_count} 行 · {a.columns.length} 列{a.header_row > 0 ? ` · 表头在第 ${a.header_row + 1} 行` : ''}{a.total_rows ? ` · 末尾 ${a.total_rows} 行合计` : ''}</span>
        <WhyPopover v={v} />
        {a.rule ? <span className={cn('rounded-md border px-1.5 py-0.5 text-[11.5px]', a.rule.missing_cols.length ? 'border-warn/40 text-warn' : 'border-primary/30 text-primary')}>按规则「{a.rule.name}」· {a.rule.matched}/{a.rule.total} 列一样</span>
          : a.retired && a.retired.used > 0 ? <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-1.5 py-0.5 text-[11.5px] text-primary" title={`旧规则「${a.retired.name}」已停用；名字没变的列是人确认过的，直接沿用`}><History className="size-3" />沿用停用的旧规则：{a.retired.used} 列名字没变 · 导入时存成新规则</span>
          : <span className="rounded-md border border-dashed px-1.5 py-0.5 text-[11.5px] text-muted-foreground">还没有这种表的规则，导入时存下来</span>}
        {a.derived.map((d) => <span key={d.field} className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-1.5 py-0.5 text-[11.5px] text-primary" title={d.how}><Calculator className="size-3" />{d.label} = {d.how.split('（')[0]}</span>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Field label="渠道" hint={a.channel_from}>
          {chCol ? <div className="flex h-8 items-center rounded-md border bg-background px-2.5 text-[13px]">按“渠道”列</div>
            : <Choice className={cn('h-8 w-[118px] bg-background', !a.channel_id && 'border-danger/60')} value={a.channel_id} placeholder="选渠道" onChange={(id) => onPatch({ channel_id: id })} options={(meta?.channels ?? Object.entries(CHANNEL_NAME).map(([id, name]) => ({ id, name }))).map((c) => ({ value: c.id, label: c.name }))} />}
        </Field>
        <Field label="日期" hint={a.date?.auto && a.date.auto === a.date.fmt ? '自动认出' : null}>
          {a.date ? <Choice className="h-8 w-[172px] bg-background" value={a.date.fmt} placeholder="认不出来，选一下" onChange={(f) => onPatch({ date_fmt: f })} options={meta?.date_formats ?? []} />
            : <div className="flex h-8 items-center rounded-md border border-danger/50 bg-background px-2.5 text-[13px] text-danger">没找到日期列</div>}
        </Field>
        <Field label="金额" hint={a.amount_unit_from}>
          <Choice className="h-8 w-[76px] bg-background" value={a.amount_unit} onChange={(u) => u && onPatch({ amount_unit: u as '元' | '万元' })} options={['元', '万元']} />
        </Field>
      </div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string | null; children: React.ReactNode }) {
  return <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title={hint ? `${label}：${hint}` : undefined}><span className="shrink-0">{label}</span>{children}</label>
}

/** 为什么这么认：认表的依据、规则对上几列、表头上方的说明、编码、年份 */
function WhyPopover({ v }: { v: DraftView }) {
  const a = v.analysis
  return (
    <Popover>
      <PopoverTrigger asChild><button className="text-[12.5px] text-primary underline-offset-4 hover:underline">为什么这么认</button></PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] text-[13px] leading-relaxed">
        <ul className="grid gap-1.5">
          {a.recognized?.reasons.map((r) => <li key={r}>· {r}</li>)}
          {!a.recognized && <li>· 表头里没有哪家平台特有的叫法，按列名一列一列对</li>}
          {a.rule && <li>· 有导入规则「{a.rule.name}」：表头 {a.rule.matched}/{a.rule.total} 列和规则一样{a.rule.missing_cols.length ? `，少了「${a.rule.missing_cols.join('」「')}」` : ''}{a.rule.extra_cols.length ? `，多了「${a.rule.extra_cols.join('」「')}」` : ''}（{when(a.rule.created)} 存的{a.rule.origin === '示例' ? '，预置' : ''}）</li>}
          {a.header_row > 0 && <li>· 前 {a.header_row} 行是平台写的说明：{a.preamble.slice(0, 3).join(' / ')}</li>}
          {a.retired && <li>· 这类表原来有规则「{a.retired.name}」，平台改版后停用了；名字没变的 {a.retired.used} 列按它对（人确认过的），改了名的才标黄</li>}
          {a.sample_file && <li>· 开头写了“示例数据”：这是样例表，数字和工作台一样</li>}
          {v.draft.encoding === 'GBK' && <li>· 文字格式已自动转好，中文不会乱码</li>}
          {a.date?.year_inferred && <li>· 日期没写年份，按今年算；跨年的会往前推一年</li>}
          <li>· 渠道：{a.channel_from ?? '没定'}；金额单位：{a.amount_unit_from}</li>
        </ul>
      </PopoverContent>
    </Popover>
  )
}
