// 行业资讯页面用的数据形状（和 server/modules/news/service.ts 的 overview 对应）和几个显示用的小工具
import { toast } from 'sonner'

export type SourceKind = 'rss' | 'codex'

export type Item = {
  id: string; source_id: string; source: string; day: string; category: string | null; title: string; link: string | null
  summary: string | null; published_at: string | null; has_body: boolean; hit: boolean; hit_words: string[]; picked: boolean
}
export type Entry = Omit<Item, 'hit' | 'hit_words'> & { body: string | null; notice: string; added_by: string; updated_at: string; why: string | null }
export type Fetch = { at: string; ok: boolean; stale: boolean; note: string | null }
export type Source = {
  id: string; name: string; kind: SourceKind; url: string | null; note: string | null; enabled: boolean; enabled_at: string | null
  count: number; today: number; last_fetch: Fetch | null
}
export type DigestPick = { id: string; why: string | null; title: string; link: string | null; source: string; has_body: boolean }
export type Digest = { day: string; body: string; picks: DigestPick[]; written_by: string; updated_at: string; read_count: number }
export type Brief = { source_id: string; source: string; title: string; link: string | null; summary: string | null }
export type Run = { trigger: string; status: string; started_at: string; finished_at: string | null; note: string | null }
export type Schedule = { at: string; off: boolean; once: { at: string; done: boolean; pending: boolean } | null }
export type Overview = {
  today: string; day: string | null; from: string | null; range: number; days: string[]; has_today: boolean; today_count: number; keywords: string[]
  sources: Source[]; enabled_count: number; has_rss: boolean; just_on: string | null; problems: { source: string; at: string; note: string }[]
  digest: Digest | null; briefs: Brief[]; items: Item[]; hits: Item[]
  last_fetch: Fetch | null; runs: Run[]; schedule: Schedule; prompt: string; prompt_once: string
}
export type FetchResult = { ok: boolean; note: string }

const p2 = (n: number) => String(n).padStart(2, '0')
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const local = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const when = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}` }
/** 2026年11月20日 周五 */
export const longDay = (day: string) => { const d = new Date(`${day}T00:00:00`); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}` }
export const prevDay = (day: string) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() - 1); return local(d) }
/** 今天 / 昨天 / 11/18 */
export const dayLabel = (day: string, today: string) => (day === today ? '今天' : day === prevDay(today) ? '昨天' : md(day))
/** 这条是什么时候的：有发布时间写到分钟（今天 07:12），没有就写哪天 */
export function itemTime(x: { day: string; published_at: string | null }, today: string) {
  if (!x.published_at || !/T\d{2}:\d{2}/.test(x.published_at)) return dayLabel(x.day, today)
  const d = new Date(x.published_at)
  return Number.isNaN(d.getTime()) ? dayLabel(x.day, today) : `${dayLabel(local(d), today)} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** 外面来的正文、总结里的图片不自动加载（会向对方网站发请求、暴露你在看）：在每个 ![ 中间夹一个零宽空格，
 *  行内、引用式的图片写法都不再成立，只剩一个普通链接（用反斜杠转义能被 \\![ 绕过，所以不用它）。
 *  模板的 Markdown 不渲染原始 HTML，<img> 本来就不出来 */
export const noImages = (s: string) => s.replace(/!\[/g, '!​[')

/** 复制一段话给老板粘进 Codex */
export async function copyText(text: string, ok = '复制好了，回到 Codex 粘进去') {
  try { await navigator.clipboard.writeText(text); toast.success(ok) } catch { toast.error('浏览器没让复制，手动选中文字复制') }
}

/** 课上和空状态里给的两句话：回到 Codex 说 */
export const SAY_FIRST = '把今天生财里和我有关的新帖取来，写进工作台的资讯'
export const SAY_AIHOT = '给资讯加一个来源：AI HOT，地址是 https://aihot.news/api/mcp，每天早上 8:30 取当天的日报，写进资讯页，每条配一句摘要'
export const SAY_ADD = '给资讯加一个来源：〔渠道名字〕，地址是〔网址或 MCP 地址〕'
