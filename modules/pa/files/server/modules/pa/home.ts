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
import { kbCheck, needsUpgrade } from './check.ts'
import { places } from './places.ts'
import { usageStat } from './usage.ts'

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
  const pending = [...inboxFiles().map((f) => ({ kind: '收件箱', title: f.name, sub: `${places()['收件箱']} · 等你看`, to: `/kb?path=${encodeURIComponent(f.path)}` })), ...pendingItems()]
  return {
    'pa-done': { count: done.length, items: done.slice(0, 4).map(item) },
    'pa-waiting': { count: waiting.length, items: waiting.slice(0, 4).map(item) },
    'pa-confirm': { count: pending.length, items: pending.slice(0, 4) },
  }
}

/** 和上周同期比的一句 */
const compare = (n: number, last: number, unit: string) => (n > last ? `比上周同期多 ${n - last} ${unit}` : n < last ? `上周同期 ${last} ${unit}` : last ? '和上周同期一样多' : '上周同期也没有')

/** 驾驶舱顶上那一排数：本周做完、本周产出、连续在用，各带近 14 天的走势；再加 AI 用量（能切时间段） */
export function homeStats() {
  const p = buildPulse(listSessions({ days: 28 }), recentOutputs(28), now(), 14)
  const out = p.week.images + p.week.files
  return [
    { label: '本周做完', value: p.week.done, unit: '件', hint: compare(p.week.done, p.week.last.done, '件'), to: '/progress', spark: p.days.map((d) => d.done), ...(p.week.done ? { tone: 'ok' as const } : {}) },
    { label: '本周产出', value: out, unit: '个', hint: out ? `${p.week.images} 张图 · ${p.week.files} 个文件` : compare(out, p.week.last.outputs, '个'), to: '/outputs', spark: p.days.map((d) => d.images + d.files) },
    { label: '连续在用', value: p.streak, unit: '天', hint: p.streak >= 3 ? '保持住' : p.streak ? '今天也来一件' : '今天开个头', to: '/progress', spark: p.days.map((d) => d.talks) },
    // AI 用量（2026-11-26 A梦 要）：今日 / 近 7 日 / 近 30 日在格子里切换
    usageStat(),
  ]
}

/** 知识库里有这几类，就接管基础版的同名入口（2026-11-24 A梦 定）：项目、客户只有一份，就是知识库里的，和对话里改的是同一份。
 *  老页面的地址和数据库里的数据都留着，只是菜单里不显示、不再给 Codex 列 */
const TAKES_OVER: Record<string, string> = { 项目: 'projects', 客户: 'clients' }

export const paHooks: ModuleHooks = {
  stats: () => homeStats(),
  home: { 'pa-done': () => homeCards()['pa-done'], 'pa-waiting': () => homeCards()['pa-waiting'], 'pa-confirm': () => homeCards()['pa-confirm'] },
  nav: () => focusClasses().classes.map((c) => ({ key: `focus-${c.name}`, to: `/focus/${encodeURIComponent(c.name)}`, label: c.name, icon: c.icon, section: '我关注的', ...(TAKES_OVER[c.name] ? { replaces: TAKES_OVER[c.name] } : {}) })),
  // “我的助理”导航上不放数字（2026-11-26 A梦：“大概率的操作，他不是在这里操作的”）；页面里的页签、驾驶舱的卡照旧有数
  note: () => {
    // 知识库撑不起我关注的、助理、报告里的某一页：先在驾驶舱说清（约定 v0.6 第 9.6 节），点了去看一屏的检测结果
    const c = kbCheck()
    if (needsUpgrade(c)) {
      const ok = c.pages.filter((p) => p.status === '能用').map((p) => p.label)
      const need = c.pages.filter((p) => p.status === '要升级检查')
      return { title: c.building ? '你的知识库还在建' : '你的知识库还差几步', lines: [...(c.building ? [`建库还没做完（${c.building}）：资料还在整理，整理完客户、项目这些才齐`] : []), `现在就能用：${ok.join('、')}`, ...need.map((p) => `${p.label}：${p.need}`)].slice(0, 5), foot: `想都用起来，对 AI 说${c.says.map((x) => `“${x.say}”`).join('，再说')}`, to: '/kb-check' }
    }
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
