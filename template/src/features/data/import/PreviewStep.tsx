// 第 ③ 步：预览。能导多少行（新增 / 覆盖 / 一样）、哪几行跳过或有问题（行号 + 原因）、哪几行要核对；写进去长什么样。
// 一个数都不会变的时候直说“和工作台一模一样”，主按钮换成“先清掉天猫的示例数据，再看一次”（只清这份表涉及的渠道，先弹确认），不演成“导入了 30 行”。
// 写进去长什么样：默认看最近 10 天，有问题、要核对的行排在最上面；金额整数加千分位，日期写“10月26日”。归属：数据源与导入模块
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleAlert, Equal, Info, Loader2, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { api, useWrite } from '@/lib/api'
import { Panel, Stat } from '@/components/page'
import { StickyTable } from '@/components/data-view'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { shortDate, thousands } from '@/lib/format'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Badge, Note } from '../parts'
import { CHANNEL_NAME, fullSpan } from '../labels'
import { useCommit, useDiscard } from '../use-draft'
import type { DraftView, NumKey, PreviewRow } from '../types'

const COLS: { key: NumKey; label: string }[] = [
  { key: 'gmv', label: '成交额（元）' }, { key: 'orders', label: '订单' }, { key: 'visitors', label: '访客' }, { key: 'refund_amount', label: '退款（元）' },
  { key: 'ad_spend', label: '推广花费（元）' }, { key: 'ad_gmv', label: '推广成交（元）' }, { key: 'new_buyers', label: '新客' }, { key: 'old_buyers', label: '老客' },
]
/** 和今日页、经营页一样：金额、人数都写整数加千分位（表头写了单位） */
const fmt = (_k: NumKey, n: number) => thousands(n)

export function PreviewStep({ v, onBack, onLeave }: { v: DraftView; onBack: () => void; onLeave: () => void }) {
  const p = v.preview!
  const a = v.analysis
  const qc = useQueryClient()
  const commit = useCommit(v.draft.id)
  const discard = useDiscard(onLeave)
  const chs = p.sample_channels
  const chName = chs.length === 1 ? chs[0].name : `这 ${chs.length} 个渠道`
  const clear = useWrite(async () => {
    let n = 0
    for (const c of chs) n += (await api.post<{ cleared: number }>('/data/samples/clear', { channel: c.id })).cleared
    return n
  }, (n) => `清掉了${chName}的示例数据 ${n} 行，预览重新算了一遍`)
  const acked = (v.choices.ack_missing ?? []).length > 0
  const [saveRule, setSaveRule] = useState(!acked)
  const [all, setAll] = useState(false)
  // 默认：有问题、要核对的行在最上面，其余按日期从新到旧，取 10 行；看全部时也按日期从新到旧
  const byNew = [...p.rows].sort((x, y) => y.date.localeCompare(x.date) || x.channel_id.localeCompare(y.channel_id))
  const rows = all ? byNew : [...byNew.filter((r) => r.warnings.length), ...byNew.filter((r) => !r.warnings.length)].slice(0, 10)
  const warned = p.rows.filter((r) => r.warnings.length)
  const bad = p.problems.filter((x) => x.kind === '有问题')
  const skipped = p.problems.filter((x) => x.kind === '跳过')
  const ruleText = a.rule ? (a.columns.some((c) => c.how !== '规则') && !a.rule.missing_cols.length ? `把这次的改动更新进规则「${a.rule.name}」` : `按规则「${a.rule.name}」导，规则记一次“用过”`) : '存成导入规则，以后同一种表直接按它导'
  const same = p.all_same

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {same && (
        <Note tone="info" icon={Equal} title={`这份表和工作台里的数一模一样：${p.counts.same} 行导进去，不会改任何数`}
          action={<>
            {p.same_from_samples > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="sm" disabled={clear.isPending}>{clear.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}先清掉{chName}的示例数据，再看一次</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>清掉{chName}的示例数据？</AlertDialogTitle>
                    <AlertDialogDescription>会从经营每天的数里拿掉{chs.map((c) => `${c.name}预置的 ${c.rows} 行`).join('、')}（{fullSpan(p.date_from, p.date_to)}），其余渠道不动。清掉以后、导进来之前，{chName}的经营页先是空的（不当 0）；清掉的随时能放回去：撤销这次导入后，点“放回示例数据”就行。</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>不清</AlertDialogCancel>
                    <AlertDialogAction onClick={() => clear.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: [`/data/drafts/${v.draft.id}`] }) })}>清掉，再看一次</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button size="sm" variant="outline" className="bg-card" disabled={discard.isPending} onClick={() => discard.mutate(v.draft.id)}>不用导了</Button>
          </>}>
          {a.sample_file ? '样例表本来就是从工作台导出来的。' : ''}{p.same_from_samples > 0 ? `这 ${p.same_from_samples} 行现在是${chName}预置的示例数据：只清掉${chName}的（别的渠道不动），再看就是“从无到有”导进来的样子。` : '已经导过了，不用再导。'}
        </Note>
      )}

      <div className={cn('grid gap-3', bad.length ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3')}>
        <Stat label={same ? '核对' : '能导'} value={p.counts.ok} unit="行" hint={<span>新增 {p.counts.new} · 覆盖 {p.counts.update} · 一样 {p.counts.same}</span>} />
        {bad.length > 0 && <Stat label="有问题，不导" value={bad.length} unit="行" tone="danger" hint="原因写在下面，不会当成 0" />}
        <Stat label="跳过" value={skipped.length} unit="行" hint={skipped.length ? '合计行，工作台自己会加总' : '没有要跳过的'} />
        <Stat label="渠道和日期" value={p.channels.length === 1 ? p.channels[0].name : `${p.channels.length} 个渠道`} hint={`${fullSpan(p.date_from, p.date_to)}${p.counts.warned ? ` · ${p.counts.warned} 行要核对` : ''}`} />
      </div>

      {(p.problems.length > 0 || warned.length > 0) && (
        <Panel title="这几行要说一下" desc="行号是在原文件里的第几行（含表头上面的说明行），用 Excel 打开能对上" bodyClass="p-0">
          <ul className="divide-y text-[13.5px]">
            {p.problems.map((x) => (
              <li key={`p${x.line}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-2.5">
                {x.kind === '有问题' ? <CircleAlert className="mt-0.5 size-4 text-danger" /> : <Info className="mt-0.5 size-4 text-muted-foreground" />}
                <span className="num w-[68px] shrink-0 text-muted-foreground">第 {x.line} 行</span>
                <Badge value={x.kind} />
                {x.date && <span className="num text-muted-foreground">{shortDate(x.date)}</span>}
                <span className="min-w-0 flex-1">{x.reason}</span>
              </li>
            ))}
            {warned.map((r) => (
              <li key={`w${r.line}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 bg-warn-soft/30 px-5 py-2.5">
                <TriangleAlert className="mt-0.5 size-4 text-warn" />
                <span className="num w-[68px] shrink-0 text-muted-foreground">第 {r.line} 行</span>
                <Badge value="要核对" />
                <span className="num text-muted-foreground">{shortDate(r.date)} {CHANNEL_NAME[r.channel_id]}</span>
                <span className="min-w-0 flex-1">{r.warnings.join('；')}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={`写进去长什么样${all ? `（全部 ${p.rows.length} 行）` : `（最近 ${rows.length} 天${warned.length ? '，要核对的排最上面' : ''}）`}`} desc="覆盖的行：划掉的是工作台里原来的数；灰色是表里没有、保留原来的"
        action={p.rows.length > 10 && <Button size="sm" variant="ghost" onClick={() => setAll((x) => !x)}>{all ? '只看最近 10 天' : `看全部 ${p.rows.length} 行`}</Button>} bodyClass="p-0">
        <StickyTable className="rounded-none border-0 shadow-none" maxHeight={all ? '560px' : 'none'}>
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">行</TableHead><TableHead>日期</TableHead><TableHead>渠道</TableHead>
            {COLS.map((c) => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}
            <TableHead className="pr-5">写入</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((r) => <PreviewLine key={r.line} r={r} />)}</TableBody>
        </StickyTable>
      </Panel>

      <footer className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 md:-mx-7 md:px-7">
        <Button variant="ghost" onClick={onBack}><ArrowLeft />改对照</Button>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
          <Checkbox checked={saveRule} onCheckedChange={(x) => setSaveRule(x === true)} />
          <span className="min-w-0">{ruleText}{acked && <span className="text-muted-foreground">（这次有不导的列，建议先不存）</span>}</span>
        </label>
        <Button variant={same ? 'outline' : 'default'} disabled={commit.isPending || !p.counts.ok} onClick={() => commit.mutate({ save_rule: saveRule })}>
          {commit.isPending ? <Loader2 className="animate-spin" /> : <Upload />}{same ? '仍然导入（记一次核对）' : `导入 ${p.counts.ok} 行`}
        </Button>
      </footer>
    </div>
  )
}

function PreviewLine({ r }: { r: PreviewRow }) {
  return (
    <TableRow className={cn(r.warnings.length && 'bg-warn-soft/30')}>
      <TableCell className="num pl-5 text-muted-foreground">{r.line}</TableCell>
      <TableCell className="num whitespace-nowrap">{shortDate(r.date)}</TableCell>
      <TableCell className="whitespace-nowrap">{CHANNEL_NAME[r.channel_id] ?? r.channel_id}</TableCell>
      {COLS.map(({ key }) => {
        const changed = r.changed.includes(key) && r.before
        const kept = r.kept.includes(key)
        return (
          <TableCell key={key} className={cn('num text-right whitespace-nowrap', kept && 'text-muted-foreground')} title={kept ? '表里没有，保留工作台里原来的' : undefined}>
            {changed && <span className="mr-1.5 text-xs text-muted-foreground line-through">{fmt(key, r.before![key])}</span>}
            <span className={cn(changed && 'font-medium text-foreground')}>{fmt(key, r.values[key])}</span>
          </TableCell>
        )
      })}
      <TableCell className="pr-5"><Badge value={r.status} /></TableCell>
    </TableRow>
  )
}
