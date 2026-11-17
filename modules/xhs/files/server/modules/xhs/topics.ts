// 选题：每天早上 Codex 定时任务用命令写回（xhs-topics-add），网页上“再出几个 / AI 出选题”现场调本机 Codex。归属：小红书内容模块。
import { all, get, run, uid, nowIso, logChange } from '../../db.ts'
import { BadRequest, today, type Actor } from '../../services/common.ts'
import { runCodex, TIMEOUT_MS } from './codex.ts'
import { parseReply } from './parse.ts'
import { accountFacts } from './stats.ts'
import { SOURCES } from './pieces.ts'
import { identity } from '../../services/identity.ts'

export type TopicIn = { title?: unknown; source?: unknown; reason?: unknown; pillar?: unknown; angle?: unknown; ref?: unknown; warn?: unknown }

const SOURCE_MAP: [RegExp, (typeof SOURCES)[number]][] = [
  [/评论/, '评论区问题'], [/热点|节气|天气/, '热点和节气'], [/同行|爆款|对标/, '同行爆款'], [/知识库|客户|常问/, '知识库客户常问'], [/复盘/, '复盘建议'],
]
const norm = (s: string) => s.replace(/[\s，。,.！!？?｜|：:“”"'、（）()]/g, '')

function pillarId(name: unknown): string | null {
  const n = String(name ?? '').trim()
  if (!n) return null
  const ps = all<{ id: string; name: string }>('SELECT id, name FROM content_pillars')
  return ps.find((p) => p.name === n)?.id ?? ps.find((p) => n.includes(p.name.slice(0, 3)) || p.name.includes(n.slice(0, 3)))?.id ?? null
}

/** 写进灵感池（同名的跳过）。by：谁出的（Codex 定时任务 / 本机 Codex / 小艾）；jobId：网页上现场出的那一次。
 *  命令行写回（每天早上的定时任务）没有 jobId，就记一条“出选题”任务，今天页按它写“谁、几点写的” */
export function addTopics(items: TopicIn[], opts: { date?: string; by?: string; actor?: Actor; jobId?: string } = {}) {
  if (!Array.isArray(items) || !items.length) throw new BadRequest('没有选题：要一个数组，每项至少有 title')
  const date = opts.date ?? today()
  const by = opts.by ?? 'Codex 定时任务'
  const jobId = opts.jobId ?? uid('job')
  if (!opts.jobId) run(`INSERT INTO xhs_jobs (id, kind, ref, who, status, started_at, finished_at, origin) VALUES (:id, '出选题', NULL, :who, 'done', :at, :at, '现场')`, { id: jobId, who: by, at: nowIso() })
  const existing = new Set(all<{ title: string }>("SELECT title FROM xhs_pieces WHERE status != '已放弃' OR topic_date >= :d", { d: date }).map((r) => norm(r.title)))
  const base = get<{ n: number }>('SELECT COALESCE(MAX(sort), 0) AS n FROM xhs_pieces WHERE topic_date = :d', { d: date })?.n ?? 0
  const added: { id: string; title: string }[] = []
  const skipped: string[] = []
  items.slice(0, 20).forEach((t, i) => {
    const title = String(t.title ?? '').trim().slice(0, 60)
    if (!title) return
    if (existing.has(norm(title))) { skipped.push(title); return }
    existing.add(norm(title))
    const src = String(t.source ?? '')
    const source = (SOURCES as readonly string[]).includes(src) ? src : SOURCE_MAP.find(([re]) => re.test(src))?.[1] ?? '自己想的'
    const id = uid('p')
    const at = nowIso()
    run(`INSERT INTO xhs_pieces (id, title, angle, format, pillar_id, source, reason, ref, warn, status, topic_date, job_id, created_by, sort, created_at, updated_at)
      VALUES (:id, :title, :angle, '图文', :pillar, :source, :reason, :ref, :warn, '灵感池', :date, :job, :by, :sort, :at, :at)`, {
      id, title, angle: t.angle ? String(t.angle).slice(0, 200) : null, pillar: pillarId(t.pillar), source, reason: t.reason ? String(t.reason).slice(0, 400) : null,
      ref: t.ref ? String(t.ref).slice(0, 400) : null, warn: t.warn ? String(t.warn).slice(0, 400) : null, date, job: jobId, by, sort: base + i + 1, at,
    })
    added.push({ id, title })
  })
  if (!opts.jobId) run('UPDATE xhs_jobs SET result_count = :n WHERE id = :id', { id: jobId, n: added.length })
  if (added.length) logChange(opts.actor ?? 'Codex', 'xhs_piece', added[0].id, '新增选题', `小红书：${by}写进 ${added.length} 个选题（${date}）`)
  return { date, by, job_id: jobId, added, skipped }
}

type JobDb = { id: string; kind: string; ref: string | null; who: string | null; status: string; progress: string | null; error: string | null; result_count: number | null; duration_ms: number | null; started_at: string; finished_at: string | null; origin: string }
export function jobs(kind?: string) {
  // 超过超时时间还挂着的（工作台中途重启了），如实标成没跑完
  run(`UPDATE xhs_jobs SET status = 'failed', progress = NULL, error = '工作台中途重启了，这次没跑完。再点一次。' WHERE status = 'running' AND started_at < :before`,
    { before: new Date(Date.parse(nowIso()) - TIMEOUT_MS - 30_000).toISOString() })
  return all<JobDb>(`SELECT * FROM xhs_jobs ${kind ? 'WHERE kind = :kind' : ''} ORDER BY started_at DESC LIMIT 20`, kind ? { kind } : {})
}

export function finishJob(id: string, patch: { status: 'done' | 'failed'; error?: string | null; count?: number | null; ms: number }) {
  run('UPDATE xhs_jobs SET status = :status, error = :error, result_count = :count, duration_ms = :ms, progress = NULL, finished_at = :at WHERE id = :id',
    { id, status: patch.status, error: patch.error ?? null, count: patch.count ?? null, ms: patch.ms, at: nowIso() })
}
export function startJob(kind: '出选题' | '复盘', ref: string | null) {
  if (all("SELECT id FROM xhs_jobs WHERE kind = :kind AND status = 'running' AND started_at > :since", { kind, since: new Date(Date.parse(nowIso()) - TIMEOUT_MS - 30_000).toISOString() }).length) {
    throw new BadRequest(kind === '出选题' ? '上一次出选题还在跑，等它写完' : '这周的复盘正在写，等它写完')
  }
  const id = uid('job')
  run(`INSERT INTO xhs_jobs (id, kind, ref, who, status, progress, started_at) VALUES (:id, :kind, :ref, '本机 Codex', 'running', '正在读账号定位和作品索引…', :at)`, { id, kind, ref, at: nowIso() })
  return id
}

/** 网页上点“再出几个”：现场调本机 Codex 出选题，写进灵感池 */
export function generateTopics(input: { direction?: string | null; count?: number }) {
  const count = [3, 5, 10].includes(Number(input.count)) ? Number(input.count) : 5
  const direction = String(input.direction ?? '').trim().slice(0, 80)
  const jobId = startJob('出选题', direction || null)
  const pool = all<{ title: string }>("SELECT title FROM xhs_pieces WHERE status IN ('灵感池','已选','写稿中','待发布') ORDER BY updated_at DESC LIMIT 30").map((r) => r.title)
  const prompt = [
    `你在 ${identity().shop} 的工作台「小红书内容中心」。今天是 ${today()}。按项目里的「小红书创作」Skill（.agents/skills/xhs-creator/SKILL.md）出 ${count} 个小红书选题${direction ? `，这次往这个方向想：${direction}` : ''}。`,
    '先读 11-内容与作品/小红书账号定位.md 和 11-内容与作品/作品索引.md（别和最近 30 天发过的重复），需要时看 04-客户/客户原话与顾虑.md 和 03-生意/品牌与口吻.md。只读，不改文件。这次没开联网，热点按日期、节气和天气常识判断，说清楚是推测。',
    '回复：先 1—3 句中文说明，再单独一行“参考了：文件路径、文件路径”，最后：',
    '<topics>[{"title":"20 字以内","source":"评论区|热点节气|同行爆款|知识库","reason":"为什么现在写（一句话，带依据）","pillar":"四个内容支柱之一的名字，都不是就写空","angle":"切入角度"}]</topics>',
    'JSON 必须能直接解析。选题里不出现企业客户名字、还没上线的新品名字。',
    `【已经在池子里的，别重复】${pool.join('；')}`,
    `【账号数据参考】（工作台算好的）\n${accountFacts()}`,
  ].join('\n\n')
  const h = runCodex(prompt, (u) => { if (u.progress) run('UPDATE xhs_jobs SET progress = :p WHERE id = :id AND status = :s', { id: jobId, p: u.progress, s: 'running' }) }, { labels: { writing: '正在想选题…', final: '正在写进灵感池…' } })
  h.done.then((r) => {
    if (!r.ok) { finishJob(jobId, { status: 'failed', error: `${r.reason}：${r.error}`, ms: r.ms }); return }
    const parsed = parseReply(r.text)
    if (!parsed.topics?.length) { finishJob(jobId, { status: 'failed', error: '回复里没有能用的选题（格式没解析出来），可以再试一次', ms: r.ms }); return }
    const res = addTopics(parsed.topics as TopicIn[], { by: '本机 Codex', actor: 'Codex', jobId })
    finishJob(jobId, { status: 'done', count: res.added.length, ms: r.ms })
  }).catch((err) => finishJob(jobId, { status: 'failed', error: (err as Error).message, ms: 0 }))
  return { job_id: jobId }
}
