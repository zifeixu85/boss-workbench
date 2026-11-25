// 一个对象的详情（右侧抽屉，只读）：现在、下一步、时间线（人做的往来记录和 AI 做的对话放在一条线上）、这个对象里的东西（相关文件、相关对话、关联的对象）。
import { Link } from 'react-router'
import { Bot, CheckSquare, MessageSquareText, Square } from 'lucide-react'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KbFile, ObjectStatus, SessionBadge, kbLink, when } from './parts'
import type { ObjectDetail } from './types'

const xhsPiece = (v?: string) => v?.match(/^xhs-piece:([\w-]+)$/)?.[1]

export function ObjectSheet({ path, onClose }: { path: string | null; onClose: () => void }) {
  const { data: d, error } = useApi<ObjectDetail>(path ? `/m/pa/object?path=${encodeURIComponent(path)}` : null)
  const o = d?.object
  return (
    <DetailSheet open={!!path} onClose={onClose} wide eyebrow={d ? `${d.class.name}详情` : '详情'} title={o?.name}
      meta={o && <>
        <ObjectStatus value={o.status} known={!d!.class.statuses.length || d!.class.statuses.includes(o.status)} />
        {o.fields_shown.filter((f) => f.value).map((f) => <span key={f.key}>{f.key} {/^\d{4}-\d{2}-\d{2}$/.test(f.value) ? shortDate(f.value) : f.value}</span>)}
        {o.updated && <span>更新 {shortDate(o.updated)}</span>}
        {o.confirm && o.confirm !== '已确认' && <StatusBadge value={o.confirm} tone={o.confirm === '已过期' ? 'danger' : 'warn'} />}
        {o.privacy === '私密' && <StatusBadge value="私密" tone="neutral" />}
      </>}
      actions={o && <>
        {/* 内容助理写的作品：开头记着它在工作台内容页的编号（工作台: xhs-piece:<编号>），能直接去看图文预览 */}
        {xhsPiece(o.fields?.['工作台']) && <Button asChild size="sm"><Link to={`/content/studio/${xhsPiece(o.fields?.['工作台'])}`}>看图文预览</Link></Button>}
        <Button asChild size="sm" variant="outline"><Link to={kbLink(o.path)}>看知识库原文</Link></Button>
      </>}>
      {error && !d && <EmptyNote>没读到这个对象：{error.message}</EmptyNote>}
      {!d && !error && <div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>}
      {d && o && (
        <>
          {(o.missing.length > 0 || o.warnings.length > 0) && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{[o.missing.length ? `这份文件开头还缺：${o.missing.join('、')}` : '', ...o.warnings].filter(Boolean).join('；')}。</p>}
          <SheetSection title="现在">
            <p className="rounded-lg bg-accent px-3.5 py-3 text-sm leading-relaxed text-accent-foreground">{o.now || '文件里还没写“现在”这一节。'}</p>
          </SheetSection>

          <SheetSection title="下一步">
            {o.next.length ? (
              <ul className="grid gap-1.5 text-sm">
                {o.next.map((n) => <li key={n.text} className={`flex items-start gap-2 ${n.done ? 'text-muted-foreground line-through' : ''}`}>{n.done ? <CheckSquare className="mt-0.5 size-4 shrink-0" /> : <Square className="mt-0.5 size-4 shrink-0" />}<span>{n.text}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">没写下一步。</p>}
          </SheetSection>

          <SheetSection title="时间线 · 人做的和 AI 做的放一起">
            {d.timeline.length ? (
              <ol className="relative grid gap-3 border-l pl-4">
                {d.timeline.map((t) => (
                  <li key={`${t.kind}${t.at}${t.title}`} className="relative text-sm">
                    <span aria-hidden className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card ${t.kind === 'AI' ? 'bg-primary' : 'bg-muted-foreground/60'}`} />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="num">{t.date ? shortDate(t.date) : '没写日期'}</span>
                      <span className="inline-flex items-center gap-1">{t.kind === 'AI' ? <Bot className="size-3.5" /> : <MessageSquareText className="size-3.5" />}{t.kind === 'AI' ? `AI · ${t.sub}` : t.sub || '往来记录'}</span>
                      {t.pending && <StatusBadge value="待确认" tone="warn" />}
                    </div>
                    {t.session ? <Link to={`/progress?s=${encodeURIComponent(t.session)}`} className="mt-0.5 block hover:underline">{t.title}</Link> : <p className="mt-0.5">{t.title}</p>}
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted-foreground">还没有往来记录，也没有归到它的 AI 对话。</p>}
          </SheetSection>

          <SheetSection title={`相关对话${d.sessions.length ? ` · ${d.sessions.length} 个` : ''}`}>
            {d.sessions.length ? (
              <ul className="grid gap-1">
                {d.sessions.slice(0, 8).map((s) => (
                  <li key={s.id}><Link to={`/progress?s=${encodeURIComponent(s.id)}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                    <SessionBadge s={s} /><span className="min-w-0 flex-1 truncate">{s.title}</span><span className="shrink-0 text-xs text-muted-foreground">{s.tool_name} · {when(s.last_at)} · 按{s.object?.by}归的</span>
                  </Link></li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">还没有归到它的对话。对话所在的文件夹写进这份文件开头的“工作文件夹”，或标题里提到它的名字，就会自动归过来；也可以在“进展”里手动指。</p>}
          </SheetSection>

          <SheetSection title={`这个${d.class.name}里的东西`}>
            <div className="grid gap-2 text-sm">
              {d.files.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <StatusBadge value={f.kind} tone="neutral" /><span className={`min-w-0 flex-1 truncate ${f.exists ? '' : 'text-muted-foreground line-through'}`} title={f.path}>{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">AI 产出 · {f.tool_name} · {when(f.at)}</span>
                </div>
              ))}
              {d.files_total > d.files.length && <Link to={`/outputs?object=${encodeURIComponent(o.path)}`} className="text-xs text-primary hover:underline">全部 {d.files_total} 个产出</Link>}
              {d.kb_files.map((p) => <div key={p} className="flex items-center gap-2"><StatusBadge value="知识库" tone="neutral" /><KbFile path={p} /></div>)}
              {[...d.links, ...d.backlinks].map((l) => (
                <div key={l.path} className="flex items-center gap-2"><StatusBadge value={l.type ?? '关联'} tone="neutral" />{l.to ? <Link to={l.to} className="text-primary hover:underline">{l.name}</Link> : <span className="text-muted-foreground">{l.name}（知识库里没找到）</span>}</div>
              ))}
            </div>
          </SheetSection>
        </>
      )}
    </DetailSheet>
  )
}
