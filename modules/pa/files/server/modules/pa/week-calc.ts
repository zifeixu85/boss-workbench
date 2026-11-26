// 这一期的数（报告模板里“来源：工作台”的节用，命令 pa-week 也给）：纯计算，传进来对话、产出、用量。
// 按本地日期算。对话按最后活动时间算在哪一期（和报告页顶上的数一致），几点开的、是不是深夜按开始时间算。
// “做完”和报告页顶上一样：AI 把一轮做完了的（做完未读、做完了、在等我），是推断的。

export type WeekSession = { started_at: string; last_at: string; status: string; object: { name: string } | null; folder: string }
export type WeekOutput = { at: string; kind: string }
export type WeekUsage = { tool: string; day: string; fresh: number; cached: number; output: number }
export type Card = { value: number | null; unit: string }
export type PeriodData = {
  from: string; to: string
  cards: Record<'对话数' | '做完' | '在等你' | '打断' | '出图' | '出文件' | 'token' | '连续天数' | '没挂对象占比' | '深夜占比', Card>
  series: {
    按天对话: { label: string; date: string; talks: number; done: number }[]
    按天token: { label: string; date: string; value: number }[]
    按小时: { label: string; value: number }[]
    按对象: { label: string; value: number }[]
  }
  lists: { 重复开对话: { 对象: string; 日期: string; 对话: number }[] }
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return dayOf(d.toISOString()) }
const DONE = new Set(['做完未读', '做完了', '在等我'])
const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null)
const label = (day: string, days: number) => (days <= 7 ? ['日', '一', '二', '三', '四', '五', '六'][new Date(`${day}T12:00:00`).getDay()] : `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`)
const where = (s: WeekSession) => s.object?.name ?? `${s.folder || '没有文件夹'}（文件夹）`

export function periodData(i: { sessions: WeekSession[]; outputs: WeekOutput[]; usage: WeekUsage[]; from: string; to: string; today: string }): PeriodData {
  const inP = (day: string) => day >= i.from && day <= i.to
  const sessions = i.sessions.filter((s) => inP(dayOf(s.last_at)))
  const outputs = i.outputs.filter((o) => o.kind !== '代码' && inP(dayOf(o.at)))
  const usage = i.usage.filter((u) => u.tool === 'codex' && inP(u.day))
  const days: string[] = []
  for (let d = i.from; d <= i.to && days.length < 62; d = addDays(d, 1)) days.push(d)
  const hourOf = (s: WeekSession) => new Date(s.started_at || s.last_at).getHours()
  const late = sessions.filter((s) => { const h = hourOf(s); return h >= 22 || h < 6 }).length

  // 连续天数：到这一期最后一天（还没到就到今天）；今天还没有就从昨天往前数
  const active = new Set(i.sessions.map((s) => dayOf(s.last_at)))
  let end = i.to < i.today ? i.to : i.today
  if (!active.has(end) && end === i.today) end = addDays(end, -1)
  let streak = 0
  for (let d = end; active.has(d); d = addDays(d, -1)) streak++

  const byObj = new Map<string, number>()
  for (const s of sessions) byObj.set(where(s), (byObj.get(where(s)) ?? 0) + 1)
  const byObjDay = new Map<string, number>()
  for (const s of sessions) { const k = `${where(s)}|${dayOf(s.last_at)}`; byObjDay.set(k, (byObjDay.get(k) ?? 0) + 1) }

  return {
    from: i.from, to: i.to,
    cards: {
      对话数: { value: sessions.length, unit: '个' },
      做完: { value: sessions.filter((s) => DONE.has(s.status)).length, unit: '件' },
      在等你: { value: sessions.filter((s) => s.status === '在等我').length, unit: '个' },
      打断: { value: sessions.filter((s) => s.status === '没做完').length, unit: '个' },
      出图: { value: outputs.filter((o) => o.kind === '图片').length, unit: '张' },
      出文件: { value: outputs.filter((o) => o.kind !== '图片').length, unit: '个' },
      token: { value: usage.reduce((n, u) => n + u.fresh + u.cached + u.output, 0), unit: 'token' },
      连续天数: { value: streak, unit: '天' },
      没挂对象占比: { value: share(sessions.filter((s) => !s.object).length, sessions.length), unit: '%' },
      深夜占比: { value: share(late, sessions.length), unit: '%' },
    },
    series: {
      按天对话: days.map((d) => { const ss = sessions.filter((s) => dayOf(s.last_at) === d); return { label: label(d, days.length), date: d, talks: ss.length, done: ss.filter((s) => DONE.has(s.status)).length } }),
      按天token: days.map((d) => ({ label: label(d, days.length), date: d, value: usage.filter((u) => u.day === d).reduce((n, u) => n + u.fresh + u.cached + u.output, 0) })),
      按小时: Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: sessions.filter((s) => hourOf(s) === h).length })),
      按对象: [...byObj].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')).slice(0, 8).map(([label, value]) => ({ label, value })),
    },
    lists: {
      重复开对话: [...byObjDay].filter(([, n]) => n >= 3).map(([k, n]) => { const [对象, 日期] = k.split('|'); return { 对象, 日期, 对话: n } }).sort((a, b) => b.对话 - a.对话),
    },
  }
}
