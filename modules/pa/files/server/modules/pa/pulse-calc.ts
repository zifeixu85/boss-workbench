// 进展的数字和图：近几天每天做完几件、出了几张图几个文件；本周对比上周同一段；连续几天在用；本周花在哪。
// 纯计算（传进来对话和产出），按本地日期分天。让老板一眼看到自己这段时间做了多少。

export type PulseSession = { last_at: string; status: string; object: { name: string } | null }
export type PulseOutput = { at: string; kind: string }
export type PulseDay = { date: string; label: string; done: number; talks: number; images: number; files: number }
export type Pulse = {
  days: PulseDay[]
  week: { from: string; done: number; talks: number; images: number; files: number; last: { done: number; outputs: number } }
  streak: number
  top: { name: string; n: number }[]
  total: { done: number; talks: number; images: number; files: number }
}

const DONE = new Set(['做完未读', '做完了'])
const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return dayOf(d.getTime()) }
/** 文件不算代码：老板关心的是文档、表格、网页这些能拿去用的 */
const isFile = (kind: string) => kind !== '图片' && kind !== '代码'

export function buildPulse(sessions: PulseSession[], outputs: PulseOutput[], now: number, days = 14): Pulse {
  const today = dayOf(now)
  const sDay = sessions.map((s) => ({ ...s, day: dayOf(Date.parse(s.last_at)) }))
  const oDay = outputs.map((o) => ({ ...o, day: dayOf(Date.parse(o.at)) }))
  const count = (from: string, to: string) => {
    const ss = sDay.filter((s) => s.day >= from && s.day <= to)
    const os = oDay.filter((o) => o.day >= from && o.day <= to)
    return { done: ss.filter((s) => DONE.has(s.status)).length, talks: ss.length, images: os.filter((o) => o.kind === '图片').length, files: os.filter((o) => isFile(o.kind)).length, list: ss }
  }
  const list: PulseDay[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1)
    const c = count(date, date)
    return { date, label: `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`, done: c.done, talks: c.talks, images: c.images, files: c.files }
  })
  // 本周：周一到今天；上周取同样几天
  const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7
  const monday = addDays(today, -dow)
  const w = count(monday, today)
  const l = count(addDays(monday, -7), addDays(today, -7))
  // 连续几天在用：今天还没动的话，从昨天往前数
  const active = new Set(sDay.map((s) => s.day))
  let d = active.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (active.has(d)) { streak++; d = addDays(d, -1) }
  const by = new Map<string, number>()
  for (const s of w.list) if (s.object) by.set(s.object.name, (by.get(s.object.name) ?? 0) + 1)
  const top = [...by].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh')).slice(0, 5)
  const t = count(list[0].date, today)
  return {
    days: list,
    week: { from: monday, done: w.done, talks: w.talks, images: w.images, files: w.files, last: { done: l.done, outputs: l.images + l.files } },
    streak, top, total: { done: t.done, talks: t.talks, images: t.images, files: t.files },
  }
}
