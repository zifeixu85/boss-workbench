// 小红书 · 创作：内容中心唯一有对话窗口的页面。/content/studio 是开始页（一句话 + 四个起点 + 今天的选题 + 在写的），
// /content/studio/:id 是一篇的创作台（左约 40% 和 Codex 对话，右约 60% 稿件 / 预览 / 封面 / 版本）。归属：小红书内容模块。
import { Link, useParams } from 'react-router'
import { ArrowRight, Bot } from 'lucide-react'
import { PageHeader, PageBody, Panel, SubTabs } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/api'
import { md } from '@/lib/format'
import { CONTENT_TABS } from './tabs'
import { SOURCE_SHORT, mdhm } from './lib'
import { OneLine, StartPicker, useBegin } from './starts'
import { CoverArt } from './phone/Cover'
import { StatusTag } from './badges'
import { ContentOverlays } from './ContentOverlays'
import { Workspace } from './studio/Workspace'
import type { CodexStatus, Starts } from './types'

export default function StudioPage() {
  const { id } = useParams()
  return id ? <Workspace key={id} id={id} /> : <StudioStart />
}

const STEPS = [
  ['说一句', '想写什么、给谁看，一句话就行；也可以从左边四个起点挑'],
  ['Codex 翻资料写第一版', '读品牌口吻、账号定位、写法卡和自家笔记，一般 1 分钟左右'],
  ['右边改、看手机', '标题、封面、正文都能直接改；手机预览和发布前检查跟着变'],
  ['定稿 · 排期', '排进日历，那天早上今天页提醒；在小红书 App 里发'],
]

function StudioStart() {
  const { data } = useApi<Starts>('/content/starts')
  const { data: codex } = useApi<CodexStatus>('/content/codex')
  const { begin, pending } = useBegin()
  const topics = (data?.topics ?? []).slice(0, 3)
  return (
    <>
      <PageHeader eyebrow="内容 · 小红书" title="创作" desc="说一句想写什么，或者从一个起点开始。进去以后左边和 Codex 聊，右边是稿件和手机上的样子。">
        <SubTabs items={CONTENT_TABS} />
      </PageHeader>
      <PageBody className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="聊一聊，就能写出一篇能发的笔记" desc={codex ? <span className="inline-flex items-center gap-1"><Bot className="size-3.5" />{codex.detail}</span> : '正在看本机 Codex…'}>
          <OneLine autoFocus />
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between"><h3 className="text-[13px] font-semibold">今天的选题，点一个就开写</h3><span className="text-xs text-muted-foreground">早上 Codex 定时任务出的</span></div>
            {!data ? <Skeleton className="h-28" /> : topics.length ? (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {topics.map((t) => (
                  <li key={t.id}>
                    <button type="button" disabled={pending} onClick={() => begin({ piece: t })} className="group flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40">
                      <StatusBadge value={SOURCE_SHORT[t.source] ?? t.source} tone="primary" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium group-hover:text-primary">{t.title}</span><span className="block truncate text-xs text-muted-foreground">{t.reason}</span></span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">今天的选题都开写了</p>}
          </div>
          <ol className="mt-5 grid gap-2 sm:grid-cols-2">
            {STEPS.map(([a, b], i) => (
              <li key={a} className="flex gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
                <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">{i + 1}</span>
                <span className="min-w-0"><span className="block text-[13px] font-medium">{a}</span><span className="block text-xs leading-relaxed text-muted-foreground">{b}</span></span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title={`在写的 · ${data?.recent.length ?? '—'} 篇`} desc="写稿中和定了稿等着发的，点开接着写" bodyClass="p-0">
          {!data ? <div className="grid gap-2 p-5"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : !data.recent.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">现在没有在写的。左边说一句，或者从今天的选题开一篇。</p>
          ) : (
            <ul className="divide-y">
              {data.recent.map((p) => (
                <li key={p.id}>
                  <Link to={`/content/studio/${p.id}`} className="group flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <span className="w-10 shrink-0 overflow-hidden rounded-sm shadow-sm">{p.draft ? <CoverArt text={p.draft.cover_text} cover={p.draft.cover} pages={p.draft.pages} seed={p.draft.title} /> : <span className="block aspect-[3/4] border border-dashed" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{p.draft?.title || p.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusTag s={p.status} />{p.version ? `稿件 v${p.version}` : '还没动笔'} · {mdhm(p.last_at)}
                        {p.scheduled_date && <span>· 排在 {md(p.scheduled_date)} {p.scheduled_time ?? ''}</span>}
                        {p.check && (p.check.blocks || p.check.warns) ? <span className={p.check.blocks ? 'text-danger' : 'text-warn'}>· {p.check.blocks ? `${p.check.blocks} 处要改` : `${p.check.warns} 项提醒`}</span> : null}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PageBody>
      <StartPicker />
      <ContentOverlays />
    </>
  )
}
