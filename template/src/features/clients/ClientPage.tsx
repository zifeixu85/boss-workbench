// 单个客户的整页。/clients/:id 带导航；/embed/clients/:id 不带导航，给 Codex 插件侧栏或浏览器小窗用
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ClientActions, ClientBody, ClientMeta, ClientTitle, useClientDetail } from './ClientDetail'

export default function ClientPage({ embed }: { embed?: boolean }) {
  const { id = '' } = useParams()
  const { data, error } = useClientDetail(id)
  if (error) return <div className="p-10 text-center text-sm text-muted-foreground">{error.message}<div className="mt-3"><Link className="text-primary underline" to="/clients">回到客户列表</Link></div></div>
  if (embed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-1 text-xs text-muted-foreground">客户</div>
        <h1 className="font-heading text-xl font-semibold"><ClientTitle d={data} /></h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><ClientMeta d={data} /></div>
        <div className="mt-3 mb-5 flex flex-wrap gap-2"><ClientActions id={id} withPageLink={false} /></div>
        <ClientBody d={data} />
      </div>
    )
  }
  return (
    <>
      {/* 第三轮修产品评审 #19：标题只写名字，副信息做灰色说明；内容卡和页头同宽 */}
      <PageHeader eyebrow="客户详情" title={data ? data.client.name : '…'}
        desc={<span className="flex flex-wrap items-center gap-2">{data?.client.label && <span>{data.client.label}</span>}<ClientMeta d={data} /></span>}
        actions={<><Button variant="ghost" asChild><Link to="/clients"><ArrowLeft />客户列表</Link></Button><ClientActions id={id} withPageLink={false} /></>} />
      <PageBody>
        <div className="rounded-xl border bg-card p-5 shadow-paper md:p-6"><ClientBody d={data} /></div>
      </PageBody>
    </>
  )
}
