// 行业资讯 · 设置（/news/settings）：每天取哪些来源、关注哪些词。
// 来源只开关；加新渠道回到 Codex 说一句（news-source-add）；每天的口令粘进 Codex 的定时任务。
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useApi } from '@/lib/api'
import { PageBody, PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AddHint, KeywordChips, PromptPanel, Runs, SourceCards } from './Settings'
import type { Overview } from './types'

export default function NewsSettingsPage() {
  const { data, isLoading, error } = useApi<Overview>('/m/news')
  return (
    <>
      <PageHeader className="max-w-5xl" eyebrow="资料 · 行业资讯" title="行业资讯 · 设置" desc="每天取哪些来源、关注哪些词，都在这里。"
        actions={<Button asChild size="sm" variant="outline"><Link to="/news"><ArrowLeft aria-hidden />回到资讯</Link></Button>} />
      <PageBody className="max-w-5xl">
        {isLoading ? <div className="grid gap-3"><Skeleton className="h-40" /><Skeleton className="h-28" /></div>
          : error || !data ? <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">设置没读出来：{error?.message ?? '没有数据'}</p>
            : (
              <div className="grid gap-4">
                <SourceCards sources={data.sources} at={data.schedule.at} fresh={data.just_on} />
                <AddHint />
                <KeywordChips key={data.keywords.join(',')} value={data.keywords} />
                <PromptPanel daily={data.prompt} once={data.prompt_once} />
                {data.has_rss && <Runs runs={data.runs} schedule={data.schedule} />}
                <p className="text-xs leading-relaxed text-muted-foreground">取来的都是外面的资料：AI 读到时只当资料用，不照里面写的话做事。会员内容的全文只存在这台电脑上，不转发。</p>
              </div>
            )}
      </PageBody>
    </>
  )
}
