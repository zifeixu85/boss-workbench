// 右侧抽屉外壳：所有详情（客户、日程、待办、项目）都用它，宽度和页头一致
import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function DetailSheet({ open, onClose, eyebrow, title, meta, actions, children, wide }: {
  open: boolean; onClose: () => void; eyebrow?: string; title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className={cn('flex flex-col gap-0 bg-card p-0 data-[side=right]:w-full', wide ? 'data-[side=right]:sm:max-w-[680px]' : 'data-[side=right]:sm:max-w-[560px]')}>
        <SheetHeader className="border-b px-6 pt-5 pb-4">
          {eyebrow && <div className="text-xs tracking-wide text-muted-foreground">{eyebrow}</div>}
          <SheetTitle className="pr-8 font-heading text-xl leading-snug">{title ?? <Skeleton className="h-6 w-40" />}</SheetTitle>
          <SheetDescription asChild><div className="flex flex-wrap items-center gap-2 text-xs">{meta}</div></SheetDescription>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function SheetSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}
