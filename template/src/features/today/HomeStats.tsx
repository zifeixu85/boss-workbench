// 驾驶舱顶上那一排数（2026-11-24）：核心给今天的待办、日程，装进来的模块再各给几个（个人助理：本周做完、本周产出、连续在用）。
// 每个数是一个入口，点了去对应的页；有走势的画一条近 14 天的小柱（从旧到新，最后一根是今天）。没有数就整排不显示。
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import type { Overview } from '@/lib/types'

type HomeStat = NonNullable<Overview['home_stats']>[number]

/** 近几天的小柱：只看高低，不标数；全是 0 时画一条底线 */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 0)
  const w = 4, gap = 2, h = 22
  return (
    <svg aria-hidden width={values.length * (w + gap) - gap} height={h} className="shrink-0 text-chart-1">
      {values.map((v, i) => {
        const bh = max ? Math.max(2, Math.round((v / max) * h)) : 2
        return <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1} className={i === values.length - 1 ? 'fill-current' : 'fill-current opacity-40'} />
      })}
    </svg>
  )
}

function Tile({ s }: { s: HomeStat }) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{s.label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className={cn('num font-heading text-[26px] leading-none font-semibold', s.tone === 'ok' && 'text-ok', s.tone === 'warn' && 'text-warn')}>
          {s.value}{s.unit && <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{s.unit}</span>}
        </div>
        {s.spark && s.spark.length > 1 && <Spark values={s.spark} />}
      </div>
      {s.hint && <div className="mt-2 truncate text-xs text-muted-foreground">{s.hint}</div>}
    </>
  )
  const cls = 'block min-w-0 rounded-xl border bg-card px-4 py-3.5 shadow-paper'
  return s.to
    ? <Link to={s.to} className={cn(cls, 'transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring')}>{body}</Link>
    : <div className={cls}>{body}</div>
}

export function HomeStats({ stats }: { stats?: HomeStat[] }) {
  if (!stats?.length) return null
  return (
    <section aria-label="进展的几个数" className={cn('grid grid-cols-2 gap-3', stats.length >= 5 ? 'md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6' : stats.length >= 3 ? 'md:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-2')}>
      {stats.map((s) => <Tile key={`${s.module}-${s.label}`} s={s} />)}
    </section>
  )
}
