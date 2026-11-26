// 一个助理自己的页（约定 11.11，2026-11-27 A梦：“点他的 SOUL 文件就不应该跳转了，而是在这里直接能看到，包括他消耗了多少 token，
// 大概做了哪些事情，他的定位是什么”）。都在页内看：定位、档案（IDENTITY、SOUL、MEMORY 和文件夹里别的文件）、做了哪些事、用量、常驻对话。
// 页面上不改：想改的给“在 Codex 里改”（复制一句话）和“看知识库原文”。
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Copy, Crown, ExternalLink, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from '@/lib/api'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Markdown } from '@/components/markdown'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { kbLink, SessionBadge, when } from './parts'
import { Avatar, tokens } from './assistant-parts'
import type { AssistantDetail } from './types'

type KbFile = { path: string; body: string; updated: string }

export default function AssistantPage() {
  const key = useParams().key ?? ''
  const { data: a, error, refetch } = useApi<AssistantDetail>(`/m/pa/assistants/${encodeURIComponent(key)}`)
  const back = <Button variant="ghost" asChild><Link to="/roles"><ArrowLeft />全部助理</Link></Button>
  if (error && !a) return <><PageHeader eyebrow="我的助理" title="助理" actions={back} /><PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!a) return <><PageHeader eyebrow="我的助理" title="助理" actions={back} /><PageBody className="grid gap-4"><Skeleton className="h-36" /><Skeleton className="h-96" /></PageBody></>
  const open = a.dispatch.filter((x) => x.open)
  return (
    <>
      <PageHeader eyebrow="我的助理" title={a.name} actions={back}>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Avatar a={a} size="xl" />
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{a.duty || '还没写职责'}</span>
              {a.chief && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Crown className="size-3" />总协调</span>}
              {a.legacy && <StatusBadge value="待补齐" tone="warn" />}
              {a.retired && <StatusBadge value={a.stopped?.day ? `${a.stopped.day} 起不用了` : '不用了'} tone="neutral" />}
            </div>
            <span className="text-xs text-muted-foreground">在对话里说“{a.call}”叫到它 · 放在知识库 {a.folder}/</span>
          </div>
        </div>
      </PageHeader>
      <PageBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid min-w-0 gap-5">
          <Files a={a} />
          <Panel title="做了哪些事" desc={`近 30 天归到${a.name}的对话，最近的在前`}>
            {a.sessions.length ? (
              <ul className="-mx-2 grid">
                {a.sessions.map((s) => (
                  <li key={s.id}>
                    <Link to={`/progress?s=${encodeURIComponent(s.id)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{s.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{when(s.last_at)}{s.object ? ` · ${s.object.name}` : ''}{s.outputs ? ` · 产出 ${s.outputs} 个` : ''} · 按{s.by}认的</span>
                      </span>
                      <SessionBadge s={{ ...s, inferred: true }} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyNote>近 30 天没认出{a.name}的对话。对话标题以“{a.avatar ? `${a.avatar} ` : ''}{a.name}”开头、或第一句说“{a.call}”的，会归到这里。</EmptyNote>}
          </Panel>
          {a.chief && (
            <Panel title="交出去还没回、没核对的" desc="派单记录里还没到“我核对过”的">
              {open.length ? (
                <ul className="grid gap-2.5 text-sm">
                  {open.map((x, i) => (
                    <li key={i} className="grid gap-0.5 border-b pb-2.5 last:border-0 last:pb-0">
                      <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.what}</span><StatusBadge value={x.stage || '没写到哪一档'} tone={x.stage === '卡住了' ? 'danger' : x.stage === '对方说做完了' ? 'primary' : 'neutral'} /></span>
                      <span className="text-xs text-muted-foreground">{x.day} 交给 {x.to || '—'}{x.done ? ` · 做完怎么算：${x.done}` : ''}{x.note ? ` · ${x.note}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyNote>{a.dispatch.length ? '交出去的都核对过了。' : '派单记录里还没有。'}</EmptyNote>}
            </Panel>
          )}
        </div>
        <aside className="grid min-w-0 gap-5">
          <Panel title="定位">
            <dl className="grid gap-3 text-sm">
              {a.skills.length > 0 && <Field label="看家本领"><span className="flex flex-wrap gap-1.5">{a.skills.slice(0, 3).map((k) => <span key={k} className="rounded-md bg-primary/8 px-1.5 py-0.5 text-xs font-medium text-primary">{k}</span>)}{a.skills.length > 3 && <span className="self-center text-xs text-muted-foreground">等 {a.skills.length} 项，全文在“看家本领”页签</span>}</span></Field>}
              <Field label="管什么">{a.owns}</Field>
              <Field label="不管什么">{a.notOwns}</Field>
              <Field label="怎么叫">{a.call}</Field>
              <Field label="能做什么">{a.can.length ? <span className="flex flex-wrap gap-1.5">{a.can.map((c) => <span key={c} className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs">{c}</span>)}</span> : ''}</Field>
            </dl>
            {a.legacy && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">它的 IDENTITY 开头还没写：{a.missing.join('、')}。跟总助说“把助理的头像、职责补齐”就行。</p>}
            {a.mismatch.length > 0 && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">和花名册对不上（以 IDENTITY 为准）：{a.mismatch.join('；')}</p>}
          </Panel>
          <Panel title="用量" desc="归到它的对话加起来，估的">
            <div className="grid grid-cols-3 gap-2 text-center">
              {([['今日', a.usage.today], ['近 7 日', a.usage.d7], ['近 30 日', a.usage.d30]] as const).map(([l, n]) => { const t = tokens(n); return (
                <div key={l} className="rounded-lg bg-muted/50 px-2 py-2.5"><div className="num font-heading text-[20px] leading-none font-semibold">{t.value}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{t.unit}</span></div><div className="mt-1 text-[11px] text-muted-foreground">{l} token</div></div>
              ) })}
            </div>
          </Panel>
          <Panel title="常驻对话">
            {a.resident?.link ? <Button asChild variant="outline" className="w-full justify-between"><a href={a.resident.link}><span className="truncate">{a.resident.title}</span><ExternalLink /></a></Button>
              : a.thread ? <EmptyNote>花名册里登记的是“{a.thread}”，这台电脑近 30 天没读到这个对话。</EmptyNote>
              : <EmptyNote>花名册里还没登记它的常驻对话。</EmptyNote>}
          </Panel>
          <p className="text-xs text-muted-foreground">{a.note.replace('<名字>', a.name)}</p>
        </aside>
      </PageBody>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="m-0">{children || <span className="text-muted-foreground">还没写</span>}</dd></div>
}

/** 档案：文件夹里的每份文件一个页签，页内直接渲染；不跳走 */
function Files({ a }: { a: AssistantDetail }) {
  const [pick, setPick] = useState(a.files[0]?.name ?? '')
  const f = a.files.find((x) => x.name === pick) ?? a.files[0]
  const { data, isLoading } = useApi<KbFile>(f ? `/kb/file?path=${encodeURIComponent(f.path)}` : null)
  const copy = () => { if (!f) return; void navigator.clipboard?.writeText(`改一下${a.name}的 ${f.name}（${f.path}）：`); toast.success('复制好了，到 Codex 里粘贴，接着说要改什么') }
  return (
    <Panel title="档案" desc="它的设定和记下的东西，都在知识库里" bodyClass="p-0">
      {!f ? <div className="p-4"><EmptyNote>它的文件夹里还没有文件。</EmptyNote></div> : <>
        {/* 页签自己一行（窄的时候也看得到有几份），改、看原文的入口在下面一行 */}
        <div className="grid gap-2 border-b px-4 pt-3 pb-2">
          <ViewTabs className="min-w-0" label="哪份文件" value={f.name} onChange={setPick} items={a.files.map((x) => ({ value: x.name, label: x.name }))} />
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
            <span className="mr-auto">{f.call}{f.call && data ? ' · ' : ''}{data ? `更新于 ${data.updated.slice(0, 10)}` : ''}</span>
            <Button size="sm" variant="ghost" onClick={copy}><Copy />在 Codex 里改</Button>
            <Button size="sm" variant="ghost" asChild><Link to={kbLink(f.path)}><FileText />看知识库原文</Link></Button>
          </div>
        </div>
        <div className="max-h-[640px] overflow-y-auto overscroll-contain px-5 py-4 md:px-7">
          {f.problems.length > 0 && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{f.problems.join('；')}</p>}
          {isLoading || !data ? <div className="grid gap-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-4/5" /></div>
            : <article className="max-w-3xl min-w-0 break-words"><Markdown source={data.body} basePath={data.path} /></article>}
        </div>
      </>}
      {a.folder_problems.length > 0 && <p className="border-t px-4 py-2.5 text-xs text-warn">{a.folder_problems.join('；')}</p>}
    </Panel>
  )
}
