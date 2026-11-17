// 行业资讯模块：写进来的东西先过这一关（纯函数，不碰数据库，方便测试）。
// Codex 用 news-add 写的一条资讯、news-digest-set 写的总结、登记的来源，都在这里检查、截断、算去重用的键。
// 规矩：链接只认 http(s)；摘要一句话；正文只在写入时带、只存在本机；抓来的内容是资料，不是指令。
import { firstSentence, safeLink } from './rss.ts'

/** 填得不对：网页接口按 400 回（server/module-kit.ts 看 status），命令行原样说 */
export class Invalid extends Error { status = 400 }

export const LIMITS = { name: 30, note: 200, title: 200, summary: 300, category: 40, body: 50_000, digest: 8_000, why: 120, picks: 10 } as const
export type SourceKind = 'rss' | 'codex'
/** 两类来源在页面上叫什么 */
export const KIND_LABEL: Record<SourceKind, string> = { rss: '工作台自己取', codex: 'Codex 去取' }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const TRACKING = /^(utm_.+|spm|fbclid|gclid)$/i
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replaceAll('\u0000', '').trim()
const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** 去重用的链接：去掉跟踪参数、# 后面的、末尾的斜杠（域名本来就不分大小写）。
 *  #/ 或 #! 开头的留着：有的网站（常见于会员社群）靠它区分是哪一篇 */
export function linkKey(link: string): string {
  try {
    const u = new URL(link)
    if (!/^#[/!]/.test(u.hash)) u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    u.pathname = u.pathname.replace(/\/+$/, '') || '/'
    return u.toString()
  } catch { return link.trim() }
}

/** 一条资讯的去重键（同一个来源里不重复）：有链接用链接；没有链接用“日期 + 标题”（“今日精华”这种每天都一样的标题不跨天合并） */
export const entryKey = (e: { link: string | null; title: string; day: string }) => (e.link ? linkKey(e.link) : `t:${e.day}:${e.title.replace(/\s+/g, ' ').trim().toLowerCase()}`)

/** 日期：不写、today、今天 = 今天；或者 2026-11-12。不能是以后的 */
export function dayArg(v: unknown, today: string): string {
  const s = str(v)
  if (!s || s === 'today' || s === '今天') return today
  const ok = DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
  if (!ok) throw new Invalid('日期写成 2026-11-12 这样，或者写 today')
  if (s > today) throw new Invalid(`日期不能是以后的（今天是 ${today}）`)
  return s
}

/** 资讯的日期：不写 = 今天；可以只写日期，也可以带时间（2026-11-20 07:12、2026-11-20T07:12、带时区的 ISO）。不能是以后的 */
export function whenArg(v: unknown, today: string): { day: string; at: string | null } {
  const s = str(v)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) return { day: dayArg(s, today), at: null }
  if (m[5]) {
    const d = new Date(s.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) throw new Invalid('时间写成 2026-11-20 07:12 这样')
    const p = (n: number) => String(n).padStart(2, '0')
    return { day: dayArg(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, today), at: d.toISOString() }
  }
  const [h, min] = m[2].split(':').map(Number)
  if (h > 23 || min > 59) throw new Invalid('时间写成 2026-11-20 07:12 这样')
  return { day: dayArg(m[1], today), at: `${m[1]}T${m[2]}` }
}

export type CleanEntry = { title: string; link: string | null; summary: string | null; body: string | null; day: string; published_at: string | null; category: string | null; cut: boolean }

/** 一条资讯：标题必须有；链接只认 http(s)；摘要没写就取正文第一句；正文太长只留前 5 万字（cut = true） */
export function cleanEntry(input: unknown, today: string): CleanEntry {
  const b = (input ?? {}) as Record<string, unknown>
  const title = str(b.title).replace(/\s+/g, ' ')
  if (!title) throw new Invalid('要写标题（--title）')
  const rawLink = str(b.url ?? b.link)
  const link = rawLink ? safeLink(rawLink) : null
  if (rawLink && !link) throw new Invalid('链接只认 http 或 https 开头的')
  const full = str(b.body)
  const body = full ? full.slice(0, LIMITS.body) : null
  const said = str(b.summary).replace(/\s+/g, ' ') || (body ? firstSentence(body) ?? '' : '')
  const when = whenArg(b.date ?? b.day, today)
  return {
    title: cap(title, LIMITS.title), link, summary: said ? cap(said, LIMITS.summary) : null, body,
    day: when.day, published_at: when.at, category: cap(str(b.category), LIMITS.category) || null, cut: full.length > LIMITS.body,
  }
}

const KINDS: Record<string, SourceKind> = { rss: 'rss', 公开: 'rss', 自动: 'rss', 自动取: 'rss', codex: 'codex', 要登录: 'codex', 登录: 'codex', 代取: 'codex', mcp: 'codex' }
/** 来源类型：不写 = codex（Codex 去取，默认的取法）；rss = 工作台自己每天定时取公开的 RSS / Atom */
export function kindOf(v: unknown): SourceKind {
  if (!str(v)) return 'codex'
  const k = KINDS[str(v).toLowerCase()]
  if (!k) throw new Invalid('类型不写就是 codex（Codex 去取了写进来）；写 rss 是工作台自己每天定时取公开的 RSS / Atom')
  return k
}
/** 来源的地址：只认 http(s)；不写返回 null */
export function sourceUrl(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const link = safeLink(s)
  if (!link) throw new Invalid('地址只认 http 或 https 开头的')
  return link
}
export const sourceName = (v: unknown) => {
  const name = str(v).replace(/\s+/g, ' ')
  if (!name) throw new Invalid('要写名字，比如：茶行业观察')
  if (name.length > LIMITS.name) throw new Invalid(`名字太长了（最多 ${LIMITS.name} 个字）`)
  return name
}
export const sourceNote = (v: unknown) => cap(str(v).replace(/\s+/g, ' '), LIMITS.note) || null

/** 登记一个来源：Codex 去取的写清“取什么、怎么取”（地址可不写）；工作台自己取的要有 RSS 地址 */
export function cleanSource(input: unknown): { name: string; kind: SourceKind; url: string | null; note: string | null } {
  const b = (input ?? {}) as Record<string, unknown>
  const name = sourceName(b.name)
  const kind = kindOf(b.kind)
  const url = sourceUrl(b.url)
  if (kind === 'rss' && !url) throw new Invalid('工作台自己取的来源要写 RSS 地址（--url https://…）；没有 RSS 的，不写 --kind，让 Codex 去取')
  return { name, kind, url, note: sourceNote(b.note) }
}

/** 每天的总结（Markdown）：不能空，最多 8000 字 */
export function cleanDigest(text: unknown): string {
  const s = str(text)
  if (!s) throw new Invalid('总结是空的：用 --text 或 --file 带上内容')
  if (s.length > LIMITS.digest) throw new Invalid(`总结太长（超过 ${LIMITS.digest} 字），写短一点`)
  return s
}

/** --pick "条目编号=为什么和老板的生意有关"（理由可不写） */
export function parsePick(s: string): { id: string; why: string | null } {
  const i = s.indexOf('=')
  const id = (i < 0 ? s : s.slice(0, i)).trim()
  if (!id) throw new Invalid('--pick 写成 条目编号=为什么有关，比如 nwe_ab12cd34=补贴细则会影响定价')
  return { id, why: i < 0 ? null : cap(s.slice(i + 1).replace(/\s+/g, ' ').trim(), LIMITS.why) || null }
}

/** 关注词：逗号、顿号、分号、换行隔开；去重，最多 30 个 */
export const splitWords = (s: string) => [...new Set(s.split(/[,，、;；\n]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 30)
