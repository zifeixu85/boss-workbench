// 异常列表：状态页签“还没办完 / 已处理 / 全部”（默认还没办完，?status=），已处理的在底下折成一行。点开右侧抽屉看证据、原因、建议，改状态。汇总页和渠道页共用。
// 每条开头是发现的日子，右边是严重程度和处理状态；渠道、类型、谁跟放在描述下面（手机上不挤标题）。
import { useSearchParams } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Panel } from '@/components/page'
import { EmptyNote } from '@/components/chart-kit'
import { ViewTabs } from '@/components/view-tabs'
import { md } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge } from './parts'
import { useBizOverlay } from './state'
import type { AnomalyItem } from './types'

type Tab = 'open' | '已处理' | 'all'
const isOpen = (a: AnomalyItem) => a.status !== '已处理'

export function AnomalyList({ active, history, title = '异常', desc, showChannel = true }: {
  active: AnomalyItem[]; history: AnomalyItem[]; title?: string; desc?: string; showChannel?: boolean
}) {
  const ov = useBizOverlay()
  const [sp, setSp] = useSearchParams()
  const all = [...active, ...history]
  const raw = sp.get('status')
  const tab: Tab = raw === '已处理' || raw === 'all' ? raw : 'open'
  const setTab = (v: Tab) => setSp((p) => { const x = new URLSearchParams(p); if (v === 'open') x.delete('status'); else x.set('status', v); return x }, { replace: true })
  const open = all.filter(isOpen)
  const done = all.filter((a) => !isOpen(a))
  const rows = tab === 'open' ? open : tab === '已处理' ? done : all
  return (
    <Panel title={title} desc={desc} bodyClass="p-0">
      <div className="border-b px-4 py-2.5">
        <ViewTabs label="处理状态" value={tab} onChange={setTab} items={[
          { value: 'open', label: '还没办完', count: open.length }, { value: '已处理', label: '已处理', count: done.length }, { value: 'all', label: '全部', count: all.length },
        ]} />
      </div>
      {rows.length ? (
        <ul className="divide-y">
          {rows.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => ov.openAnomaly(a.id)}
                className={cn('group grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none', !isOpen(a) && 'opacity-85')}>
                <span className="num pt-0.5 text-xs leading-tight text-muted-foreground">{md(a.first_seen ?? a.since)}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] leading-snug font-medium group-hover:text-primary">{a.title}</span>
                  <span className="mt-1 line-clamp-2 block text-[12.5px] leading-relaxed text-muted-foreground">{isOpen(a) ? (a.cause ?? a.detail) : (a.note ?? a.detail)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {[showChannel ? a.channel_name : null, a.short ?? a.kind, a.owner ? `${a.owner}跟` : null].filter(Boolean).join(' · ')}
                    {a.quiet && <BizBadge value="现在不报了" />}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 pt-0.5 whitespace-nowrap">
                  {isOpen(a) && <BizBadge value={a.level} className="max-sm:hidden" />}<BizBadge value={a.status} /><ChevronRight className="size-4 text-muted-foreground" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="p-5"><EmptyNote>{tab === 'open' ? '没有还没办完的异常。' : tab === '已处理' ? '还没有处理过的异常。' : '这里还没有报过异常。'}</EmptyNote></div>}
      {tab === 'open' && done.length > 0 && (
        <button type="button" onClick={() => setTab('已处理')} className="flex w-full items-center justify-between border-t px-5 py-2.5 text-left text-[13px] text-muted-foreground hover:bg-muted/50 hover:text-foreground">
          <span>已处理 {done.length} 条<span className="max-sm:hidden">：{[...new Set(done.map((a) => a.short ?? a.kind))].join('、')}</span></span><ChevronRight className="size-4" />
        </button>
      )}
    </Panel>
  )
}
