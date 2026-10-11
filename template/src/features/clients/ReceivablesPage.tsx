// 应收款：企业茶礼的定金尾款、渠道的月结货款、寄卖结算。哪笔该收、收了多少、哪笔逾期
import { HandCoins } from 'lucide-react'
import { PageHeader, SubTabs } from '@/components/page'
import { Button } from '@/components/ui/button'
import { useOverlay } from '@/app/overlay'
import { ReceivablesView } from './ReceivablesView'
import { CLIENT_TABS } from './ClientsPage'

export default function ReceivablesPage() {
  const ov = useOverlay()
  return (
    <>
      <PageHeader eyebrow="客户" title="应收款" desc="企业茶礼的定金和尾款、渠道的月结货款、寄卖结算：收了多少、还差多少、哪笔该去催了。"
        actions={<Button onClick={() => ov.openNew('collect')}><HandCoins />登记回款</Button>}>
        <SubTabs items={CLIENT_TABS} />
      </PageHeader>
      <ReceivablesView />
    </>
  )
}
