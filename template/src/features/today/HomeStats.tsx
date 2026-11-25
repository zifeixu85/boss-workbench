// 驾驶舱顶上那一排数（2026-11-24）：核心给今天的待办、日程，装进来的模块再各给几个（个人助理：本周做完、本周产出、连续在用）。
// 每个数是一个入口，点了去对应的页；有走势的画一条近 14 天的小柱（从旧到新，最后一根是今天）。没有数就整排不显示。
// 带 ranges 的格子（AI 用量：今日 / 近 7 日 / 近 30 日）上有一排小页签，切换不跳页；选了哪段记在这台电脑的浏览器里。
import { useState } from 'react'
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

const rangeKey = (s: HomeStat) => `home-stat-range:${s.module}:${s.label}`
function readRange(s: HomeStat): string | null { try { return localStorage.getItem(rangeKey(s)) } catch { return null } }

/** 格子上的时间段页签：按钮在链接外面一层，点它不跳页 */
function RangeSwitch({ s, value, onChange }: { s: HomeStat; value: string; onChange: (k: string) => void }) {
  return (
    <div role="group" aria-label={`${s.label}的时间段`} className="absolute top-2.5 right-2.5 flex rounded-md bg-muted p-0.5 text-[11px]">
      {s.ranges!.map((r) => (
        <button key={r.key} type="button" aria-pressed={r.key === value} onClick={() => onChange(r.key)}
          className={cn('rounded px-1.5 py-0.5 leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', r.key === value && 'bg-card font-medium text-foreground shadow-sm')}>
          {r.label.replace(/^近 /, '')}
        </button>
      ))}
    </div>
  )
}

function Tile({ s }: { s: HomeStat }) {
  const [pick, setPick] = useState<string | null>(() => (s.ranges?.length ? readRange(s) : null))
  const cur = s.ranges?.find((r) => r.key === pick) ?? s.ranges?.[0]
  const v = cur ? { ...s, ...cur, label: s.label } : s
  const choose = (k: string) => { setPick(k); try { localStorage.setItem(rangeKey(s), k) } catch { /* 记不住也能切 */ } }
  const body = (
    <>
      <div className={cn('text-xs text-muted-foreground', cur && 'pr-24')}>{s.label}{cur && <span className="sr-only">（{cur.label}）</span>}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className={cn('num font-heading text-[26px] leading-none font-semibold whitespace-nowrap', v.tone === 'ok' && 'text-ok', v.tone === 'warn' && 'text-warn')}>
          {v.display ?? v.value}{v.unit && <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{v.unit}</span>}
        </div>
        {v.spark && v.spark.length > 1 && <Spark values={v.spark} />}
      </div>
      {v.hint && <div className="mt-2 truncate text-xs text-muted-foreground">{v.hint}</div>}
    </>
  )
  const cls = 'block min-w-0 rounded-xl border bg-card px-4 py-3.5 shadow-paper'
  const tile = s.to
    ? <Link to={s.to} className={cn(cls, 'h-full transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring')}>{body}</Link>
    : <div className={cn(cls, 'h-full')}>{body}</div>
  return cur ? <div className="relative min-w-0">{tile}<RangeSwitch s={s} value={cur.key} onChange={choose} /></div> : tile
}

export function HomeStats({ stats }: { stats?: HomeStat[] }) {
  if (!stats?.length) return null
  return (
    <section aria-label="进展的几个数" className={cn('grid grid-cols-2 gap-3', stats.length === 6 ? 'md:grid-cols-3 xl:grid-cols-6' : stats.length >= 5 ? 'md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6' : stats.length >= 3 ? 'md:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-2')}>
      {stats.map((s) => <Tile key={`${s.module}-${s.label}`} s={s} />)}
    </section>
  )
}
