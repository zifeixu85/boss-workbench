// 页面骨架：页头、面板、子标签、指标卡。各模块都用这几个，保证长得一样。
import { createContext, useContext, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { useNavMode } from '@/app/nav-mode'

/** 没有左栏时（顶部导航、双层里只有一页的分区）正文居中：外壳提供 true，页头和正文加 mx-auto（2026-10-17） */
export const PageCenterContext = createContext(false)
/** 分区名：复杂导航的顶栏已经写了位置（分区 › 分组 › 页面），页头上方的小字是分区名时，电脑上不再重复 */
const SECTION_NAMES = new Set(['今日', '客户', '经营', '内容', '数据', '资料', '系统'])

/** className 用来限宽（比如 max-w-5xl），和下面 PageBody 的宽度对齐；居中时一起居中 */
export function PageHeader({ eyebrow, title, desc, actions, children, className }: { eyebrow?: string; title: string; desc?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  const centered = useContext(PageCenterContext)
  const crumbsOnTop = useNavMode() === 'complex' && !!eyebrow && SECTION_NAMES.has(eyebrow)
  return (
    <header className={cn('px-4 pt-5 pb-4 md:px-7', centered && 'mx-auto w-full', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className={cn('mb-1 text-xs tracking-wide text-muted-foreground', crumbsOnTop && 'md:hidden')}>{eyebrow}</div>}
          <h1 className="font-heading text-[26px] leading-tight font-semibold">{title}</h1>
          {desc && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** 页内二级导航：只在“简单导航”时显示。复杂导航和顶部导航已经在菜单里列出子页面，这里不再重复。
 *  样式和视图切换的 Tab 下划线版一致。 */
export function SubTabs({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  const mode = useNavMode()
  if (mode !== 'simple') return null
  return (
    <nav className="mt-4 flex gap-5 border-b" aria-label="子页面">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cn('-mb-px border-b-2 pb-2 text-sm transition-colors', isActive ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {i.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  const centered = useContext(PageCenterContext)
  return <div className={cn('px-4 pb-24 md:px-7 md:pb-10', centered && 'mx-auto w-full', className)}>{children}</div>
}

export function Panel({ title, desc, action, children, className, bodyClass }: { title?: ReactNode; desc?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn('min-w-0 rounded-xl border bg-card shadow-paper', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('p-5', bodyClass)}>{children}</div>
    </section>
  )
}

/** 涨跌颜色按中国习惯：涨用红，跌用绿（与好坏无关，好坏看文字） */
export function Stat({ label, value, unit, delta, hint, tone }: {
  label: string; value: ReactNode; unit?: string; delta?: number | null; hint?: ReactNode; tone?: 'warn' | 'danger' | 'ok'
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3.5 shadow-paper">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('num mt-1 font-heading text-[26px] leading-none font-semibold', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger', tone === 'ok' && 'text-ok')}>
        {value}{unit && <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {(delta != null || hint) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {delta != null && (
            <span className={cn('num font-medium', delta > 0 && 'text-rise', delta < 0 && 'text-fall')}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)}{unit === '%' ? ' 个点' : unit ? ` ${unit}` : ''}
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  )
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? '—'}</dd>
    </div>
  )
}
