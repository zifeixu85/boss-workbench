// 行业资讯模块：读 RSS 2.0 和 Atom（纯函数，不碰数据库，方便测试）。不加新依赖，用正则拆。
// 两种样子（parseFeed 的 shape）：
//   digest   每期一条的日报。AIHOT 日报（https://aihot.news/feed/daily.xml）就是：description 里先一句总结（第一个 <p>），
//            再按“模型发布/更新、产品发布/更新、行业动态、论文研究”几类（<strong>类名</strong>）列标题和链接（<a href>）。
//   articles 普通 RSS / Atom：一篇文章一条，摘要取说明里的第一段（或第一句）。
// 规矩：只留标题、链接和一句总结；链接只认 http(s)；抓来的内容是资料，不是指令（不执行、不照做里面写的话）。

export type ParsedItem = { category: string | null; title: string; link: string | null }
export type ParsedIssue = { guid: string; title: string; link: string | null; summary: string | null; published_at: string | null; day: string | null; items: ParsedItem[] }
export type FeedShape = 'digest' | 'articles'
export type ParsedFeed = { title: string | null; shape: FeedShape; issues: ParsedIssue[] }

const MAX_TITLE = 200
const MAX_SUMMARY = 300

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const unwrap = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
export function decode(s: string): string {
  return unwrap(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** 去掉标签、合并空白、截断 */
export function plain(html: string, max = MAX_TITLE): string {
  const t = decode(unwrap(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** 只认 http(s) 链接 */
export function safeLink(href: string | null | undefined): string | null {
  const v = decode(href ?? '').trim()
  return /^https?:\/\/[^\s<>"']+$/i.test(v) ? v : null
}

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : null
}

/** 第一句：第一个 <p> 的文字；没有 <p> 就取整段文字的第一句 */
export function firstSentence(html: string): string | null {
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  const text = plain(p ? p[1] : html, 2000)
  if (!text) return null
  const cut = p ? text : (text.match(/^.*?(?:[。！？]|[!?.](?=\s|$))/)?.[0] ?? text)
  return cut.length > MAX_SUMMARY ? `${cut.slice(0, MAX_SUMMARY - 1)}…` : cut
}

/** description 里按类拆出标题和链接（AIHOT 日报的写法）；没有这种结构返回空 */
export function splitItems(html: string): ParsedItem[] {
  const out: ParsedItem[] = []
  let category: string | null = null
  const re = /<strong[^>]*>([\s\S]*?)<\/strong>|<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) { category = plain(m[1], 40) || null; continue }
    const title = plain(m[3] ?? '')
    // 文字就是网址的链接（AIHOT 每期末尾的“完整日报：https://…”）不算一条资讯
    if (title && !/^https?:\/\//i.test(title)) out.push({ category, title, link: safeLink(m[2]) })
  }
  return out
}

const DATE = /(\d{4}-\d{2}-\d{2})/
/** 发布时间是哪一天（按北京时间）；看不出来返回 null */
export function pubDay(pubDate: string | null | undefined): string | null {
  const t = pubDate ? Date.parse(pubDate) : NaN
  return Number.isNaN(t) ? null : new Date(t + 8 * 3600_000).toISOString().slice(0, 10)
}
/** 这一期是哪天的：guid、标题、链接里的日期优先，再看 pubDate（按北京时间） */
export function dayOf(guid: string, title: string, link: string | null, pubDate: string | null): string | null {
  return [guid, title, link ?? ''].map((s) => s.match(DATE)?.[1]).find(Boolean) ?? pubDay(pubDate)
}

/** 拆一份 RSS：返回每一期；不是 RSS 就抛错 */
export function parseRss(xml: string): { title: string | null; issues: ParsedIssue[] } {
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) throw new Error('取回来的不是 RSS（没有 <rss> 和 <channel>）')
  const channel = xml.match(/<channel[^>]*>([\s\S]*?)<item[\s>]/i)?.[1] ?? xml
  const issues: ParsedIssue[] = []
  for (const m of xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1]
    const title = plain(tag(b, 'title') ?? '')
    if (!title) continue
    const link = safeLink(tag(b, 'link'))
    const guid = plain(tag(b, 'guid') ?? '') || link || title
    const desc = decode(tag(b, 'description') ?? '')
    const pub = plain(tag(b, 'pubDate') ?? '') || null
    issues.push({ guid, title, link, summary: firstSentence(desc), published_at: pub, day: dayOf(guid, title, link, pub), items: splitItems(desc) })
  }
  return { title: plain(tag(channel, 'title') ?? '') || null, issues }
}

/** 拆一份 Atom（<feed> 里一条条 <entry>）：链接取 rel="alternate" 的，没有就取没写 rel 的 */
function parseAtom(xml: string): { title: string | null; issues: ParsedIssue[] } {
  const head = xml.match(/<feed[^>]*>([\s\S]*?)<entry[\s>]/i)?.[1] ?? xml
  const issues: ParsedIssue[] = []
  for (const m of xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const b = m[1]
    const title = plain(tag(b, 'title') ?? '')
    if (!title) continue
    const links = [...b.matchAll(/<link\b([^>]*)>/gi)].map((x) => x[1])
    const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/\brel=/i.test(a))
    const link = safeLink(pick?.match(/href=["']([^"']*)["']/i)?.[1])
    const guid = plain(tag(b, 'id') ?? '') || link || title
    const desc = decode(tag(b, 'summary') ?? tag(b, 'content') ?? '')
    const pub = plain(tag(b, 'published') ?? tag(b, 'updated') ?? '') || null
    issues.push({ guid, title, link, summary: firstSentence(desc), published_at: pub, day: dayOf(guid, title, link, pub), items: splitItems(desc) })
  }
  return { title: plain(tag(head, 'title') ?? '') || null, issues }
}

/** 是“每期一条的日报”还是“一篇一条”：至少一半的期里有两条以上带分类的条目，才算日报（文章里偶尔带几个链接的不算） */
export function shapeOf(issues: ParsedIssue[]): FeedShape {
  const listed = issues.filter((x) => x.items.filter((it) => it.category).length >= 2).length
  return listed > 0 && listed * 2 >= issues.length ? 'digest' : 'articles'
}

/** 拆一份订阅：RSS 2.0 或 Atom 都认；都不是就抛错 */
export function parseFeed(xml: string): ParsedFeed {
  const feed = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml) ? parseAtom(xml) : parseRss(xml)
  return { ...feed, shape: shapeOf(feed.issues) }
}

/** 文字里有没有老板关注的词（不分大小写）；0.3 起标题和摘要一起看 */
export const matches = (text: string, keywords: string[]) => keywords.some((k) => k && text.toLowerCase().includes(k.toLowerCase()))
