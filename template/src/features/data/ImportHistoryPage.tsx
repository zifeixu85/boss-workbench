// 导入记录：只列有文件的导入（哪个文件、按哪条规则、多少行、哪几天、成没成功），按天分组；直接读取的运行（RSS、日历、Codex 定时任务）在数据源抽屉里看。
// “预置”只在上面的示例数据卡里说一次；你现场导的那几行加主色左边条和“你导的”。抽屉里如实说来源：预置的、你用样例表导的、你自己的表。归属：数据源与导入模块
import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowRight, Database, FileText, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { PageBody, PageHeader, SubTabs } from '@/components/page'
import { StickyTable } from '@/components/data-view'
import { ViewTabs } from '@/components/view-tabs'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { ReadRow } from '@/components/detail-parts'
import { Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, GoneNote, KindIcon, Note, RestoreButton, TablesLine } from './parts'
import { IMPORT_TABS, actorText, dayTitle, fullSpan, spanOf, when } from './labels'
import { RunDetailView } from './RunItem'
import { hasRunDetail } from './runs'
import { ImportedChart } from './import/ImportedChart'
import type { ImportResult, Run, SampleStatus, UndoResult } from './types'

const TABS = [{ value: 'all', label: '全部' }, { value: 'bad', label: '有问题' }, { value: 'live', label: '你导的' }] as const
type Tab = (typeof TABS)[number]['value']
const isBad = (r: Run) => r.status === '失败' || r.status === '超时' || r.status === '部分成功'
const inTab = (r: Run, t: Tab) => t === 'all' || (t === 'live' ? !r.preset : isBad(r))
const fileOf = (r: Run) => r.file_name?.split('/').pop() ?? ''
/** 记录的标题：“天猫 9/27—10/26 · 30 行” */
const titleOf = (r: Run) => `${r.source_short} ${spanOf(r.date_from, r.data_date)}${r.rows_ok ? ` · ${r.rows_ok} 行` : ''}`
/** 结果那一句：失败红、超时和没导全用警示色，只把“1 行没导”这几个字标出来 */
function Message({ r, className }: { r: Run; className?: string }) {
  const msg = r.message ?? ''
  if (r.status === '失败') return <span className={cn('text-danger', className)} title={msg}>{msg}</span>
  if (r.status === '超时') return <span className={cn('text-warn', className)} title={msg}>{msg}</span>
  const parts = r.status === '部分成功' ? msg.split(/(\d+ 行[^，；。]*没导|[^，；。]*先空着)/) : [msg]
  return <span className={cn('text-muted-foreground', className)} title={msg}>{parts.map((p, i) => (i % 2 ? <b key={i} className="font-medium text-warn">{p}</b> : p))}</span>
}

export default function ImportHistoryPage() {
  const { data, isLoading, error, refetch } = useApi<Run[]>('/data/runs?limit=300&files=1')
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((t) => t.value === sp.get('status'))?.value ?? 'all') as Tab
  const openId = sp.get('run')
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: k === 'status' })
  const runs = useMemo(() => data ?? [], [data])
  const rows = runs.filter((r) => inTab(r, tab))
  const days = useMemo(() => {
    const m = new Map<string, Run[]>()
    rows.forEach((r) => m.set(r.started_at.slice(0, 10), [...(m.get(r.started_at.slice(0, 10)) ?? []), r]))
    return [...m.entries()]
  }, [rows])
  const open = runs.find((r) => r.id === openId)
  return (
    <>
      <PageHeader eyebrow="数据" title="导入记录" desc="每次导入的文件：按哪条规则、多少行、哪几天、成没成功。失败的写清原因；导错了可以撤销。直接读取的（飞书、RSS、Codex 定时任务）在数据源里看。">
        <SubTabs items={IMPORT_TABS} />
      </PageHeader>
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <SamplePanel />
        {error ? <Failed message="导入记录没读出来" onRetry={() => refetch()} /> : isLoading ? <Skeleton className="h-[480px]" /> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ViewTabs label="按结果" value={tab} onChange={(v) => set('status', v === 'all' ? null : v)} items={TABS.map((t) => ({ value: t.value, label: t.label, count: runs.filter((r) => inTab(r, t.value)).length }))} />
              <span className="ml-auto text-xs text-muted-foreground">最近 {runs.length} 次导入 · 点一行看详情</span>
            </div>
            <StickyTable className="hidden md:block" maxHeight="calc(100dvh - 160px)">
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">时间</TableHead><TableHead>数据源</TableHead><TableHead>文件和结果</TableHead><TableHead>规则</TableHead>
                <TableHead className="text-right">行数</TableHead><TableHead>数据</TableHead><TableHead className="pr-4">结果</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {days.map(([d, xs]) => (
                  <Fragment key={d}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="sticky top-10 z-[5] bg-surface-2/95 py-1.5 pl-4 text-xs font-medium text-muted-foreground backdrop-blur">{dayTitle(d)}<span className="num ml-2 font-normal">{xs.length} 次</span></TableCell>
                    </TableRow>
                    {xs.map((r) => {
                      const live = !r.preset
                      return (
                        <TableRow key={r.id} className={cn('cursor-pointer', live && 'bg-accent/40 hover:bg-accent/60', r.batch_status === '已撤销' && 'text-muted-foreground')} onClick={() => set('run', r.id)}>
                          <TableCell className={cn('num relative pl-4 whitespace-nowrap', live && 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary')}>{r.started_at.slice(11, 16)}<div className="text-xs text-muted-foreground">{actorText(r.actor)}</div></TableCell>
                          <TableCell className="max-w-[180px]"><div className="truncate">{r.source_short}</div></TableCell>
                          <TableCell className="max-w-[400px] min-w-[240px]">
                            <div className="flex min-w-0 items-center gap-2">
                              <button className="min-w-0 truncate text-left font-medium hover:text-primary" onClick={(e) => { e.stopPropagation(); set('run', r.id) }}>{fileOf(r)}</button>
                              {live && <Badge value={r.provenance === '样例表' ? '你导的 · 样例表' : '你导的'} tone="primary" className="shrink-0" />}
                            </div>
                            <div className="truncate text-xs"><Message r={r} /></div>
                          </TableCell>
                          <TableCell className="max-w-[170px]"><div className="truncate text-[13px] text-muted-foreground">{r.rule_name ?? '没用规则'}</div></TableCell>
                          <TableCell className="num text-right whitespace-nowrap">{r.rows_total ? `${r.rows_ok ?? 0}/${r.rows_total}` : '—'}</TableCell>
                          <TableCell className="num whitespace-nowrap">{spanOf(r.date_from, r.data_date)}</TableCell>
                          <TableCell className="pr-4"><span className="flex flex-wrap gap-1"><Badge value={r.status} />{r.batch_status === '已撤销' && <Badge value="已撤销" />}{r.batch_status === '已清除' && <Badge value="已清除" />}</span></TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                ))}
                {!rows.length && <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{tab === 'live' ? <>你还没导过。<Link className="text-primary underline" to="/imports">去导一份</Link></> : '这一类没有记录'}</TableCell></TableRow>}
              </TableBody>
            </StickyTable>
            <div className="grid gap-3 md:hidden">
              {days.map(([d, xs]) => (
                <section key={d}>
                  <h3 className="sticky top-(--sticky-top) z-[5] -mx-4 bg-background/95 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">{dayTitle(d)} · {xs.length} 次</h3>
                  <ul className="grid gap-2">
                    {xs.map((r) => (
                      <li key={r.id} className={cn('relative overflow-hidden rounded-xl border bg-card p-3 shadow-paper', !r.preset && 'border-primary/30 pl-4')} onClick={() => set('run', r.id)}>
                        {!r.preset && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                        <div className="flex items-center gap-2"><span className="num text-[13px] font-medium">{r.started_at.slice(11, 16)}</span><span className="min-w-0 truncate text-[13px]">{titleOf(r)}</span><span className="ml-auto flex shrink-0 gap-1">{!r.preset && <Badge value="你导的" tone="primary" />}<Badge value={r.status} /></span></div>
                        <p className="mt-1 line-clamp-2 text-xs"><Message r={r} /></p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </PageBody>
      {openId && <RunSheet run={open} loading={isLoading} onClose={() => set('run', null)} />}
    </>
  )
}

/** 抽屉里说清这条记录从哪来：预置的（原件在不在如实说）、你用样例表导的、你自己的表 */
function Provenance({ r }: { r: Run }) {
  if (r.preset) {
    const folder = r.file_name?.replace(/[^/]+$/, '')
    return (
      <Note tone="muted" icon={Database} title="这是预置的记录"
        action={r.file_exists && r.status === '失败' && <Button size="sm" variant="outline" className="bg-card" asChild><Link to={`/sources?source=${r.source_id}`}>去确认对照<ArrowRight /></Link></Button>}>
        ABC茶社示例里写好的，不是刚才发生的。{r.file_exists ? `原件在 ${folder}，${r.status === '失败' ? '确认对照后可以重新导入' : '可以打开看'}。` : '示例里没放这份文件的原件。'}
      </Note>
    )
  }
  if (r.provenance === '样例表') return <Note tone="muted" icon={FileText} title={`你 ${when(r.started_at)} 用样例表导的`}>数字和预置的示例数据一样；要去掉这次写进去的数，用上面的“撤销这次导入”（清掉示例数据不会动它）。</Note>
  return null
}

function RunSheet({ run: r, loading, onClose }: { run?: Run; loading: boolean; onClose: () => void }) {
  const [undone, setUndone] = useState<UndoResult | null>(null)
  const undo = useWrite((id: string) => api.post<UndoResult>(`/data/batches/${id}/undo`, {}),
    (u) => `已撤销：${u.restored ? `恢复 ${u.restored} 行` : ''}${u.removed ? `${u.restored ? '、' : ''}删掉新增的 ${u.removed} 行` : ''}${u.kept ? `；${u.kept} 行后来又被改过，没动` : ''}`)
  // 只有你导进来的那一批能撤销；预置的示例数据用上面的“清掉示例数据”
  const canUndo = !!r?.batch_id && r.batch_status === '有效' && !r.preset
  const daily = !!r?.batch_id && !r.preset && r.source_id !== 'src_xhs_notes'
  const { data: result } = useApi<ImportResult>(daily ? `/data/batches/${r!.batch_id}/result` : null)
  const empty = (undone?.empty_channels ?? []).filter((c) => c.sample_rows > 0)
  const one = result?.channels.length === 1 ? result.channels[0] : null
  return (
    <DetailSheet open onClose={onClose} eyebrow="导入记录" title={r ? titleOf(r) : !loading ? '找不到这条导入记录' : undefined}
      meta={r && <><Badge value={r.status} />{r.batch_status === '已撤销' && <Badge value="已撤销" />}{!r.preset && <Badge value="你导的" tone="primary" />}<span>{when(r.started_at)} · {actorText(r.actor)}</span><span className="inline-flex min-w-0 items-center gap-1 truncate"><KindIcon of={{ source_id: r.source_id }} className="size-3 shrink-0" />{fileOf(r)}</span></>}
      actions={r && canUndo && (
        <AlertDialog>
          <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-danger hover:text-danger"><Undo2 />撤销这次导入</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>撤销这次导入？</AlertDialogTitle>
              <AlertDialogDescription>这次写进去的 {r.rows_ok ?? 0} 行恢复成导入前的样子；后来又被别的导入改过的行不动。记录留着，标“已撤销”。</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>不撤销</AlertDialogCancel><AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => undo.mutate(r.batch_id!, { onSuccess: (u) => setUndone(u) })}>撤销</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}>
      {!r ? (loading ? <Skeleton className="h-60" /> : <GoneNote what="导入记录" hint="链接里的编号不对，或者彩排后复原过、这条记录已经没有了。" onClose={onClose} />) : (
        <div className="grid gap-5">
          {empty.length > 0 && (
            <Note tone="warn" title={`${empty.map((c) => c.name).join('、')}现在没有数了：示例数据之前清掉了`} action={<RestoreButton channel={empty[0].id} name={empty[0].name} />}>
              撤销以后，经营页这个渠道先是空的（不当 0）。演示完点右边，把预置的示例数据放回去。
            </Note>
          )}
          <p className="text-[14.5px] leading-relaxed">{r.message}</p>
          <TablesLine tables={r.detail?.表} className="-mt-3" />
          {result && result.series.length > 1 && !result.all_same && r.batch_status === '有效' && (
            <section className="rounded-xl border bg-background/60 p-4">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[13px] text-muted-foreground">这一批写进去的</span>
                <span className="num font-heading text-lg font-semibold">{thousands(result.gmv_total)} 元</span>
                <span className="text-[13px] text-muted-foreground">成交额 · {fullSpan(result.date_from, result.date_to)} · {result.days} 天</span>
                {one && <Button size="sm" variant="ghost" className="ml-auto" asChild><Link to={`/channel/${one.id}`}>去{one.name}页看<ArrowRight /></Link></Button>}
              </div>
              {one && <ImportedChart series={result.series} channel={one.name} compact />}
            </section>
          )}
          <dl>
            <ReadRow label="数据源"><Link className="hover:text-primary" to={`/sources?source=${r.source_id}`}>{r.source_name}</Link></ReadRow>
            <ReadRow label="规则">{r.rule_id ? <Link className="hover:text-primary" to={`/imports/rules?rule=${r.rule_id}`}>{r.rule_name}</Link> : <span className="text-muted-foreground">没用规则</span>}</ReadRow>
            <ReadRow label="行数">{r.rows_total != null ? `${r.rows_ok ?? 0} 行导进去${r.rows_failed ? `，${r.rows_failed} 行没导` : ''}（共 ${r.rows_total} 行）` : '—'}</ReadRow>
            <ReadRow label="数据">{fullSpan(r.date_from, r.data_date)}{r.batch_status && <span className="text-muted-foreground">（写进去的这一批{r.batch_status === '有效' ? '还在' : r.batch_status}）</span>}</ReadRow>
            {r.file_name?.includes('/') && <ReadRow label="文件"><span className="break-all text-[13px] text-muted-foreground">{r.file_name}{!r.file_exists && '（示例里没放原件）'}</span></ReadRow>}
          </dl>
          {r.detail && r.detail.新增 != null && (
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['新增', r.detail.新增], ['覆盖', r.detail.覆盖], ['一样', r.detail.一样], ['有问题', r.detail.有问题]].map(([k, n]) => (
                <div key={k as string} className="rounded-lg border bg-background/60 py-2"><div className="text-xs text-muted-foreground">{k}</div><div className={cn('num font-heading text-lg font-semibold', k === '有问题' && Number(n) > 0 && 'text-warn')}>{n ?? 0}</div></div>
              ))}
            </div>
          )}
          {hasRunDetail(r.detail) && <SheetSection title="原因和明细"><RunDetailView d={r.detail!} /></SheetSection>}
          <Provenance r={r} />
        </div>
      )}
    </DetailSheet>
  )
}

/** 预置的示例数据：经营表里有多少行是预置的、按渠道清掉 / 放回（只动预置批次，你导的不动）。“预置”只在这里说一次 */
function SamplePanel() {
  const { data: s } = useApi<SampleStatus>('/data/samples')
  const clear = useWrite(() => api.post<{ cleared: number; kept: number }>('/data/samples/clear', {}), (r) => `清掉了预置的示例数据 ${r.cleared} 行${r.kept ? `（${r.kept} 行后来导过，没动）` : ''}`)
  const restore = useWrite(() => api.post<{ restored: number; skipped: number }>('/data/samples/restore', {}), (r) => `放回了预置的示例数据 ${r.restored} 行${r.skipped ? `（${r.skipped} 行那天已经有你导的数，没放回）` : ''}`)
  if (!s) return <Skeleton className="h-24" />
  if (!s.has_presets) return null
  const live = s.batches.filter((b) => b.status === '有效')
  const gone = s.batches.filter((b) => b.status !== '有效')
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-paper md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Database className="size-4 text-primary" /><span className="text-[15px] font-semibold">预置的示例数据</span>
          {s.cleared ? <Badge value="都清掉了" tone="neutral" /> : gone.length ? <Badge value={`${gone.map((b) => b.channel).join('、')}清掉了`} tone="warn" /> : <Badge value="在用" tone="ok" />}</div>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {s.cleared ? `5 个渠道的示例数据都清掉了（${s.rows_cleared} 行放在一边，能放回）。经营页现在只有你导的数${s.my_batches ? `（${s.my_batches} 批）` : '，还没有'}。`
            : `经营每天的数里，${s.rows_live} 行是预置的（ABC茶社虚构，${live.length} 个渠道各 ${live[0]?.range ?? ''}）。下面没标“你导的”的记录（晓雯、阿杰、定时任务这些）也都是预置的，不是刚才发生的。`}
          {gone.length > 0 && !s.cleared && `${gone.map((b) => `${b.channel} ${b.cleared_rows} 行`).join('、')}清掉了，能放回。`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">{s.batches.map((b) => <span key={b.id} className={cn('rounded-md border px-2 py-0.5 text-xs', b.status === '有效' ? 'bg-background' : 'border-dashed text-muted-foreground line-through')}>{b.label.replace('示例数据 · ', '')}</span>)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.rows_cleared > 0 && <Button variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(undefined, { onSuccess: () => toast('经营页、今日页的示例数字回来了') })}><RotateCcw />{gone.length === 1 ? `放回${gone[0].channel}的示例数据` : '放回示例数据'}</Button>}
        {live.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" className="text-danger hover:text-danger"><Trash2 />{gone.length ? '其余的也清掉' : '清掉示例数据'}</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>清掉{live.length === 5 ? ' 5 个渠道' : `${live.map((b) => b.channel).join('、')}`}的示例数据？</AlertDialogTitle>
                <AlertDialogDescription>会从经营每天的数里拿掉预置的 {s.rows_live} 行（{live.map((b) => b.channel).filter(Boolean).join('、')}）。你导的数不动。清掉后这几个渠道的经营页、今日页的成交先是空的（不当 0），等你导自己的表；随时可以在这里放回。只想演示一个渠道“从无到有”，在导入页的预览里清那一个渠道就行。</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>不清</AlertDialogCancel><AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => clear.mutate(undefined)}>清掉</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </section>
  )
}
