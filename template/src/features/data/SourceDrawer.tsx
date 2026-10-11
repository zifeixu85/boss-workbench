// 数据源抽屉（?source=）：最近 7 天、等你确认的字段对照（AI 给的建议写明谁几点给的）、按新规则重新导入、怎么来的、运行记录。
// 主次：等你确认时唯一的实心按钮是“有建议的都采用”；对好以后唯一的实心按钮是“按新规则重新导入”。归属：数据源与导入模块
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { AlarmClock, ArrowRight, Check, CheckCircle2, DatabaseZap, FileUp, Loader2, RefreshCw, RotateCcw, ShieldAlert, Sparkles, Upload, X } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { ReadRow } from '@/components/detail-parts'
import { Choice } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, todayStr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, GoneNote, Note, RestoreButton, RunStrip } from './parts'
import { confirmedBy, fullOf, when } from './labels'
import { RunTimeline } from './RunItem'
import { useSync } from './use-sync'
import type { Mapping, Run, SourceDetail } from './types'

/** “近 7 天跑了 7 次：6 次成功、1 次失败” */
function runsText(runs: Run[]) {
  const from = addDays(todayStr(), -6)
  const xs = runs.filter((r) => r.started_at.slice(0, 10) >= from)
  const n = (st: string) => xs.filter((r) => r.status === st).length
  const parts = [n('成功') && `${n('成功')} 次成功`, n('失败') && `${n('失败')} 次失败`, n('超时') && `${n('超时')} 次超时`, n('部分成功') && `${n('部分成功')} 次没导全`].filter(Boolean)
  return xs.length ? `近 7 天跑了 ${xs.length} 次：${parts.join('、')}` : '近 7 天没有运行记录'
}

export function SourceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: s, error } = useApi<SourceDetail>(`/data/sources/${id}`)
  const sync = useSync()
  const pending = s?.mappings.filter((m) => m.status === 'AI 建议' || m.status === '未匹配') ?? []
  const reviewed = s?.mappings.filter((m) => m.suggested_by) ?? []
  return (
    <DetailSheet open onClose={onClose} wide eyebrow={s ? `数据源 · ${s.way}` : '数据源'} title={error ? '找不到这个数据源' : s?.name}
      meta={s && <><Badge value={s.display} />{!s.realtime && <span>数据截至 {fullOf(s.data_through)}</span>}{s.owner && <span>· {s.owner}负责</span>}<span>· {s.schedule}</span></>}
      actions={s && <>
        {s.auto ? <span className="inline-flex h-7 items-center rounded-lg border border-dashed px-2.5 text-xs text-muted-foreground">{s.next_held ? `${s.next_text}，${s.auto}，不能现场拉` : `${s.auto} · 示例没连真的账号，不能现场拉`}</span>
          : <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(s.id)}><RefreshCw className={cn(sync.isPending && 'animate-spin')} />立即同步</Button>}
        {s.channel_id && <Button size="sm" variant="outline" asChild><Link to="/imports"><FileUp />拖文件导入</Link></Button>}
        {s.channel_id && <Button size="sm" variant="ghost" asChild><Link to={`/channel/${s.channel_id}`}>去经营页看<ArrowRight /></Link></Button>}
        {s.id === 'src_xhs_notes' && <Button size="sm" variant="ghost" asChild><Link to="/content/data">去小红书数据看<ArrowRight /></Link></Button>}
      </>}>
      {error ? <GoneNote what="数据源" onClose={onClose} /> : !s ? <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-40" /><Skeleton className="h-60" /></div> : (
        <div className="grid gap-1">
          {s.display === '没数据' && (
            <Note className="mb-5" tone="warn" icon={DatabaseZap} title="现在没有数：经营页这个渠道先是空的，不当 0"
              action={s.channel_id && s.sample_rows > 0 && <RestoreButton channel={s.channel_id} name={s.short.replace(/经营数据$/, '')} />}>{s.reason}</Note>
          )}
          {s.display !== '正常' && s.display !== '没数据' && s.reason && (
            <Note className="mb-5" tone={s.display === '读取失败' ? 'danger' : 'warn'} icon={s.display === '读取失败' ? ShieldAlert : AlarmClock}
              title={s.display === '读取失败' ? `读取失败：数据停在 ${fullOf(s.data_through)}` : s.parts.find((p) => p.tone !== 'ok') ? `${s.parts.find((p) => p.tone !== 'ok')!.label}：${s.parts.find((p) => p.tone !== 'ok')!.text}` : '没按时更新'}>
              {s.reason}{s.parts.length > 0 && <span className="mt-1 block">{s.parts.map((p) => `${p.label} ${p.text}`).join(' · ')}</span>}
            </Note>
          )}
          {s.realtime ? (
            <SheetSection title="现在">
              <p className="text-[14px]">现在 <b className="num font-semibold">{s.kb?.notes ?? 0}</b> 份笔记{s.kb?.latest && <>，最近改的是 <span className="font-medium">{s.kb.latest.path.replace(/\.md$/, '')}</span></>}</p>
              <p className="mt-1 text-xs text-muted-foreground">工作台直接读笔记文件，文件一改网页就刷新，不用跑、也没有“近 7 天”。不算 README 这类说明文件。</p>
            </SheetSection>
          ) : (
            <SheetSection title="最近 7 天">
              <div className="flex flex-wrap items-end justify-between gap-3"><RunStrip days={s.strip} size="md" /><span className="text-[13px] text-muted-foreground">{runsText(s.runs)}</span></div>
            </SheetSection>
          )}
          {reviewed.length > 0 && <MappingReview s={s} items={s.mappings} pending={pending} />}
          <SheetSection title="怎么来的">
            <dl>
              <ReadRow label="送来什么">{s.feeds}</ReadRow>
              <ReadRow label="怎么拿">{s.method}</ReadRow>
              <ReadRow label="多久一次">{s.schedule}{s.next_run_at && <span className={cn(s.overdue_min ? 'text-warn' : 'text-muted-foreground')}>（下一次 {s.next_text}）</span>}</ReadRow>
              {s.inbox_dir && <ReadRow label="放文件">{s.inbox_dir}/</ReadRow>}
              <ReadRow label="导入规则">{s.rules.length ? (
                <span className="flex flex-wrap gap-1.5">{s.rules.map((r) => (
                  <Link key={r.id} to={`/imports/rules?rule=${r.id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs hover:border-primary hover:text-primary">{r.platform} · {r.report}<Badge value={r.status} /></Link>
                ))}</span>
              ) : <span className="text-muted-foreground">{s.kind === '平台导出' ? '还没有，第一次在导入页对好字段就会存' : '不用规则（直接读）'}</span>}</ReadRow>
              {!s.realtime && <ReadRow label="最近成功">{when(s.last_ok_at)}</ReadRow>}
              {s.note && s.display === '正常' && <ReadRow label="备注">{s.note}</ReadRow>}
            </dl>
          </SheetSection>
          {!s.realtime && (
            <SheetSection title={`运行记录（${s.runs.length}）`}>
              {s.runs.length ? <RunTimeline runs={s.runs} /> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">还没有运行记录</p>}
            </SheetSection>
          )}
        </div>
      )}
    </DetailSheet>
  )
}

/** 等你确认的字段对照 + 对好以后按新规则重新导入（小红书笔记数据） */
function MappingReview({ s, items, pending }: { s: SourceDetail; items: Mapping[]; pending: Mapping[] }) {
  const { data: targets } = useApi<{ notes: { value: string; label: string }[]; daily: { value: string; label: string }[] }>('/data/mapping-targets')
  const decide = useWrite((b: { id: string; action: string; target?: string }) => api.post(`/data/mappings/${b.id}`, b), '已记下')
  const reimport = useWrite(() => api.post<{ message: string }>('/data/notes/reimport', {}), (r) => r.message)
  const by = items.find((m) => m.suggested_by)
  const options = s.id === 'src_xhs_notes' ? targets?.notes ?? [] : targets?.daily ?? []
  const acceptAll = () => pending.filter((m) => m.target).forEach((m) => decide.mutate({ id: m.id, action: 'accept' }))
  const decided = items.filter((m) => m.suggested_by && !pending.includes(m))
  const others = items.filter((m) => !m.suggested_by)
  const notes = s.notes
  return (
    <>
      {pending.length > 0 && (
        <SheetSection title={`等你确认（${pending.length} 列）`} action={pending.some((m) => m.target) && <Button size="sm" onClick={acceptAll} disabled={decide.isPending}><Check />有建议的都采用</Button>}>
          <p className="mb-3 flex items-start gap-1.5 text-[13px] text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-info" />
            <span>下面的对照建议是 <b className="font-medium text-foreground">{by?.suggested_by ?? 'AI'}</b> {when(by?.suggested_at)} 写的，理由写在每一列下面。建议不会自己生效，你点了才算数；确认完，导入规则换成新表头。</span></p>
          <ul className="grid gap-2.5">
            {pending.map((m) => <PendingRow key={m.id} m={m} options={options} busy={decide.isPending} onDecide={(action, target) => decide.mutate({ id: m.id, action, target })} />)}
          </ul>
        </SheetSection>
      )}
      {!pending.length && notes && (
        <SheetSection title="按新规则重新导入">
          {notes.file?.imported_at ? (
            <Note tone="ok" icon={CheckCircle2} title={`${notes.file.name} 已按新对照导进来（${when(notes.file.imported_at)}）`}
              action={<Button size="sm" variant="outline" asChild><Link to="/content/data">去小红书数据看<ArrowRight /></Link></Button>}>
              笔记数据和粉丝数都到 {fullOf(notes.file.data_date)} 了，10/26 那篇也有数了。要撤回，在下面运行记录对应的那一批里撤销（导入记录页也能撤）。
            </Note>
          ) : notes.file ? (
            <Note tone="info" icon={Upload} title={`对照确认完了，${notes.file.name} 还没导`}
              action={<Button size="sm" disabled={reimport.isPending} onClick={() => reimport.mutate(undefined, { onSuccess: () => toast('今日页的提醒会跟着消失', { description: '笔记数据写进了小红书模块，能撤销' }) })}>{reimport.isPending ? <Loader2 className="animate-spin" /> : <Upload />}按新规则重新导入</Button>}>
              这份是平台改版后第一份笔记数据表（{notes.file.rel}）。按刚确认的对照导进小红书模块的笔记数据，同一次导出的粉丝数据也一起补上；写之前记下原来的数，导错了能撤销。
            </Note>
          ) : <p className="text-[13px] text-muted-foreground">导入文件夹里没有笔记数据表：小艾从专业号后台导出放进去，再点“立即同步”。</p>}
        </SheetSection>
      )}
      {decided.length > 0 && (
        <SheetSection title={`已经对好的 ${decided.length + others.length} 列`}>
          <ul className="divide-y rounded-lg border text-[13px]">
            {[...decided, ...others].map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-[88px] font-medium">{m.source_field}</span><span className="text-muted-foreground">→</span>
                <span className={cn(!m.target && 'text-muted-foreground')}>{m.target ? m.target_label : '不导'}</span>
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {m.decided_by && <span>{confirmedBy(m.decided_by === '网页' ? '你' : m.decided_by, m.decided_at ?? undefined)}</span>}
                  {m.suggested_by && !notes?.file?.imported_at && <Button size="xs" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: m.id, action: 'revert' })}><RotateCcw />改回</Button>}
                </span>
              </li>
            ))}
          </ul>
        </SheetSection>
      )}
    </>
  )
}

function PendingRow({ m, options, busy, onDecide }: { m: Mapping; options: { value: string; label: string }[]; busy: boolean; onDecide: (action: string, target?: string) => void }) {
  const [editing, setEditing] = useState(false)
  const pct = m.confidence != null ? Math.round(m.confidence * 100) : null
  return (
    <li className={cn('rounded-xl border p-3.5', m.target ? 'border-warn/30 bg-warn-soft/40' : 'bg-surface-2/50')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-medium">「{m.source_field}」</span>
        <span className="text-muted-foreground">→</span>
        <span className={cn('font-medium', !m.target && 'font-normal text-muted-foreground')}>{m.target ? m.target_label : '工作台没有这一项'}</span>
        {m.target ? <Badge value="Codex 建议" /> : <Badge value="不导" />}
        {pct != null && <span className="num text-xs text-muted-foreground">把握 {pct}%</span>}
        {m.sample && <span className="ml-auto max-w-[180px] truncate text-xs text-muted-foreground">这份里的值：<span className="num text-foreground">{m.sample}</span></span>}
      </div>
      {m.reason && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{m.reason}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {m.target && <Button size="sm" variant="outline" className="bg-card" disabled={busy} onClick={() => onDecide('accept')}><Check />采用</Button>}
        {editing ? <div className="w-48"><Choice value={null} placeholder="改成…" onChange={(v) => v && onDecide('set', v)} options={options} /></div>
          : <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>改成别的</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide('ignore')}><X />不导这一列</Button>
      </div>
    </li>
  )
}
