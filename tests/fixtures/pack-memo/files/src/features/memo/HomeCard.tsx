// 测试用的假模块的今日页重点卡：data 是 hooks.ts 的 home['memo-today'] 给的
import { Panel } from '@/components/page'

export default function MemoHomeCard({ data }: { data: unknown }) {
  const d = data as { title: string; count: number } | null
  return <Panel title={d?.title ?? '备忘'}>{d ? `${d.count} 条` : '还没有数据'}</Panel>
}
