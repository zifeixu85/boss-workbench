// 测试用的假模块的页面
import { useApi } from '@/lib/api'
import { PageBody, PageHeader } from '@/components/page'

export default function MemoPage() {
  const { data } = useApi<{ title: string; items: { id: string; text: string }[] }>('/m/memo')
  return (
    <>
      <PageHeader title={data?.title ?? '备忘'} />
      <PageBody><ul>{(data?.items ?? []).map((x) => <li key={x.id}>{x.text}</li>)}</ul></PageBody>
    </>
  )
}
