// 今日页用的三张卡、“总助的话”、菜单和角标。只查数据库、读几个小文件，不在这里扫对话记录（今日概况每次打开都要算，要快）。
import type { ModuleHooks } from '../../module-types.ts'
import { focusClasses, inboxFiles } from './kb.ts'
import { pendingItems } from './focus.ts'
import { latestNote } from './reports.ts'
import { listSessions, type SessionView } from './store.ts'
import { scan, scannedAt } from './scan.ts'

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

export const paHooks: ModuleHooks = {
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
