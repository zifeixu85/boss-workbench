// 内容中心的“今天”页和创作页要的汇总：今天发哪篇、本周排期、今日选题、数据提醒、开写的起点、AI 手上有什么。归属：小红书内容模块。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, nowIso, ROOT } from '../../db.ts'
import { today, addDays, isoWeek } from '../../services/common.ts'
import { listPieces, pieceDetail } from './pieces.ts'
import { reminders, statsThrough, noteRows } from './stats.ts'
import { jobs } from './topics.ts'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const weekday = (d: string) => WEEK[new Date(`${d}T00:00:00`).getDay()]

function account() {
  const a = get<{ name: string; red_id: string | null; followers: number; likes_saves: number | null; owner: string | null }>('SELECT name, red_id, followers, likes_saves, owner FROM xhs_account LIMIT 1')
  const series = all<{ date: string; followers: number }>('SELECT date, followers FROM xhs_followers_daily ORDER BY date')
  const last = series.at(-1), weekAgo = series.at(-8)
  return { ...a, followers: last?.followers ?? a?.followers ?? null, followers_7d: last && weekAgo ? last.followers - weekAgo.followers : null, through: statsThrough() }
}

export function centerToday() {
  const t = today()
  const pieces = listPieces()
  const live = pieces.filter((p) => p.status !== '已放弃')
  const todays = live.filter((p) => (p.scheduled_date === t && p.status !== '已发布') || p.published_at?.slice(0, 10) === t)
  const main = todays.sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))[0] ?? null
  const fallback = main ? null : live.find((p) => p.status === '待发布') ?? live.find((p) => p.status === '写稿中') ?? null
  const w = isoWeek(t)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(w.start, i)
    return {
      date: d, weekday: weekday(d), is_today: d === t,
      items: live.filter((p) => (p.status === '已发布' ? p.published_at?.slice(0, 10) : p.scheduled_date) === d)
        .map((p) => ({ id: p.id, title: p.draft?.title ?? p.title, status: p.status, time: p.status === '已发布' ? p.published_at?.slice(11, 16) ?? null : p.scheduled_time, pillar_name: p.pillar_name })),
    }
  })
  const counts = Object.fromEntries(['灵感池', '已选', '写稿中', '待发布'].map((s) => [s, pieces.filter((p) => p.status === s).length]))
  return {
    date: t, weekday: weekday(t), account: account(),
    main: main ? pieceDetail(main.id) : null, fallback,
    week: { key: w.key, from: w.start, to: w.end, days: week },
    topics: todayTopics(pieces, t),
    reminders: reminders(), counts,
  }
}

/** 今日选题：哪一次“出选题”写的就归哪一组（早上的定时任务、现场点的“再出几个”），刚出的那组放最上面。
 *  复盘建议、自己记的选题不算（它们没有出选题任务）。 */
function todayTopics(pieces: ReturnType<typeof listPieces>, t: string) {
  const date = get<{ d: string | null }>('SELECT MAX(topic_date) AS d FROM xhs_pieces WHERE topic_date <= :t AND job_id IS NOT NULL', { t })?.d ?? t
  const items = pieces.filter((p) => p.topic_date === date && p.job_id).sort((a, b) => a.sort - b.sort)
  const all = jobs('出选题')
  const nowMs = Date.parse(nowIso())
  const groups = [...new Set(items.map((p) => p.job_id!))].map((id) => {
    const job = all.find((j) => j.id === id) ?? null
    const fresh = !!job?.finished_at && job.origin !== '示例' && nowMs - Date.parse(job.finished_at) < 60 * 60_000
    return { job, fresh, items: items.filter((p) => p.job_id === id) }
  }).sort((a, b) => (b.job?.started_at ?? '').localeCompare(a.job?.started_at ?? ''))
  return { date, items, groups, warns: items.filter((p) => p.warn && p.status === '灵感池').length, running: all.find((j) => j.status === 'running') ?? null }
}

/** 创作开始页：最近在写的、四个起点各自的候选（今天的选题、旧笔记、一款茶、对标笔记） */
export function starts() {
  const t = today()
  const pieces = listPieces()
  const recent = all<{ piece_id: string; at: string }>(`SELECT piece_id, MAX(at) AS at FROM (
      SELECT piece_id, created_at AS at FROM xhs_versions UNION ALL SELECT piece_id, created_at AS at FROM xhs_messages) GROUP BY piece_id ORDER BY at DESC LIMIT 20`)
  const notes = noteRows().filter((n) => n.organic).sort((a, b) => b.organic!.saves - a.organic!.saves).slice(0, 12)
  const teas = productList()
  const bench = all('SELECT * FROM xhs_benchmarks ORDER BY saved_at DESC')
  return {
    recent: recent.map((r) => ({ ...pieces.find((p) => p.id === r.piece_id)!, last_at: r.at })).filter((p) => p.id && ['写稿中', '待发布'].includes(p.status)),
    topics: pieces.filter((p) => p.status === '灵感池' && p.topic_date && p.topic_date >= addDays(t, -2)).sort((a, b) => (b.topic_date ?? '').localeCompare(a.topic_date ?? '') || a.sort - b.sort).slice(0, 12),
    notes: notes.map((n) => ({ id: n.id, piece_id: n.piece_id, title: n.title, date: n.date, pillar_name: n.pillar_name, saves: n.organic!.saves, reads: n.organic!.reads, cover_text: n.cover_text, cover: n.cover, pages: n.pages })),
    teas, benchmarks: bench,
  }
}

/** 零售商品清单里的 12 款（一款茶开始写时选）；还没上线的标出来 */
export function productList() {
  const rel = '03-生意/产品与服务/零售商品清单.md'
  const md = existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : ''
  const out: { name: string; kind: string; spec: string; price: string; status: string; note: string; secret: boolean }[] = []
  for (const line of md.split('\n')) {
    const c = line.split('|').map((s) => s.trim())
    if (c.length < 9 || !/\d/.test(c[4] ?? '') || c[1] === '商品') continue
    out.push({ name: c[1].replace(/\*/g, ''), kind: c[2], spec: c[3], price: c[4], status: c[6], note: c[7].replace(/\*/g, ''), secret: /待上线|保密/.test(line) })
  }
  return out
}

/** “AI 手上有什么”：这次 Codex 能读到的资料（都能点开读原文） */
export function aiKit() {
  const has = (p: string) => existsSync(join(ROOT, p))
  const list = (dir: string) => (has(dir) ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => `${dir}/${f}`) : [])
  const cards = list('05-方法与判断/小红书内容')
  const rules = list('11-内容与作品/规律')
  const index = '11-内容与作品/作品索引.md'
  const lastReview = get<{ week: string; date_from: string; date_to: string; written_by: string }>('SELECT week, date_from, date_to, written_by FROM xhs_reviews ORDER BY week DESC LIMIT 1')
  return {
    skill: has('.agents/skills/xhs-creator/SKILL.md') ? '.agents/skills/xhs-creator/SKILL.md' : null,
    // 页面上叫“小红书写法”（给 AI 的做事说明），不说 Skill
    groups: [
      { label: '品牌与账号', note: '定位、口吻、不能说的话', files: ['03-生意/品牌与口吻.md', '11-内容与作品/小红书账号定位.md'].filter(has) },
      { label: `写法卡 ${cards.length} 张`, note: '场景开头、清单图文、茶具一图一知识点、新品预热', files: ['05-方法与判断/小红书内容/README.md', ...cards].filter(has) },
      { label: `作品索引和规律 ${rules.length} 条`, note: '发过什么、哪类收藏高', files: [index, ...rules].filter(has) },
      { label: '商品和新品', note: '只用清单里有的价格、规格', files: ['03-生意/产品与服务/零售商品清单.md', '06-项目/秋冬新品围炉白茶上市.md'].filter(has) },
    ],
    data_note: `近 60 天 ${noteRows().length} 篇笔记的数据（截至 ${statsThrough() ?? '—'}，工作台算好附在提示词里）`,
    last_review: lastReview ? `${Number(lastReview.date_from.slice(5, 7))}/${Number(lastReview.date_from.slice(8, 10))}—${Number(lastReview.date_to.slice(5, 7))}/${Number(lastReview.date_to.slice(8, 10))} 的复盘（${lastReview.written_by}写）` : null,
  }
}

export function skillText() {
  const p = join(ROOT, '.agents/skills/xhs-creator/SKILL.md')
  return { path: '.agents/skills/xhs-creator/SKILL.md', body: existsSync(p) ? readFileSync(p, 'utf8') : '' }
}
