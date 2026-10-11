// “建设中”的占位页：给还没开发的模块用。用规范里的空状态组件（ui/empty），下面列出这个模块已经备好的数据和接口，
// 开发的人一眼知道从哪接着做。模块做好后，把页面里的 <BuildingPage> 换成真正的内容即可。
import type { ReactNode } from 'react'
import { Construction } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/page'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

export type ReadyFact = { label: string; value: ReactNode }

export function BuildingPage({ eyebrow, title, desc, tabs, plan, module, folder, api, facts, children }: {
  eyebrow: string; title: string; desc?: ReactNode
  /** 页头下面的子页面标签（SubTabs，只在简单导航显示） */
  tabs?: ReactNode
  /** 这一页以后会有什么，一两句话 */
  plan: ReactNode
  /** 负责的模块，如“经营” */
  module: string
  /** 代码放在哪，如 src/features/biz/ */
  folder: string
  /** 已经能用的接口 */
  api: string[]
  /** 已经备好的数据（从接口取的真实数字）；还在读取时传 undefined */
  facts?: ReadyFact[]
  children?: ReactNode
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} desc={desc}>{tabs}</PageHeader>
      <PageBody className="grid gap-5">
        {children}
        <Empty className="border bg-card py-10 shadow-paper">
          <EmptyHeader className="max-w-lg">
            <EmptyMedia variant="icon"><Construction /></EmptyMedia>
            <EmptyTitle className="text-base">建设中</EmptyTitle>
            <EmptyDescription>{plan}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="w-full max-w-lg">
            <div className="w-full rounded-lg border bg-background/60 text-left">
              <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">数据已经备好</div>
              {facts ? (
                <dl className="divide-y text-[13px]">
                  {facts.map((f) => (
                    <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2">
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="num text-right font-medium">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="grid gap-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4" />)}</div>
              )}
            </div>
            <div className="grid gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <p>由「{module}」模块开发 · 代码放在 <code className="rounded bg-muted px-1 font-mono break-all">{folder}</code></p>
              <p className="flex flex-wrap items-center justify-center gap-1"><span className="whitespace-nowrap">接口</span>{api.map((a) => <code key={a} className="rounded bg-muted px-1 font-mono">{a}</code>)}</p>
            </div>
          </EmptyContent>
        </Empty>
      </PageBody>
    </>
  )
}
