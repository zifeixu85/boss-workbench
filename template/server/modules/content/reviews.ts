// 每周复盘：一周按周二到下周一算（和知识库 01-AI协作/任务手册/每周复盘.md 一样，每周二 07:30 的定时任务写上一周），
// 这里是小红书那一段的细账。生成复盘现场调本机 Codex（<review>）；下周选题建议可以放进灵感池；
// 可沉淀的经验，林总点“存进知识库”才追加到 90-持续生长/待确认的发现.md（照那里的发现卡格式，只追加不改别的）。归属：小红书内容模块。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, uid, nowIso, logChange, ROOT } from '../../db.ts'
import { BadRequest, NotFound, today, addDays, type Actor } from '../../services/common.ts'
import { noteRows, statsThrough, accountFacts, accountMedianRate, type NoteRow } from './stats.ts'
import { runCodex } from './codex.ts'
import { parseReply } from './parse.ts'
import { createPiece } from './pieces.ts'
import { startJob, finishJob } from './topics.ts'

export const FINDINGS = '90-持续生长/待确认的发现.md'

type Learning = { rule: string; evidence: string; scope?: string; prior?: string | null; prior_path?: string | null; status: '待定' | '已存进知识库' | '不要'; saved_at?: string | null; kb_path?: string | null; number?: number | null }
type Idea = { title: string; reason: string; pillar?: string | null; piece_id?: string | null }
type ReviewDb = { id: string; week: string; date_from: string; date_to: string; summary: string | null; worked: string; change: string; ideas: string; learnings: string; inputs: string; written_by: string; origin: string; duration_ms: number | null; previous: string | null; created_at: string; updated_at: string }

const parse = <T>(s: string | null | undefined, f: T): T => { try { return s ? JSON.parse(s) as T : f } catch { return f } }
const r1 = (n: number) => Math.round(n * 10) / 10
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 一周：周二到下周一。key 是那个周二（2026-10-20） */
export function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00`)
  const start = addDays(date, -((d.getDay() + 5) % 7))
  return { key: start, start, end: addDays(start, 6) }
}
const label = (w: { start: string; end: string }) => `${md(w.start)}—${md(w.end)}`
function checkKey(week: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || weekOf(week).start !== week) throw new BadRequest('周写成那一周的周二，例如 2026-10-20')
  return weekOf(week)
}

function shape(r: ReviewDb) {
  return {
    ...r, worked: parse<string[]>(r.worked, []), change: parse<string[]>(r.change, []), ideas: parse<Idea[]>(r.ideas, []), learnings: parse<Learning[]>(r.learnings, []),
    inputs: parse<Record<string, unknown>>(r.inputs, {}), previous: parse<Record<string, unknown> | null>(r.previous, null),
  }
}
const getReview = (week: string) => { const r = get<ReviewDb>('SELECT * FROM xhs_reviews WHERE week = :week', { week }); return r ? shape(r) : null }

/** 一周的指标（按“数据截至”那天的累计；自然、投流分开，也给合计） */
export function weekMetrics(week: string) {
  const w = checkKey(week)
  const rows = noteRows()
  const notes = rows.filter((n) => n.date >= w.start && n.date <= w.end).sort((a, b) => a.date.localeCompare(b.date))
  const withData = notes.filter((n) => n.organic)
  const s = (f: (n: NoteRow) => number) => withData.reduce((a, n) => a + f(n), 0)
  const reads = s((n) => n.organic!.reads), saves = s((n) => n.organic!.saves), likes = s((n) => n.organic!.likes), fol = s((n) => n.total!.new_followers)
  const paidReads = notes.reduce((a, n) => a + (n.paid?.reads ?? 0), 0), paidSaves = notes.reduce((a, n) => a + (n.paid?.saves ?? 0), 0), spend = notes.reduce((a, n) => a + (n.paid?.spend ?? 0), 0)
  return {
    week, from: w.start, to: w.end, label: label(w), through: statsThrough(),
    posts: notes.length, with_data: withData.length, organic_reads: reads, organic_saves: saves, organic_likes: likes, new_followers: fol,
    total_reads: reads + paidReads, total_saves: saves + paidSaves,
    save_rate: reads ? r1((saves / reads) * 100) : null, paid_reads: paidReads, spend: Math.round(spend), median_rate: accountMedianRate(rows),
    notes: notes.map((n) => ({ id: n.id, piece_id: n.piece_id, title: n.title, date: n.date, kind: n.kind, pillar_name: n.pillar_name, boosted: n.boosted, organic: n.organic, paid: n.paid, total: n.total, cover_text: n.cover_text, cover: n.cover, pages: n.pages })),
  }
}

/** 按周列表：本周（还没过完）、没复盘的、复盘过的（几条经验待定） */
export function weeks() {
  const t = today()
  const rows = noteRows()
  const first = rows.at(-1)?.date ?? addDays(t, -60)
  const out: { week: string; from: string; to: string; label: string; posts: number; state: '本周' | '未复盘' | '已复盘'; pending: number; written_by: string | null }[] = []
  for (let d = weekOf(t).start; d >= weekOf(first).start; d = addDays(d, -7)) {
    const w = weekOf(d)
    const r = getReview(w.key)
    const posts = rows.filter((n) => n.date >= w.start && n.date <= w.end).length
    out.push({
      week: w.key, from: w.start, to: w.end, label: label(w), posts,
      state: w.end >= t ? '本周' : r ? '已复盘' : '未复盘', pending: r ? r.learnings.filter((l) => l.status === '待定').length : 0, written_by: r?.written_by ?? null,
    })
  }
  return out
}

export function reviewDetail(week: string) {
  checkKey(week)
  const running = get<{ id: string; progress: string | null; started_at: string }>("SELECT id, progress, started_at FROM xhs_jobs WHERE kind = '复盘' AND ref = :week AND status = 'running'", { week })
  const last = get<{ status: string; error: string | null }>("SELECT status, error FROM xhs_jobs WHERE kind = '复盘' AND ref = :week ORDER BY started_at DESC LIMIT 1", { week })
  const m = weekMetrics(week)
  const prev = weekMetrics(addDays(week, -7))
  const { notes: _n, ...prevSummary } = prev
  return { metrics: m, prev: prevSummary, review: getReview(week), running: running ?? null, last_error: last?.status === 'failed' ? last.error : null }
}

/** 生成复盘：本机 Codex 读账号定位、规律、写法卡，按工作台算好的这周数据写 <review>。重新生成时：旧的一份留在 previous，
 *  已经存进知识库的经验和已经放进灵感池的选题建议都保留 */
export function generateReview(week: string) {
  const m = weekMetrics(week)
  if (m.to >= today()) throw new BadRequest('这周还没过完（周二到下周一），下周二再复盘')
  if (!m.posts) throw new BadRequest('这周没发笔记，不用复盘')
  const jobId = startJob('复盘', week)
  const prev = weekMetrics(addDays(week, -7))
  const table = m.notes.map((n) => `- ${n.date}《${n.title}》${n.kind}｜${n.pillar_name ?? '—'}｜${n.organic ? `自然阅读 ${n.organic.reads}、点赞 ${n.organic.likes}、收藏 ${n.organic.saves}、评论 ${n.organic.comments}、涨粉 ${n.total!.new_followers}` : '暂无数据'}${n.paid ? `｜投流 ${Math.round(n.paid.spend)} 元带来阅读 ${n.paid.reads}、收藏 ${n.paid.saves}` : ''}`).join('\n')
  const prompt = [
    `你在 ABC茶社 工作台的「小红书内容中心 · 复盘」页。今天是 ${today()}。按项目里的「小红书创作」Skill（.agents/skills/xhs-creator/SKILL.md）的“复盘”任务，复盘小红书 ${m.from}—${m.to} 这一周（一周按周二到下周一算，和每周复盘一样）。`,
    '先读 11-内容与作品/小红书账号定位.md 和 11-内容与作品/规律/ 里的几条，需要时看 05-方法与判断/小红书内容/ 的写法卡。只读，不改文件。数据以下面工作台给的为准（以自然流量为准，比较用中位数；样本少要说“只供参考”，不直接归因成交）。',
    '写短一点：summary 2—3 句；每条 worked / change 一句话，带哪篇、什么数；不要重复同一个数。',
    '回复：先 1—2 句中文说明，再一行“参考了：文件路径、文件路径”，最后：',
    '<review>{"summary":"2—3 句总结","worked":["做得好的"],"change":["要改的"],"ideas":[{"title":"下周选题，20 字以内","reason":"为什么，一句","pillar":"内容支柱名"}],"learnings":[{"rule":"以后写稿要遵守的一句话","evidence":"依据：哪几篇、什么数","scope":"适用范围和样本数","prior":"知识库里原来有没有类似的做法，有就写在哪份文件、怎么说的，没有写“没有”"}]}</review>',
    'worked、change 各 2—3 条；ideas 3 个；learnings 1—2 条，没有把握就少写。JSON 必须能直接解析。',
    `【这周的数据】（截至 ${m.through}，累计）发了 ${m.posts} 篇（${m.with_data} 篇有数据）；自然阅读 ${m.organic_reads}、收藏 ${m.organic_saves}、整体收藏率 ${m.save_rate ?? '—'}%（账号一篇的中位数 ${m.median_rate ?? '—'}%）；投流 ${m.spend} 元带来阅读 ${m.paid_reads}；涨粉 ${m.new_followers}。\n${table}`,
    `【上一周 ${prev.from}—${prev.to}】发了 ${prev.posts} 篇；自然阅读 ${prev.organic_reads}、收藏 ${prev.organic_saves}、整体收藏率 ${prev.save_rate ?? '—'}%；投流 ${prev.spend} 元。`,
    `【账号数据参考】\n${accountFacts()}`,
  ].join('\n\n')
  const h = runCodex(prompt, (u) => { if (u.progress) run('UPDATE xhs_jobs SET progress = :p WHERE id = :id AND status = :s', { id: jobId, p: u.progress, s: 'running' }) }, { labels: { writing: '正在写复盘…', final: '正在整理复盘…' } })
  h.done.then((r) => {
    if (!r.ok) { finishJob(jobId, { status: 'failed', error: `${r.reason}：${r.error}`, ms: r.ms }); return }
    const v = parseReply(r.text).review
    if (!v) { finishJob(jobId, { status: 'failed', error: '回复里没有能用的复盘（格式没解析出来），可以再试一次', ms: r.ms }); return }
    const arr = (x: unknown) => (Array.isArray(x) ? x : [])
    const old = getReview(week)
    const kept = (old?.learnings ?? []).filter((l) => l.status === '已存进知识库')
    const fresh: Learning[] = arr(v.learnings).map((l: Record<string, unknown>) => ({ rule: String(l.rule ?? ''), evidence: String(l.evidence ?? ''), scope: String(l.scope ?? ''), prior: l.prior ? String(l.prior) : null, status: '待定' as const }))
      .filter((l) => l.rule && !kept.some((k) => k.rule === l.rule))
    const pooled = (old?.ideas ?? []).filter((i) => i.piece_id)
    const ideas = [...pooled, ...arr(v.ideas).map((i: Record<string, unknown>) => ({ title: String(i.title ?? ''), reason: String(i.reason ?? ''), pillar: i.pillar ? String(i.pillar) : null, piece_id: null }))
      .filter((i) => i.title && !pooled.some((p) => p.title === i.title))]
    const inputs = { posts: m.posts, with_data: m.with_data, organic_reads: m.organic_reads, organic_saves: m.organic_saves, total_reads: m.total_reads, total_saves: m.total_saves, new_followers: m.new_followers, save_rate: m.save_rate, spend: m.spend, median_rate: m.median_rate, through: m.through }
    const previous = old ? JSON.stringify({ summary: old.summary, worked: old.worked, change: old.change, ideas: old.ideas, learnings: old.learnings, written_by: old.written_by, origin: old.origin, created_at: old.created_at }) : null
    const at = nowIso()
    run(`INSERT INTO xhs_reviews (id, week, date_from, date_to, summary, worked, change, ideas, learnings, inputs, written_by, origin, duration_ms, previous, created_at, updated_at)
      VALUES (:id, :week, :from, :to, :summary, :worked, :change, :ideas, :learnings, :inputs, '本机 Codex', '现场', :ms, :previous, :at, :at)
      ON CONFLICT(week) DO UPDATE SET summary = excluded.summary, worked = excluded.worked, change = excluded.change, ideas = excluded.ideas, learnings = excluded.learnings,
        inputs = excluded.inputs, written_by = excluded.written_by, origin = excluded.origin, duration_ms = excluded.duration_ms, previous = excluded.previous,
        created_at = excluded.created_at, updated_at = excluded.updated_at`, {
      id: uid('rv'), week, from: m.from, to: m.to, summary: String(v.summary ?? ''), worked: JSON.stringify(arr(v.worked).map(String)), change: JSON.stringify(arr(v.change).map(String)),
      ideas: JSON.stringify(ideas), learnings: JSON.stringify([...kept, ...fresh]), inputs: JSON.stringify(inputs), ms: r.ms, previous, at,
    })
    finishJob(jobId, { status: 'done', count: fresh.length, ms: r.ms })
    logChange('Codex', 'xhs_review', week, '复盘', `小红书：本机 Codex 写了 ${m.label} 的复盘${old ? '（替换了原来那份，原来的留着）' : ''}`)
  }).catch((err) => finishJob(jobId, { status: 'failed', error: (err as Error).message, ms: 0 }))
  return { job_id: jobId }
}

function saveField(week: string, field: 'learnings' | 'ideas', value: unknown) {
  run(`UPDATE xhs_reviews SET ${field} = :v, updated_at = :at WHERE week = :week`, { v: JSON.stringify(value), at: nowIso(), week })
}

/** 改一条经验：改写措辞、标“不要”、改回“待定”。存进知识库的不能再改（要改去知识库里改） */
export function updateLearning(week: string, idx: number, input: { rule?: string; status?: string }, actor: Actor) {
  const r = getReview(week)
  if (!r?.learnings[idx]) throw new NotFound('没有这一条经验')
  const l = { ...r.learnings[idx] }
  if (l.status === '已存进知识库') throw new BadRequest('这条已经存进知识库了；要改，去知识库的“待确认的发现”里改')
  if (typeof input.rule === 'string' && input.rule.trim()) l.rule = input.rule.trim().slice(0, 200)
  if (input.status === '不要' || input.status === '待定') l.status = input.status
  saveField(week, 'learnings', r.learnings.map((x, i) => (i === idx ? l : x)))
  logChange(actor, 'xhs_review', week, '修改', `小红书复盘：经验「${l.rule.slice(0, 20)}」${l.status}`)
  return getReview(week)
}

/** 知识库里的相对链接：从 90-持续生长/ 出发 */
const link = (path: string, name?: string) => `[${name ?? path.split('/').pop()!.replace(/\.md$/, '')}](../${path})`

/** 存进知识库之前，先给林总看要追加的那一节（照 90-持续生长/README.md 的发现卡格式） */
export function learningPreview(week: string, idx: number) {
  const r = getReview(week)
  const l = r?.learnings[idx]
  if (!r || !l) throw new NotFound('没有这一条经验')
  const body = existsSync(join(ROOT, FINDINGS)) ? readFileSync(join(ROOT, FINDINGS), 'utf8') : ''
  const n = Math.max(0, ...[...body.matchAll(/^##\s*发现\s*(\d+)/gm)].map((m) => Number(m[1]))) + 1
  const head = l.rule.split(/[：:，,。；;]/)[0] || l.rule
  const title = head.length > 28 ? `${head.slice(0, 27)}…` : head
  const through = String(r.inputs.through ?? statsThrough() ?? '—')
  const span = `${md(r.date_from)}—${md(r.date_to)}`
  const md2 = [
    `## 发现 ${n}｜${title}`,
    `- 看到的：${l.evidence || '（复盘里没写依据）'}（工作台小红书笔记数据，截至 ${through}，以自然流量为准）`,
    `- 原来的做法：${l.prior ? `${l.prior}${l.prior_path ? `（${link(l.prior_path)}）` : ''}` : '没有'}`,
    `- 可能的规律或建议：以后写小红书照这条来——${l.rule}${l.scope ? `。适用：${l.scope}` : ''}`,
    '- 想问你：要不要整理进小红书的规律，或者补进对应的写法卡？',
    `- 证据强度：${l.scope?.match(/样本[^，,；;]*/)?.[0] ?? '样本数没写'}；有数据，是从笔记数据里看出来的，还没核对原文和评论`,
    '- 状态：待确认',
    `- 提出：${today()}，小红书每周复盘（${span}，${r.written_by}写；林总在工作台点了“存进知识库”）`,
  ].join('\n')
  const source = `- 发现 ${n}：工作台小红书每周复盘（${span}）的笔记数据，截至 ${through}；${today()} 林总在工作台点了“存进知识库”。`
  return { path: FINDINGS, number: n, markdown: md2, source, exists: !!body }
}

/** 追加到 90-持续生长/待确认的发现.md：发现卡插在“## 来源”前面，来源里追加一行；别的不改（文件开头的日期、90 的索引由整理知识库时改） */
export function saveLearning(week: string, idx: number, actor: Actor) {
  const r = getReview(week)
  const l = r?.learnings[idx]
  if (!r || !l) throw new NotFound('没有这一条经验')
  if (l.status === '已存进知识库') throw new BadRequest('这条已经存过了')
  if (l.status !== '待定') throw new BadRequest('这条标了“不要”，先放回待定再存')
  const { markdown, source, path, number } = learningPreview(week, idx)
  const abs = join(ROOT, path)
  const body = existsSync(abs) ? readFileSync(abs, 'utf8') : `# 待确认的发现\n\n## 来源\n`
  const at = body.search(/^##\s*来源\s*$/m)
  let next: string
  if (at >= 0) {
    const tail = body.slice(at)
    const nextHead = tail.slice(1).search(/^##\s/m)
    const end = nextHead >= 0 ? at + 1 + nextHead : body.length
    next = `${body.slice(0, at)}${markdown}\n\n${body.slice(at, end).replace(/\s*$/, '')}\n${source}\n${nextHead >= 0 ? `\n${body.slice(end)}` : ''}`
  } else {
    next = `${body.replace(/\s*$/, '')}\n\n${markdown}\n`
  }
  writeFileSync(abs, next, 'utf8')
  saveField(week, 'learnings', r.learnings.map((x, i) => (i === idx ? { ...x, status: '已存进知识库', saved_at: nowIso(), kb_path: path, number } : x)))
  logChange(actor, 'xhs_review', week, '存进知识库', `小红书复盘：经验「${l.rule.slice(0, 20)}」追加到 ${path}（发现 ${number}）`)
  return { path, review: getReview(week) }
}

/** 下周选题建议放进灵感池（不算“今日选题”，来源写复盘建议） */
export function ideaToPool(week: string, idx: number, actor: Actor) {
  const r = getReview(week)
  const idea = r?.ideas[idx]
  if (!r || !idea) throw new NotFound('没有这个选题建议')
  if (idea.piece_id) return { piece_id: idea.piece_id, review: r }
  const pillar = idea.pillar ? all<{ id: string; name: string }>('SELECT id, name FROM content_pillars').find((p) => idea.pillar!.includes(p.name.slice(0, 3)))?.id ?? null : null
  const p = createPiece({ title: idea.title.slice(0, 60), reason: idea.reason, ref: `${md(r.date_from)}—${md(r.date_to)} 的复盘`, source: '复盘建议', status: '灵感池', pillar_id: pillar }, actor, { created_by: r.written_by })
  saveField(week, 'ideas', r.ideas.map((x, i) => (i === idx ? { ...x, piece_id: p.id } : x)))
  return { piece_id: p.id, review: getReview(week) }
}
