// 小红书店特有：售后明细（千帆后台导出的逐单售后表）。上面是按发货批次汇总（10/23 那批公道杯），下面一单一单看，可以按批次、状态筛。
// 金额分开写：已经退的（已退款 + 退款中）一个数，还没处理的另写；“几位买家说坏了”和“退款几单”是两回事，说法分开。
import { useState } from 'react'
import { PackageX } from 'lucide-react'
import { Panel } from '@/components/page'
import { ChartNote, EmptyNote } from '@/components/chart-kit'
import { ViewTabs } from '@/components/view-tabs'
import { StickyTable } from '@/components/data-view'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { md } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge } from '../parts'
import { yuanNum } from '../fmt'
import type { ChannelData } from '../types'
import { useIdentity } from '@/lib/identity'

type Tab = 'batch' | 'open' | 'all'
const money = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function AftersalesPanel({ d }: { d: ChannelData }) {
  const a = d.extras.aftersales
  const [tab, setTab] = useState<Tab>('batch')
  const { owner } = useIdentity()
  if (!a) return null
  const batch = a.batches[0]
  const isOpen = (s: string) => s === '待处理' || s === '退款中'
  const rows = a.list.filter((x) => (tab === 'batch' ? x.batch === batch?.batch : tab === 'open' ? isOpen(x.status) : true))
  return (
    <Panel title="小红书店售后明细" desc={`近 ${d.days} 天 ${a.list.length} 张售后单；${batch ? `“${batch.batch}”那批${batch.sku_name ?? ''}有 ${batch.tickets} 位买家说到手坏了` : '没有集中在某一批的'}`} bodyClass="p-0" className={cn(batch && 'border-danger/30')}>
      {batch && (
        <div className="grid gap-4 border-b bg-danger-soft/30 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex gap-3">
            <PackageX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">{batch.batch} · {batch.sku_name}</div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{batch.ship_note ?? '运营记录里没找到这批的发货记录'}</p>
            </div>
          </div>
          <dl className="grid grid-cols-5 gap-x-3 text-center sm:gap-x-4">
            {([['发出', batch.shipped ?? '—', '件'], ['说坏了', batch.tickets, '位'], ['退款', batch.refunded, '单'], ['补发', batch.resent, '单'], ['没处理', batch.pending, '单']] as const).map(([k, v, u]) => (
              <div key={k}><dt className="text-[11px] whitespace-nowrap text-muted-foreground">{k}</dt><dd className={cn('num font-heading text-[20px] font-semibold whitespace-nowrap', k === '没处理' && Number(v) > 0 && 'text-danger')}>{v}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{u}</span></dd></div>
            ))}
          </dl>
          {batch.shipped ? (
            <p className="text-xs leading-relaxed text-muted-foreground md:col-span-2">
              这批 {batch.shipped} 件里，已经有 {batch.tickets} 位买家说到手坏了（{Math.round((batch.tickets / batch.shipped) * 100)}%）：退款 {batch.refunded} 单共 {yuanNum(batch.refunded_amount)} 元{batch.refunding ? `（其中 ${batch.refunding} 单还在退）` : ''}，补发 {batch.resent} 单{batch.pending ? `，还有 ${batch.pending} 单 ${yuanNum(batch.pending_amount)} 元没处理` : ''}；另外 {batch.shipped - batch.tickets} 位买家还没反馈。
            </p>
          ) : null}
        </div>
      )}
      <div className="px-4 py-2.5">
        <ViewTabs label="筛选售后单" value={tab} onChange={setTab} items={[
          { value: 'batch', label: batch ? `${batch.batch}那批` : '这一批', count: a.list.filter((x) => x.batch === batch?.batch).length },
          { value: 'open', label: `没结束（待处理 ${a.open.pending} + 退款中 ${a.open.refunding}）` },
          { value: 'all', label: '全部', count: a.list.length },
        ]} />
      </div>
      {rows.length ? (
        <StickyTable maxHeight="360px" className="mx-4 mb-1 shadow-none">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">申请时间</TableHead>
              <TableHead>商品</TableHead>
              <TableHead>原因</TableHead>
              <TableHead className="text-right whitespace-nowrap">退款（元）</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="min-w-[180px]">买家说</TableHead>
              <TableHead>客服</TableHead>
              <TableHead className="pr-4">订单号</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="num pl-4 whitespace-nowrap">{md(x.applied_at)} {x.applied_at.slice(11, 16)}</TableCell>
                <TableCell className="whitespace-nowrap">{x.sku_name ?? '—'}{x.qty > 1 && <span className="text-muted-foreground"> × {x.qty}</span>}{x.batch && <div className="text-[11px] text-muted-foreground">{x.batch}</div>}</TableCell>
                <TableCell className="whitespace-nowrap">{x.reason}</TableCell>
                <TableCell className="num text-right whitespace-nowrap">{x.amount ? money(x.amount) : <span className="text-muted-foreground">不退钱</span>}</TableCell>
                <TableCell><BizBadge value={x.status} /></TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{x.buyer_note ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{x.handler ?? '—'}</TableCell>
                <TableCell className="num pr-4 text-xs text-muted-foreground">{x.order_no}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </StickyTable>
      ) : <div className="px-5 pb-2"><EmptyNote>没有这样的售后单。</EmptyNote></div>}
      <div className="px-5 pb-4"><ChartNote>来源：千帆后台导出的售后表（晓雯每天 07:30 前导出）· 客服{a.handlers.join('、')}处理 · 零售小件碎了客服可以直接补发或退，不用等{owner} · 退款金额到分，和平台售后表一致</ChartNote></div>
    </Panel>
  )
}
