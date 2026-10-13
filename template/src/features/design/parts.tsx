// 组件规范页自己的小件：分节标题、示例卡（上面是活的示例，下面写什么时候用 / 不要这样用）、规则清单
import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-5">
      <header className="max-w-3xl">
        <h2 className="font-heading text-[22px] leading-tight font-semibold">{title}</h2>
        {desc && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>}
      </header>
      {children}
    </section>
  )
}

/** 小标题：一节里再分几组 */
export function Sub({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

export function Example({ title, tag, desc, use, avoid, children, className, bodyClass }: {
  title: ReactNode; tag?: string; desc?: ReactNode; use?: ReactNode; avoid?: ReactNode; children: ReactNode; className?: string; bodyClass?: string
}) {
  return (
    <figure className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-paper', className)}>
      <figcaption className="border-b px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold">{title}</span>
          {tag && <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">{tag}</code>}
        </div>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </figcaption>
      <div className={cn('min-w-0 flex-1 p-5', bodyClass)}>{children}</div>
      {(use || avoid) && <UseAvoid use={use} avoid={avoid} />}
    </figure>
  )
}

export function UseAvoid({ use, avoid, className }: { use?: ReactNode; avoid?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-x-6 gap-y-1.5 border-t bg-surface-2/50 px-5 py-3 text-[12.5px] leading-relaxed sm:grid-cols-2', className)}>
      {use && <p className="flex gap-1.5"><Check className="mt-[3px] size-3.5 shrink-0 text-ok" aria-hidden /><span><span className="font-semibold">适合：</span>{use}</span></p>}
      {avoid && <p className="flex gap-1.5"><X className="mt-[3px] size-3.5 shrink-0 text-danger" aria-hidden /><span><span className="font-semibold">不要：</span>{avoid}</span></p>}
    </div>
  )
}

/** 规则清单：编号列出，最重要的写在前面 */
export function Rules({ title = '规则', items, className }: { title?: string; items: ReactNode[]; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-primary/25 bg-accent/40 px-5 py-4', className)}>
      <h3 className="text-[13px] font-semibold text-accent-foreground">{title}</h3>
      <ol className="mt-2 grid gap-1.5 text-[13px] leading-relaxed">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[18px_minmax(0,1fr)] gap-1">
            <span className="num text-xs leading-[1.6rem] text-muted-foreground">{i + 1}.</span>
            <span>{it}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 行内代码：组件名、文件名、令牌名 */
export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] break-all">{children}</code>
}

/** 示意图里的一道灰条（代表文字） */
export function Bar({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block h-1.5 rounded-full bg-foreground/15', className)} />
}
