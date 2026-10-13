// 老板早上最想看的第 3 件：小红书今天发什么（数据来自内容模块 todayPlan()）
import { Link } from 'react-router'
import { Clock, ImageIcon } from 'lucide-react'
import type { XhsToday as Plan } from '@/lib/types'
import { md, relDay, thousands } from '@/lib/format'
import { Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { GoLink } from './parts'

export function XhsToday({ plan }: { plan: Plan | null }) {
  if (!plan) return <Panel title="小红书今天发什么"><EmptyNote>内容模块还没有数据。</EmptyNote></Panel>
  const a = plan.account
  return (
    <Panel title="小红书今天发什么" desc={`粉丝 ${thousands(a.followers)}${a.followers_7d !== null ? ` · 近 7 天 +${a.followers_7d}` : ''}（数据截至 ${md(a.stats_through)}）`}
      action={<GoLink to="/content">小红书</GoLink>} bodyClass="grid gap-4 p-4">
      {plan.posts.map((p) => (
        <article key={p.id} className="rounded-lg border bg-background/60 p-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground"><Clock className="size-3.5" />{p.time ?? '时间未定'} 发</span>
            {p.pillar_name && <span>· {p.pillar_name}</span>}
            <span className="ml-auto flex gap-1"><StatusBadge value={p.status} />{p.draft_status && p.draft_status !== p.status && <StatusBadge value={p.draft_status} />}</span>
          </div>
          <h3 className="mt-2 text-[15px] leading-snug font-semibold">{p.title}</h3>
          {p.cover_text && <p className="mt-2 flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs text-accent-foreground"><ImageIcon className="size-3.5 shrink-0" />封面字：{p.cover_text}</p>}
          {p.memo && <p className="mt-2 text-xs text-muted-foreground">{p.memo}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" asChild><Link to={`/content/studio/${p.draft_id ?? p.id}`}>看草稿</Link></Button>
            <Button size="sm" variant="outline" asChild><Link to="/content/pieces?view=calendar">排期</Link></Button>
          </div>
        </article>
      ))}
      {!plan.posts.length && <EmptyNote>今天没排笔记，从下面的选题里挑一个。</EmptyNote>}
      <div>
        <div className="mb-1 flex items-baseline justify-between px-1 text-xs"><span className="font-medium text-muted-foreground">早上生成的选题</span><Link to="/content" className="text-primary hover:underline">全部 {plan.topics_total} 个</Link></div>
        {plan.topics.map((t) => (
          <Link key={t.id} to={`/content?piece=${t.id}`} className="block rounded-md px-1 py-1.5 hover:bg-muted/60">
            <span className="line-clamp-2 block text-[13px] leading-snug">{t.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground"><StatusBadge value={t.source} tone="neutral" />{t.pillar_name ?? '不在内容支柱里'}</span>
          </Link>
        ))}
      </div>
      {plan.upcoming.length > 0 && (
        <p className="border-t pt-3 text-xs text-muted-foreground">接下来：{plan.upcoming.map((u) => (u.status === '待定' ? `${relDay(u.date)}还空着` : `${relDay(u.date)}「${u.title}」${u.status}`)).join('；')}</p>
      )}
    </Panel>
  )
}
