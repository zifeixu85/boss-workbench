// 单个渠道一页：/channel/douyin、/channel/tmall、/channel/xhs、/channel/wechat、/channel/store
// 指标卡、成交和订单走势、渠道特有的内容（天猫推广计划、小红书店售后明细、抖店云仓、门店停业提醒 / 哪几天人多 / 会员）、流量来源、商品前 5、退款原因、推广、库存、运营记录、导入记录。
// 数据：GET /api/biz/channel/:id?days=（server/modules/biz/channel.ts）。抽屉和汇总页共用（drawers/）。
import { Link, useParams } from 'react-router'
import { ArrowRight, ChevronRight, Siren } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/page'
import { Loading } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/api'
import { shortDate, todayStr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ChannelFreshBar } from './fresh'
import { BizBadge, KpiCard, RangeTabs, SectionHead } from './parts'
import { useBizOverlay, useDays, withDays } from './state'
import { channelColor, PLATFORM_TOOL } from './fmt'
import { BizError } from './errors'
import { GmvChart, OrdersChart } from './channel/Trends'
import { ProductsPanel, TrafficPanel } from './channel/Mix'
import { AdsPanel, CampaignTable, RefundsPanel } from './channel/Money'
import { MemberPanel, StoreNotice, StoreWeekPanel } from './channel/Store'
import { CloudPanel, InventoryPanel } from './channel/Stock'
import { AftersalesPanel } from './channel/Aftersales'
import { OpsPanel, RunsPanel } from './channel/Ops'
import { AnomalyList } from './AnomalyList'
import { BizDrawers } from './drawers'
import type { AnomalyItem, ChannelData } from './types'

const KPI_KIND: Record<string, string> = { refund_rate: '退款', roi: '推广' }
const CHANNELS = [['douyin', '抖店'], ['tmall', '天猫'], ['xhs', '小红书店'], ['wechat', '视频号小店'], ['store', '门店']]

function ActiveAlerts({ items }: { items: AnomalyItem[] }) {
  const ov = useBizOverlay()
  const open = items.filter((a) => a.status !== '已处理')
  if (!open.length) return null
  return (
    <div className="grid gap-2">
      {open.map((a) => (
        <button key={a.id} type="button" onClick={() => ov.openAnomaly(a.id)}
          className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-left shadow-paper hover:border-danger/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Siren className="mt-0.5 size-4 text-danger" aria-hidden />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{a.title}</span><BizBadge value={a.status} />{a.owner && <span className="text-xs text-muted-foreground">{a.owner}在跟</span>}</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">{a.cause ?? a.detail}</span>
          </span>
          <span className="flex items-center gap-1 self-center text-xs whitespace-nowrap text-muted-foreground group-hover:text-primary"><span className="hidden sm:inline">看证据和建议</span><ChevronRight className="size-4" /></span>
        </button>
      ))}
    </div>
  )
}

function sourceOf(d: ChannelData) {
  return d.freshness?.source_name ?? '平台导出'
}

export default function ChannelPage() {
  const { id = '' } = useParams()
  const [days] = useDays()
  const { data: d, isLoading, isError, error, refetch } = useApi<ChannelData | null>(`/biz/channel/${id}?days=${days}`)
  const store = id === 'store'
  const open = (d?.anomalies.active ?? []).filter((a) => a.status !== '已处理')
  const flagsOf = (key: string) => open.filter((a) => a.kind === KPI_KIND[key]).map((a) => ({ id: a.id, channel_name: d?.channel.name ?? '' }))
  const src = d ? sourceOf(d) : ''
  const desc = d && <>负责人 {d.channel.owner} · 从{d.channel.warehouse_name}发货{PLATFORM_TOOL[id] ? ` · 推广用${PLATFORM_TOOL[id]}` : ' · 没有平台推广'} · <Link to={withDays('/biz', days)} className="whitespace-nowrap text-primary hover:underline">回经营汇总</Link></>
  return (
    <>
      <PageHeader eyebrow="经营" title={d?.channel.name ?? CHANNELS.find(([k]) => k === id)?.[1] ?? '渠道'} desc={desc} actions={<RangeTabs />} />
      <PageBody className="grid gap-4">
        {isLoading ? <Loading /> : isError ? (
          <BizError error={error} onRetry={() => refetch()} hint="换一个渠道看看："
            action={<div className="flex flex-wrap justify-center gap-2">{CHANNELS.map(([k, name]) => <Button key={k} size="sm" variant="outline" asChild><Link to={`/channel/${k}`}>{name}</Link></Button>)}</div>} />
        ) : !d ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-paper">这个渠道还没有经营数据。到 <Link to="/sources" className="text-primary underline">数据源</Link> 看看文件有没有导进来。</div>
        ) : (
          <>
            <ChannelFreshBar f={d.freshness} run={d.runs[0]} today={todayStr()} />
            {d.range.coverage.note && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{d.range.coverage.note}</p>}
            {store && <StoreNotice d={d} />}
            <ActiveAlerts items={d.anomalies.active} />

            <SectionHead title={`昨天 · ${shortDate(d.date)}`} desc={`指标卡是昨天的数，小线是近 ${d.days} 天每天的走势；点卡片看这个数是怎么来的${d.prev_holiday_days ? ` · 前 ${d.days} 天含国庆，比上一段会显得少` : ''}`} />
            <div className={cn('grid grid-cols-2 gap-3', store ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
              {d.kpis.map((k) => <KpiCard key={k.key} k={k} days={d.days} flags={flagsOf(k.key)} color={channelColor(id)} trace={{ metric: k.key, channel: id, from: d.date, to: d.date }} />)}
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <GmvChart d={d} source={src} />
              <OrdersChart d={d} source={src} />
            </div>

            {id === 'tmall' && <CampaignTable d={d} />}
            {id === 'xhs' && <AftersalesPanel d={d} />}
            {d.extras.cloud && <CloudPanel d={d} />}
            {store && (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <StoreWeekPanel d={d} />
                <MemberPanel d={d} />
              </div>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-5"><TrafficPanel d={d} source={src} /></div>
              <div className="min-w-0 xl:col-span-7"><ProductsPanel d={d} source={src} /></div>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-5"><RefundsPanel d={d} source={src} /></div>
              <div className="min-w-0 xl:col-span-7">{store ? <InventoryPanel d={d} /> : <AdsPanel d={d} source={src} compact={id !== 'tmall'} />}</div>
            </div>
            {!store && !d.extras.cloud && <InventoryPanel d={d} />}

            <OpsPanel d={d} />
            <div className="grid items-start gap-4 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-5"><RunsPanel d={d} /></div>
              <div className="min-w-0 xl:col-span-7">
                {(d.anomalies.active.length + d.anomalies.history.length) > 0 ? (
                  <AnomalyList active={d.anomalies.active} history={d.anomalies.history} title={`${d.channel.name}的异常`} showChannel={false} desc="现在报的和处理过的；点开看证据、原因、建议和处理记录" />
                ) : <div className="rounded-xl border bg-card px-5 py-4 text-[13px] text-muted-foreground shadow-paper">{d.channel.name}这段时间没有报过异常。</div>}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" asChild><Link to={d.freshness?.source_id ? `/sources?source=${d.freshness.source_id}` : '/sources'}>这个渠道的数据源<ArrowRight /></Link></Button>
            </div>
          </>
        )}
      </PageBody>
      <BizDrawers fallbackDate={d?.date} />
    </>
  )
}
