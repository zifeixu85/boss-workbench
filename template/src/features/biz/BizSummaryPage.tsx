// 经营汇总：5 个渠道放在一起看。首屏四样（昨天成交、近 15 天走势、今天最要紧的事、最新经营早报），往下是指标卡、各渠道成交、占比、对比表、异常和早报。
// 数据：GET /api/biz/board?days=（server/modules/biz/board.ts）。抽屉：异常、早报、日报设置、数字来源（drawers/）。
// 手机上：页头说明收起、日报设置是图标按钮、数据新鲜度缩成一行；顺序是 大数字 → 最要紧的事 → 15 天走势 → 早报。
import { Settings2 } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/page'
import { Failed, Loading } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { FreshnessBar } from './fresh'
import { KpiCard, RangeTabs, SectionHead } from './parts'
import { channelColor } from './fmt'
import { useBizOverlay, useDays } from './state'
import { HeroSales, LatestReport, MobileTrend, TopIssues } from './summary/Hero'
import { ChannelShare, StackedByChannel } from './summary/Charts'
import { ChannelTable } from './summary/ChannelTable'
import { ReportHistory } from './summary/ReportHistory'
import { AnomalyList } from './AnomalyList'
import { BizDrawers } from './drawers'
import type { Board } from './types'

function rangeNote(b: Board) {
  const base = `${shortDate(b.from)}—${shortDate(b.to)} · 指标卡是昨天的数，小线是这段时间每天的走势；点卡片看这个数是怎么来的`
  return b.prev_holiday_days > 0 ? `${base} · 上一段含国庆 ${b.prev_holiday_days} 天，偏高` : base
}

export default function BizSummaryPage() {
  const [days] = useDays()
  const ov = useBizOverlay()
  const { data: b, isLoading, isError, error, refetch } = useApi<Board | null>(`/biz/board?days=${days}`)
  const toList = () => document.getElementById('biz-anomalies')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <>
      <PageHeader eyebrow="经营" title="经营汇总"
        desc={<span className="max-sm:hidden">抖店、天猫、小红书店、视频号小店、门店放在一起看：昨天卖了多少、比上周怎样、哪几件事要处理。企业茶礼另算。</span>}
        actions={<Button variant="outline" size="sm" onClick={ov.openSettings} aria-label="日报设置"><Settings2 /><span className="max-sm:hidden">日报设置</span></Button>} />
      <PageBody className="grid gap-4 md:gap-5">
        {isLoading ? <Loading /> : isError ? <Failed message={(error as Error).message} onRetry={() => refetch()} /> : !b ? (
          <Empty className="border bg-card py-12 shadow-paper">
            <EmptyHeader><EmptyTitle>经营数据还没导进来</EmptyTitle><EmptyDescription>到“数据源”看看哪个平台的文件没到，导入后这里自动出数。</EmptyDescription></EmptyHeader>
          </Empty>
        ) : (
          <>
            <FreshnessBar f={b.freshness} />
            <div className="grid gap-4 xl:grid-cols-12 xl:items-stretch">
              <div className="min-w-0 xl:col-span-7"><HeroSales b={b} /></div>
              <div className="min-w-0 xl:col-span-5"><TopIssues b={b} onAll={toList} /></div>
            </div>
            <MobileTrend b={b} />
            <LatestReport r={b.report} />

            <div className="mt-3 grid gap-4">
              <SectionHead title={`近 ${b.days} 天`} desc={rangeNote(b)} action={<RangeTabs />} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {b.kpis.map((k) => <KpiCard key={k.key} k={k} days={b.days} flags={b.kpi_flags[k.key] ?? []} color={channelColor('all')} trace={{ metric: k.key, from: b.date, to: b.date }} />)}
              </div>
              <div className="grid gap-4 xl:grid-cols-12">
                <div className="min-w-0 xl:col-span-8"><StackedByChannel b={b} /></div>
                <div className="min-w-0 xl:col-span-4"><ChannelShare b={b} /></div>
              </div>
              <ChannelTable b={b} />
              <div className="grid items-start gap-4 xl:grid-cols-12">
                <div className="min-w-0 scroll-mt-4 xl:col-span-7" id="biz-anomalies">
                  <AnomalyList active={b.anomalies.active} history={b.anomalies.history} title="异常" desc={`规则每天早上按日报设置算：${b.rules_text}`} />
                </div>
                <div className="min-w-0 xl:col-span-5"><ReportHistory /></div>
              </div>
            </div>
          </>
        )}
      </PageBody>
      <BizDrawers fallbackDate={b?.date} />
    </>
  )
}
