// 图表示例卡：眉题是图的种类，标题是它回答的问题，底下写截至日期、来源和适合 / 不适合
import type { ReactNode } from 'react'
import { shortDate, todayStr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ChartNote } from '@/components/chart-kit'
import { UseAvoid } from '../../parts'

export const DEMO_NOTE = `截至 ${shortDate(todayStr())} · 来源：示例数据（虚构）`

export function ChartCard({ kind, question, desc, fit, unfit, note, children, className }: {
  kind: string; question: string; desc?: ReactNode; fit: ReactNode; unfit: ReactNode; note?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <figure className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-paper', className)}>
      <figcaption className="px-5 pt-4">
        <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-[12px] font-medium text-muted-foreground">{kind}</span>
        <div className="mt-1.5 text-[15px] leading-snug font-semibold">{question}</div>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </figcaption>
      <div className="min-w-0 flex-1 px-5 pt-4 pb-4">
        {children}
        <ChartNote>{note ?? DEMO_NOTE}</ChartNote>
      </div>
      <UseAvoid use={fit} avoid={unfit} />
    </figure>
  )
}
