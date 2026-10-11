// 列表类展示的通用外壳。规范（见 工作台/程序/规范/展示方式.md）：
//   表格 —— 字段多、要横向比较（客户、应收、项目）
//   卡片 —— 一眼看人或物的全貌，适合手机（客户卡片、风险项目）
//   看板 —— 有先后阶段，要看卡在哪（商机、待办状态）
//   清单 —— 要逐条处理、打勾（待办、随手记）
//   时间线 —— 按时间发生的记录（跟进记录、最近改动）
//   日历 —— 按日期组织（日程）；周报用“按周列表”切换，不是日历
// 长列表往下滚时，表头 / 看板列标题要一直钉在上面，才知道每列是什么。
//
// 窄空间换行规则（卡片、看板、列表行都适用）：
//   ① 数字和单位不拆行：format.ts 的 wan()/relDay() 已用不换行空格；自己拼的用 NBSP。
//   ② 小信息整块换行：一行里的几个小信息（金额、跟进、城市）各自不换行，放不下时整块掉到下一行（MetaRow）。
//   ③ 名称类文字：一行放不下就省略号（truncate）或最多两行（line-clamp-2），外层要有 min-w-0。
//   ④ 看板列有最小宽度，放不下就整块左右滑动，不把列挤扁（Board）；手机上一列约占 85% 宽。
//   ⑤ 列标题：状态在左、数量金额在右；窄了数量金额整体换到第二行。
//   ⑥ 任何内容都不能超出卡片边框：卡片 overflow-hidden 兜底，但不能靠它裁掉文字。
import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Table } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** 表格：自带滚动区域，表头吸顶。maxHeight 默认留出页头的高度 */
export function StickyTable({ children, className, maxHeight = 'calc(100dvh - 230px)' }: { children: ReactNode; className?: string; maxHeight?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl border bg-card shadow-paper', className)} style={{ '--tbl-h': maxHeight } as React.CSSProperties}>
      <Table containerClassName="max-h-(--tbl-h) overflow-auto rounded-xl [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead_th]:bg-surface-2 [&_thead_tr]:shadow-[0_1px_0_var(--border)]">
        {children}
      </Table>
    </div>
  )
}

/** 看板外框：列有最小宽度（默认 228px），放不下时整块左右滑动，手机上按列吸附（规则④）；宽屏时平分。
 *  右边还有内容时，边缘淡出并给一个小箭头，提示可以往右滑 */
export function Board({ children, className, minCol = 228 }: { children: ReactNode; className?: string; minCol?: number }) {
  const n = Children.count(children)
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', check) }
  }, [n])
  return (
    <div className={cn('relative min-w-0', className)}>
      <div ref={ref} className="-mx-1 snap-x snap-mandatory overflow-x-auto px-1 pb-2 [scrollbar-width:thin] sm:snap-none">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(${minCol}px, 1fr))` }}>{children}</div>
      </div>
      {edge.left && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />}
      {edge.right && (
        <button type="button" aria-label="往右看更多列" onClick={() => ref.current?.scrollBy({ left: minCol, behavior: 'smooth' })}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent pr-1 text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  )
}

/** 看板列：每列自己滚动，列标题吸顶（规则⑤）；列内卡片可以拖动（拖放逻辑由页面决定） */
export function BoardColumn({ title, meta, children, className, highlight }: { title: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; highlight?: boolean }) {
  return (
    <section className={cn('flex max-h-[calc(100dvh-250px)] min-w-0 snap-start flex-col rounded-xl border bg-surface-2/60 transition-colors', highlight && 'border-primary bg-accent/60', className)}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-t-xl border-b bg-surface-2/95 px-3 py-2.5 backdrop-blur">
        {title}
        {meta && <span className="num ml-auto text-xs whitespace-nowrap text-muted-foreground">{meta}</span>}
      </header>
      <div className="grid content-start gap-2 overflow-y-auto p-2">{children}</div>
    </section>
  )
}

/** 卡片里的一行小信息（规则②）：每一项整块不换行，放不下整项掉到下一行 */
export function MetaRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground [&>*]:whitespace-nowrap', className)}>
      {children}
    </div>
  )
}
