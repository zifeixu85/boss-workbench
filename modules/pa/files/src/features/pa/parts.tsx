// 这个模块几页共用的小零件：对话状态的标签、打开对话的按钮、知识库文件的链接、今日页卡片的壳。
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ExternalLink, FileText } from 'lucide-react'
import { api, useWrite } from '@/lib/api'
import { ago } from '@/lib/format'
import { Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { GoLink } from '@/features/today/parts'
import type { CardData, Session, SessionStatus } from './types'

export const SESSION_STATUSES: SessionStatus[] = ['做完未读', '在等我', '进行中', '没做完', '做完了']
const TONE: Record<SessionStatus, 'primary' | 'warn' | 'info' | 'neutral' | 'ok'> = { 做完未读: 'primary', 在等我: 'warn', 进行中: 'info', 没做完: 'neutral', 做完了: 'ok' }

/** 对话状态。推断出来的后面带一个“推”字的小点提示（鼠标移上去看依据） */
export function SessionBadge({ s }: { s: Pick<Session, 'status' | 'why' | 'inferred'> }) {
  return <span title={`${s.inferred ? '推断：' : ''}${s.why}`}><StatusBadge value={s.status} tone={TONE[s.status]} /></span>
}

/** 对象的状态：知识库档案里列了的状态用同一套颜色词表，没列的标出来 */
export function ObjectStatus({ value, known = true }: { value: string; known?: boolean }) {
  if (!value) return <StatusBadge value="没写状态" tone="neutral" />
  return <span title={known ? undefined : '这个状态还没对到阶段：在知识库档案“我关注的”表的状态对照里加一条（自己的值=未开始 / 进行中 / 已结束）'}><StatusBadge value={value} tone={known ? undefined : 'danger'} /></span>
}

/** 打开对话：Codex、Claude 桌面版有链接（点了同时标已看）；命令行开的 Claude Code 没有链接，给一条能复制的命令 */
export function OpenSession({ s, size = 'sm' }: { s: Pick<Session, 'id' | 'link' | 'resume' | 'tool_name'>; size?: 'sm' | 'default' }) {
  const read = useWrite(() => api.post(`/m/pa/sessions/${encodeURIComponent(s.id)}/read`, {}))
  if (s.link) return <Button asChild size={size} variant="outline"><a href={s.link} onClick={() => read.mutate(undefined)}>在 {s.tool_name === 'Claude Code' ? 'Claude' : s.tool_name} 里打开<ExternalLink /></a></Button>
  if (!s.resume) return null
  return <Button size={size} variant="outline" onClick={() => { void navigator.clipboard?.writeText(s.resume!); read.mutate(undefined) }} title={s.resume}>复制接着聊的命令</Button>
}

export const kbLink = (path: string) => `/kb?path=${encodeURIComponent(path)}`
export function KbFile({ path, children }: { path: string; children?: ReactNode }) {
  return <Link to={kbLink(path)} className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline"><FileText className="size-3.5 shrink-0" /><span className="truncate">{children ?? path}</span></Link>
}

export const when = (iso?: string | null) => (iso ? ago(iso) : '—')

/** 今日页的一张卡：一个大数 + 最多四条；空的时候说清为什么是空的 */
export function HomeCard({ title, desc, data, to, go, empty, tone }: { title: string; desc: string; data: CardData; to: string; go: string; empty: string; tone?: 'warn' }) {
  return (
    <Panel title={title} desc={desc} action={<GoLink to={to}>{go}</GoLink>} bodyClass="p-2">
      <div className="flex items-baseline gap-2 px-3 pt-2 pb-1">
        <span className={`num font-heading text-[34px] leading-none font-semibold ${tone === 'warn' && data?.count ? 'text-warn' : ''}`}>{data?.count ?? '—'}</span>
        <span className="text-xs text-muted-foreground">{data ? (data.count ? '件' : '') : '还没读到数据'}</span>
      </div>
      {(data?.items ?? []).map((i) => {
        const body = (
          <>
            <span className="block truncate text-[13.5px] font-medium">{i.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{i.sub}{i.at ? ` · ${ago(i.at)}` : ''}</span>
          </>
        )
        const cls = 'block w-full rounded-lg px-3 py-2 text-left hover:bg-muted/60'
        return i.to ? <Link key={i.title + i.sub} to={i.to} className={cls}>{body}</Link> : <Link key={i.id ?? i.title} to={`/progress?s=${encodeURIComponent(i.id ?? '')}`} className={cls}>{body}</Link>
      })}
      {data && !data.count && <div className="px-3 py-2"><EmptyNote>{empty}</EmptyNote></div>}
    </Panel>
  )
}
