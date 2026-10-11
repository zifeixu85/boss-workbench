// 出错时分两种说：服务端回了话（没有这个渠道、这条异常已经不报了）→ 写清楚是什么情况，给一个去处；
// 根本没连上本地服务 → 才让人重试。不把“没有这条”说成网络问题。
import type { ReactNode } from 'react'
import { Failed } from '@/components/chart-kit'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ApiError } from '@/lib/api'

export function BizError({ error, onRetry, hint, action }: { error: unknown; onRetry: () => void; hint?: string; action?: ReactNode }) {
  if (error instanceof ApiError) {
    return (
      <Empty className="border bg-card py-10 shadow-paper">
        <EmptyHeader><EmptyTitle>{error.message}</EmptyTitle>{hint && <EmptyDescription>{hint}</EmptyDescription>}</EmptyHeader>
        {action && <EmptyContent>{action}</EmptyContent>}
      </Empty>
    )
  }
  return <Failed message="没连上本地服务" onRetry={onRetry} />
}
