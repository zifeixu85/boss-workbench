// 今日页用的三张卡、“总助的话”、菜单和角标。只查数据库、读几个小文件，不在这里扫对话记录（今日概况每次打开都要算，要快）。
import type { ModuleHooks } from '../../module-types.ts'
import { focusClasses, inboxFiles } from './kb.ts'
import { pendingItems } from './focus.ts'
import { latestNote } from './reports.ts'
import { listSessions, type SessionView } from './store.ts'
import { scan, scannedAt } from './scan.ts'
import { buildPulse } from './pulse-calc.ts'
import { recentOutputs } from './outputs.ts'
import { now } from './store.ts'

/** 离上次扫超过 5 分钟：后台悄悄扫一遍（不等它，今日页先用现有的数） */
function refreshSoon() {
  const at = scannedAt()
  if (!at || Date.now() - Date.parse(at) > 5 * 60_000) setTimeout(() => { void scan({ budgetMs: 5000 }).catch(() => {}) }, 50).unref()
}

const item = (s: SessionView) => ({ id: s.id, title: s.title, sub: `${s.object?.name ?? s.folder} · ${s.tool_name}`, at: s.last_at, link: s.link })
const recent = () => listSessions({ days: 14 })

export function homeCards() {
  refreshSoon()
  const list = recent()
  const done = list.filter((s) => s.status === '做完未读')
  const waiting = list.filter((s) => s.status === '在等我')
  const pending = [...inboxFiles().map((f) => ({ kind: '收件箱', title: f.name, sub: '00-收件箱 · 等你看', to: `/kb?path=${encodeURIComponent(f.path)}` })), ...pendingItems()]
  return {
    'pa-done': { count: done.length, items: done.slice(0, 4).map(item) },
    'pa-waiting': { count: waiting.length, items: waiting.slice(0, 4).map(item) },
    'pa-confirm': { count: pending.length, items: pending.slice(0, 4) },
  }
}

/** 和上周同期比的一句 */
const compare = (n: number, last: number, unit: string) => (n > last ? `比上周同期多 ${n - last} ${unit}` : n < last ? `上周同期 ${last} ${unit}` : last ? '和上周同期一样多' : '上周同期也没有')

/** 驾驶舱顶上那一排数：本周做完、本周产出、连续在用，各带近 14 天的走势 */
export function homeStats() {
  const p = buildPulse(listSessions({ days: 28 }), recentOutputs(28), now(), 14)
  const out = p.week.images + p.week.files
  return [
    { label: '本周做完', value: p.week.done, unit: '件', hint: compare(p.week.done, p.week.last.done, '件'), to: '/progress', spark: p.days.map((d) => d.done), ...(p.week.done ? { tone: 'ok' as const } : {}) },
    { label: '本周产出', value: out, unit: '个', hint: out ? `${p.week.images} 张图 · ${p.week.files} 个文件` : compare(out, p.week.last.outputs, '个'), to: '/outputs', spark: p.days.map((d) => d.images + d.files) },
    { label: '连续在用', value: p.streak, unit: '天', hint: p.streak >= 3 ? '保持住' : p.streak ? '今天也来一件' : '今天开个头', to: '/progress', spark: p.days.map((d) => d.talks) },
  ]
}

export const paHooks: ModuleHooks = {
  stats: () => homeStats(),
  home: { 'pa-done': () => homeCards()['pa-done'], 'pa-waiting': () => homeCards()['pa-waiting'], 'pa-confirm': () => homeCards()['pa-confirm'] },
  nav: () => focusClasses().classes.map((c) => ({ key: `focus-${c.name}`, to: `/focus/${encodeURIComponent(c.name)}`, label: c.name, icon: c.icon, section: '我关注的' })),
  badges: () => { const list = recent(); return { 'pa-progress': list.filter((s) => s.status === '做完未读' || s.status === '在等我').length } },
  note: () => {
    const d = latestNote()
    if (!d || !d.lines.length) return null
    return { title: `总助的话 · ${d.report.kind} ${d.report.period}`, lines: d.lines, by: `来自 ${d.report.path}${d.report.confirm === '待确认' ? '（待确认）' : ''}`, ...(d.twin ? { foot: `分身的一句：${d.twin}` } : {}), to: `/reports?kind=${encodeURIComponent(d.report.kind)}&period=${d.report.period}` }
  },
  today: () => {
    const list = recent()
    const done = list.filter((s) => s.status === '做完未读')
    const waiting = list.filter((s) => s.status === '在等我')
    if (!done.length && !waiting.length) return null
    return {
      title: 'AI 做到哪了（状态是推断的）',
      lines: [...waiting.map((s) => `在等你回话：${s.title}（${s.tool_name}）`), ...done.map((s) => `做完了还没看：${s.title}（${s.tool_name}）`)].slice(0, 8),
      brief: [done.length ? `AI 做完 ${done.length} 件等你看` : '', waiting.length ? `${waiting.length} 个对话在等你回话` : ''].filter(Boolean).join('，'),
    }
  },
}
