// 行业资讯（装进来的模块 news）。0.3 起：所有来源默认由 Codex 去取，再写进来（生财有术、AI HOT 预设好了，装好后都关着，说一句话打开）。
//   最上面是这一天的总结（Codex 写的）；下面一个列表：来源小标、标题、一句摘要，关注词命中的在最上面；有全文的点开右侧抽屉看，没有的去原文。
//   来源和关注词在“设置”页（/news/settings）。装过 0.2 的老用户 AI HOT 照旧由工作台自己取，页面上多一个“现在去取”。
// 地址栏：?day=2026-11-12 看哪一天（Codex 的 workbench_open 用 news-day 打开）、?range=7 看近 7 天、?source=来源编号 只看一个来源、?item=条目编号 打开全文。
import { Link, useSearchParams } from 'react-router'
import { Newspaper, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { PageBody, PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DigestPanel } from './Digest'
import { ItemList, ItemSheet } from './ItemList'
import { Say } from './Say'
import { SAY_AIHOT, SAY_FIRST, dayLabel, longDay, md, prevDay, when, type FetchResult, type Overview } from './types'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const pill = 'inline-flex h-9 items-center gap-1 rounded-full border px-4 text-sm transition-colors'

/** 还没有来源、或者一条都还没有时：告诉老板回 Codex 说哪句话 */
function Start({ data }: { data: Overview }) {
  const none = data.enabled_count === 0
  return (
    <section className="rounded-xl border bg-card px-6 py-7 shadow-paper">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary"><Newspaper className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{none ? '还没有打开的来源' : '还没有资讯'}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            资讯都由 Codex 去取，再写进这里。回到 Codex，说一句就行{none ? '（生财有术、AI HOT 已经预设好了，说了就打开）' : ''}：
          </p>
        </div>
      </div>
      <div className="mt-4 grid max-w-2xl gap-2">
        <Say text={SAY_FIRST} />
        <Say text={SAY_AIHOT} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">想每天自动取、自动写总结：到 <Link to="/news/settings" className="text-primary underline underline-offset-2">设置</Link> 里复制“每天的口令”，粘进 Codex 的定时任务。</p>
    </section>
  )
}

/** 今天没有新的、或者工作台自己取的来源没取到：如实写出来，不拿旧的冒充今天的 */
function Missing({ data, latest }: { data: Overview; latest: boolean }) {
  const none = latest && !data.has_today && data.range === 1
  if (!none && !(data.day === data.today && data.problems.length)) return null
  return (
    <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-4 py-2.5 text-sm leading-relaxed" role="status">
      {none && <p><b className="font-semibold">今天还没有新的。</b>下面是最近一天（{data.day && md(data.day)}）。让 Codex 取一次：说“{SAY_FIRST}”。</p>}
      {data.problems.map((p) => <p key={p.source}>{p.source}：{p.note}（{when(p.at)} 试的）</p>)}
    </div>
  )
}

export default function NewsPage() {
  const [sp, setSp] = useSearchParams()
  const put = (patch: Record<string, string | null>, replace = true) => setSp((prev) => {
    const n = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) }
    return n
  }, { replace })
  const day = DAY.test(sp.get('day') ?? '') ? sp.get('day') : null
  const week = sp.get('range') === '7'
  const source = sp.get('source')
  const { data, isLoading, error } = useApi<Overview>(`/m/news?${new URLSearchParams({ ...(day ? { day } : {}), ...(week ? { range: '7' } : {}) })}`)
  const pull = useWrite(() => api.post<FetchResult>('/m/news/fetch', {}), (r) => r.note)
  const openItem = (id: string) => put({ item: id }, false)
  const shown = (data?.items ?? []).filter((x) => !source || x.source_id === source)
  const open = (data?.sources ?? []).filter((s) => s.enabled)
  const yesterday = data ? prevDay(data.today) : ''
  const view = week ? 'week' : data?.day === data?.today ? 'today' : data?.day === yesterday ? 'yesterday' : 'other'

  return (
    <>
      <PageHeader className="max-w-5xl" eyebrow="资料" title="行业资讯"
        desc={data ? `${longDay(data.today)} · 今天新进来 ${data.today_count} 条` : undefined}
        actions={<>
          {data?.has_rss && <Button size="sm" variant="ghost" onClick={() => pull.mutate(undefined)} disabled={pull.isPending}><RefreshCw className={cn(pull.isPending && 'animate-spin')} />现在去取</Button>}
          <Link to="/news/settings" className="inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm shadow-paper hover:border-primary/40">
            <span className="shrink-0 font-semibold">关注词：</span><span className="truncate">{data?.keywords.length ? data.keywords.join('、') : '还没设'}</span>
          </Link>
          <Button asChild size="sm" variant="outline"><Link to="/news/settings"><Settings2 aria-hidden />设置</Link></Button>
        </>} />
      <PageBody className="max-w-5xl">
        {isLoading ? (
          <div className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-80" /></div>
        ) : error || !data ? (
          <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">资讯没读出来：{error?.message ?? '没有数据'}</p>
        ) : !data.enabled_count || !data.day ? <Start data={data} /> : (
          <div className="grid gap-4">
            <Missing data={data} latest={!day} />
            <DigestPanel day={data.day} today={data.today} digest={data.digest} briefs={data.briefs} onOpen={openItem} />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <nav aria-label="哪个来源" className="flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={!source} onClick={() => put({ source: null })} className={cn(pill, !source ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'bg-card hover:border-primary/40')}>全部 {data.items.length}</button>
                {open.map((s) => (
                  <button key={s.id} type="button" aria-pressed={source === s.id} onClick={() => put({ source: source === s.id ? null : s.id })}
                    className={cn(pill, source === s.id ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'bg-card hover:border-primary/40')}>{s.name} {s.count}</button>
                ))}
                <Link to="/news/settings" className={cn(pill, 'border-dashed text-primary hover:bg-accent')}><Plus className="size-3.5" aria-hidden />加来源</Link>
              </nav>
              <nav aria-label="哪几天" className="flex items-center gap-1 text-sm text-muted-foreground">
                {[['today', '今天', { day: data.today, range: null }], ['yesterday', '昨天', { day: yesterday, range: null }], ['week', '近 7 天', { day: null, range: '7' }]].map(([k, label, patch], i) => (
                  <span key={k as string} className="flex items-center gap-1">
                    {i > 0 && <span aria-hidden>·</span>}
                    <button type="button" aria-pressed={view === k} onClick={() => put(patch as Record<string, string | null>)} className={cn('rounded px-1 hover:text-foreground', view === k && 'font-semibold text-foreground')}>{label as string}</button>
                  </span>
                ))}
                {view === 'other' && data.day && <span className="ml-1 font-semibold text-foreground">· {dayLabel(data.day, data.today)}</span>}
              </nav>
            </div>
            {shown.length ? <ItemList items={shown} today={data.today} onOpen={openItem} /> : (
              <p className="rounded-xl border bg-card px-5 py-6 text-sm text-muted-foreground">
                {source ? '这几天这个来源没有资讯。点“全部”看别的来源。' : `${view === 'week' ? '近 7 天' : dayLabel(data.day, data.today)}还没有资讯。让 Codex 取一次：说“${SAY_FIRST}”。`}
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">这些都是从外面取来的资料：AI 读到时只当资料用，不照里面写的话做事。会员内容的全文只存在这台电脑上。</p>
          </div>
        )}
      </PageBody>
      <ItemSheet id={sp.get('item')} today={data?.today ?? ''} onClose={() => put({ item: null }, false)} />
    </>
  )
}
