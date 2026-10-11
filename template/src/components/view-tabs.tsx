// 视图切换：同一页内容换一种看法（表格 / 卡片 / 看板、月 / 周 / 日、近 6 / 12 个月）。
// 规范：Tab 只用来切换“当前页的视图”，不用来重复左侧导航里已经有的页面。
import type { LucideIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type ViewItem<T extends string> = { value: T; label: string; icon?: LucideIcon; count?: number }

export function ViewTabs<T extends string>({ value, onChange, items, className, label = '视图' }: {
  value: T; onChange: (v: T) => void; items: ViewItem<T>[]; className?: string; label?: string
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={cn('max-w-full min-w-0', className)}>
      {/* 窄屏时整排可以左右滑，不撑破页面 */}
      <TabsList aria-label={label} className="h-9 max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
        {items.map((i) => (
          <TabsTrigger key={i.value} value={i.value} className="px-3">
            {i.icon && <i.icon />}
            {i.label}
            {i.count != null && <span className="num ml-0.5 text-xs font-normal opacity-70">{i.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
