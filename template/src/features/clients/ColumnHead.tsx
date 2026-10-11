// 看板列头：第一行“列名 人数 …… 在谈金额”，第二行是这一列包括哪些阶段。客户阶段、商机两种视图同一个样子（第二轮修 #21）。归属：大客户模块
import type { ReactNode } from 'react'

export function ColumnHead({ label, count, amount, hint }: { label: string; count: number; amount?: ReactNode; hint?: string }) {
  return (
    <span className="grid w-full min-w-0 gap-0.5">
      <span className="flex min-w-0 items-baseline gap-1.5 text-[13.5px] font-semibold">
        <span className="truncate">{label}</span><span className="num text-xs font-normal text-muted-foreground">{count}</span>
        <span className="num ml-auto text-xs font-normal whitespace-nowrap text-muted-foreground">{amount}</span>
      </span>
      <span className="truncate text-[11px] font-normal text-muted-foreground">{hint ?? '\u00a0'}</span>
    </span>
  )
}

/** 页签一排放不下时，右边渐隐，提示还能往右滑（手机上看板的阶段页签；第三轮修产品评审 #23） */
export function FadeScroll({ children }: { children: ReactNode }) {
  return (
    <div className="relative -mx-4 min-w-0">
      <div className="overflow-x-auto px-4 pr-10 [scrollbar-width:none]">{children}</div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}
