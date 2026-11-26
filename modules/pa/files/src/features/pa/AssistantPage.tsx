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
import { Avatar, tokens, useFillHeight } from './assistant-parts'
import { archiveGroups } from './archive-groups'
import type { AssistantDetail } from './types'

type KbFile = { path: string; body: string; updated: string }

export default function AssistantPage() {
  const key = useParams().key ?? ''
  const { data: a, error, refetch } = useApi<AssistantDetail>(`/m/pa/assistants/${encodeURIComponent(key)}`)
  const [cols, height] = useFillHeight(1024, !!a)
  const back = <Button variant="ghost" asChild><Link to="/roles"><ArrowLeft />全部助理</Link></Button>
  if (error && !a) return <><PageHeader eyebrow="我的助理" title="助理" actions={back} /><PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!a) return <><PageHeader eyebrow="我的助理" title="助理" actions={back} /><PageBody className="grid gap-4"><Skeleton className="h-36" /><Skeleton className="h-96" /></PageBody></>
  const open = a.dispatch.filter((x) => x.open)
  return (
    <>
      <PageHeader eyebrow="我的助理" title={a.name} actions={back}>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Avatar a={a} size="lg" />
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{a.duty || '还没写职责'}</span>
              {a.chief && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Crown className="size-3" />总协调</span>}
              {a.legacy && <StatusBadge value="待补齐" tone="warn" />}
              {a.retired && <StatusBadge value={a.stopped?.day ? `${a.stopped.day} 起不用了` : '不用了'} tone="neutral" />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs text-muted-foreground"><span className="text-foreground/70">唤起</span>{a.call}</span>
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs text-muted-foreground" title={`知识库 ${a.folder}/`}><span className="text-foreground/70">位置</span><span className="truncate font-mono">{a.folder}/</span></span>
            </div>
          </div>
        </div>
      </PageHeader>
      {/* 宽屏：左边只放档案，右边是定位、用量、常驻对话、做过的事；两栏撑到窗口底、各自滚动（2026-11-27 A梦：“不然现在滚动会有问题”）。窄屏照常上下排、整页滚 */}
      <PageBody className="lg:pb-4">
        <div ref={cols} style={height ? { height } : undefined} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Files a={a} />
          <aside className="grid min-h-0 min-w-0 content-start gap-5 lg:overflow-y-auto lg:overscroll-contain lg:pr-1" aria-label="定位、用量和做过的事">
            <Panel title="定位">
              <dl className="grid gap-3 text-sm">
                {a.motto && <Field label="信条"><span className="font-heading text-[15px] leading-6">“{a.motto}”</span></Field>}
                {a.skills.length > 0 && <Field label="方法"><span className="flex flex-wrap gap-1.5">{a.skills.slice(0, 3).map((k) => <span key={k} className="rounded-md bg-primary/8 px-1.5 py-0.5 text-xs font-medium text-primary">{k}</span>)}{a.skills.length > 3 && <span className="self-center text-xs text-muted-foreground">等 {a.skills.length} 项，全文见“能力 › 方法”</span>}</span></Field>}
                <Field label="职责范围">{a.owns}</Field>
                <Field label="不负责">{a.notOwns}</Field>
                <Field label="唤起方式">{a.call}</Field>
                <Field label="权限">{a.can.length ? <span className="flex flex-wrap gap-1.5">{a.can.map((c) => <span key={c} className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs">{c}</span>)}</span> : ''}</Field>
              </dl>
              {a.legacy && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">它的 IDENTITY 开头还没写：{a.missing.join('、')}。跟总助说“把助理的头像、职责补齐”就行。</p>}
              {a.mismatch.length > 0 && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">和花名册对不上（以 IDENTITY 为准）：{a.mismatch.join('；')}</p>}
            </Panel>
            <Panel title="用量" desc="按归属对话估算">
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
            <Panel title="工作记录" desc={`近 30 天${a.name}参与的对话，按时间倒序`}>
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
              <Panel title="待核对的派单" desc="派单记录中尚未核对的事项">
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
            <p className="text-xs text-muted-foreground">{a.note.replace('<名字>', a.name)}</p>
          </aside>
        </div>
      </PageBody>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="m-0">{children || <span className="text-muted-foreground">还没写</span>}</dd></div>
}

/** 档案：分四组（设定、能力、协作、资料），组内每份文件一个页签，页内直接渲染、不跳走。页签用界面用语，真实文件名在下面一行 */
function Files({ a }: { a: AssistantDetail }) {
  const groups = archiveGroups(a.files)
  const [pick, setPick] = useState<{ group: string; file: string } | null>(null)
  const g = groups.find((x) => x.key === pick?.group) ?? groups[0]
  const item = g?.items.find((x) => x.file.name === pick?.file) ?? g?.items[0]
  const f = item?.file
  const { data, isLoading } = useApi<KbFile>(f ? `/kb/file?path=${encodeURIComponent(f.path)}` : null)
  const copy = () => { if (!f) return; void navigator.clipboard?.writeText(`改一下${a.name}的 ${f.name}.md（${f.path}）：`); toast.success(`复制好了：到 Codex 里粘贴，接着说要改 ${f.name}.md 的什么`) }
  return (
    <Panel title="档案" desc={`${a.name}的设定、能力和资料，存放在知识库中`} className="flex min-h-0 flex-col" bodyClass="flex min-h-0 flex-1 flex-col p-0">
      {!g || !item || !f ? <div className="p-4"><EmptyNote>文件夹里还没有文件。</EmptyNote></div> : <>
        <div className="grid gap-2 border-b px-4 pt-3 pb-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ViewTabs label="档案分组" value={g.key} onChange={(v) => setPick({ group: v, file: '' })} items={groups.map((x) => ({ value: x.key, label: x.label }))} />
            {g.items.length > 1 && <span aria-hidden className="text-muted-foreground/60">›</span>}
            {g.items.length > 1 && (
              <div role="tablist" aria-label={`${g.label}里的文件`} className="flex min-w-0 flex-wrap gap-1">
                {g.items.map((x) => (
                  <button key={x.file.name} type="button" role="tab" aria-selected={x.file.name === f.name} title={`${x.file.name}.md`} onClick={() => setPick({ group: g.key, file: x.file.name })}
                    className={`rounded-md px-2 py-1 text-[13px] transition-colors ${x.file.name === f.name ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{x.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
            <span className="mr-auto"><span className="font-mono">{f.name}.md</span>{data ? ` · 更新于 ${data.updated.slice(0, 10)}` : ''}</span>
            <Button size="sm" variant="ghost" onClick={copy} title={`复制一句“改一下${a.name}的 ${f.name}.md……”`}><Copy />在 Codex 里改</Button>
            <Button size="sm" variant="ghost" asChild><Link to={kbLink(f.path)} title={f.path}><FileText />看知识库原文</Link></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-7">
          {a.files.find((x) => x.name === f.name)?.problems.length ? <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{a.files.find((x) => x.name === f.name)!.problems.join('；')}</p> : null}
          {isLoading || !data ? <div className="grid gap-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-4/5" /></div>
            : <article className="max-w-3xl min-w-0 break-words"><Markdown source={data.body} basePath={data.path} /></article>}
        </div>
      </>}
      {a.folder_problems.length > 0 && <p className="border-t px-4 py-2.5 text-xs text-warn">{a.folder_problems.join('；')}</p>}
    </Panel>
  )
}
