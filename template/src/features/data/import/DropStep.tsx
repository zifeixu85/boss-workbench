// 第 ① 步：拖文件（手机上是“选一份导出的表”）。下面是样例表（两列小卡：渠道图标、人话名称、一句说明、“用这份试试”、下载）；
// 右边是“上次没导完的”和“以后不用拖”，你现场导过才显示“最近你导的”。归属：数据源与导入模块
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Download, FileSpreadsheet, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { useApi } from '@/lib/api'
import { Panel } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Badge, KindIcon } from '../parts'
import { CHANNEL_ICON, when } from '../labels'
import { useCreateDraft, useDiscard } from '../use-draft'
import type { Run, SampleFile, Source } from '../types'

type DraftLite = { id: string; file_name: string; file_size: number | null; created_at: string }

export function DropStep({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateDraft(onCreated)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { data: samples = [] } = useApi<SampleFile[]>('/data/sample-files')
  const { data: drafts = [] } = useApi<DraftLite[]>('/data/drafts')
  const { data: runs = [] } = useApi<Run[]>('/data/runs?limit=5&origin=自己的&files=1')
  const { data: sources = [] } = useApi<Source[]>('/data/sources')
  const discard = useDiscard(() => undefined)
  const pick = (files: FileList | null) => { const f = files?.[0]; if (f) create.mutate({ file: f }) }
  const busy = create.isPending

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(280px,1fr)]">
      <div className="grid content-start gap-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files) }}
          className={cn('group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed bg-card px-6 py-8 text-center shadow-paper transition',
            over ? 'border-primary bg-accent/70' : 'border-border hover:border-primary/50 hover:bg-accent/30', busy && 'pointer-events-none opacity-70')}>
          <input ref={input} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
          <span className={cn('grid size-14 place-items-center rounded-2xl bg-accent text-primary transition', over && 'scale-110')}>
            {busy ? <Loader2 className="size-7 animate-spin" /> : <UploadCloud className="size-7" />}
          </span>
          <div>
            <div className="font-heading text-xl font-semibold">{busy ? '正在读这份表…' : over ? '松手就行' : <><span className="hidden sm:inline">把平台导出的表拖到这里</span><span className="sm:hidden">选一份导出的表</span></>}</div>
            <p className="mt-1.5 hidden text-sm text-muted-foreground sm:block">或者 <span className="font-medium text-primary underline-offset-4 group-hover:underline">点这里选文件</span>　·　CSV 表格；Excel 先“另存为 CSV”</p>
            <p className="mt-1.5 text-sm text-muted-foreground sm:hidden">点这里，从手机里选 CSV 表格。<br />Excel 文件先另存为 CSV。</p>
          </div>
          <p className="max-w-xl text-[12px] text-muted-foreground">这一步只读文件，不改任何数据。认出是哪家的表、对好字段、预览没问题才写进去。</p>
        </label>

        <section aria-label="样例表">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-[15px] font-semibold">没有自己的表？用样例表试试</h2>
            <span className="text-xs text-muted-foreground">示例数据：从工作台 9月27日—10月26日 的数导出来的，数字和经营页一样</span>
          </div>
          {samples.length ? (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {samples.map((f, i) => <SampleCard key={f.name} f={f} first={i === 0} busy={busy} onTry={() => create.mutate({ sample: f.name })} />)}
            </ul>
          ) : <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">还没生成样例表。在 工作台/程序/ 下运行 node server/modules/data/sample-files.ts</p>}
        </section>
      </div>

      <div className="grid content-start gap-4">
        {drafts.length > 0 && (
          <Panel title="上次没导完的" desc="对到一半的文件存着，接着对就行" bodyClass="p-0">
            <ul className="divide-y">
              {drafts.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                  <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium" title={d.file_name}>{d.file_name}</div><div className="text-xs text-muted-foreground">{when(d.created_at)} 拖进来</div></div>
                  <Button size="sm" variant="outline" onClick={() => onCreated(d.id)}>接着对</Button>
                  <Button size="icon-sm" variant="ghost" aria-label="放弃这份" onClick={() => discard.mutate(d.id)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title="以后不用拖" desc="存好规则后，导出表放进对应文件夹，定时任务按规则导；表头变了会停下来提醒" bodyClass="p-0">
          <ul className="divide-y">
            {sources.filter((s) => s.inbox_dir).map((s) => {
              return (
                <li key={s.id} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px]">
                  <KindIcon of={s} className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><div className="truncate">{s.short}</div><div className="truncate text-xs text-muted-foreground" title={s.inbox_dir!}>{s.inbox_dir}/</div></div>
                  {s.pending ? <Badge value="表头变了" /> : s.rule ? <Badge value="有规则" tone="ok" /> : <Badge value="还没规则" tone="warn" />}
                </li>
              )
            })}
          </ul>
        </Panel>
        {runs.length > 0 && (
          <Panel title="最近你导的" action={<Button size="sm" variant="ghost" asChild><Link to="/imports/history">导入记录<ArrowRight /></Link></Button>} bodyClass="p-0">
            <ul className="divide-y">
              {runs.map((r) => (
                <li key={r.id} className="grid gap-0.5 px-4 py-2.5">
                  <div className="truncate text-[13px]">{r.message}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="num">{when(r.started_at)}</span><Badge value={r.status} />{r.batch_status === '已撤销' && <Badge value="已撤销" />}</div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  )
}

function SampleCard({ f, first, busy, onTry }: { f: SampleFile; first: boolean; busy: boolean; onTry: () => void }) {
  const Icon = (f.channel && CHANNEL_ICON[f.channel]) || FileSpreadsheet
  return (
    <li className={cn('group flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3 shadow-paper transition hover:border-primary/40', first && 'border-primary/35 ring-1 ring-primary/10')}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium" title={f.name}>{f.title}</span>
            {first && <Badge value="建议先试这份" tone="primary" className="shrink-0" />}
          </div>
          <div className="num text-[11.5px] text-muted-foreground">{f.range}</div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{f.note}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 pl-12">
        <Button size="sm" variant="outline" className="h-7" aria-label={`用这份试试：${f.title}`} disabled={busy} onClick={onTry}>用这份试试</Button>
        <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`下载：${f.title}`} asChild><a href={`/api/data/sample-files/${encodeURIComponent(f.name)}`} download={f.name}><Download /></a></Button></TooltipTrigger><TooltipContent>下载这份 CSV（自己用 Excel 打开看看）</TooltipContent></Tooltip>
      </div>
    </li>
  )
}
