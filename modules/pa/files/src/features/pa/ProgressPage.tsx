// 进展：本机所有 AI 对话做到哪了。只读本机的对话记录；状态是推断的（页面上写明），可以手动改，改动只记在工作台里。
// 状态页签写进地址栏（?status=）；点一行在右侧抽屉看这次对话（?s=<编号>）。
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Choice } from '@/components/form'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { SessionSheet } from './SessionSheet'
import { SESSION_STATUSES, SessionBadge, when } from './parts'
import { ProgressCharts, ProgressStats } from './Pulse'
import { UsagePanel } from './UsagePanel'
import type { Progress, Pulse, Session } from './types'

type Scan = { read: number; left: number; sessions: number }

export default function ProgressPage() {
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') ?? 'all'
  const object = sp.get('object')
  const tool = sp.get('tool')
  const who = sp.get('assistant')
  const all = sp.get('all') === '1'
  const { data, error, refetch } = useApi<Progress>(`/m/pa/progress?days=30${all ? '&all=1' : ''}`)
  const { data: pulse } = useApi<Pulse>('/m/pa/pulse?days=14')
  // 后台在扫本机对话记录：先给现有的，过 2 秒再取一次，扫完就停
  useEffect(() => { if (!data?.scanning) return; const t = setTimeout(() => { void refetch() }, 2000); return () => clearTimeout(t) }, [data, refetch])
  const rescan = useWrite(() => api.post<Scan>('/m/pa/scan', {}), (r) => (r.left ? `读了 ${r.read} 个记录文件，还剩 ${r.left} 个，再点一次接着读` : `扫完了，现在有 ${r.sessions} 个对话`))
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n }, { replace: k !== 's' })

  const head = <PageHeader eyebrow="我的助理" title="进展" desc="所有 AI 对话做到哪了。只读这台电脑上 Codex、Claude Code 的对话记录，只取标题、文件夹和时间，不存对话内容。"
    actions={<Button variant="outline" onClick={() => rescan.mutate(undefined)} disabled={rescan.isPending}><RefreshCw className={rescan.isPending ? 'animate-spin' : ''} />重新扫一遍</Button>} />
  if (error && !data) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!data) return <>{head}<PageBody className="grid gap-3"><Skeleton className="h-9 w-96" /><Skeleton className="h-96" /></PageBody></>

  const pool = data.sessions.filter((s) => (!tool || s.tool === tool) && (!object || (object === '-' ? !s.object : s.object?.path === object)) && (!who || (who === '-' ? !s.assistant : s.assistant?.key === who)))
  const counts = Object.fromEntries(SESSION_STATUSES.map((k) => [k, pool.filter((s) => s.status === k).length]))
  const list = status === 'all' ? pool : pool.filter((s) => s.status === status)
  const used = [...new Map(data.sessions.filter((s) => s.object).map((s) => [s.object!.path, s.object!])).values()]
  const missing = data.sources.filter((s) => !s.found)
  // 按助理（约定 11.11）：对话按标题、第一句、常驻对话认是哪个助理的
  const helpers = [...new Map(data.sessions.filter((s) => s.assistant).map((s) => [s.assistant!.key, s.assistant!])).values()]
  const active = [who, object, tool, all ? '1' : null].filter(Boolean).length
  const filters = (
    <>
      <Choice className="w-full xl:w-32" value={who} onChange={(v) => set('assistant', v)} allowEmpty emptyLabel="全部助理" placeholder="按助理"
        options={[...helpers.map((a) => ({ value: a.key, label: `${a.avatar ? `${a.avatar} ` : ''}${a.name}` })), { value: '-', label: '没归到助理的' }]} />
      <Choice className="w-full xl:w-36" value={object} onChange={(v) => set('object', v)} allowEmpty emptyLabel="全部对象" placeholder="按对象"
        options={[...used.map((o) => ({ value: o.path, label: `${o.type} · ${o.name}` })), { value: '-', label: '未归类' }]} />
      <Choice className="w-full xl:w-32" value={tool} onChange={(v) => set('tool', v)} allowEmpty emptyLabel="全部工具" placeholder="按工具" options={data.sources.map((s) => ({ value: s.tool, label: s.name }))} />
      <Choice className="w-full xl:w-36" value={all ? '1' : '0'} onChange={(v) => set('all', v === '1' ? '1' : null)} options={[{ value: '0', label: '只看我开的对话' }, { value: '1', label: '连子任务、脚本' }]} />
    </>
  )
  return (
    <>
      {head}
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {pulse ? <><ProgressStats p={pulse} waiting={data.sessions.filter((s) => s.status === '在等我').length} /><ProgressCharts p={pulse} /></> : <Skeleton className="h-28" />}
        <UsagePanel focus={sp.get('view') === 'usage'} />
        {/* 页签和筛选一行放下（2026-11-26 A梦：“容易换行”）：宽屏三个下拉跟在页签右边；窄了（含 Codex 右边面板）收成一个“筛选”按钮，不半行悬着 */}
        <div className="flex min-w-0 items-center gap-2">
          <ViewTabs className="min-w-0 flex-1" label="按状态看" value={status} onChange={(v) => set('status', v === 'all' ? null : v)}
            items={[{ value: 'all', label: '全部', count: pool.length }, ...SESSION_STATUSES.map((k) => ({ value: k, label: k, count: counts[k] }))]} />
          <div className="hidden shrink-0 items-center gap-2 xl:flex">{filters}</div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 xl:hidden"><SlidersHorizontal />筛选{active ? <span className="num rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">{active}</span> : null}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="grid w-60 gap-2">{filters}</PopoverContent>
          </Popover>
        </div>

        <Panel bodyClass="p-2">
          {list.map((s) => <Row key={s.id} s={s} onOpen={() => set('s', s.id)} />)}
          {!list.length && <div className="p-3"><EmptyNote>{data.sessions.length ? '这个筛选下没有对话。' : data.left ? '还在读本机的对话记录，稍等一下再点“重新扫一遍”。' : `近 30 天这台电脑上没有读到 AI 对话。${missing.length ? `没找到 ${missing.map((m) => m.name).join('、')} 的记录目录。` : ''}`}</EmptyNote></div>}
        </Panel>

        <p className="text-xs leading-relaxed text-muted-foreground">
          状态大多是推断的：看最后一轮结束没有、最后一段话像不像在问你、多久没动（{data.rules.running_min} 分钟内还在动算进行中；做完两天多没动、或超过 {data.rules.stale_days} 天没动，按做完了算；最近一轮没跑完就断了的算没做完）。Codex 桌面版的对话，看没看用的是 Codex 自己记的。会有不准，点开一条可以手动改，改动只记在工作台里。
          只读得到这台电脑上的对话，网页版和云端的读不到；只读近 {data.rules.scan_days} 天动过的记录。
          {data.scanned_at && ` 上次扫描 ${when(data.scanned_at)}。`}{data.left > 0 && ` 还有 ${data.left} 个记录文件没读完，点“重新扫一遍”接着读。`}
          {missing.length > 0 && ` 这台电脑上没找到 ${missing.map((m) => m.name).join('、')} 的记录目录。`}
          {data.errors.length > 0 && ` 有 ${data.errors.length} 个文件没读成。`}
        </p>
      </PageBody>
      <SessionSheet id={sp.get('s')} objects={data.objects} onClose={() => set('s', null)} />
    </>
  )
}

function Row({ s, onOpen }: { s: Session; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">{s.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{s.assistant && <>{s.assistant.avatar ? `${s.assistant.avatar} ` : ''}{s.assistant.name} · </>}<span className={s.object ? 'font-medium text-primary' : ''}>{s.object?.name ?? '未归类'}</span> · {s.tool_name}{s.kind !== '对话' ? ` · ${s.kind}` : ''} · {when(s.last_at)} · {s.folder}{s.outputs ? ` · 产出 ${s.outputs} 个` : ''}</span>
      </span>
      <SessionBadge s={s} />
    </button>
  )
}
