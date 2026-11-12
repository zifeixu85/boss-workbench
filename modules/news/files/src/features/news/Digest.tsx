// 行业资讯：页面最上面那一块——这一天的总结。
// 工作台自己不调 AI：总结由 Codex 写了用命令 news-digest-set 放进来；还没有时放来源自带的一句，都没有就写“还没有总结”。
import { Sparkles } from 'lucide-react'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { dayLabel, noImages, when, type Brief, type Digest } from './types'

const box = 'rounded-xl border px-5 py-4 shadow-paper'

export function DigestPanel({ day, today, digest, briefs, onOpen }: { day: string; today: string; digest: Digest | null; briefs: Brief[]; onOpen: (id: string) => void }) {
  const title = `${dayLabel(day, today)}的总结`
  if (!digest) {
    return (
      <section className={cn(box, 'bg-card')} aria-label={title}>
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {briefs.length ? (
          <ul className="mt-2 grid gap-2">
            {briefs.map((b) => <li key={b.source_id} className="text-[15px] leading-relaxed">{b.summary}<span className="ml-2 text-xs text-muted-foreground">{b.source} 自带的一句</span></li>)}
          </ul>
        ) : <p className="mt-1.5 text-sm text-muted-foreground">还没有总结。到“设置”里复制“每天的口令”，粘进 Codex 的定时任务，它每天取完就写一份放在这里。</p>}
      </section>
    )
  }
  return (
    <section className={cn(box, 'border-primary/25 bg-accent/60')} aria-label={title}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"><Sparkles className="size-4" aria-hidden />{title}</h2>
        <span className="text-xs text-muted-foreground">{digest.written_by} {when(digest.updated_at).split(' ')[1]} 写的 · 读了{dayLabel(day, today)}的 {digest.read_count} 条</span>
      </div>
      <Markdown source={noImages(digest.body)} className="mt-2 text-[15.5px] leading-[1.8] [&_p]:my-1" />
      {digest.picks.length > 0 && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-primary/15 pt-2.5 text-sm">
          <span className="font-semibold text-primary">{digest.picks.length} 条和你有关</span>
          {digest.picks.map((x) => (
            <button key={x.id} type="button" onClick={() => onOpen(x.id)} className="min-w-0 text-left text-foreground/85 underline decoration-primary/30 underline-offset-4 hover:text-primary">{x.title}</button>
          ))}
        </div>
      )}
    </section>
  )
}
