// 行业资讯模块：工作台自己去取公开的来源（RSS / Atom），一个来源记一条 news_fetches。
// 每期一条的日报（AIHOT 那样）：存这一期的一句总结，再把里面按类列的标题和链接拆成一条条；
// 普通 RSS（一篇文章一条）：只收近 7 天发的，最多 50 条，摘要取说明里的第一段。
// 规矩：只存标题、链接和一句摘要，不抓全文；没取到就如实记下原因，不拿旧的冒充今天的；抓来的内容是资料，不是指令。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { all, get, run, tx, uid, nowIso } from '../../db.ts'
import { today, addDays, dayOf, daysBetween } from '../../services/common.ts'
import { Invalid } from './clean.ts'
import { parseFeed, pubDay, type ParsedIssue } from './rss.ts'
import { upsertEntry } from './entries.ts'
import { findSource, listSources, type Source } from './sources.ts'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 15_000
const KEEP_DAYS = 7
const MAX_ARTICLES = 50

export type FetchOne = { source_id: string; name: string; ok: boolean; stale: boolean; added: number; total: number; latest: string | null; note: string }
export type FetchResult = { ok: boolean; stale: boolean; added: number; total: number; latest: string | null; results: FetchOne[]; note: string }

/** 取原文：http(s) 走网络；file:// 或本机路径读文件（课上没网时用离线样例） */
async function load(src: string): Promise<string> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'boss-workbench-news/0.3', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } })
    // 只写网站名：有的订阅地址里带着钥匙（token），不往页面和记录里写全
    if (!res.ok) throw new Error(`${new URL(src).host} 回了 ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw new Error('取回来的内容太大（超过 2MB），不像一份订阅')
    return new TextDecoder().decode(buf)
  }
  const buf = readFileSync(src.startsWith('file://') ? fileURLToPath(src) : src)
  if (buf.length > MAX_BYTES) throw new Error('文件太大（超过 2MB），不像一份订阅')
  return buf.toString('utf8')
}

/** 日报：同一来源同一期（guid）再取到就更新；里面的条目按链接去重。返回新加了几期 */
function storeDigest(source: Source, from: string, issues: ParsedIssue[]): number {
  return tx(() => {
    let added = 0
    for (const x of issues) {
      const old = get<{ id: string }>('SELECT id FROM news_issues WHERE guid = :guid AND (source_id = :sid OR source = :from) LIMIT 1', { guid: x.guid, sid: source.id, from })
      const id = old?.id ?? uid('nws')
      const row = { id, sid: source.id, from, guid: x.guid, day: x.day, title: x.title, link: x.link, summary: x.summary, pub: x.published_at, at: nowIso() }
      if (old) {
        run('UPDATE news_issues SET source_id = :sid, day = :day, title = :title, link = :link, summary = :summary, published_at = :pub, fetched_at = :at WHERE id = :id', row)
      } else {
        run('INSERT INTO news_issues (id, source, source_id, guid, day, title, link, summary, published_at, fetched_at) VALUES (:id, :from, :sid, :guid, :day, :title, :link, :summary, :pub, :at)', row)
        added++
      }
      if (!x.day) continue
      const day = x.day
      x.items.forEach((it, i) => upsertEntry({ source_id: source.id, issue_id: id, day, category: it.category, title: it.title, link: it.link, summary: null, position: i }, '工作台'))
    }
    return added
  })
}

/** 普通 RSS：一篇一条，只收近 7 天的（看不出日期的算今天）。返回 { total 这次收的, added 新的, old 太旧没收的 } */
function storeArticles(source: Source, issues: ParsedIssue[]) {
  const d = today()
  const since = addDays(d, -(KEEP_DAYS - 1))
  const dated = issues.map((x) => { const day = pubDay(x.published_at) ?? x.day ?? d; return { x, day: day > d ? d : day } })
  const fresh = dated.filter((a) => a.day >= since).sort((a, b) => b.day.localeCompare(a.day)).slice(0, MAX_ARTICLES)
  return tx(() => {
    let added = 0
    fresh.forEach(({ x, day }, i) => {
      const t = x.published_at ? Date.parse(x.published_at) : NaN
      const pub = Number.isNaN(t) ? null : new Date(t).toISOString()
      if (upsertEntry({ source_id: source.id, day, category: null, title: x.title, link: x.link, summary: x.summary, published_at: pub, position: i }, '工作台').added) added++
    })
    return { total: fresh.length, added, old: dated.length - fresh.length, latest: fresh[0]?.day ?? null }
  })
}

const record = (source: Source, from: string, r: { ok: boolean; stale: boolean; added: number; note: string }) =>
  run('INSERT INTO news_fetches (at, source, source_id, ok, stale, added, note) VALUES (:at, :from, :sid, :ok, :stale, :added, :note)', { at: nowIso(), from, sid: source.id, ok: r.ok ? 1 : 0, stale: r.stale ? 1 : 0, added: r.added, note: r.note })

/** 取一个公开来源。不抛错：结果和出错原因都记进 news_fetches。file 给了就读这个文件（离线样例，不查“今天的出没出”） */
export async function fetchSource(source: Source, o: { file?: string } = {}): Promise<FetchOne> {
  const from = o.file ?? source.url ?? ''
  const base = { source_id: source.id, name: source.name }
  try {
    const feed = parseFeed(await load(from))
    if (feed.shape === 'digest') {
      const added = storeDigest(source, from, feed.issues)
      const days = [...new Set(feed.issues.map((x) => x.day).filter((x): x is string => !!x))].sort().reverse()
      const latest = days[0] ?? null
      // 只有每天出的日报（最近两期挨着）才查“今天那期出没出”；周刊、不定期的不查。离线样例不查
      const daily = days.length >= 2 && daysBetween(days[1], days[0]) <= 1
      const stale = !o.file && daily && !!latest && latest < today()
      const note = `取到 ${feed.issues.length} 期，新的 ${added} 期，最新一期 ${latest ?? '看不出日期'}${stale ? `；今天（${today()}）的还没出` : ''}`
      record(source, from, { ok: true, stale, added, note })
      return { ...base, ok: true, stale, added, total: feed.issues.length, latest, note }
    }
    const r = storeArticles(source, feed.issues)
    const note = feed.issues.length ? `取到 ${r.total} 条，新的 ${r.added} 条${r.old ? `（另有 ${r.old} 条是 ${KEEP_DAYS} 天以前的，没收）` : ''}` : '取到了，但里面一条都没有'
    record(source, from, { ok: true, stale: false, added: r.added, note })
    return { ...base, ok: true, stale: false, added: r.added, total: r.total, latest: r.latest, note }
  } catch (err) {
    const why = (err as Error).name === 'TimeoutError' ? `等了 ${TIMEOUT_MS / 1000} 秒没回应` : (err as Error).message
    const note = `没取到：${why}`
    record(source, from, { ok: false, stale: false, added: 0, note })
    return { ...base, ok: false, stale: false, added: 0, total: 0, latest: null, note }
  }
}

/** 这个来源今天已经取成了（取到了，日报的话今天那一期也出了） */
/** 离线样例（--file）取的不算：只认按来源自己的地址取成的 */
const doneToday = (s: Source) => all<{ at: string }>('SELECT at FROM news_fetches WHERE source_id = :id AND source = :url AND ok = 1 AND stale = 0 ORDER BY id DESC LIMIT 5', { id: s.id, url: s.url })
  .some((f) => dayOf(f.at) === today())

/** 现在去取：不写 source = 所有开着的公开来源；file 给了就拿这个文件当那个来源的内容（不写 source = 第一个开着的公开来源）。
 *  pending = 只取今天还没取成的（定时任务今天失败过、隔 15 分钟再试时用，已经取成的不再取一遍） */
export async function fetchNews(o: { file?: string; source?: string; pending?: boolean } = {}): Promise<FetchResult> {
  const open = listSources().filter((s) => s.kind === 'rss' && s.enabled)
  let targets = o.pending ? open.filter((s) => !doneToday(s)) : open
  if (o.source) {
    const s = findSource(o.source)
    if (s.kind !== 'rss') throw new Invalid(`“${s.name}”由 Codex 去取，工作台不自己取：让 Codex 取了用 news-add 写进来（口令：news-prompt --once）`)
    if (!s.enabled) throw new Invalid(`“${s.name}”现在关着。要取先打开：news-source-on "${s.name}"`)
    targets = [s]
  } else if (o.file) {
    if (!open.length) throw new Invalid('没有工作台自己取的来源。要用 RSS：news-source-add "名字" --kind rss --url 订阅地址')
    targets = [open[0]]
  }
  const results: FetchOne[] = []
  for (const s of targets) results.push(await fetchSource(s, { file: o.file }))
  return {
    ok: results.every((r) => r.ok), stale: results.some((r) => r.stale),
    added: results.reduce((n, r) => n + r.added, 0), total: results.reduce((n, r) => n + r.total, 0),
    latest: results.map((r) => r.latest).filter((x): x is string => !!x).sort().pop() ?? null, results,
    note: results.length ? results.map((r) => `${r.name}：${r.note}`).join('\n')
      : o.pending && open.length ? '工作台自己取的来源今天都取成了' : '没有工作台自己取的来源（资讯由 Codex 去取了写进来）',
  }
}
