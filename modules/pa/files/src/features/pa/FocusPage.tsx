// “我关注的”里的一页：知识库档案里有几类就出几页，都用这一个页面（/focus/<类名>）。
// 列表：状态标签 + 知识库档案里“列表上显示”点到的两个字段；点一行在右侧抽屉看详情（地址栏 ?o=<路径>）。只读，不改知识库。
import { useParams, useSearchParams } from 'react-router'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { StickyTable } from '@/components/data-view'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ObjectSheet } from './ObjectSheet'
import { ObjectStatus, when } from './parts'
import type { FocusList } from './types'

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

export default function FocusPage() {
  const { name = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') ?? 'all'
  const open = sp.get('o')
  const { data, error, refetch } = useApi<FocusList>(`/m/pa/focus/${encodeURIComponent(name)}`)
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n }, { replace: k === 'status' })

  if (error && !data) return <><PageHeader eyebrow="我关注的" title={name} /><PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!data) return <><PageHeader eyebrow="我关注的" title={name} /><PageBody className="grid gap-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-72" /></PageBody></>

  const cls = data.class
  // 状态页签：按知识库档案里写的可选值排；对象上写了别的状态也列出来，最多 6 个
  const order = [...cls.statuses, ...Object.keys(data.counts).filter((s) => !cls.statuses.includes(s))].filter((s) => data.counts[s]).slice(0, 5)
  const items = status === 'all' ? data.items : data.items.filter((i) => (i.status || '没写状态') === status)
  return (
    <>
      <PageHeader eyebrow="我关注的" title={cls.name} desc={`知识库 ${cls.folder}/ 里的每一份文件是一个${cls.name}。这一页只读；要改，在对话里让助理改知识库。`} />
      <PageBody className="grid gap-4">
        {!cls.confirmed && (
          <Alert><AlertTitle>这一类还没确认</AlertTitle><AlertDescription>“{cls.name}”是 AI 按你的资料提的分类，知识库档案里还标着待确认。看着对就在对话里说一声“{cls.name}这一类确认”。</AlertDescription></Alert>
        )}
        {data.problems.length > 0 && (
          <Alert className="border-warn/30 bg-warn-soft/50"><AlertTitle>知识库这边有几处要看一下</AlertTitle><AlertDescription>{data.problems.join('；')}</AlertDescription></Alert>
        )}
        <ViewTabs label="按状态看" value={status} onChange={(v) => set('status', v === 'all' ? null : v)}
          items={[{ value: 'all', label: '全部', count: data.items.length }, ...order.map((s) => ({ value: s, label: s, count: data.counts[s] }))]} />
        {items.length ? (
            <StickyTable>
                <TableHeader><TableRow>
                  <TableHead>{cls.name}</TableHead><TableHead>状态</TableHead>
                  {cls.fields.map((f) => <TableHead key={f} className="hidden sm:table-cell">{f}</TableHead>)}
                  <TableHead className="hidden lg:table-cell">现在</TableHead><TableHead className="hidden md:table-cell">AI 对话</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((o) => (
                    <TableRow key={o.path} className="cursor-pointer" onClick={() => set('o', o.path)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') set('o', o.path) }}>
                      <TableCell className="font-medium">
                        <span className="flex flex-wrap items-center gap-1.5">{o.name}
                          {o.confirm === '待确认' && <StatusBadge value="待确认" tone="warn" />}
                          {o.confirm === '已过期' && <StatusBadge value="已过期" tone="danger" />}
                          {o.privacy === '私密' && <StatusBadge value="私密" tone="neutral" />}
                        </span>
                      </TableCell>
                      <TableCell><ObjectStatus value={o.status} known={o.status_known} /></TableCell>
                      {o.fields.map((f) => <TableCell key={f.key} className="hidden text-sm sm:table-cell">{f.value ? (isDate(f.value) ? shortDate(f.value) : f.value) : <span className="text-muted-foreground">—</span>}</TableCell>)}
                      <TableCell className="hidden max-w-[360px] truncate text-sm text-muted-foreground lg:table-cell">{o.now || '—'}</TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        {o.sessions ? <span className="flex items-center gap-1.5">{o.sessions} 个{o.unread > 0 && <StatusBadge value={`${o.unread} 个等你`} tone="warn" />}<span className="text-xs text-muted-foreground">{when(o.last_at)}</span></span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
            </StickyTable>
          ) : (
            <Panel><EmptyNote>{data.items.length ? `没有“${status}”的${cls.name}。` : `知识库 ${cls.folder}/ 里还没有${cls.name}。在对话里让助理按“对象文件”的格式建一份，这里就会出现。`}</EmptyNote></Panel>
          )}
      </PageBody>
      <ObjectSheet path={open} onClose={() => set('o', null)} />
    </>
  )
}
