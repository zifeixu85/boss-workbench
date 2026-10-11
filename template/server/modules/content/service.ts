// 小红书内容模块：底座留下的只读接口（账号、笔记、选题、排期、旧草稿、素材）和今日页用的 todayPlan()。归属：内容模块。
// 2026-10-10 内容中心（E3）做好后，选题和排期改从 xhs_pieces 读，接口形状不变；新功能在 pieces / studio / stats / reviews / topics / center 这几个文件。
// 今日页会调用 todayPlan()（见 services/today.ts）：改它的返回形状，要在 README 的改动记录里写一笔。
import { all, get } from '../../db.ts'
import { findDoc } from '../../services/kb.ts'
import { today, addDays, NotFound } from '../../services/common.ts'

const tags = <T extends { tags?: unknown }>(r: T) => ({ ...r, tags: JSON.parse(String(r.tags ?? '[]')) as string[] })

export function account() {
  const a = get<{ id: string; name: string; red_id: string | null; bio: string | null; positioning: string | null; followers: number; likes_saves: number | null; owner: string | null; positioning_kb: string | null; voice_kb: string | null; updated_at: string }>('SELECT * FROM xhs_account LIMIT 1')
  const series = all<{ date: string; followers: number; gained: number; lost: number }>('SELECT * FROM xhs_followers_daily ORDER BY date')
  const last = series.at(-1)
  const weekAgo = series.at(-8)
  return {
    ...a, followers_series: series, stats_through: last?.date ?? null, followers_7d: last && weekAgo ? last.followers - weekAgo.followers : null,
    docs: { positioning: findDoc(a?.positioning_kb, '小红书账号定位'), voice: findDoc(a?.voice_kb, '品牌与口吻') },
  }
}

export const pillars = () => all('SELECT * FROM content_pillars ORDER BY sort')

const NOTE_SQL = `SELECT n.*, p.name AS pillar_name,
  s.impressions, s.reads, s.likes, s.saves, s.comments, s.shares, s.new_followers, s.stats_date,
  b.impressions AS paid_impressions, b.reads AS paid_reads, b.likes AS paid_likes, b.saves AS paid_saves, b.comments AS paid_comments,
  b.new_followers AS paid_new_followers, b.spend AS paid_spend
  FROM xhs_notes n LEFT JOIN content_pillars p ON p.id = n.pillar_id
  LEFT JOIN xhs_note_stats s ON s.note_id = n.id AND s.traffic = '自然'
  LEFT JOIN xhs_note_stats b ON b.note_id = n.id AND b.traffic = '投流'`

/** 笔记列表：自然流量一组字段，投流一组 paid_* 字段；没数据的是 null（暂无，不是 0） */
export const notes = () => all(`${NOTE_SQL} ORDER BY n.published_at DESC`).map(tags)

export function note(id: string) {
  const n = get(`${NOTE_SQL} WHERE n.id = :id`, { id })
  if (!n) throw new NotFound('找不到这篇笔记')
  return tags(n)
}

/** 某天早上生成的选题（默认最近一次）。2026-10-10 起从内容中心的 xhs_pieces 读（topic_date），形状不变 */
export function topics(date?: string) {
  // 只算“出选题”写的（有 job_id）；复盘建议、自己记的选题不算今日选题
  const d = date ?? get<{ d: string }>('SELECT MAX(topic_date) AS d FROM xhs_pieces WHERE topic_date <= :t AND job_id IS NOT NULL', { t: today() })?.d ?? today()
  return all(`SELECT p.id, p.topic_date AS date, p.title, p.source, p.reason, p.ref, p.pillar_id, p.status, p.sort, p.created_by, pl.name AS pillar_name
    FROM xhs_pieces p LEFT JOIN content_pillars pl ON pl.id = p.pillar_id WHERE p.topic_date = :d AND p.job_id IS NOT NULL ORDER BY p.sort`, { d })
}

/** 排期：哪天发什么（排了日子的和已经发的）。2026-10-10 起从 xhs_pieces 读，状态沿用旧词：已发布 / 待发布 / 草稿（写稿中）/ 选题（已选） */
const OLD_STATUS: Record<string, string> = { 已发布: '已发布', 待发布: '待发布', 写稿中: '草稿', 已选: '选题', 灵感池: '选题' }
export function schedule(from?: string, to?: string) {
  const f = from ?? addDays(today(), -1)
  const t = to ?? addDays(today(), 13)
  return all<{ id: string; date: string; time: string | null; title: string; status: string; pillar_name: string | null; memo: string | null; piece_status: string }>(
    `SELECT p.id, COALESCE(substr(p.published_at, 1, 10), p.scheduled_date) AS date, COALESCE(substr(p.published_at, 12, 5), p.scheduled_time) AS time,
      p.title, p.status AS piece_status, p.memo, pl.name AS pillar_name
    FROM xhs_pieces p LEFT JOIN content_pillars pl ON pl.id = p.pillar_id
    WHERE p.status != '已放弃' AND COALESCE(substr(p.published_at, 1, 10), p.scheduled_date) BETWEEN :f AND :t ORDER BY date, time`, { f, t })
    .map((r) => ({ ...r, status: OLD_STATUS[r.piece_status] ?? r.piece_status }))
}

export const drafts = () => all('SELECT d.*, p.name AS pillar_name FROM xhs_drafts d LEFT JOIN content_pillars p ON p.id = d.pillar_id ORDER BY d.updated_at DESC').map(tags)

export function draft(id: string) {
  const d = get('SELECT d.*, p.name AS pillar_name FROM xhs_drafts d LEFT JOIN content_pillars p ON p.id = d.pillar_id WHERE d.id = :id', { id })
  if (!d) throw new NotFound('找不到这篇草稿')
  return { ...tags(d), chat: all('SELECT * FROM content_chat WHERE draft_id = :id ORDER BY at', { id }) }
}

export const assets = () => all('SELECT * FROM xhs_assets ORDER BY kind, id')

/** 今天发什么：今天排的那篇（带稿件状态）、今天的选题、账号概况。今日页和命令行 xhs 用；形状和底座一致（见 lib/types.ts 的 XhsToday） */
export function todayPlan(t = today()) {
  const rows = schedule(t, t)
  const posts = rows.map((r) => {
    const v = get<{ data: string; version: number }>('SELECT data, version FROM xhs_versions WHERE piece_id = :id ORDER BY version DESC LIMIT 1', { id: r.id })
    const d = v ? JSON.parse(v.data) as { cover_text?: string } : null
    return { id: r.id, time: r.time, title: r.title, status: r.status, draft_id: v ? r.id : null, pillar_name: r.pillar_name, cover_text: d?.cover_text ?? null, draft_status: v ? ({ 待发布: '已定稿', 写稿中: '写作中' } as Record<string, string>)[r.piece_status] ?? null : null, memo: r.memo }
  })
  const ts = topics(t) as { id: string; title: string; source: string; reason: string; pillar_name: string | null; status: string; date: string }[]
  const fresh = ts.filter((x) => x.date === t)
  const a = account()
  const upcoming = schedule(addDays(t, 1), addDays(t, 3)).slice(0, 3).map((r) => ({ date: r.date, time: r.time, title: r.title, status: r.status }))
  return {
    date: t, posts, upcoming,
    topics: fresh.slice(0, 3).map((x) => ({ ...x, status: x.status === '灵感池' ? '新' : x.status })), topics_total: fresh.length,
    account: { followers: a.followers ?? null, followers_7d: a.followers_7d, stats_through: a.stats_through },
  }
}
