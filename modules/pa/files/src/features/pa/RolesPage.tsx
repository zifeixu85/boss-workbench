// 助理（约定 11.11，2026-11-27 A梦 定：“全部就要助理，都是我们的助理”）：一张助理清单，不分种类，建多少个都放得下。
// 每个助理一张卡：头像、名字、职责、管什么、最近在忙什么、这周用了多少；总协调（总助）排最前、带标记。点进去是它自己的页（/roles/<文件夹名>）。
// 只读：要建、要改助理，在对话里说。
import { Link } from 'react-router'
import { Crown, Users } from 'lucide-react'
import { useApi } from '@/lib/api'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { kbLink, SessionBadge, when } from './parts'
import { Avatar, tokens } from './assistant-parts'
import type { AssistantCard, AssistantList } from './types'

export default function RolesPage() {
  const { data: d, error, refetch } = useApi<AssistantList>('/m/pa/assistants')
  const head = <PageHeader eyebrow="我的助理" title="助理" desc="你的几位助理，每位管什么、最近在忙什么、用了多少。点进去看它的设定、档案和做过的事。要新建或改哪位，在对话里说。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-52" /><Skeleton className="h-52" /><Skeleton className="h-52" /></PageBody></>
  return (
    <>
      {head}
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {d.assistants.length > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span>团队里现在有 <span className="num font-heading text-[22px] font-semibold">{d.roster.count}</span> 位</span>
            <span className="text-xs text-muted-foreground">{d.roster.path ? <>按花名册数（<Link className="text-primary hover:underline" to={kbLink(d.roster.path)}>{d.roster.path.split('/').pop()}</Link>{d.roster.old ? '，还是旧名“同事清单”，下次更新时总助会改名' : ''}）</> : '还没有花名册，按助理文件夹数'}</span>
          </p>
        )}
        {d.problems.length > 0 && <Alert className="border-warn/30 bg-warn-soft/50"><AlertTitle>有几处要看一下</AlertTitle><AlertDescription>{d.problems.join('；')}</AlertDescription></Alert>}
        {!d.exists || !d.assistants.length
          ? <Panel><EmptyNote>还没有助理（知识库 {d.base}/ 下没有助理的文件夹）。在 Codex 里说“认识一下我的总助”，建好以后这里就会多一张卡；以后想加小红书助理、报价助理，也是说一句。</EmptyNote></Panel>
          : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{d.assistants.map((a) => <Card key={a.key} a={a} />)}</div>}
        {d.retired.length > 0 && (
          <details className="group rounded-xl border bg-card/60 px-4 py-3 text-sm">
            <summary className="cursor-pointer list-none text-muted-foreground marker:hidden hover:text-foreground">不用了的 {d.retired.length} 位（文件夹还留着，点开能看）</summary>
            <ul className="mt-2 grid gap-1.5">
              {d.retired.map((r) => (
                <li key={r.key}><Link to={`/roles/${encodeURIComponent(r.key)}`} className="text-primary hover:underline">{r.avatar ? `${r.avatar} ` : ''}{r.name}</Link>
                  <span className="text-xs text-muted-foreground"> · {r.duty || '没写职责'}{r.day ? ` · ${r.day} 停的` : ''}{r.why ? ` · ${r.why}` : ''}</span></li>
              ))}
            </ul>
          </details>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{d.note}</span>
          {d.unmatched > 0 && <Link to="/progress?assistant=-" className="inline-flex items-center gap-1 text-primary hover:underline"><Users className="size-3.5" />近 30 天还有 {d.unmatched} 个对话没归到助理</Link>}
          {!d.colleagues && d.assistants.length > 0 && <span>还没有花名册（{d.base}/花名册.md），常驻对话认不出来；让总助补上就行。</span>}
        </p>
      </PageBody>
    </>
  )
}

function Card({ a }: { a: AssistantCard }) {
  const week = tokens(a.usage.d7)
  return (
    <Link to={`/roles/${encodeURIComponent(a.key)}`}
      className={`group relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-paper transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none ${a.chief ? 'border-primary/30 sm:col-span-2 xl:col-span-1' : ''}`}>
      <div className="flex items-start gap-3">
        <Avatar a={a} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-heading text-[17px] leading-tight font-semibold">{a.name}</span>
            {a.chief && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Crown className="size-3" />总协调</span>}
          </div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">{a.duty || '还没写职责'}</div>
        </div>
        {(a.legacy || a.file_problems > 0) && <StatusBadge value={a.legacy ? '待补齐' : `${a.file_problems} 处要改`} tone="warn" />}
      </div>
      {a.skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="看家本领">
          {a.skills.slice(0, 3).map((k) => <span key={k} className="rounded-md bg-primary/8 px-1.5 py-0.5 text-xs font-medium text-primary">{k}</span>)}
          {a.skills.length > 3 && <span className="text-xs text-muted-foreground">等 {a.skills.length} 项本领</span>}
        </div>
      )}
      <p className="line-clamp-2 min-h-10 text-[13.5px] leading-5">{a.owns ? <><span className="text-muted-foreground">管：</span>{a.owns}</> : <span className="text-muted-foreground">还没写管什么</span>}</p>
      <div className="mt-auto grid gap-2 border-t pt-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">最近</span>
          {a.recent ? <><span className="min-w-0 flex-1 truncate font-medium">{a.recent.title}</span><SessionBadge s={{ status: a.recent.status, why: `最后动静 ${when(a.recent.last_at)}`, inferred: true }} /></>
            : <span className="text-muted-foreground">近 30 天没认出它的对话</span>}
        </div>
        <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
          <span>近 30 天 {a.sessions} 个对话</span>
          <span>这周 <span className="num text-[15px] font-semibold text-foreground">{week.value}</span>{week.unit} token</span>
        </div>
      </div>
    </Link>
  )
}
