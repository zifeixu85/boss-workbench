// 产出：AI 生成的图片和写出来的文件，不分哪个 AI、存在哪个文件夹。图片排成瀑布流（按原来的宽高比例整张显示，不裁切），
// 别的是列表（文件名打头、左对齐）；按类型（页签）、对象、工具筛。顶上是本周出了多少、近两周每天出了多少。
// 详情按编号取；能在本机打开（图片、文档、表格、网页）或在访达里显示。已经不在原处的默认不列。文件只读不搬。
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ExternalLink, FolderOpen, ImageOff } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Choice } from '@/components/form'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { ReadRow } from '@/components/detail-parts'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { when } from './parts'
import { OutputCharts } from './Pulse'
import type { Output, Outputs, Pulse } from './types'

const OPENABLE = new Set(['图片', '文档', '表格', '网页'])

const KINDS = ['图片', '文档', '表格', '网页', '代码', '其他']
const RANGES = [{ value: '7', label: '近 7 天' }, { value: '30', label: '近 30 天' }, { value: '90', label: '近 90 天' }]
const src = (o: Output, thumb = false) => `/api/m/pa/outputs/${o.id}/file${thumb ? '?size=thumb' : ''}`

export default function OutputsPage() {
  const [sp, setSp] = useSearchParams()
  const [limit, setLimit] = useState(60)
  const kind = sp.get('kind') ?? '图片'
  const days = sp.get('days') ?? '30'
  const q = new URLSearchParams({ kind, days, limit: String(limit) })
  for (const k of ['assistant', 'object', 'tool', 'session', 'gone']) if (sp.get(k)) q.set(k, sp.get(k)!)
  const { data, error, refetch } = useApi<Outputs>(`/m/pa/outputs?${q}`)
  const set = (k: string, v: string | null) => { setLimit(60); setSp((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n }, { replace: k !== 'f' }) }
  const { data: pulse } = useApi<Pulse>('/m/pa/pulse?days=14')
  // 详情按编号直接取：不受列表条数、筛选的限制
  const fid = sp.get('f')
  const { data: open } = useApi<Output>(fid ? `/m/pa/outputs/${encodeURIComponent(fid)}` : null)
  const openOnMac = useWrite((reveal: boolean) => api.post<{ reveal: boolean }>(`/m/pa/outputs/${encodeURIComponent(fid!)}/open`, { reveal }), (r) => (r.reveal ? '已在访达里显示' : '已在本机打开'))

  const head = <PageHeader eyebrow="我的助理" title="产出" desc="AI 生成的图和写出来的文件，不分哪个 AI、存在哪个文件夹。文件只读不搬，还在它原来的位置。" />
  if (error && !data) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!data) return <>{head}<PageBody className="grid gap-3"><Skeleton className="h-9 w-96" /><Skeleton className="h-96" /></PageBody></>
  return (
    <>
      {head}
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {pulse ? <OutputCharts p={pulse} /> : <Skeleton className="h-44" />}
        <div className="flex flex-wrap items-center gap-2">
          <ViewTabs label="按类型看" value={kind} onChange={(v) => set('kind', v)} items={KINDS.map((k) => ({ value: k, label: k, count: data.counts[k] ?? 0 }))} />
          <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap">
            <Choice className="w-full sm:w-32" value={days} onChange={(v) => set('days', v)} options={RANGES} />
            {data.assistants.length > 0 && <Choice className="w-full sm:w-32" value={sp.get('assistant')} onChange={(v) => set('assistant', v)} allowEmpty emptyLabel="全部助理" placeholder="按助理"
              options={data.assistants.map((a) => ({ value: a.key, label: `${a.avatar ? `${a.avatar} ` : ''}${a.name}` }))} />}
            <Choice className="w-full sm:w-40" value={sp.get('object')} onChange={(v) => set('object', v)} allowEmpty emptyLabel="全部对象" placeholder="按对象"
              options={[...data.objects.map((o) => ({ value: o.path, label: `${o.type} · ${o.name}` })), { value: '-', label: '未归类' }]} />
            <Choice className="w-full sm:w-36" value={sp.get('tool')} onChange={(v) => set('tool', v)} allowEmpty emptyLabel="全部工具" placeholder="按工具" options={data.tools.map((t) => ({ value: t.tool, label: t.name }))} />
          </div>
        </div>
        {sp.get('session') && <p className="text-sm text-muted-foreground">只看一次对话的产出。<button className="text-primary hover:underline" onClick={() => set('session', null)}>看全部</button></p>}

        {!data.items.length && <Panel><EmptyNote>这个筛选下没有{kind}。{kind !== '图片' && '这里只列对话里“写文件”动作留下的路径；AI 用命令行生成的文件记不到。'}</EmptyNote></Panel>}

        {kind === '图片' && data.items.length > 0 && (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 2xl:columns-5">
            {data.items.map((o) => (
              <button key={o.id} onClick={() => set('f', o.id)} className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border bg-card text-left shadow-paper transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring">
                {o.exists ? <img src={src(o, true)} alt={o.name} loading="lazy" width={o.width ?? undefined} height={o.height ?? undefined} style={{ aspectRatio: o.width && o.height ? `${o.width} / ${o.height}` : '4 / 3' }} className="block h-auto w-full bg-muted object-contain" />
                  : <span className="grid aspect-[4/3] place-items-center bg-muted"><ImageOff className="size-6 text-muted-foreground" /></span>}
                <span className="block px-2.5 py-2">
                  <span className={`block truncate text-xs font-medium ${o.object ? 'text-primary' : 'text-muted-foreground'}`}>{o.object?.name ?? '未归类'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.tool_name} · {when(o.at)}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {kind !== '图片' && data.items.length > 0 && (
          <Panel bodyClass="p-2">
            {data.items.map((o) => (
              <button key={o.id} onClick={() => set('f', o.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14.5px] font-medium ${o.exists ? '' : 'text-muted-foreground line-through'}`}>{o.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground"><span className={o.object ? 'font-medium text-primary' : ''}>{o.object?.name ?? '未归类'}</span> · {o.tool_name} · {when(o.at)} · {o.folder}</span>
                </span>
                {!o.exists && <StatusBadge value="已不在原处" tone="neutral" />}
              </button>
            ))}
          </Panel>
        )}

        {(data.gone > 0 || sp.get('gone')) && <p className="text-xs text-muted-foreground">{sp.get('gone')
          ? <>已经不在原处的也列出来了。<button className="text-primary hover:underline" onClick={() => set('gone', null)}>只看还在的</button></>
          : <>另有 {data.gone} 个{kind}已经不在原处（多是临时文件夹里的），没列出来。<button className="text-primary hover:underline" onClick={() => set('gone', '1')}>也列出来</button></>}</p>}
        {data.total > data.items.length && <div className="text-center"><Button variant="outline" onClick={() => setLimit((n) => n + 60)}>再看 60 个（共 {data.total} 个）</Button></div>}
        <p className="text-xs leading-relaxed text-muted-foreground">图片来自 Codex 的图片目录；文件来自对话里“写文件”动作留下的路径（Codex 的补丁、Claude Code 的写文件），只算新写出来的，改已有文件的不算。AI 用命令行生成的文件、网页版里生成的东西记不到。</p>
      </PageBody>

      <DetailSheet open={!!fid} onClose={() => set('f', null)} wide eyebrow={open?.kind} title={open?.name} meta={open && <><span>{open.tool_name}</span><span>{when(open.at)}</span>{!open.exists && <StatusBadge value="已不在原处" tone="neutral" />}</>}
        actions={open?.exists && <>
          {OPENABLE.has(open.kind) && <Button size="sm" disabled={openOnMac.isPending} onClick={() => openOnMac.mutate(false)}><ExternalLink />{open.kind === '网页' ? '在浏览器里打开' : '在本机打开'}</Button>}
          <Button size="sm" variant="outline" disabled={openOnMac.isPending} onClick={() => openOnMac.mutate(true)}><FolderOpen />在访达里显示</Button>
        </>}>
        {open && (
          <>
            {open.kind === '图片' && open.exists && <div className="mb-5 grid place-items-center rounded-lg border bg-muted/50 p-2"><img src={src(open)} alt={open.name} className="h-auto max-h-[62vh] w-auto max-w-full rounded-md" /></div>}
            {!open.exists && <p className="mb-5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">这个文件已经不在原来的位置了（被删掉、挪走，或者是临时文件夹里的）。清单里只留着它的路径。</p>}
            {open.exists && !OPENABLE.has(open.kind) && <p className="mb-5 text-xs text-muted-foreground">{open.kind}文件不从网页直接打开（有的一打开就会运行），点“在访达里显示”找到它。</p>}
            <SheetSection title="在哪">
              <dl>
                <ReadRow label="所在文件夹"><span className="break-all">{open.folder}</span></ReadRow>
                <ReadRow label="哪次对话">{open.session ? <Link className="text-primary hover:underline" to={`/progress?s=${encodeURIComponent(open.session.id)}`}>{open.session.title}</Link> : '认不出是哪次对话生成的'}</ReadRow>
                <ReadRow label="归到">{open.object ? `${open.object.type} · ${open.object.name}` : '未归类（跟着对话归类；在“进展”里给那次对话指一个对象）'}</ReadRow>
                <ReadRow label="怎么来的">{open.action === '生成' ? 'AI 生成的图片' : `对话里${open.action}的文件`}</ReadRow>
              </dl>
            </SheetSection>
          </>
        )}
      </DetailSheet>
    </>
  )
}
