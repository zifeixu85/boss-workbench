// 小红书内容中心（013_content_center）的种子：一篇从选题到发布是同一条（xhs_pieces）、稿件版本、预先写好的创作对话、
// 已发笔记每天的累计、每周复盘、对标收藏、后台任务。归属：内容模块（E3，2026-10-10）。
// 由 seed/content.ts 在写完笔记和数据之后调用；用自己的伪随机种子，不影响笔记数据（作品索引里的数和数据库对得上）。
import { all, get } from '../db.ts'
import { insert, rng, addDays, iso } from './lib.ts'
import { NOTES, TOPICS } from './content-data.ts'
import { NOTE_BODIES, PILLAR_TAGS, NOTE_SOURCES, PIPELINE_DRAFTS, OTHER_PIECES, TODAY_TOPIC_EDITS, TODAY_TOPIC_ANGLES, BENCHMARKS, REVIEW_TEXT, COMMENTS, type SeedDraft } from './content-center-data.ts'

const STATS_DATE = '2026-10-25'
const R = rng(2710)
/** 每天早上出选题的那次后台任务（Codex 定时任务 07:00 开始）；10/25 那天还没有工作台，没有记录 */
const TOPIC_JOB: Record<string, string> = { '2026-10-27': 'job_topics_1027', '2026-10-26': 'job_topics_1026' }
const noteId = (i: number) => `xn_${String(i).padStart(2, '0')}`
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 864e5)

/** 封面模板：一周搭配用茶单日历，茶具用三宫格或大字，新品用陶炉垫图 */
function coverFor(pillar: string, title: string) {
  if (pillar === 'pl_week') return { template: 'a_cover4', pad: 'a_pad1', tone: '米白' }
  if (pillar === 'pl_gear') return { template: /拿法|动作|出汤/.test(title) ? 'a_cover2' : 'a_cover1', pad: /公道杯|玻璃|银针/.test(title) ? 'a_pad2' : 'a_pad1', tone: '茶绿' }
  if (pillar === 'pl_new') return { template: 'a_cover1', pad: /岩茶/.test(title) ? 'a_pad4' : 'a_pad5', tone: '暖棕' }
  if (/加班|保温杯|晚/.test(title)) return { template: 'a_cover1', pad: 'a_pad3', tone: '暖棕' }
  if (/开会|会议/.test(title)) return { template: 'a_cover1', pad: 'a_pad4', tone: '雾蓝' }
  return { template: 'a_cover1', pad: 'a_pad1', tone: '米白' }
}

/** 从正文里拆出图片页：1. 2. 3. 的步骤、“周一 …”这种清单、“xx：…”这种要点，最多 5 张内页 */
function pagesFrom(cover: string, body: string) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  const steps = lines.filter((l) => /^(\d+\.|周[一二三四五六日]|早上|中午|晚上|[^\s：:]{1,6}[：:])/.test(l) && !/[？?]$/.test(l))
  const pages: { role: '封面' | '内页'; text: string }[] = [{ role: '封面', text: cover.replace(/｜/g, '\n') }]
  const inner = (steps.length >= 2 ? steps : lines.slice(0, 3)).flatMap((l) => (l.includes('｜') && !/^周.\s.*｜.*｜/.test(l) ? [l] : l.split(/｜(?=周)/)))
  for (const l of inner.slice(0, 5)) {
    const t = l.replace(/^\d+\.\s*/, '').replace(/[：:]\s*/, '\n').replace(/｜/, '\n')
    pages.push({ role: '内页', text: t.length > 34 ? `${t.slice(0, 32)}…` : t })
  }
  return pages
}

function merged(base: SeedDraft, patch: Partial<SeedDraft>): SeedDraft { return { ...base, ...patch } }

export function seedContentCenter() {
  const T = (s: string) => iso(s)

  // ① 已发的 41 篇：每篇一条 piece（已发布）+ 一个“导入”版本（后台导出的原文）
  NOTES.forEach((n, k) => {
    const i = k + 1
    const id = `p_${noteId(i)}`
    const topic = i === 41 ? TOPICS.find((t) => t[0] === 'tp_1026_01') : undefined
    const by = topic ? 'Codex 定时任务' : '小艾'
    const created = addDays(n.at.slice(0, 10), -(1 + (i % 3)))
    insert('xhs_pieces', {
      id, title: n.title, angle: n.summary, format: n.kind, pillar_id: n.pillar, source: NOTE_SOURCES[i] ?? '自己想的', reason: topic?.[4] ?? null, ref: topic?.[5] ?? null,
      status: '已发布', topic_date: topic ? topic[1] : null, job_id: topic ? TOPIC_JOB[topic[1]] ?? null : null, created_by: by, scheduled_date: n.at.slice(0, 10), scheduled_time: n.at.slice(11, 16),
      published_at: n.at, note_id: noteId(i), sort: i, created_at: T(`${created}T10:00`), updated_at: T(n.at),
    })
    const body = NOTE_BODIES[i] ?? n.summary
    const tags = [...new Set([...n.tags, ...PILLAR_TAGS[n.pillar]])].slice(0, 6)
    const data = { format: n.kind, title: n.title, titles: [n.title], cover_text: n.cover, cover: coverFor(n.pillar, n.title), pages: pagesFrom(n.cover, body), body: n.kind === '视频' ? `（视频笔记）\n${body}` : body, tags, checks: [] }
    insert('xhs_versions', { id: `v_${noteId(i)}_1`, piece_id: id, version: 1, data: JSON.stringify(data), origin: '导入', author: '小红书后台导出', note: '发出去的原文', created_at: T(n.at) })
  })

  // ② 今天早上（和前两天）的选题 → 灵感池；前两天的有的已经写成稿、排了期
  const doneTopics: Record<string, string> = { tp_1026_01: 'p_xn_41', tp_1026_02: 'p_d_1', tp_1026_03: 'p_d_2', tp_1025_01: 'p_tp_1025_01' }
  const pieceOfTopic = new Set(['tp_1026_04', 'tp_1026_05', 'tp_1025_02'])
  TOPICS.forEach(([tid, date, title, source, reason, ref, pillar], k) => {
    if (doneTopics[tid] || pieceOfTopic.has(tid) || date !== '2026-10-27') return
    const e = TODAY_TOPIC_EDITS[tid] ?? {}
    insert('xhs_pieces', {
      id: `p_${tid}`, title: e.title ?? title, angle: e.angle ?? TODAY_TOPIC_ANGLES[tid] ?? null, format: '图文', pillar_id: pillar, source, reason: e.reason ?? reason, ref,
      warn: e.warn ?? null, status: '灵感池', topic_date: date, job_id: TOPIC_JOB[date] ?? null, created_by: 'Codex 定时任务', sort: k + 1, created_at: T('2026-10-27T07:03'), updated_at: T('2026-10-27T07:03'),
    })
  })

  // ③ 正在做的四篇：d_1（今天发）、d_2（明天发）、d_3（新品预热）、11/1 的一周搭配
  const pipeline: [string, string, string, string, string, string, string | null, string, string | null, string][] = [
    // [id, 状态, 排期日, 时间, 支柱, 来源, 选题ID, 起点, 备注, 角度]
    ['p_d_1', '待发布', '2026-10-27', '12:10', 'pl_office', '同行爆款', 'tp_1026_02', '选题', '定稿了，发之前等林总看一眼', '开会前只有 5 分钟，工位上没茶盘也能泡一杯不苦的岩茶'],
    ['p_d_2', '写稿中', '2026-10-28', '18:30', 'pl_gear', '评论区问题', 'tp_1026_03', '选题', '还差一段 15 秒手部特写', '评论区教的第 4 个拿法，试了一周来交作业'],
    ['p_d_3', '写稿中', '2026-10-30', '12:10', 'pl_new', '自己想的', null, '一句话', '新品预热第一篇；不写名字和上线日期；发前给林总看', '天冷了、想喝点热的：一壶慢慢煮的白茶'],
    ['p_tp_1025_01', '待发布', '2026-11-01', '12:10', 'pl_week', '热点和节气', 'tp_1025_01', '选题', null, '降温版：五格就五格，每格一句为什么'],
  ]
  for (const [id, status, date, time, pillar, source, tid, startKind, memo, angle] of pipeline) {
    const sd = PIPELINE_DRAFTS[id]
    const topic = tid ? TOPICS.find((t) => t[0] === tid) : undefined
    const first = sd.versions[0].at
    const start = startKind === '一句话'
      ? { kind: '一句话', label: '小艾在创作页说的', text: sd.messages[0].text }
      : { kind: '选题', ref: tid, label: `${Number(topic![1].slice(5, 7))}/${Number(topic![1].slice(8, 10))} 早上的选题`, text: topic![4] }
    let draft = sd.base
    const last = sd.versions.reduce((acc, v) => merged(acc, v.patch), sd.base)
    insert('xhs_pieces', {
      id, title: last.title, angle, format: '图文', pillar_id: pillar, source, reason: topic?.[4] ?? '11/5 新品上线前的预热第一篇；评论区有人问秋冬有没有新茶。', ref: topic?.[5] ?? null,
      warn: id === 'p_d_3' ? '上线前不说名字和上线日期；发之前给林总看' : null, status, topic_date: topic?.[1] ?? null, job_id: topic ? TOPIC_JOB[topic[1]] ?? null : null, created_by: topic ? 'Codex 定时任务' : '小艾',
      scheduled_date: date, scheduled_time: time, memo, start: JSON.stringify(start), sort: 0,
      created_at: T(topic ? `${topic[1]}T07:03` : addDays(first.slice(0, 10), 0) + 'T19:50'), updated_at: T(sd.versions.at(-1)!.at),
    })
    sd.versions.forEach((v, k) => {
      draft = merged(draft, v.patch)
      insert('xhs_versions', {
        id: `v_${id}_${k + 1}`, piece_id: id, version: k + 1, data: JSON.stringify({ format: '图文', ...draft }), origin: v.origin, author: v.author, note: v.note,
        message_id: v.msg ?? null, created_at: T(v.at),
      })
    })
    for (const m of sd.messages) {
      insert('xhs_messages', {
        id: m.id, piece_id: id, role: m.role, author: m.author, text: m.text, status: 'done', kind: m.options ? 'options' : 'chat',
        options: m.options ? JSON.stringify(m.options) : null, refs: m.refs ? JSON.stringify(m.refs) : null, files_read: m.files ? JSON.stringify(m.files) : null,
        version: m.version ?? null, duration_ms: m.ms ?? null, origin: '示例', created_at: T(m.at),
      })
    }
  }

  // ④ 已选、已放弃和别的灵感
  for (const [id, title, pillar, source, status, date, time, reason, ref, warn, by, topicDate, memo] of OTHER_PIECES) {
    const fromReview = by.includes('每周复盘')
    insert('xhs_pieces', {
      id, title, format: '图文', pillar_id: pillar, source, reason, ref, warn, status, topic_date: topicDate, job_id: topicDate ? TOPIC_JOB[topicDate] ?? null : null, created_by: by, scheduled_date: date, scheduled_time: time, memo,
      sort: 20, created_at: T(topicDate ? `${topicDate}T07:03` : fromReview ? REVIEW_TEXT.w1020.at : '2026-10-26T10:30'), updated_at: T(fromReview ? REVIEW_TEXT.w1020.at : '2026-10-26T18:00'),
    })
  }

  // ⑤ 已发笔记每天的累计（发布后第 1—30 天，自然 / 投流分开），总数和 xhs_note_stats 对得上
  const stats = all<{ note_id: string; traffic: string; impressions: number; reads: number; likes: number; saves: number; comments: number; new_followers: number; spend: number }>('SELECT * FROM xhs_note_stats')
  const pub = new Map(NOTES.map((n, k) => [noteId(k + 1), n]))
  for (const s of stats) {
    const n = pub.get(s.note_id)!
    const d0 = n.at.slice(0, 10)
    const age = daysBetween(d0, STATS_DATE) + 1
    const span = Math.min(age, 30)
    const tau = s.traffic === '投流' ? 1.1 : n.tier === 'hit' ? 3.6 : n.tier === 'good' ? 2.6 : 2.0
    const g = (d: number) => (s.traffic === '投流' ? 1 - Math.exp(-d / tau) : 1 - Math.exp(-d / tau) + 0.0045 * d)
    const scale = g(age)
    const wobble = R.between(0.96, 1.04)
    for (let day = 1; day <= span; day++) {
      const f = Math.min(1, (g(day) / scale) * (day === age ? 1 : wobble))
      const k = (v: number) => Math.round(v * f)
      insert('xhs_note_daily', {
        note_id: s.note_id, traffic: s.traffic, day, date: addDays(d0, day - 1), impressions: k(s.impressions), reads: k(s.reads), likes: k(s.likes), saves: k(s.saves),
        comments: k(s.comments), new_followers: k(s.new_followers), spend: s.traffic === '投流' ? Math.round(s.spend * Math.min(1, day / Math.min(3, age))) : 0,
      })
    }
  }

  // ⑥ 对标收藏
  for (const [id, account, title, cover, pad, likes, saves, comments, structure, borrow, saved] of BENCHMARKS) {
    insert('xhs_benchmarks', { id, account, title, cover_text: cover, pad, likes, saves, comments, structure, borrow, saved_at: T(`${saved}T21:00`) })
  }

  // ⑦ 后台任务（示例数据）：每天 07:00 出选题、每周二 07:30 每周复盘（Codex 定时任务，时间见知识库 01-AI协作/工具与账号.md）
  insert('xhs_jobs', { id: 'job_topics_1027', kind: '出选题', ref: null, who: 'Codex 定时任务', status: 'done', result_count: 10, duration_ms: 201_000, started_at: T('2026-10-27T07:00'), finished_at: T('2026-10-27T07:03'), origin: '示例' })
  insert('xhs_jobs', { id: 'job_topics_1026', kind: '出选题', ref: null, who: 'Codex 定时任务', status: 'done', result_count: 5, duration_ms: 142_000, started_at: T('2026-10-26T07:00'), finished_at: T('2026-10-26T07:02'), origin: '示例' })
  insert('xhs_jobs', { id: 'job_review_1020', kind: '复盘', ref: '2026-10-20', who: REVIEW_TEXT.w1020.by, status: 'done', result_count: 2, duration_ms: REVIEW_TEXT.w1020.ms, started_at: T(REVIEW_TEXT.w1020.started), finished_at: T(REVIEW_TEXT.w1020.at), origin: '示例' })

  // ⑧ 几条评论（评论区问题是选题来源；单篇手机预览里显示）
  COMMENTS.forEach(([i, author, text, likes, at, reply, topic], k) => insert('xhs_comments', { id: `cm_${k + 1}`, note_id: noteId(i), author, text, likes, at, reply, topic }))

  seedReviews()
}

// ---------- 每周复盘：文字里的数字按数据库现算 ----------
type S = { reads: number; saves: number; likes: number; fol: number; spend: number; preads: number; psaves: number }
function weekStats(from: string, to: string) {
  const rows = all<{ id: string; title: string; d: string; traffic: string; reads: number; saves: number; likes: number; new_followers: number; spend: number }>(
    `SELECT n.id, n.title, substr(n.published_at, 1, 10) AS d, s.traffic, s.reads, s.saves, s.likes, s.new_followers, s.spend FROM xhs_notes n JOIN xhs_note_stats s ON s.note_id = n.id
     WHERE substr(n.published_at, 1, 10) BETWEEN :from AND :to`, { from, to })
  const by = new Map<string, S>()
  for (const r of rows) {
    const cur = by.get(r.id) ?? { reads: 0, saves: 0, likes: 0, fol: 0, spend: 0, preads: 0, psaves: 0 }
    if (r.traffic === '自然') Object.assign(cur, { reads: r.reads, saves: r.saves, likes: r.likes })
    else Object.assign(cur, { spend: r.spend, preads: r.reads, psaves: r.saves })
    cur.fol += r.new_followers
    by.set(r.id, cur)
  }
  const posts = get<{ n: number }>('SELECT COUNT(*) AS n FROM xhs_notes WHERE substr(published_at, 1, 10) BETWEEN :from AND :to', { from, to })!.n
  const tot = [...by.values()].reduce((a, s) => ({ reads: a.reads + s.reads, saves: a.saves + s.saves, likes: a.likes + s.likes, fol: a.fol + s.fol, spend: a.spend + s.spend, preads: a.preads + s.preads, psaves: a.psaves + s.psaves }), { reads: 0, saves: 0, likes: 0, fol: 0, spend: 0, preads: 0, psaves: 0 })
  return { by, posts, tot, rate: tot.reads ? Math.round((tot.saves / tot.reads) * 1000) / 10 : 0 }
}
const n = (v: number) => v.toLocaleString('zh-CN')
const rate = (s: S) => (s.reads ? (Math.round((s.saves / s.reads) * 1000) / 10).toFixed(1) : '—')

function seedReviews() {
  // 账号中位数：一篇一篇的自然收藏率取中位数（偶数篇取中间两篇的平均），和内容中心页面上的算法一样
  const allRates = all<{ r: number }>("SELECT saves * 100.0 / reads AS r FROM xhs_note_stats WHERE traffic = '自然' AND reads > 0").map((x) => x.r)
  const medRate = (Math.round(median(allRates) * 10) / 10).toFixed(1)
  const g = (w: ReturnType<typeof weekStats>, i: number) => w.by.get(noteId(i)) ?? { reads: 0, saves: 0, likes: 0, fol: 0, spend: 0, preads: 0, psaves: 0 }
  const one = (i: number, d: string) => g(weekStats(d, d), i)

  // 每周二 07:30 的每周复盘里写的小红书这一段：周二到下周一（10/20—10/26），和知识库那份周复盘同一个范围
  const w = weekStats('2026-10-20', '2026-10-26')
  const withData = w.by.size
  const s35 = g(w, 35), s37 = g(w, 37), s38 = g(w, 38), s39 = g(w, 39)
  const s34 = one(34, '2026-10-19'), s16 = one(16, '2026-09-18')
  const share35 = Math.round((s35.preads / (s35.reads + s35.preads)) * 100)
  const paidRate35 = (Math.round((s35.psaves / s35.preads) * 1000) / 10).toFixed(1)
  const t = REVIEW_TEXT.w1020
  insert('xhs_reviews', {
    id: 'rv_1020', week: '2026-10-20', date_from: '2026-10-20', date_to: '2026-10-26',
    summary: `这周（10/20—10/26）发了 ${w.posts} 篇，${withData} 篇有数据：阅读合计 ${n(w.tot.reads + w.tot.preads)}（自然 ${n(w.tot.reads)}），收藏 ${n(w.tot.saves + w.tot.psaves)}，涨粉 ${w.tot.fol}；投流 ${n(w.tot.spend)} 元。自然阅读最高的是「霜降这周」，「一周喝茶搭配」这一栏连着两周都是自然阅读最高；阅读合计最高的是公道杯那篇，但 ${share35}% 来自投流。10/24、10/25 两篇发出不到 3 天，10/26 那篇还没有数据，只供参考。`,
    worked: JSON.stringify([
      `「霜降这周：一壶热的白茶」发出 3 天自然阅读 ${n(s38.reads)}、自然收藏率 ${rate(s38)}%（账号中位数 ${medRate}%）：节气加一壶热茶，正好赶上降温`,
      `「一周喝茶搭配」跟着降温写，连着两周是自然阅读最高的一栏（上周「降温这周的喝茶搭配」自然阅读 ${n(s34.reads)}）`,
    ]),
    change: JSON.stringify([
      `「玻璃公道杯怎么选不烫手」投了 ${n(s35.spend)} 元，投流带来阅读 ${n(s35.preads)}，这部分收藏率 ${paidRate35}%；自然收藏率 ${rate(s35)}%（账号中位数 ${medRate}%）。选题本身是好的，投流没多带来收藏。公道杯这几天还在退款，先别再推`,
      `「周日品茶会预告」自然阅读只有 ${n(s39.reads)}：写成了通知（时间、地点、限几位），没给人收藏的理由`,
      `「开会前一分钟：飘逸杯岩茶」视频自然阅读 ${n(s37.reads)}，拍视频比图文费时，效果没更好`,
    ]),
    ideas: JSON.stringify([
      { title: '霜降之后：一壶热白茶的三种喝法', reason: '霜降那篇自然阅读是这周最高的，降温还在继续', pillar: '一周喝茶搭配', piece_id: 'p_rv43_1' },
      { title: '品茶会回顾：三款白茶，大家选了哪款', reason: '预告写成通知没人收藏；回顾写“大家怎么选”，读的人能拿去用。10/31 停业前那场也能这么写', pillar: '新品试喝', piece_id: null },
      { title: '工位上的热茶：保温杯和盖碗怎么选', reason: '天冷了，工位上从冷泡换回热茶；10/25 写的是出差带哪个，工位上怎么选还没写过', pillar: '办公室 3 分钟泡茶', piece_id: null },
    ]),
    learnings: JSON.stringify([
      {
        rule: '活动预告别写成通知：写清来了能喝到什么、学到什么，给人收藏的理由',
        evidence: `品茶会预告自然阅读 ${n(s39.reads)}、自然收藏率 ${rate(s39)}%（账号中位数 ${medRate}%）；9/18 中秋试喝写的是喝起来怎样，自然阅读 ${n(s16.reads)}、收藏率 ${rate(s16)}%`,
        scope: '门店活动、品茶会预告；样本 2 篇，只供参考',
        prior: '方法卡《新品预热不说名字》的“别这样做”里写过一句“写成通知，读的人没理由收藏”，当时是推测；这周品茶会预告是第一个例子',
        prior_path: '05-方法与判断/小红书内容/新品预热不说名字.md',
        status: '待定',
      },
      {
        rule: '一周喝茶搭配跟着天气写（降温、霜降），比跟着假期、星期几写好',
        evidence: `跟着天气的：霜降这周 ${n(s38.reads)}、降温这周 ${n(s34.reads)}、降温前的十月 ${n(one(27, '2026-10-09').reads)}；跟着假期和星期几的：国庆七天 ${n(one(22, '2026-09-29').reads)}、节后第一周 ${n(one(25, '2026-10-06').reads)}、周三下午 ${n(one(31, '2026-10-14').reads)}（都是自然阅读）`,
        scope: '一周喝茶搭配；样本 6 篇',
        prior: '没有专门写过。代表作《早白茶、午岩茶、晚花草》说的是“排法要排满”，没说跟着天气',
        prior_path: '11-内容与作品/代表作/XHS-2026-10-早白茶午岩茶晚花草.md',
        status: '待定',
      },
    ]),
    inputs: JSON.stringify({ posts: w.posts, with_data: withData, organic_reads: w.tot.reads, organic_saves: w.tot.saves, total_reads: w.tot.reads + w.tot.preads, total_saves: w.tot.saves + w.tot.psaves, new_followers: w.tot.fol, save_rate: w.rate, spend: w.tot.spend, median_rate: Number(medRate), through: STATS_DATE }),
    written_by: t.by, origin: '示例', duration_ms: t.ms, created_at: iso(t.at), updated_at: iso(t.at),
  })
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** --only content 重建时先清空的表（按删除顺序） */
export const CENTER_TABLES = ['xhs_comments', 'xhs_messages', 'xhs_versions', 'xhs_note_daily', 'xhs_reviews', 'xhs_benchmarks', 'xhs_jobs', 'xhs_pieces']
