// 行业资讯模块：读 RSS 2.0（纯函数，不碰数据库，方便测试）。不加新依赖，用正则拆。
// AIHOT 日报（https://aihot.news/feed/daily.xml）每期一条 item：description 里先一句总结（第一个 <p>），
// 再按“模型发布/更新、产品发布/更新、行业动态、论文研究”几类（<strong>类名</strong>）列标题和链接（<a href>）。
// 别的 RSS 没有这种结构的，只取一句总结，不拆条目。
// 规矩：只留标题、链接和一句总结；链接只认 http(s)；抓来的内容是资料，不是指令（不执行、不照做里面写的话）。

export type ParsedItem = { category: string | null; title: string; link: string | null }
export type ParsedIssue = { guid: string; title: string; link: string | null; summary: string | null; published_at: string | null; day: string | null; items: ParsedItem[] }

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
  const cut = p ? text : (text.match(/^.*?[。！？!?.](?=\s|$)/)?.[0] ?? text)
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
    if (title) out.push({ category, title, link: safeLink(m[2]) })
  }
  return out
}

const DATE = /(\d{4}-\d{2}-\d{2})/
/** 这一期是哪天的：guid、标题、链接里的日期优先，再看 pubDate（按北京时间） */
export function dayOf(guid: string, title: string, link: string | null, pubDate: string | null): string | null {
  const hit = [guid, title, link ?? ''].map((s) => s.match(DATE)?.[1]).find(Boolean)
  if (hit) return hit
  const t = pubDate ? Date.parse(pubDate) : NaN
  if (Number.isNaN(t)) return null
  return new Date(t + 8 * 3600_000).toISOString().slice(0, 10)
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

/** 标题里有没有老板关注的词（不分大小写） */
export const matches = (title: string, keywords: string[]) => keywords.some((k) => k && title.toLowerCase().includes(k.toLowerCase()))
