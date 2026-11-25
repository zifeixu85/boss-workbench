// AI 用量：从 pa_usage 取近 30 天的数，按今日 / 近 7 日 / 近 30 日汇总；驾驶舱顶上那一排里的“AI 用量”和命令 pa-usage 用。
import { all } from '../../db.ts'
import { localDay, summarizeUsage, tokenText, USAGE_RANGES, type UsageRange, type UsageRow } from './usage-calc.ts'
import { codexLimits } from './scan.ts'
import { now } from './store.ts'

const rows = (since: string) => all<UsageRow>('SELECT tool, day, cwd, fresh, cached, output FROM pa_usage WHERE day >= :since', { since })

/** 额度那一句：Codex 自己记的“这个周期用了百分之几、什么时候重置” */
function limitText() {
  const l = codexLimits()
  if (!l) return null
  const reset = l.resets_at ? new Date(l.resets_at * 1000) : null
  const when = reset && reset.getTime() > now() ? `，${reset.getMonth() + 1}/${reset.getDate()} 重置` : ''
  const span = l.window_minutes === 10080 ? '本周' : l.window_minutes && l.window_minutes <= 300 ? '这几个小时' : '这个周期'
  return { ...l, text: `Codex ${span}额度用了 ${Math.round(l.used_percent)}%${when}` }
}

export function usage(range: UsageRange = '7d') {
  const today = localDay(new Date(now()).toISOString())
  const list = rows(summarizeUsage([], today, '30d').from)
  return { ...summarizeUsage(list, today, range), limits: limitText(), note: '这台电脑上 Codex 对话记录里的用量（桌面版、命令行、子任务都算；别的电脑、网页版不算）。新算的输入、缓存命中的输入、输出分开记，缓存便宜得多。' }
}

/** 驾驶舱那一格：三个时间段各一份，网页上切换 */
export function usageStat() {
  const today = localDay(new Date(now()).toISOString())
  const list = rows(summarizeUsage([], today, '30d').from)
  const lim = limitText()
  const ranges = USAGE_RANGES.map((r) => {
    const s = summarizeUsage(list, today, r.key)
    const t = tokenText(s.total.all)
    const spark = (r.key === 'today' ? summarizeUsage(list, today, '7d') : s).days.map((d) => d.all).slice(-14)
    // 格子窄：单位只写万、亿，“token”放进说明的开头
    const hint = s.total.all ? ['token', s.cachedShare !== null ? `缓存占 ${s.cachedShare}%` : '', lim?.text.replace(/^Codex /, '') ?? ''].filter(Boolean).join(' · ') : '这段时间没有用量'
    return { key: r.key, label: r.label, value: s.total.all, display: t.value, unit: t.unit, hint, spark }
  })
  return { label: 'AI 用量', value: ranges[0].value, display: ranges[0].display, unit: ranges[0].unit, hint: ranges[0].hint, spark: ranges[0].spark, to: '/progress?view=usage', ranges }
}
