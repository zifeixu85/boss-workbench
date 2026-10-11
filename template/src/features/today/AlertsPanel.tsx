// 数据异常提醒：经营规则每天早上算一遍（退款率、推广 ROI、库存），再加上没跟上的数据源
import { Link } from 'react-router'
import { ListPlus, Search } from 'lucide-react'
import type { Alert } from '@/lib/types'
import { useOverlay } from '@/app/overlay'
import { Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { GoLink } from './parts'

const KIND: Record<string, string> = { 退款: '经营 · 退款', 推广: '经营 · 推广', 库存: '经营 · 库存', 导入失败: '数据源', 更新超时: '数据源' }

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const ov = useOverlay()
  const biz = alerts.filter((a) => a.module === 'biz').length
  return (
    <Panel title="数据异常提醒" desc={alerts.length ? `${biz} 处经营数据不对劲，${alerts.length - biz} 个数据源没跟上；每条都附了从数据里找到的线索` : '数据都正常'}
      action={<GoLink to="/sources">数据源</GoLink>} bodyClass="p-0">
      {alerts.length ? (
        <ul className="divide-y">
          {alerts.map((a) => (
            <li key={a.id} className="grid gap-x-6 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge value={a.level} />
                  <span className="font-medium">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{KIND[a.kind] ?? a.kind}</span>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">{a.detail}</p>
                {a.cause && <p className="mt-1 flex gap-1.5 text-[13px] leading-relaxed"><Search className="mt-[3px] size-3.5 shrink-0 text-primary" aria-hidden /><span><span className="text-muted-foreground">线索：</span>{a.cause}</span></p>}
              </div>
              <div className="flex gap-2 md:justify-end">
                <Button size="sm" variant="outline" asChild><Link to={a.link}>去看</Link></Button>
                <Button size="sm" variant="ghost" onClick={() => ov.openNew('todo', { text: `查一下：${a.title}` })}><ListPlus />转成待办</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="p-5"><EmptyNote>各渠道的退款、推广和库存都在正常范围，数据源也都按时更新了。</EmptyNote></div>}
    </Panel>
  )
}
