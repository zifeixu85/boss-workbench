// 一篇的创作台：左对话、右稿件。手上的修改在发给 AI、采用候选之前先存成一版；AI 在写的时候右边锁住，写完换成新版本。归属：小红书内容模块。
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CheckCheck, Eye, FileText, Images, History, Send, Smartphone, LineChart } from 'lucide-react'
import { PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ViewTabs } from '@/components/view-tabs'
import { Failed } from '@/components/chart-kit'
import { dateWithRel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useStudio, useSaveVersion } from '../api'
import { useParam, usePieceParam } from '../lib'
import { StatusTag } from '../badges'
import { ContentOverlays } from '../ContentOverlays'
import { ScheduleDialog, PublishDialog } from '../dialogs'
import { ChatPane } from './ChatPane'
import { DraftEditor } from './DraftEditor'
import { PreviewTab } from './PreviewTab'
import { CoverTab } from './CoverTab'
import { VersionsTab } from './VersionsTab'
import { DraftBar } from './DraftBar'
import type { Draft } from '../types'

type Tab = 'draft' | 'preview' | 'cover' | 'versions'
type Pane = 'chat' | 'draft' | 'preview'
const START_LABEL: Record<string, string> = { 选题: '从选题开始', 旧笔记: '翻新一篇旧笔记', 一款茶: '从一款茶开始', 对标笔记: '借一篇对标笔记', 一句话: '一句话开写' }

export function Workspace({ id }: { id: string }) {
  const { data, error, refetch } = useStudio(id)
  const qc = useQueryClient()
  const save = useSaveVersion()
  const sheet = usePieceParam()
  const [tab, setTab] = useParam<Tab>('tab', 'draft')
  // 手机宽度：对话 / 稿件 / 预览 三个切换（写进地址栏）；电脑上左右并排，不用它
  const [pane, setPane] = useParam<Pane>('pane', 'chat')
  const showDraft = useCallback(() => { setTab('draft'); setPane('draft') }, [setTab, setPane])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [flash, setFlash] = useState(false)
  const [dlg, setDlg] = useState<'final' | 'publish' | null>(null)
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
  /** 先把手上的修改存成一版（发给 AI、采用候选、离开之前） */
  const ensureSaved = useCallback(async () => {
    if (!dirty || !draft) return
    await save.mutateAsync({ id, data: draft, note: '手动修改' })
    setDirty(false)
  }, [dirty, draft, id, save])
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
  const locked = data.running || published
  return (
    <>
      <PageHeader eyebrow={`创作 · ${START_LABEL[p.start?.kind ?? ''] ?? (p.topic_date ? '从选题开始' : '记下的选题')}${p.pillar_name ? ` · ${p.pillar_name}` : ''}`} title={draft.title || p.title}
        actions={<>
          <StatusTag s={p.status} />
          {p.scheduled_date && p.status !== '已发布' && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />{dateWithRel(p.scheduled_date)} {p.scheduled_time}</span>}
          <Button variant="outline" size="sm" onClick={() => sheet.open(p.id)}><Smartphone />看单篇</Button>
          {['灵感池', '已选', '写稿中'].includes(p.status) && <Button size="sm" disabled={!data.has_draft || locked} onClick={async () => { await ensureSaved(); setDlg('final') }}><CheckCheck />定稿 · 排期</Button>}
          {p.status === '待发布' && <Button size="sm" onClick={async () => { await ensureSaved(); setDlg('publish') }}><Send />标记已发布</Button>}
          {p.status === '已发布' && <Button size="sm" variant="outline" asChild><Link to={`/content/data?piece=${p.id}`}><LineChart />看数据</Link></Button>}
        </>} />
      <div className="px-4 pb-3 md:px-7 lg:hidden">
        <ViewTabs label="手机上看哪一块" value={pane} onChange={(v) => { setPane(v); if (v !== 'chat') setTab(v === 'preview' ? 'preview' : 'draft') }} items={[
          { value: 'chat', label: '对话', count: data.messages.length || undefined }, { value: 'draft', label: '稿件', icon: FileText }, { value: 'preview', label: '预览', icon: Eye },
        ]} />
      </div>
      <div className="grid gap-4 px-4 pb-24 md:px-7 md:pb-6 lg:h-[calc(100dvh-162px)] lg:min-h-[600px] lg:grid-cols-[minmax(360px,2fr)_minmax(0,3fr)]">
        <ChatPane data={data} ensureSaved={ensureSaved} onShowDraft={showDraft} onCover={() => { setTab('cover'); setPane('draft') }} className={cn(pane !== 'chat' && 'hidden lg:flex')} />
        <section className={cn('flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-paper lg:min-h-0', pane === 'chat' && 'hidden lg:flex')}>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <ViewTabs label="稿件区" value={tab} onChange={setTab} items={[
              { value: 'draft', label: '稿件', icon: FileText }, { value: 'preview', label: '预览', icon: Eye },
              { value: 'cover', label: '封面', icon: Images }, { value: 'versions', label: '版本', icon: History, count: data.versions.length },
            ]} />
            <DraftBar draft={draft} version={data.version} dirty={dirty} saving={save.isPending} locked={locked} onSave={() => ensureSaved()} onDiscard={discard} />
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {data.running && (
              <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-info-soft/95 px-4 py-2 text-[13px] text-info backdrop-blur">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-info" /></span>
                Codex 正在写新一版，写好会换到这里；这会儿稿件先只读。
              </div>
            )}
            {published && (
              <div className="sticky top-0 z-20 border-b bg-surface-2/95 px-4 py-2 text-[13px] text-muted-foreground backdrop-blur">这篇已经发出去了，稿件只读。要再写，在单篇里点“从这篇翻新”。</div>
            )}
            <div className={flash ? 'animate-in fade-in duration-700' : undefined}>
              {tab === 'draft' && <DraftEditor draft={draft} onChange={edit} readOnly={locked} hasDraft={data.has_draft || dirty} publishOn={p.scheduled_date} ai={data.ai_check} dirty={dirty} />}
              {tab === 'preview' && <PreviewTab draft={draft} piece={p} ai={data.ai_check} dirty={dirty} />}
              {tab === 'cover' && <CoverTab draft={draft} onChange={edit} readOnly={locked} />}
              {tab === 'versions' && <VersionsTab id={p.id} versions={data.versions} current={data.version} dirty={dirty} readOnly={published} onRestored={() => setDirty(false)} />}
            </div>
          </div>
        </section>
      </div>
      {dlg === 'final' && <ScheduleDialog piece={p} finalize onClose={() => setDlg(null)} />}
      {dlg === 'publish' && <PublishDialog piece={p} onClose={() => setDlg(null)} />}
      <ContentOverlays />
    </>
  )
}
