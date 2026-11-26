// 一篇的创作台：左对话、右稿件。手上的修改在发给 AI、采用候选之前先存成一版；AI 在写的时候右边锁住，写完换成新版本。归属：小红书内容模块。 创作台：一屏两栏、账号与离开前保存。
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CheckCheck, Eye, FileText, Images, History, Send, Smartphone, LineChart } from 'lucide-react'
import { PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ViewTabs } from '@/components/view-tabs'
import { Failed } from '@/components/chart-kit'
import { dateWithRel } from '@/lib/format'
import { useStudio } from '../api'
import { XhsPreviewName } from '../account-name'
import { toast } from 'sonner'
import { usePieceParam } from '../lib'
import { ContentOverlays } from '../ContentOverlays'
import { ScheduleDialog, PublishDialog } from '../dialogs'
import { ChatPane } from './ChatPane'
import { DraftEditor } from './DraftEditor'
import { PreviewTab } from './PreviewTab'
import { CoverTab } from './CoverTab'
import { VersionsTab } from './VersionsTab'
import { DraftBar } from './DraftBar'
import { AccountPicker } from './AccountPicker'
import { PaneResizer, useChatWidth } from './PaneResizer'
import './studio.css'
import type { Draft } from '../types'

type Tab = 'draft' | 'preview' | 'cover' | 'versions'
const START_LABEL: Record<string, string> = { 选题: '从选题开始', 旧笔记: '翻新一篇旧笔记', 一款茶: '从一款产品开始', 对标笔记: '借一篇对标笔记', 一句话: '一句话开写' }

export function Workspace({ id }: { id: string }) {
  const { data, error, refetch } = useStudio(id)
  const qc = useQueryClient()
  const sheet = usePieceParam()
  const [params, setParams] = useSearchParams()
  const tab = (['draft', 'preview', 'cover', 'versions'].includes(params.get('tab') ?? '') ? params.get('tab') : 'draft') as Tab
  const pane = params.get('pane') === 'preview' ? 'preview' : params.get('pane') === 'draft' ? 'draft' : 'chat'
  const setTab = useCallback((value: Tab) => setParams(p => {
    const next = new URLSearchParams(p)
    next.set('tab', value)
    next.set('pane', value === 'preview' ? 'preview' : 'draft')
    return next
  }, { replace: true }), [setParams])
  const selectPane = (value: 'chat' | 'draft' | 'preview') => {
    if (value !== 'chat') { setTab(value); return }
    setParams(p => { const next = new URLSearchParams(p); next.set('pane', 'chat'); return next }, { replace: true })
  }
  // 窄屏由 pane 决定显示内容；封面、版本仍属于稿件段。
  const visibleTab = pane === 'preview' ? 'preview' : pane === 'draft' && tab === 'preview' ? 'draft' : tab
  const root = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const draftCard = useRef<HTMLElement>(null)
  const chat = useChatWidth(grid)
  const showDraft = useCallback(() => {
    setTab('draft')
  }, [setTab])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [flash, setFlash] = useState(false)
  const [dlg, setDlg] = useState<'schedule' | 'final' | 'publish' | null>(null)
  const seen = useRef<number | null>(null)
  const wasRunning = useRef(false)

  // 服务端有了新版本（AI 写好、采用候选、恢复），没在手动改的话就换上
  useEffect(() => {
    if (!data) return
    if (seen.current !== data.version && !dirty) {
      if (seen.current !== null && data.version > seen.current) { setFlash(true); setTimeout(() => setFlash(false), 1600) }
      seen.current = data.version
      setDraft(data.draft)
    }
  }, [data, dirty])
  // 一轮跑完，刷新其他页面要用的数据（看板、今天页）
  useEffect(() => {
    if (!data) return
    if (wasRunning.current && !data.running) qc.invalidateQueries()
    wasRunning.current = data.running
  }, [data, qc])

  const edit = useCallback((patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true) }, [])
  const [saving, setSaving] = useState(false)
  const pending = useRef<Promise<void> | null>(null)
  const live = useRef({ draft, dirty })
  live.current = { draft, dirty }
  // keepalive 让刷新时已发出的保存继续完成；同一份修改只发一次。
  const ensureSaved = useCallback((): Promise<void> => {
    if (pending.current) return pending.current.then(() => live.current.dirty ? ensureSaved() : undefined)
    const snapshot = live.current.draft
    if (!live.current.dirty || !snapshot) return Promise.resolve()
    setSaving(true)
    const request = fetch(`/api/m/xhs/pieces/${encodeURIComponent(id)}/versions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ data: snapshot, note: '手动修改' }),
    }).then(async res => {
      const result = await res.json()
      if (!res.ok || !result.ok) throw new Error(result.error || '保存失败，请重试')
      if (live.current.draft === snapshot) { live.current.dirty = false; setDirty(false) }
      void qc.invalidateQueries()
    }).catch((error: Error) => { toast.error(error.message); throw error }).finally(() => { pending.current = null; setSaving(false) })
    pending.current = request
    return request
  }, [id, qc])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!window.confirm('有改动没存，保存后离开？')) { blocker.reset(); return }
    void ensureSaved().then(() => blocker.proceed()).catch(() => blocker.reset())
  }, [blocker, ensureSaved])
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (!live.current.dirty) return
      event.preventDefault(); event.returnValue = ''
      void ensureSaved().catch(() => undefined)
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [ensureSaved])
  useEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => el.style.setProperty('--studio-top', `${Math.max(0, el.getBoundingClientRect().top)}px`)
    if (window.innerWidth >= 1024) { el.closest('main')?.scrollTo(0, 0); window.scrollTo(0, 0) }
    measure()
    const observer = new ResizeObserver(measure)
    if (el.parentElement) observer.observe(el.parentElement)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [!!data, !!draft])
  const discard = () => { if (data) { setDraft(data.draft); setDirty(false) } }

  if (error) {
    const missing = /找不到/.test((error as Error).message)
    return (
      <div className="p-7">
        {missing ? (
          <div className="grid place-items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center">
            <p className="text-sm">找不到这一篇，可能已经放弃了，或者链接是旧的。</p>
            <Button asChild variant="outline"><Link to="/content/pieces">回到内容</Link></Button>
          </div>
        ) : <Failed message={(error as Error).message} onRetry={() => refetch()} />}
      </div>
    )
  }
  if (!data || !draft) return <div className="grid gap-4 p-7"><Skeleton className="h-12 w-80" /><div className="grid h-[70vh] grid-cols-[2fr_3fr] gap-4"><Skeleton /><Skeleton /></div></div>
  const p = data.piece
  const published = p.status === '已发布'
  // 谁做的：选题是谁存的，加上每一版的作者（网页上手动改的、老板自己的不重复列）
  const writers = [...new Set([p.created_by, ...data.versions.map((v) => v.author ?? '')].filter((x) => x && !/^(网页|本机 Codex|Codex|Codex 定时任务|导入|复盘)$/.test(x)))]
  const locked = data.running || published || saving
  return (
    <div ref={root} className="xhs-workspace" data-pane={pane}>
      <PageHeader eyebrow={`创作 · ${START_LABEL[p.start?.kind ?? ''] ?? (p.topic_date ? '从选题开始' : '记下的选题')}${p.pillar_name ? ` · ${p.pillar_name}` : ''}`} title={draft.title || p.title}
        actions={<>
          {p.scheduled_date && p.status !== '已发布' && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />{dateWithRel(p.scheduled_date)} {p.scheduled_time}</span>}
          {p.status !== '已发布' && <Button variant="outline" size="sm" onClick={() => setDlg('schedule')}><CalendarClock />{p.scheduled_date ? '改排期' : '排期'}</Button>}
          <Button variant="outline" size="sm" onClick={async () => { await ensureSaved(); sheet.open(p.id) }}><Smartphone />看单篇</Button>
          <AccountPicker id={id} account={p.account} disabled={data.running || saving} />
          <span className="xhs-stage"><i />{p.status}</span>
          {['灵感池', '已选', '写稿中'].includes(p.status) && <Button className="xhs-solid" size="sm" disabled={!data.has_draft || locked} onClick={async () => { await ensureSaved(); setDlg('final') }}><CheckCheck />定稿 · 排期</Button>}
          {p.status === '待发布' && <Button size="sm" onClick={async () => { await ensureSaved(); setDlg('publish') }}><Send />标记已发布</Button>}
          {p.status === '已发布' && <Button size="sm" variant="outline" asChild><Link to={`/content/data?piece=${p.id}`}><LineChart />看数据</Link></Button>}
        </>}>
        {/* 属于哪个账号、谁写的（约定 11.14）：选题是谁存的，加上每一版的作者 */}
        {(p.account || writers.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.account && <span className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs text-muted-foreground"><span className="text-foreground/70">账号 ·</span>{p.account}</span>}
            {writers.length > 0 && <span className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs text-muted-foreground" title="选题是谁存的、每一版是谁写的"><span className="text-foreground/70">写稿 ·</span>{writers.join('、')}</span>}
          </div>
        )}
      </PageHeader>
      <nav className="xhs-pane-switch" aria-label="创作视图">
        {([['chat', '对话'], ['draft', '稿件'], ['preview', '预览']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={pane === value} onClick={() => selectPane(value)}>{label}</button>)}
      </nav>
      <div ref={grid} style={chat.style} className="xhs-workspace-grid">
        <ChatPane className="xhs-chat-card" data={data} ensureSaved={ensureSaved} onShowDraft={showDraft} onCover={() => setTab('cover')} />
        <PaneResizer container={grid} chat={chat} />
        <section ref={draftCard} className="xhs-draft-card flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-paper lg:min-h-0">
          <div className="xhs-draft-toolbar flex flex-wrap items-center gap-3 border-b px-5 py-3">
            <ViewTabs className="xhs-draft-tabs" label="稿件区" value={visibleTab} onChange={setTab} items={[
              { value: 'draft', label: '稿件', icon: FileText }, { value: 'preview', label: '预览', icon: Eye },
              { value: 'cover', label: '封面', icon: Images }, { value: 'versions', label: '版本', icon: History, count: data.versions.length },
            ]} />
            <DraftBar draft={draft} version={data.version} dirty={dirty} saving={saving} locked={locked} onSave={() => { void ensureSaved().catch(() => undefined) }} onDiscard={discard} />
          </div>
          <div className="xhs-draft-content relative min-h-0 flex-1 overflow-y-auto">
            {data.running && (
              <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-info-soft/95 px-4 py-2 text-[13px] text-info backdrop-blur">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-info" /></span>
                正在写第 {data.version + 1} 版…写好会自动更新。
              </div>
            )}
            {published && (
              <div className="sticky top-0 z-20 border-b bg-surface-2/95 px-4 py-2 text-[13px] text-muted-foreground backdrop-blur">这篇已经发出去了，稿件只读。要再写，在单篇里点“从这篇翻新”。</div>
            )}
            <XhsPreviewName.Provider value={p.account || ''}><div className={flash ? 'xhs-draft-flash' : undefined}>
              {visibleTab === 'draft' && <DraftEditor draft={draft} onChange={edit} readOnly={locked} hasDraft={data.has_draft || dirty} publishOn={p.scheduled_date} ai={data.ai_check} dirty={dirty} />}
              {visibleTab === 'preview' && <PreviewTab draft={draft} piece={p} ai={data.ai_check} dirty={dirty} />}
              {visibleTab === 'cover' && <CoverTab draft={draft} onChange={edit} readOnly={locked} />}
              {visibleTab === 'versions' && <VersionsTab id={p.id} account={p.account} versions={data.versions} current={data.version} dirty={dirty} readOnly={locked || saving} onRestored={() => setDirty(false)} />}
            </div></XhsPreviewName.Provider>
          </div>
        </section>
      </div>
      {dlg === 'schedule' && <ScheduleDialog piece={p} onClose={() => setDlg(null)} />}
      {dlg === 'final' && <ScheduleDialog piece={p} finalize onClose={() => setDlg(null)} />}
      {dlg === 'publish' && <PublishDialog piece={p} onClose={() => setDlg(null)} />}
      <ContentOverlays />
    </div>
  )
}
