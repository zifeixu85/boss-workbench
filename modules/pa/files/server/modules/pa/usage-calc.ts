// AI 用量的纯计算（2026-11-26 A梦 要）：对话记录里的 token 数按本地日期分天、汇总成今日 / 近 7 日 / 近 30 日。
// 三项分开：新算的输入（fresh）、缓存命中的输入（cached）、输出（output，含推理）。缓存便宜得多、又常占九成以上，所以要拆开看。
// Codex 是总数；Claude Code 单独一行，不并进去（两家计法不一样，加在一起反而误导）。

export type Tokens = { fresh: number; cached: number; output: number }
export type UsageByDay = Record<string, Tokens>
export type CodexLimits = { used_percent: number; window_minutes: number | null; resets_at: number | null; at: string }
export type UsageRow = Tokens & { tool: string; day: string; cwd: string }
export type UsageRange = 'today' | '7d' | '30d'
export const USAGE_RANGES: { key: UsageRange; label: string; days: number }[] = [{ key: 'today', label: '今日', days: 1 }, { key: '7d', label: '近 7 日', days: 7 }, { key: '30d', label: '近 30 日', days: 30 }]

const pad = (n: number) => String(n).padStart(2, '0')
/** 本地日期（老板电脑上的那一天） */
export const localDay = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d.toISOString()) }

/** 把一笔加到那一天上（返回新的一份，不改原来的） */
export function addUsage(by: UsageByDay, iso: string, t: Tokens): UsageByDay {
  const day = localDay(iso)
  if (!day || (!t.fresh && !t.cached && !t.output)) return by
  const o = by[day] ?? { fresh: 0, cached: 0, output: 0 }
  return { ...by, [day]: { fresh: o.fresh + t.fresh, cached: o.cached + t.cached, output: o.output + t.output } }
}

const all = (t: Tokens) => t.fresh + t.cached + t.output
const sum = (rows: Tokens[]): Tokens & { all: number } => {
  const t = rows.reduce((a, r) => ({ fresh: a.fresh + r.fresh, cached: a.cached + r.cached, output: a.output + r.output }), { fresh: 0, cached: 0, output: 0 })
  return { ...t, all: all(t) }
}
const folder = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''

export type UsageSummary = {
  range: UsageRange; label: string; from: string; to: string
  total: Tokens & { all: number }
  /** 缓存占输入的百分比（整数）；没用量时为 null */
  cachedShare: number | null
  days: { date: string; all: number }[]
  top: { name: string; cwd: string; all: number }[]
  /** Claude Code 的（电脑上有记录才有）：单独显示，不算进 total */
  claude: (Tokens & { all: number }) | null
}

/** rows：数据库里按对话、按天存的用量；today：本地今天 */
export function summarizeUsage(rows: UsageRow[], today: string, range: UsageRange): UsageSummary {
  const r = USAGE_RANGES.find((x) => x.key === range) ?? USAGE_RANGES[1]
  const from = addDays(today, 1 - r.days)
  const inRange = rows.filter((x) => x.day >= from && x.day <= today)
  const codex = inRange.filter((x) => x.tool === 'codex')
  const claude = inRange.filter((x) => x.tool === 'claude')
  const total = sum(codex)
  const input = total.fresh + total.cached
  const byCwd = new Map<string, number>()
  for (const x of codex) byCwd.set(x.cwd, (byCwd.get(x.cwd) ?? 0) + all(x))
  return {
    range: r.key, label: r.label, from, to: today, total,
    cachedShare: input ? Math.round((total.cached / input) * 100) : null,
    days: Array.from({ length: r.days }, (_, i) => { const date = addDays(from, i); return { date, all: codex.filter((x) => x.day === date).reduce((n, x) => n + all(x), 0) } }),
    top: [...byCwd].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cwd, n]) => ({ name: folder(cwd) || '（没有文件夹）', cwd, all: n })),
    claude: claude.length ? sum(claude) : null,
  }
}

/** 写成人话：一万以下照写；万、亿保留一位小数 */
export function tokenText(n: number): { value: string; unit: string } {
  // 先按“万”保留一位，进到 10000.0 万就改用“亿”（不出 10000.0万 这种写法）
  if (n >= 1e4 && Math.round(n / 1e3) / 10 < 1e4) return { value: (n / 1e4).toFixed(1), unit: '万' }
  if (n >= 1e4) return { value: (n / 1e8).toFixed(1), unit: '亿' }
  return { value: String(Math.round(n)), unit: '' }
}
