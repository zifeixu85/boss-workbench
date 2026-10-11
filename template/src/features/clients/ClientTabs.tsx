// 客户详情的页签：概况 / 往来和答应 / 订单与消费 / 关怀（最多 4 个，手机上不横滑；第二轮把“答应过的事”并进往来）。
// 伙伴只有概况和往来。选中的页签写进地址栏（?ctab=），能分享、刷新不丢；旧地址 ctab=promises 打开“往来和答应”。归属：大客户模块
import { useSearchParams } from 'react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ClientProfile } from '@/features/crm/types'
import { ClientOverview } from './ClientOverview'
import { ClientTimeline } from './ClientTimeline'
import { ClientOrders } from './ClientOrders'
import { ClientCareTab } from './ClientCareTab'

const TABS = ['overview', 'log', 'orders', 'care'] as const
type Tab = (typeof TABS)[number]

export function ClientTabs({ d }: { d: ClientProfile }) {
  const [sp, setSp] = useSearchParams()
  const partner = d.client.kind === '伙伴'
  const raw = sp.get('ctab') === 'promises' ? 'log' : sp.get('ctab') ?? ''
  const allowed: readonly string[] = partner ? ['overview', 'log'] : TABS
  const tab = (allowed.includes(raw) ? raw : 'overview') as Tab
  const set = (v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v === 'overview') n.delete('ctab'); else n.set('ctab', v); return n }, { replace: true })
  const open = d.promises.filter((p) => p.status === '待兑现').length
  const upcoming = d.care.filter((x) => ['建议', '已安排'].includes(x.status)).length
  // 第三轮修产品评审 #8：整段标签包进一个 span，只给计数留一点距离（原来 TabsTrigger 的间距把“往来”“和答应”拆成两段，中间像多了空格）
  const count = (n: number) => (n > 0 ? <span className="num ml-1 text-xs opacity-60">{n}</span> : null)
  const label = (wide: string, narrow: string, n?: number) => <span className="whitespace-nowrap"><span className="hidden sm:inline">{wide}</span><span className="sm:hidden">{narrow}</span>{n !== undefined && count(n)}</span>
  return (
    <Tabs value={tab} onValueChange={set}>
      <TabsList className="mb-4 grid w-full grid-cols-4 sm:inline-flex sm:w-auto" style={partner ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } : undefined}>
        <TabsTrigger value="overview">概况</TabsTrigger>
        <TabsTrigger value="log">{partner ? label('往来记录', '往来', d.interactions.length) : label('往来和答应', '往来', d.interactions.length)}</TabsTrigger>
        {!partner && <TabsTrigger value="orders">{label('订单与消费', '订单', d.stats.order_count)}</TabsTrigger>}
        {!partner && <TabsTrigger value="care">{label('关怀', '关怀', upcoming)}</TabsTrigger>}
      </TabsList>
      <TabsContent value="overview"><ClientOverview d={d} /></TabsContent>
      <TabsContent value="log"><ClientTimeline d={d} openPromises={open} /></TabsContent>
      {!partner && <TabsContent value="orders"><ClientOrders d={d} /></TabsContent>}
      {!partner && <TabsContent value="care"><ClientCareTab d={d} /></TabsContent>}
    </Tabs>
  )
}
