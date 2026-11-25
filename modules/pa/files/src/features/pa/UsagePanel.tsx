// AI 用量（2026-11-26 A梦 要）：这台电脑上 Codex 对话用了多少 token。今日 / 近 7 日 / 近 30 日切换；
// 新算的输入、缓存命中、输出分开（缓存便宜得多，又常占九成以上）；每天一根柱；用得最多的文件夹；Codex 自己记的额度。
// Claude Code 的单独一行，不并进总数。驾驶舱那一格点进来（?view=usage）就滚到这里。
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/lib/api'
import { Panel } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Skeleton } from '@/components/ui/skeleton'
import type { Usage } from './types'

type Range = Usage['range']
const RANGES: { value: Range; label: string }[] = [{ value: 'today', label: '今日' }, { value: '7d', label: '近 7 日' }, { value: '30d', label: '近 30 日' }]
const KEY = 'pa-usage-range'
const readRange = (): Range => { try { const v = localStorage.getItem(KEY); return v === 'today' || v === '30d' ? v : '7d' } catch { return '7d' } }

/** 写成人话：一万以下照写，万、亿保留一位小数 */
export function tokens(n: number) { return n < 1e4 ? String(Math.round(n)) : Math.round(n / 1e3) / 10 < 1e4 ? `${(n / 1e4).toFixed(1)} 万` : `${(n / 1e8).toFixed(1)} 亿` }

const PARTS = [
  { key: 'fresh', label: '新算的输入', cls: 'bg-chart-1' },
  { key: 'cached', label: '缓存命中', cls: 'bg-chart-1/35' },
  { key: 'output', label: '输出', cls: 'bg-chart-3' },
] as const

export function UsagePanel({ focus }: { focus?: boolean }) {
  const [range, setRange] = useState<Range>(readRange)
  const { data: u } = useApi<Usage>(`/m/pa/usage?range=${range}`)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [focus, u === undefined])
  const pick = (v: Range) => { setRange(v); try { localStorage.setItem(KEY, v) } catch { /* 记不住也能用 */ } }
  const max = Math.max(...(u?.days.map((d) => d.all) ?? []), 0)
  return (
    <div ref={ref} className="scroll-mt-20">
      <Panel title="AI 用量" desc={u ? `${u.from === u.to ? u.to : `${u.from} — ${u.to}`} · 这台电脑上的 Codex 对话` : '这台电脑上的 Codex 对话'}
        action={<ViewTabs label="时间段" value={range} onChange={pick} items={RANGES} />}>
        {!u ? <Skeleton className="h-40" /> : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="grid content-start gap-3">
              <div><span className="num font-heading text-[32px] leading-none font-semibold">{tokens(u.total.all)}</span><span className="ml-1.5 text-sm text-muted-foreground">token</span></div>
              {u.total.all > 0 && (
                <>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {PARTS.map((p) => <span key={p.key} className={p.cls} style={{ width: `${(u.total[p.key] / u.total.all) * 100}%` }} />)}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    {PARTS.map((p) => <div key={p.key}><dt className="flex items-center gap-1.5 text-muted-foreground"><span className={`size-2 rounded-full ${p.cls}`} />{p.label}</dt><dd className="num mt-0.5 text-sm font-medium">{tokens(u.total[p.key])}</dd></div>)}
                  </dl>
                </>
              )}
              <ul className="grid gap-1 text-xs text-muted-foreground">
                {u.cachedShare !== null && <li>输入里 {u.cachedShare}% 是缓存命中，比新算的便宜得多；算额度以 Codex 自己的百分比为准。</li>}
                <li>{u.limits ? u.limits.text : 'Codex 的额度：记录里还没有'}</li>
                {u.claude && <li>Claude Code（单独算，不在上面的总数里）：{tokens(u.claude.all)} token</li>}
              </ul>
            </div>
            <div className="grid content-start gap-3">
              {u.days.length > 1 && (
                <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`每天的用量，最多一天 ${tokens(max)}`}>
                  {u.days.map((d) => <span key={d.date} title={`${d.date}：${tokens(d.all)}`} className={`min-w-0 flex-1 rounded-t-sm ${d.date === u.to ? 'bg-chart-1' : 'bg-chart-1/45'}`} style={{ height: `${max ? Math.max(3, (d.all / max) * 100) : 3}%` }} />)}
                </div>
              )}
              {u.top.length > 0 && (
                <div className="grid gap-1.5 text-sm">
                  <div className="text-xs text-muted-foreground">用得最多的文件夹</div>
                  {u.top.map((t) => <div key={t.cwd} className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate" title={t.cwd}>{t.name}</span><span className="num text-xs text-muted-foreground">{tokens(t.all)}</span></div>)}
                </div>
              )}
              {!u.total.all && <p className="text-sm text-muted-foreground">这段时间这台电脑上没有 Codex 的用量记录。</p>}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground lg:col-span-2">{u.note}工作台自己按钮调的 Codex 不留记录，不在里面。</p>
          </div>
        )}
      </Panel>
    </div>
  )
}
