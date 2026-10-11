// 内容模块的种子：把 content-data.ts 写进数据库，并按“表现档位”生成每篇笔记的数据。归属：内容模块。
// 笔记数据截至 10/25：10/27 早上那次“小红书笔记数据”导入失败（字段对不上，见数据源模块），所以 10/26 发的那篇还没有数据。
import { insert, rng, eachDay, addDays, iso, type SeedModule } from './lib.ts'
import { ACCOUNT, PILLARS, NOTES, TOPICS, SCHEDULE, DRAFTS, ASSETS, CHAT, type Tier } from './content-data.ts'
import { seedContentCenter, CENTER_TABLES } from './content-center.ts'

const STATS_DATE = '2026-10-25'
const R = rng(1260)

type Range = [number, number]
const TIERS: Record<Tier, { imp: Range; ctr: Range; like: Range; save: Range; cmt: Range; share: Range; fol: Range }> = {
  hit: { imp: [150000, 190000], ctr: [0.105, 0.12], like: [0.075, 0.09], save: [0.11, 0.14], cmt: [0.011, 0.014], share: [0.009, 0.012], fol: [0.018, 0.022] },
  good: { imp: [26000, 45000], ctr: [0.1, 0.115], like: [0.055, 0.07], save: [0.075, 0.1], cmt: [0.008, 0.011], share: [0.005, 0.008], fol: [0.01, 0.014] },
  normal: { imp: [7000, 15000], ctr: [0.085, 0.105], like: [0.045, 0.06], save: [0.05, 0.07], cmt: [0.006, 0.009], share: [0.003, 0.005], fol: [0.006, 0.009] },
  low: { imp: [2600, 5200], ctr: [0.065, 0.085], like: [0.035, 0.045], save: [0.03, 0.045], cmt: [0.004, 0.007], share: [0.002, 0.004], fol: [0.003, 0.006] },
}
const pick = ([a, b]: Range) => R.between(a, b)

/** 投流那部分的点赞率、评论率（按内容支柱；收藏率固定 5%，见下） */
const RP = rng(1263)
const PAID_RATES: Record<string, { like: Range; cmt: Range }> = {
  pl_gear: { like: [0.052, 0.066], cmt: [0.006, 0.009] }, // 茶具种草：点赞、评论都多
  pl_office: { like: [0.042, 0.052], cmt: [0.004, 0.006] },
  pl_week: { like: [0.036, 0.046], cmt: [0.003, 0.005] },
  pl_new: { like: [0.022, 0.03], cmt: [0.0015, 0.003] }, // 试喝、活动预告：推来的人不太互动
}
/** 知识库里有代表作卡片的几篇（卡片写了合计的点赞、评论，不能变）：07 26 20 38 投过流 */
const CARD_TOTALS = new Set([7, 20, 26, 38])

/** 刚发不久的笔记，数据还在涨：按发布到截至日的天数打折 */
function ageFactor(publishedAt: string) {
  const days = Math.round((new Date(`${STATS_DATE}T23:59:00`).getTime() - new Date(publishedAt).getTime()) / 864e5)
  return days <= 0 ? 0.35 : days === 1 ? 0.7 : days === 2 ? 0.88 : 1
}

function seed() {
  // 账号与粉丝
  insert('xhs_account', { ...ACCOUNT, updated_at: iso(ACCOUNT.updated_at) })
  PILLARS.forEach(([id, name, description], i) => insert('content_pillars', { id, name, description, sort: i }))

  const gainedByDay = new Map<string, number>()
  const addGain = (date: string, n: number) => gainedByDay.set(date, (gainedByDay.get(date) ?? 0) + n)

  NOTES.forEach((n, i) => {
    const id = `xn_${String(i + 1).padStart(2, '0')}`
    insert('xhs_notes', {
      id, title: n.title, kind: n.kind, published_at: n.at, pillar_id: n.pillar, cover_desc: n.coverDesc, cover_text: n.cover,
      summary: n.summary, tags: JSON.stringify(n.tags), boosted: n.boost ? 1 : 0,
    })
    if (n.at.slice(0, 10) > STATS_DATE) return // 还没有数据
    const t = TIERS[n.tier]
    const f = ageFactor(n.at)
    const imp = Math.round(pick(t.imp) * f)
    const reads = Math.round(imp * pick(t.ctr))
    const fol = Math.round(reads * pick(t.fol))
    const organic = {
      note_id: id, traffic: '自然', impressions: imp, reads, likes: Math.round(reads * pick(t.like)), saves: Math.round(reads * pick(t.save)),
      comments: Math.round(reads * pick(t.cmt)), shares: Math.round(reads * pick(t.share)), new_followers: fol, spend: 0, stats_date: STATS_DATE,
    }
    let paidFol = 0
    let paid: typeof organic | null = null
    if (n.boost) {
      const pImp = Math.round(n.boost * R.between(45, 65) * f)
      const pReads = Math.round(pImp * R.between(0.05, 0.075))
      paidFol = Math.round(pReads * R.between(0.008, 0.012))
      // 投流那部分：收藏率按知识库《投流只放大不救选题》保持在 5% 上下（那条规律就是从这里看出来的）；
      // 点赞、评论、转发按内容类型各篇不同（种草类高、活动预告低），用单独的伪随机数，不影响上面的自然流量
      const r = PAID_RATES[n.pillar] ?? PAID_RATES.pl_office
      const p = {
        likes: Math.round(pReads * RP.between(...r.like)), comments: Math.round(pReads * RP.between(...r.cmt)), shares: Math.round(pReads * RP.between(0.0015, 0.004)),
      }
      // 有代表作卡片的几篇，卡片里写的是“自然 + 投流”的合计：投流多分走的点赞、评论从自然里扣，合计不变
      if (CARD_TOTALS.has(i + 1)) {
        organic.likes += Math.round(pReads * 0.04) - p.likes
        organic.comments += Math.round(pReads * 0.004) - p.comments
      }
      paid = {
        note_id: id, traffic: '投流', impressions: pImp, reads: pReads, likes: p.likes, saves: Math.round(pReads * 0.05),
        comments: p.comments, shares: p.shares, new_followers: paidFol, spend: Math.round(n.boost * f), stats_date: STATS_DATE,
      }
    }
    insert('xhs_note_stats', organic)
    if (paid) insert('xhs_note_stats', paid)
    // 涨粉摊到发布后的 4 天里
    const d0 = n.at.slice(0, 10)
    ;[0.5, 0.25, 0.15, 0.1].forEach((w, k) => { const d = addDays(d0, k); if (d <= STATS_DATE) addGain(d, (fol + paidFol) * w) })
  })

  // 粉丝每天：近 60 天（8/27—10/25），最后一天正好 12600
  const days = eachDay('2026-08-27', STATS_DATE)
  const rows = days.map((date) => {
    const gained = Math.round(R.between(7, 15) + (gainedByDay.get(date) ?? 0))
    const lost = Math.round(R.between(2, 7))
    return { date, gained, lost }
  })
  let followers = ACCOUNT.followers - rows.reduce((a, r) => a + r.gained - r.lost, 0)
  for (const r of rows) {
    followers += r.gained - r.lost
    insert('xhs_followers_daily', { date: r.date, followers, gained: r.gained, lost: r.lost })
  }

  TOPICS.forEach(([id, date, title, source, reason, ref, pillar, status], i) => insert('xhs_topics', { id, date, title, source, reason, ref, pillar_id: pillar, status, sort: i }))
  for (const d of DRAFTS) {
    insert('xhs_drafts', {
      id: d.id, title: d.title, body: d.body, tags: JSON.stringify(d.tags), cover_text: d.coverText, cover_asset_id: d.cover, pillar_id: d.pillar,
      topic_id: d.topic, status: d.status, check_note: d.check, created_at: iso(d.created), updated_at: iso(d.updated),
    })
  }
  SCHEDULE.forEach(([date, time, title, pillar, status, link, memo], i) => insert('xhs_schedule', {
    id: `sc_${String(i + 1).padStart(2, '0')}`, date, time, title, pillar_id: pillar, status,
    note_id: link.note ? `xn_${String(link.note).padStart(2, '0')}` : null, draft_id: link.draft ?? null, topic_id: link.topic ?? null,
    owner: '小艾', memo: memo ?? null,
  }))
  ASSETS.forEach(([id, kind, name, description, usage]) => insert('xhs_assets', { id, kind, name, description, usage, file: null, created_at: iso('2026-09-01') }))
  CHAT.forEach(([draft, role, text, at], i) => insert('content_chat', { id: `ch_${i + 1}`, draft_id: draft, role, text, at }))
  // 内容中心（013）：一篇从选题到发布是同一条、稿件版本、创作对话、每天的累计、复盘（E3，2026-10-10）
  seedContentCenter()
}

export const content: SeedModule = {
  name: 'content',
  tables: [...CENTER_TABLES, 'content_chat', 'xhs_schedule', 'xhs_drafts', 'xhs_topics', 'xhs_note_stats', 'xhs_notes', 'xhs_followers_daily', 'content_pillars', 'xhs_assets', 'xhs_account'],
  seed,
}
