// 数据：已发笔记的表现（自然、投流分开）、内容支柱谁收藏高、按周走势、单篇发布后第 N 天、数据提醒。归属：小红书内容模块。
// 口径：以自然流量为准；没有的数据是 null（页面写“—”），不当 0；数据截至 xhs_note_stats.stats_date（导入失败时停在前一天）。
// 中位数：一篇一篇算再取中间（偶数篇取中间两篇的平均），两篇爆款会把平均数拉高，比较时都用中位数（和知识库作品索引一致）。
import { all, get } from '../../db.ts'
import { today, addDays, isoWeek, daysBetween } from '../../services/common.ts'
import { normalizeDraft } from './draft.ts'
import { identity } from '../../services/identity.ts'

type Stat = { impressions: number; reads: number; likes: number; saves: number; comments: number; new_followers: number; spend: number }
type NoteJoined = {
  id: string; title: string; kind: string; published_at: string; pillar_id: string | null; pillar_name: string | null; cover_text: string | null; summary: string | null
  piece_id: string | null; vdata: string | null; stats_date: string | null
  n_imp: number | null; n_reads: number | null; n_likes: number | null; n_saves: number | null; n_cmt: number | null; n_fol: number | null
  p_imp: number | null; p_reads: number | null; p_likes: number | null; p_saves: number | null; p_cmt: number | null; p_fol: number | null; p_spend: number | null
}

const NOTES_SQL = `SELECT n.id, n.title, n.kind, n.published_at, n.pillar_id, pl.name AS pillar_name, n.cover_text, n.summary,
  pc.id AS piece_id, (SELECT data FROM xhs_versions v WHERE v.piece_id = pc.id ORDER BY version DESC LIMIT 1) AS vdata,
  COALESCE(s.stats_date, b.stats_date) AS stats_date,
  s.impressions AS n_imp, s.reads AS n_reads, s.likes AS n_likes, s.saves AS n_saves, s.comments AS n_cmt, s.new_followers AS n_fol,
  b.impressions AS p_imp, b.reads AS p_reads, b.likes AS p_likes, b.saves AS p_saves, b.comments AS p_cmt, b.new_followers AS p_fol, b.spend AS p_spend
  FROM xhs_notes n
  LEFT JOIN content_pillars pl ON pl.id = n.pillar_id
  LEFT JOIN xhs_pieces pc ON pc.note_id = n.id
  LEFT JOIN xhs_note_stats s ON s.note_id = n.id AND s.traffic = '自然'
  LEFT JOIN xhs_note_stats b ON b.note_id = n.id AND b.traffic = '投流'`

const stat = (r: NoteJoined, k: 'n' | 'p'): Stat | null => {
  const reads = k === 'n' ? r.n_reads : r.p_reads
  if (reads == null) return null
  return k === 'n'
    ? { impressions: r.n_imp ?? 0, reads, likes: r.n_likes ?? 0, saves: r.n_saves ?? 0, comments: r.n_cmt ?? 0, new_followers: r.n_fol ?? 0, spend: 0 }
    : { impressions: r.p_imp ?? 0, reads, likes: r.p_likes ?? 0, saves: r.p_saves ?? 0, comments: r.p_cmt ?? 0, new_followers: r.p_fol ?? 0, spend: r.p_spend ?? 0 }
}
const add = (a: Stat | null, b: Stat | null): Stat | null => (!a && !b ? null : {
  impressions: (a?.impressions ?? 0) + (b?.impressions ?? 0), reads: (a?.reads ?? 0) + (b?.reads ?? 0), likes: (a?.likes ?? 0) + (b?.likes ?? 0),
  saves: (a?.saves ?? 0) + (b?.saves ?? 0), comments: (a?.comments ?? 0) + (b?.comments ?? 0), new_followers: (a?.new_followers ?? 0) + (b?.new_followers ?? 0), spend: (a?.spend ?? 0) + (b?.spend ?? 0),
})
export const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (a: number, b: number) => (b ? r1((a / b) * 100) : null)
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export function noteRows() {
  return all<NoteJoined>(`${NOTES_SQL} ORDER BY n.published_at DESC`).map((r) => {
    const organic = stat(r, 'n'), paid = stat(r, 'p')
    const d = r.vdata ? normalizeDraft(JSON.parse(r.vdata), undefined, r.pillar_id) : null
    return {
      id: r.id, piece_id: r.piece_id, title: r.title, kind: r.kind, published_at: r.published_at, date: r.published_at.slice(0, 10),
      pillar_id: r.pillar_id, pillar_name: r.pillar_name, cover_text: d?.cover_text ?? r.cover_text, cover: d?.cover ?? null,
      pages: d ? d.pages.map((p) => ({ role: p.role, text: p.text.slice(0, 60), pad: p.pad ?? null })) : [],
      stats_date: r.stats_date, organic, paid, total: add(organic, paid), boosted: (paid?.spend ?? 0) > 0,
    }
  })
}
export type NoteRow = ReturnType<typeof noteRows>[number]

export const statsThrough = () => get<{ d: string | null }>('SELECT MAX(stats_date) AS d FROM xhs_note_stats')?.d ?? null

/** 账号的“一篇的自然收藏率中位数”：今天页、数据页、复盘、给 Codex 的参考都用这一个 */
export function accountMedianRate(rows = noteRows()) {
  const m = median(rows.filter((n) => n.organic && n.organic.reads > 0).map((n) => (n.organic!.saves / n.organic!.reads) * 100))
  return m == null ? null : r1(m)
}

type Sum = Stat & { notes: number; save_rate: number | null; median_rate: number | null }
function summarize(xs: NoteRow[], k: 'organic' | 'paid'): Sum | null {
  const withData = xs.filter((n) => n[k])
  if (!withData.length) return null
  const s = withData.reduce<Stat | null>((acc, n) => add(acc, n[k]), null)!
  const rates = withData.filter((n) => n[k]!.reads > 0).map((n) => (n[k]!.saves / n[k]!.reads) * 100)
  return { notes: withData.length, ...s, save_rate: pct(s.saves, s.reads), median_rate: rates.length ? r1(median(rates)!) : null }
}

/** 数据页：筛选后的笔记、两张汇总卡（带和上一段时间比）、内容支柱 × 收藏中位数（只算自然）、按周的篇均赞藏 */
export function dataPage(q: { days?: number; traffic?: string; format?: string; pillar?: string; sort?: string }) {
  const t = today()
  const days = [7, 30, 60].includes(Number(q.days)) ? Number(q.days) : 60
  const from = addDays(t, -days)
  const through = statsThrough()
  const every = noteRows()
  const filt = (rows: NoteRow[]) => {
    let out = rows
    if (q.format && q.format !== '全部') out = out.filter((n) => n.kind === q.format)
    if (q.pillar && q.pillar !== '全部') out = out.filter((n) => n.pillar_id === q.pillar)
    if (q.traffic === '投流') out = out.filter((n) => n.boosted)
    return out
  }
  let rows = filt(every.filter((n) => n.date >= from && n.date < t))
  const prevRows = filt(every.filter((n) => n.date >= addDays(from, -days) && n.date < from))
  const pick = (n: NoteRow) => (q.traffic === '自然' ? n.organic : q.traffic === '投流' ? n.paid : n.total)
  const sorters: Record<string, (a: NoteRow, b: NoteRow) => number> = {
    reads: (a, b) => (pick(b)?.reads ?? -1) - (pick(a)?.reads ?? -1),
    saves: (a, b) => (pick(b)?.saves ?? -1) - (pick(a)?.saves ?? -1),
    rate: (a, b) => ((b.organic ? b.organic.saves / b.organic.reads : -1) - (a.organic ? a.organic.saves / a.organic.reads : -1)),
    new: (a, b) => b.published_at.localeCompare(a.published_at),
  }
  rows = [...rows].sort(sorters[q.sort ?? 'new'] ?? sorters.new)

  const organic = summarize(rows, 'organic'), paid = summarize(rows, 'paid')
  const summary = {
    organic,
    paid: paid ? { ...paid, cost_per_read: paid.reads ? r2(paid.spend / paid.reads) : null, cost_per_follower: paid.new_followers ? Math.round(paid.spend / paid.new_followers) : null } : null,
    prev: { from: addDays(from, -days), to: addDays(from, -1), organic: summarize(prevRows, 'organic'), paid: summarize(prevRows, 'paid') },
    first_date: every.at(-1)?.date ?? null,
    no_data: rows.filter((n) => !n.organic).length,
  }

  // 内容支柱：一篇收藏数的中位数（只算自然），平均数放旁边；顺带收藏率中位数
  const pillars = allPillars()
  const inRange = every.filter((n) => n.organic && n.date >= from && n.date < t)
  // 爆款：收藏是账号一篇中位数的 10 倍以上（现在是 9/4 盖碗、10/8 工位白茶两篇，和知识库作品索引说的一致）
  const accMedSaves = median(every.filter((n) => n.organic).map((n) => n.organic!.saves)) ?? 0
  const isHit = (n: NoteRow) => !!n.organic && accMedSaves > 0 && n.organic.saves > accMedSaves * 10
  const byPillar = pillars.map((p) => {
    const xs = inRange.filter((n) => n.pillar_id === p.id)
    const saves = xs.map((n) => n.organic!.saves)
    const avg = saves.length ? saves.reduce((a, b) => a + b, 0) / saves.length : null
    const med = median(saves)
    const rate = median(xs.filter((n) => n.organic!.reads > 0).map((n) => (n.organic!.saves / n.organic!.reads) * 100))
    const hits = xs.filter(isHit).map((n) => ({ title: n.title, saves: n.organic!.saves }))
    const recent = every.filter((n) => n.pillar_id === p.id && n.date >= addDays(t, -14) && n.date < t).length
    return { id: p.id, name: p.name, notes: xs.length, avg_saves: avg == null ? null : Math.round(avg), median_saves: med == null ? null : Math.round(med), median_rate: rate == null ? null : r1(rate), hits, recent_14d: recent }
  })

  // 按周（周一到周日）：篇均赞藏（自然，赞 + 藏）、发了几篇；单篇撑起来的那周标出是哪篇
  const weeks = new Map<string, { key: string; start: string; posts: number; engaged: number; withData: number; top: { title: string; engaged: number; saves: number } | null }>()
  for (let d = from; d < t; d = addDays(d, 7)) { const w = isoWeek(d); if (!weeks.has(w.key)) weeks.set(w.key, { key: w.key, start: w.start, posts: 0, engaged: 0, withData: 0, top: null }) }
  for (const n of rows) {
    const w = isoWeek(n.date)
    const cur = weeks.get(w.key) ?? { key: w.key, start: w.start, posts: 0, engaged: 0, withData: 0, top: null }
    cur.posts += 1
    if (n.organic) {
      const e = n.organic.likes + n.organic.saves
      cur.engaged += e; cur.withData += 1
      if (!cur.top || e > cur.top.engaged) cur.top = { title: n.title, engaged: e, saves: n.organic.saves }
    }
    weeks.set(w.key, cur)
  }
  const list = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start))
  const medWeek = median(list.filter((w) => w.withData).map((w) => w.engaged / w.withData)) ?? 0
  const weekly = list.map((w) => {
    const avg = w.withData ? Math.round(w.engaged / w.withData) : null
    const spike = avg != null && medWeek > 0 && avg > medWeek * 2.5 && w.top && w.top.engaged > w.engaged * 0.6 ? { title: w.top.title, saves: w.top.saves } : null
    return {
      week: w.key, start: w.start, label: md(w.start), partial_from: w.start < from ? from : null, posts: w.posts,
      avg_engaged: avg, with_data: w.withData, spike,
    }
  })

  const hitsInRows = rows.filter(isHit).sort((a, b) => b.organic!.saves - a.organic!.saves).map((n) => ({ title: n.title, saves: n.organic!.saves }))
  return { from, to: addDays(t, -1), days, through, rows, summary, pillars: byPillar, account_median_rate: accountMedianRate(every), hits: hitsInRows, weekly }
}
const allPillars = () => all<{ id: string; name: string }>('SELECT id, name FROM content_pillars ORDER BY sort')

/** 单篇：发布后每天的累计（自然 / 投流），第 1、3、7 天。天数按今天算：日子还没到写“还没到”，日子过了没数据写“没导进来” */
export function noteDaily(noteId: string) {
  const rows = all<{ traffic: string; day: number; date: string; impressions: number; reads: number; likes: number; saves: number; comments: number; new_followers: number; spend: number }>(
    'SELECT * FROM xhs_note_daily WHERE note_id = :id ORDER BY day, traffic', { id: noteId })
  const days = [...new Set(rows.map((r) => r.day))]
  const series: DailyPoint[] = days.map((day) => {
    const n = rows.find((r) => r.day === day && r.traffic === '自然')
    const p = rows.find((r) => r.day === day && r.traffic === '投流')
    return { day, date: (n ?? p)!.date, organic_reads: n?.reads ?? null, paid_reads: p?.reads ?? null, organic_saves: n?.saves ?? null, likes: (n?.likes ?? 0) + (p?.likes ?? 0), saves: (n?.saves ?? 0) + (p?.saves ?? 0), reads: (n?.reads ?? 0) + (p?.reads ?? 0), comments: (n?.comments ?? 0) + (p?.comments ?? 0), new_followers: (n?.new_followers ?? 0) + (p?.new_followers ?? 0), spend: p?.spend ?? 0 }
  })
  const note = get<{ published_at: string }>('SELECT published_at FROM xhs_notes WHERE id = :id', { id: noteId })
  const through = statsThrough()
  const t = today()
  const d0 = note?.published_at.slice(0, 10) ?? t
  const milestones = [1, 3, 7].map((d) => {
    const s = series.find((x) => x.day === d)
    const date = addDays(d0, d - 1)
    return { day: d, date, state: s ? 'ready' as const : date >= t ? 'waiting' as const : 'missing' as const, row: s ?? null }
  })
  return { series, milestones, through, age: daysBetween(d0, t) + 1, takeaway: takeaway(series) }
}

type DailyPoint = { day: number; date: string; organic_reads: number | null; paid_reads: number | null; organic_saves: number | null; likes: number; saves: number; reads: number; comments: number; new_followers: number; spend: number }

/** 曲线下面那句结论：投流哪天停、自然从哪天反超；没投流的说几天涨到几成 */
function takeaway(series: DailyPoint[]): string | null {
  if (series.length < 2) return null
  const last = series.at(-1)!
  const paidLast = series.filter((s) => s.paid_reads != null).at(-1)
  if (paidLast && last.paid_reads) {
    const stop = series.find((s) => s.paid_reads != null && s.paid_reads >= last.paid_reads! * 0.97)
    const over = series.find((s) => s.organic_reads != null && s.paid_reads != null && s.organic_reads > s.paid_reads)
    const share = Math.round((last.paid_reads / (last.reads || 1)) * 100)
    return `投流带来 ${last.paid_reads.toLocaleString('zh-CN')} 个阅读（占 ${share}%），第 ${stop?.day ?? '—'} 天起基本不涨了；${over ? (over.day === 1 ? '自然阅读从第 1 天就比投流多' : `自然阅读第 ${over.day} 天反超`) : '自然阅读还没追上投流'}`
  }
  const total = last.organic_reads ?? last.reads
  const d3 = series.find((s) => s.day === 3)
  if (!total || !d3) return `发出 ${last.day} 天，自然阅读 ${total?.toLocaleString('zh-CN') ?? '—'}，还在涨`
  return `第 3 天就到了现在的 ${Math.round(((d3.organic_reads ?? d3.reads) / total) * 100)}%，之后慢慢涨；没投流`
}

/** 发现页里放在旁边的卡：自己最近的笔记 + 对标收藏（同行的笔记不套自家的封面和水印） */
export function feed() {
  const account = identity().xhs // 自家账号名：设置里的小红书账号名（没设就用店名）
  const own = noteRows().slice(0, 14).map((n) => ({ id: n.id, piece_id: n.piece_id, title: n.title, cover_text: n.cover_text, cover: n.cover, pages: n.pages, likes: n.total ? n.total.likes : null, own: true, account }))
  const bench = all<{ id: string; account: string; title: string; cover_text: string | null; pad: string | null; likes: number | null }>('SELECT id, account, title, cover_text, pad, likes FROM xhs_benchmarks ORDER BY saved_at DESC')
    .map((b) => ({ id: b.id, piece_id: null, title: b.title, cover_text: b.cover_text, cover: null, pages: [], likes: b.likes, own: false, account: b.account }))
  return { own, bench }
}

/** 今天页的“数据提醒”：按规则算的（不是 AI 写的），每条带一个动作 */
export function reminders() {
  const t = today()
  const through = statsThrough()
  const notes = noteRows()
  const out: { id: string; tone: 'info' | 'warn'; title: string; detail: string; action: { label: string; kind: 'topics' | 'piece' | 'link'; value: string } }[] = []
  const recent = notes.filter((n) => n.organic && n.date >= addDays(t, -14))
  const best = [...recent].sort((a, b) => b.organic!.reads - a.organic!.reads)[0]
  const medRate = accountMedianRate(notes)
  if (best) {
    const age = through ? daysBetween(best.date, through) + 1 : null
    const paidNote = best.paid ? `另有投流 ${best.paid.reads.toLocaleString('zh-CN')}（${Math.round(best.paid.spend)} 元）` : '没投流'
    out.push({ id: 'pillar', tone: 'info', title: `「${best.pillar_name}」最近两周自然阅读最高`, detail: `「${best.title}」发出${age ? ` ${age} 天` : ''}，自然阅读 ${best.organic!.reads.toLocaleString('zh-CN')}、收藏 ${best.organic!.saves}，${paidNote}。`, action: { label: '围绕它出选题', kind: 'topics', value: best.pillar_name ?? '' } })
  }
  const paidOne = [...recent].filter((n) => n.paid && n.total).sort((a, b) => (b.paid!.reads / b.total!.reads) - (a.paid!.reads / a.total!.reads))[0]
  if (paidOne && medRate != null) {
    const share = Math.round(paidOne.paid!.reads / paidOne.total!.reads * 100)
    const rate = r1(paidOne.organic!.saves / paidOne.organic!.reads * 100).toFixed(1)
    out.push({ id: 'boost', tone: 'warn', title: `「${paidOne.title}」${share}% 的阅读是投流带来的`, detail: `投了 ${Math.round(paidOne.paid!.spend)} 元；自然收藏率 ${rate}%，账号一篇的中位数 ${medRate.toFixed(1)}%。投流放大的是选题本身，先看自然流量再决定加不加。`, action: { label: '看这篇', kind: 'piece', value: paidOne.piece_id ?? '' } })
  }
  if (through && through < addDays(t, -1)) {
    const missing = notes.filter((n) => !n.organic && n.date < t).length
    out.push({ id: 'fresh', tone: 'warn', title: `笔记数据停在 ${md(through)}`, detail: `今早“小红书笔记数据”没导进来（平台改了导出表的列名），${missing} 篇还没有数据，这几天的数先别下结论。`, action: { label: '去数据源看看', kind: 'link', value: '/sources?source=src_xhs_notes' } })
  }
  return out.slice(0, 3)
}

/** 给 Codex 的“账号数据参考”：工作台算好的几行事实（中位数口径），Codex 不用自己翻数据库 */
export function accountFacts() {
  const t = today()
  const through = statsThrough()
  const page = dataPage({ days: 60 })
  const o = page.summary.organic
  const lines = [`数据截至 ${through ?? '—'}（以自然流量为准；之后发的还没有数据）。近 60 天发了 ${page.rows.length} 篇；一篇的自然收藏率中位数 ${page.account_median_rate ?? '—'}%${o ? `，整体收藏率 ${o.save_rate}%（被两篇爆款拉高，别拿它比）` : ''}。`]
  for (const p of page.pillars) lines.push(`- ${p.name}：${p.notes} 篇有数据，一篇自然收藏的中位数 ${p.median_saves ?? '—'}（平均 ${p.avg_saves ?? '—'}${p.hits.length ? `，被《${p.hits[0].title}》这类爆款拉高` : ''}），收藏率中位数 ${p.median_rate ?? '—'}%，近两周发了 ${p.recent_14d} 篇`)
  const top = page.rows.filter((n) => n.organic).sort((a, b) => b.organic!.saves - a.organic!.saves).slice(0, 4)
  lines.push(`自然收藏最高的 4 篇：${top.map((n) => `《${n.title}》${n.organic!.saves}`).join('；')}`)
  const lastWeek = page.rows.filter((n) => n.date >= addDays(t, -8))
  if (lastWeek.length) lines.push(`最近一周发的：${lastWeek.map((n) => `《${n.title}》${n.organic ? `自然阅读 ${n.organic.reads}` : '暂无数据'}`).join('；')}`)
  return lines.join('\n')
}

/** 给 Codex 的“相似的自家笔记”：同支柱、标题里字面相近、自然收藏高的 3 篇（带原文和数据），写法和参数照自己发过的来 */
export function similarNotes(pillarId: string | null, text: string, n = 3) {
  const grams = (s: string) => { const t = s.replace(/[^一-龥a-zA-Z0-9]/g, ''); const out = new Set<string>(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out }
  const want = grams(text)
  const rows = noteRows().filter((r) => r.organic)
  const scored = rows.map((r) => {
    const g = grams(r.title)
    let overlap = 0
    for (const x of g) if (want.has(x)) overlap++
    return { r, score: overlap * 3 + (r.pillar_id && r.pillar_id === pillarId ? 4 : 0) + Math.log10(r.organic!.saves + 1) }
  }).sort((a, b) => b.score - a.score).slice(0, n)
  return scored.map(({ r }) => {
    const v = get<{ data: string }>('SELECT v.data FROM xhs_versions v JOIN xhs_pieces p ON p.id = v.piece_id WHERE p.note_id = :id ORDER BY v.version DESC LIMIT 1', { id: r.id })
    const body = v ? String((JSON.parse(v.data) as { body?: string }).body ?? '') : ''
    return `《${r.title}》${r.date} 发，${r.pillar_name ?? ''}，自然阅读 ${r.organic!.reads}、收藏 ${r.organic!.saves}${r.boosted ? '（投过流）' : ''}\n${body.slice(0, 420)}`
  }).join('\n---\n')
}
