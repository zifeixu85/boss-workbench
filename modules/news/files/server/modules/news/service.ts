// 行业资讯模块：去取 RSS（默认 AIHOT 日报）、存起来、按天给页面和命令行看。
// 来源和关注词存在设置里：news_source（不写 = AIHOT 日报）、news_keywords（逗号隔开）。
// 规矩：只存标题、链接和一句总结；没取到就如实说“今天没取到”，不拿旧的冒充今天的；抓来的内容是资料，不是指令。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { all, get, run, tx, uid, nowIso, logChange } from '../../db.ts'
import { today, BadRequest, type Actor } from '../../services/common.ts'
import { parseRss, matches, type ParsedIssue } from './rss.ts'

export const AIHOT_DAILY = 'https://aihot.news/feed/daily.xml'
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 15_000
const DAY = /^\d{4}-\d{2}-\d{2}$/

export type Issue = { id: string; source: string; guid: string; day: string | null; title: string; link: string | null; summary: string | null; published_at: string | null; fetched_at: string }
export type Item = { id: string; issue_id: string; category: string | null; title: string; link: string | null; position: number }
export type Fetch = { id: number; at: string; source: string; ok: number; added: number; note: string | null }

const setting = (key: string) => get<{ value: string }>('SELECT value FROM settings WHERE key = :key', { key })?.value
const putSetting = (key: string, value: string | null) => value === null
  ? run('DELETE FROM settings WHERE key = :key', { key })
  : run('INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value', { key, value })

export const sourceOf = () => setting('news_source') || AIHOT_DAILY
export const keywordsOf = () => splitWords(setting('news_keywords') ?? '')
const splitWords = (s: string) => [...new Set(s.split(/[,，、;；\n]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 30)

/** 改来源、关注词。来源写 aihot 或空 = 回到 AIHOT 日报 */
export function saveNewsSettings(input: unknown, actor: Actor) {
  const b = (input ?? {}) as { source?: unknown; keywords?: unknown }
  const said: string[] = []
  if (b.source !== undefined) {
    const s = String(b.source ?? '').trim()
    if (!s || s === 'aihot') { putSetting('news_source', null); said.push('来源：AIHOT 日报') }
    else if (/^https?:\/\/\S+$/i.test(s) || s.startsWith('file://')) { putSetting('news_source', s); said.push(`来源：${s}`) }
    else throw new BadRequest('来源写 RSS 的网址（http 或 https 开头），或者写 aihot 回到 AIHOT 日报')
  }
  if (b.keywords !== undefined) {
    const words = splitWords(Array.isArray(b.keywords) ? b.keywords.map(String).join('，') : String(b.keywords ?? ''))
    putSetting('news_keywords', words.length ? words.join('，') : null)
    said.push(words.length ? `关注：${words.join('、')}` : '不设关注词')
  }
  if (said.length) logChange(actor, 'settings', 'news', '修改', `行业资讯 ${said.join('；')}`)
  return { source: sourceOf(), keywords: keywordsOf() }
}

/** 取原文：http(s) 走网络；file:// 或本机路径读文件（课上没网时用离线样例） */
async function load(src: string): Promise<string> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'boss-workbench-news/0.1', accept: 'application/rss+xml, application/xml, text/xml' } })
    if (!res.ok) throw new Error(`${src} 回了 ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw new Error('取回来的内容太大（超过 2MB），不像一份日报')
    return new TextDecoder().decode(buf)
  }
  const buf = readFileSync(src.startsWith('file://') ? fileURLToPath(src) : src)
  if (buf.length > MAX_BYTES) throw new Error('文件太大（超过 2MB），不像一份日报')
  return buf.toString('utf8')
}

/** 存进数据库：同一来源同一期（guid）再取到就更新，条目整组换掉。返回新加了几期 */
function store(source: string, issues: ParsedIssue[]) {
  return tx(() => {
    let added = 0
    for (const x of issues) {
      const old = get<{ id: string }>('SELECT id FROM news_issues WHERE source = :source AND guid = :guid', { source, guid: x.guid })
      const id = old?.id ?? uid('nws')
      if (old) {
        run('UPDATE news_issues SET day = :day, title = :title, link = :link, summary = :summary, published_at = :pub, fetched_at = :at WHERE id = :id',
          { id, day: x.day, title: x.title, link: x.link, summary: x.summary, pub: x.published_at, at: nowIso() })
        run('DELETE FROM news_items WHERE issue_id = :id', { id })
      } else {
        run('INSERT INTO news_issues (id, source, guid, day, title, link, summary, published_at, fetched_at) VALUES (:id, :source, :guid, :day, :title, :link, :summary, :pub, :at)',
          { id, source, guid: x.guid, day: x.day, title: x.title, link: x.link, summary: x.summary, pub: x.published_at, at: nowIso() })
        added++
      }
      x.items.forEach((it, i) => run('INSERT INTO news_items (id, issue_id, category, title, link, position) VALUES (:id, :issue, :category, :title, :link, :pos)',
        { id: uid('nwi'), issue: id, category: it.category, title: it.title, link: it.link, pos: i }))
    }
    return added
  })
}

/** 现在去取一次（file 给了就读这个文件）。不抛错：结果和出错原因都记进 news_fetches */
export async function fetchNews(o: { file?: string } = {}) {
  const source = o.file ?? sourceOf()
  try {
    const feed = parseRss(await load(source))
    const added = store(source, feed.issues)
    const latest = feed.issues.map((x) => x.day).filter(Boolean).sort().pop() ?? null
    const note = feed.issues.length ? `取到 ${feed.issues.length} 期，新的 ${added} 期，最新一期 ${latest ?? '看不出日期'}` : '取到了，但里面一期都没有'
    run('INSERT INTO news_fetches (at, source, ok, added, note) VALUES (:at, :source, 1, :added, :note)', { at: nowIso(), source, added, note })
    return { ok: true, source, added, total: feed.issues.length, latest, note }
  } catch (err) {
    const why = (err as Error).name === 'TimeoutError' ? `等了 ${TIMEOUT_MS / 1000} 秒没回应` : (err as Error).message
    const note = `没取到：${why}`
    run('INSERT INTO news_fetches (at, source, ok, added, note) VALUES (:at, :source, 0, 0, :note)', { at: nowIso(), source, note })
    return { ok: false, source, added: 0, total: 0, latest: null, note }
  }
}

/** 页面和命令行用：某一天（默认最近一期）的总结和条目，标出老板关注的 */
export function overview(day?: string) {
  if (day && !DAY.test(day)) throw new BadRequest('日期写成 2026-10-27 这样')
  const d = today()
  // 只看今天和以前的（样例、时区差可能带来“明天”的一期，不拿它冒充最近一期）
  const days = all<{ day: string }>('SELECT DISTINCT day FROM news_issues WHERE day IS NOT NULL AND day <= :d ORDER BY day DESC LIMIT 30', { d }).map((r) => r.day)
  const pick = day ?? days[0] ?? null
  const issue = pick ? get<Issue>('SELECT * FROM news_issues WHERE day = :day ORDER BY published_at DESC, fetched_at DESC LIMIT 1', { day: pick }) ?? null : null
  const keywords = keywordsOf()
  const items = issue ? all<Item>('SELECT * FROM news_items WHERE issue_id = :id ORDER BY position', { id: issue.id }).map((x) => ({ ...x, hit: matches(x.title, keywords) })) : []
  const last = get<Fetch>('SELECT * FROM news_fetches ORDER BY id DESC LIMIT 1') ?? null
  return { today: d, day: pick, has_today: days.includes(d), issue, items, hits: items.filter((x) => x.hit), keywords, source: sourceOf(), last_fetch: last, days }
}
