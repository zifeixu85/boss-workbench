// 示例数据里“小红书 · 笔记数据导出”这个数据源在数据源模块几张表里的行：数据源本身、字段对照、导入规则、导入记录，
// 还有 Codex 定时任务那几条和小红书有关的运行记录，以及放进导入文件夹的两份原件。全部虚构（ABC茶社）。
// 现状（10/27 早上 8 点）：平台 10/26 改了导出表的列名（曝光→展现量、阅读→观看量、新增关注→涨粉数，还多了人均观看时长），
//   07:50 导入时字段对不上，同一次导出的粉丝数据也一起没导。字段对照表里放了 Codex 定时任务 07:51 给的建议，等人确认；
//   原件 笔记数据_20261026.csv、粉丝数据_20261026.csv 在导入文件夹里，确认后能在数据源抽屉里“按新规则重新导入”（能撤销）。
// 什么时候写：这个模块的示例数据（seed/content.ts 的最后）；数据源模块 import-reset 重灌之后（导入目标的 seed）。
// 可以重复跑：先删掉自己上次写的行。归属：小红书内容模块。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, ROOT } from '../../../db.ts'
import { insert, eachDay, addDays, rng, weekdayOf } from '../../../seed/lib.ts'
import { createRule, type NewRule } from '../../data/rules.ts'
import { toCsv } from '../../data/csv.ts'

const SOURCE = 'src_xhs_notes'
const DIR = '工作台/导入/小红书笔记'
const NOTES_FILE = `${DIR}/笔记数据_20261026.csv`
const FANS_FILE = `${DIR}/粉丝数据_20261026.csv`
/** 种子放进导入文件夹的文件（彩排复原时不算“多出来的”） */
export const SEEDED_FILES = [NOTES_FILE, FANS_FILE]

type S = { id: string; name: string; kind: string; feeds: string; method: string; schedule: string; owner: string; status: string; last: string | null; ok: string | null; next: string | null; through: string | null; note?: string; dir: string }
const SOURCE_ROW: S =
  { id: 'src_xhs_notes', name: '小红书 · 笔记数据导出', kind: '平台导出', feeds: '内容：每篇笔记的曝光、阅读、点赞、收藏、评论、涨粉（自然 / 投流分开）；粉丝每天的变化', method: '小艾每天 07:45 前从专业号后台导出“笔记数据”“粉丝数据”两张表，放进 工作台/导入/小红书笔记/；定时任务 07:50 按导入规则读取', schedule: '每天 07:50', owner: '小艾', status: '失败', last: '2026-10-27T07:50', ok: '2026-10-26T07:48', next: '2026-10-28T07:50', through: '2026-10-25', note: '平台 10/26 改了笔记数据表的列名：曝光→展现量、阅读→观看量、新增关注→涨粉数，还多了“人均观看时长”；07:50 导入时对不上，同一次导出的粉丝数据也一起没导。Codex 07:51 给了对照建议，等你确认后按新规则重新导入', dir: '工作台/导入/小红书笔记' }

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const plusMin = (day: string, hm: string, m: number) => {
  const d = new Date(`${day}T${hm}:00`)
  d.setMinutes(d.getMinutes() + m)
  return `${day}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
type Run = { source: string; start: string; end?: string; status: string; file?: string; date?: string; total?: number; ok?: number; failed?: number; actor: string; message: string; detail?: unknown }

/** 到某天为止发了几篇笔记、其中几篇投过流（导出表里投流的单独一行） */
function notesUpTo(date: string) {
  const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM xhs_notes WHERE substr(published_at, 1, 10) <= :d", { d: date })?.n ?? 0
  const b = get<{ n: number }>("SELECT COUNT(DISTINCT s.note_id) AS n FROM xhs_note_stats s JOIN xhs_notes x ON x.id = s.note_id WHERE s.traffic = '投流' AND substr(x.published_at, 1, 10) <= :d", { d: date })?.n ?? 0
  return { notes: n, rows: n + b }
}

function runsOf(sample: Record<string, string>): Run[] {
  const out: Run[] = []
  // 小红书笔记数据：每天 07:48 前后，行数 = 到那天为止的笔记篇数 + 投过流的篇数
  const nt = ['07:48', '07:48', '07:49', '07:48', '07:50', '07:48']
  eachDay('2026-10-21', '2026-10-26').forEach((day, i) => {
    const dd = addDays(day, -1)
    const c = notesUpTo(dd)
    out.push({ source: 'src_xhs_notes', start: `${day}T${nt[i]}`, end: plusMin(day, nt[i], 1), status: '成功', file: `工作台/导入/小红书笔记/笔记数据_${dd.replaceAll('-', '')}.csv`, date: dd, total: c.rows + 1, ok: c.rows + 1, failed: 0, actor: '定时任务',
      detail: { 表: [['笔记数据', c.rows, '行'], ['粉丝数据', 1, '行']] },
      message: `笔记数据 ${md(dd)}：${c.notes} 篇的累计（${c.rows} 行，投流的单独一行）；粉丝数 1 行` })
  })
  const c26 = notesUpTo('2026-10-26')
  out.push({
    source: 'src_xhs_notes', start: '2026-10-27T07:50', end: '2026-10-27T07:50', status: '失败', file: '工作台/导入/小红书笔记/笔记数据_20261026.csv', date: '2026-10-26',
    total: c26.rows + 1, ok: 0, failed: c26.rows + 1, actor: '定时任务', message: '笔记数据的字段对不上：找不到“曝光”“阅读”“新增关注”三列，多了 4 列没见过的；同一次的粉丝数据也先没导',
    detail: {
      缺少的列: ['曝光', '阅读', '新增关注'], 多出来的列: ['展现量', '观看量', '涨粉数', '人均观看时长'], 样例行: sample,
      建议: '平台改了笔记数据的列名（粉丝数据的表头没变）。Codex 07:51 给了字段对照建议：在这个数据源的“等你确认”里确认后，点“按新规则重新导入”，笔记数据和粉丝数据一起导进来。',
    },
  })
  // Codex 定时任务里和小红书有关的几条：07:00 出选题（07:03 写好，10/26 那天 5 个）；每周二 07:31 写周复盘；07:51 给笔记数据的对照建议
  if (get("SELECT id FROM data_sources WHERE id = 'src_codex'")) {
    eachDay('2026-10-21', '2026-10-27').forEach((day) => {
      const topics = day === '2026-10-26' ? 5 : 10
      out.push({ source: 'src_codex', start: `${day}T07:00`, end: `${day}T07:0${day === '2026-10-26' ? 2 : 3}`, status: '成功', date: day, total: topics, ok: topics, failed: 0, actor: 'Codex 定时任务', message: `出了 ${topics} 个小红书选题，写进当天的灵感池` })
      if (weekdayOf(day) === 2) out.push({ source: 'src_codex', start: `${day}T07:31`, end: `${day}T07:34`, status: '成功', date: addDays(day, -1), total: 1, ok: 1, failed: 0, actor: 'Codex 定时任务', message: '小红书第 43 周复盘写好了（2 条经验待定）' })
    })
  out.push({ source: 'src_codex', start: '2026-10-27T07:51', end: '2026-10-27T07:51', status: '成功', date: '2026-10-26', total: 4, ok: 4, failed: 0, actor: 'Codex 定时任务',
    message: '小红书笔记数据对不上：看了一遍新表头，给了 4 列对照建议（展现量→曝光、观看量→阅读、涨粉数→涨粉，人均观看时长先不导），等你确认' })
  }
  return out
}

// ———— 小红书笔记数据：10/26 那份导出表（新表头）的原件，放进导入文件夹 ————
type Stat = { note_id: string; traffic: string; impressions: number; reads: number; likes: number; saves: number; comments: number; shares: number; new_followers: number }
type NoteRow = { id: string; title: string; kind: string; published_at: string }
/** xn_41 那篇（10/26 12:10 发的）发出来半天的数 */
const FIRST_DAY = { impressions: 5216, reads: 466, likes: 29, saves: 41, comments: 5, shares: 3, new_followers: 6 }

/** 按发布后的天数推一天：自然流量前几天涨得快、后面慢慢涨；投流第 3 天以后基本不涨（和内容模块生成每天累计的曲线一致） */
function nextDay(s: Stat, age: number, r: ReturnType<typeof rng>): Stat {
  const tau = s.traffic === '投流' ? 1.1 : 2.6
  const g = (d: number) => (s.traffic === '投流' ? 1 - Math.exp(-d / tau) : 1 - Math.exp(-d / tau) + 0.0045 * d)
  const f = g(age + 1) / g(age)
  const k = (v: number) => Math.max(v, Math.round(v * f * r.between(0.985, 1.02)))
  return { ...s, impressions: k(s.impressions), reads: k(s.reads), likes: k(s.likes), saves: k(s.saves), comments: k(s.comments), shares: k(s.shares), new_followers: k(s.new_followers) }
}

function notesExport(): { rows: (string | number)[][]; sample: Record<string, string>; ref: { title: string; before: Stat; after: Stat } | null; gain: number } {
  const notes = all<NoteRow>("SELECT id, title, kind, published_at FROM xhs_notes WHERE substr(published_at, 1, 10) <= '2026-10-26' ORDER BY published_at DESC")
  const stats = all<Stat>("SELECT * FROM xhs_note_stats WHERE stats_date = '2026-10-25'")
  const r = rng(261026)
  const c = (n: number) => n.toLocaleString('en-US')
  const rows: (string | number)[][] = [['笔记标题', '发布时间', '笔记类型', '流量来源', '展现量', '观看量', '点赞', '收藏', '评论', '分享', '涨粉数', '人均观看时长']]
  let ref: { title: string; before: Stat; after: Stat } | null = null
  let sample: Record<string, string> = {}
  let gain = 0 // 10/26 这一天笔记带来的涨粉（累计的差）
  for (const n of notes) {
    const own = stats.filter((s) => s.note_id === n.id).sort((a, b) => Number(b.traffic === '自然') - Number(a.traffic === '自然'))
    const list: Stat[] = own.length ? own.map((s) => nextDay(s, Math.round((new Date('2026-10-25T00:00').getTime() - new Date(`${n.published_at.slice(0, 10)}T00:00`).getTime()) / 864e5) + 1, r))
      : [{ note_id: n.id, traffic: '自然', ...FIRST_DAY }]
    for (const s of list) {
      gain += s.new_followers - (own.find((x) => x.traffic === s.traffic)?.new_followers ?? 0)
      const secs = `${Math.round(r.between(14, 32))}秒`
      const row = [n.title, n.published_at.replace('T', ' '), n.kind, s.traffic === '投流' ? '薯条推广' : '自然推荐', c(s.impressions), c(s.reads), s.likes, s.saves, s.comments, s.shares, s.new_followers, secs]
      rows.push(row)
      if (n.id === 'xn_40' && s.traffic === '自然') {
        ref = { title: n.title, before: own.find((x) => x.traffic === '自然')!, after: s }
        sample = Object.fromEntries(rows[0].map((h, i) => [String(h), String(row[i])]))
      }
    }
  }
  return { rows, sample, ref, gain }
}

/** 同一次导出的“粉丝数据”表（表头没改版）：近 7 天，10/26 那天 = 10/25 + 笔记带来的涨粉 + 主页直接关注的几个 − 取关的几个 */
function followersExport(gain: number): (string | number)[][] | null {
  const prev = all<{ date: string; followers: number; gained: number; lost: number }>("SELECT * FROM xhs_followers_daily WHERE date BETWEEN '2026-10-20' AND '2026-10-25' ORDER BY date")
  const last = prev.at(-1)
  if (!last || last.date !== '2026-10-25') return null
  const r = rng(261027)
  const gained = gain + r.int(2, 5)
  const lost = r.int(2, 5)
  return [['日期', '粉丝总数', '新增关注', '取消关注'], ...prev.map((x) => [x.date, x.followers, x.gained, x.lost]), ['2026-10-26', last.followers + gained - lost, gained, lost]]
}

// 字段对照：[文件里的列, 工作台字段, 换算, 样例, 状态, 把握, 理由]
type M = [string, string, string | null, string | null, string | null, string, number | null, string | null]
function mappingRows(ref: ReturnType<typeof notesExport>['ref'], sample: Record<string, string>): M[] {
  const t = ref ? `《${ref.title.split('：')[0]}》` : '同一篇笔记'
  const b = ref?.before
  const a = ref?.after
  const c = (n?: number) => (n ?? 0).toLocaleString('zh-CN')
  return [
    // 小红书笔记数据：平台改了列名，Codex 定时任务 07:51 给了建议，等人确认（理由拿 10/25 前就发了的那篇比，前一天有数）
    ['src_xhs_notes', '笔记标题', 'xhs_notes.title', null, sample.笔记标题 ?? null, '已确认', null, null],
    ['src_xhs_notes', '发布时间', 'xhs_notes.published_at', '“2026-10-25 20:00”换成 2026-10-25T20:00', sample.发布时间 ?? null, '已确认', null, null],
    ['src_xhs_notes', '笔记类型', 'xhs_notes.kind', null, sample.笔记类型 ?? '图文', '已确认', null, null],
    ['src_xhs_notes', '展现量', 'xhs_note_stats.impressions', '去掉千分位逗号', sample.展现量 ?? null, 'AI 建议', 0.95, `就是原来的“曝光”，平台 10/26 改了名：${t}前一天曝光 ${c(b?.impressions)}，这份展现量 ${c(a?.impressions)}，发出第 2 天这么涨是正常的`],
    ['src_xhs_notes', '观看量', 'xhs_note_stats.reads', '去掉千分位逗号', sample.观看量 ?? null, 'AI 建议', 0.9, `就是原来的“阅读”，平台把图文和视频统一叫“观看”：${t}前一天阅读 ${c(b?.reads)}，这份观看量 ${c(a?.reads)}；和展现量的比例约 ${a ? Math.round((a.reads / a.impressions) * 100) : 9}%，和以前的阅读率一致`],
    ['src_xhs_notes', '点赞', 'xhs_note_stats.likes', null, sample.点赞 ?? null, '已确认', null, null],
    ['src_xhs_notes', '收藏', 'xhs_note_stats.saves', null, sample.收藏 ?? null, '已确认', null, null],
    ['src_xhs_notes', '评论', 'xhs_note_stats.comments', null, sample.评论 ?? null, '已确认', null, null],
    ['src_xhs_notes', '分享', 'xhs_note_stats.shares', null, sample.分享 ?? null, '已确认', null, null],
    ['src_xhs_notes', '涨粉数', 'xhs_note_stats.new_followers', null, sample.涨粉数 ?? null, 'AI 建议', 0.86, `就是原来的“新增关注”，只算这篇笔记带来的关注：${t}前一天 ${c(b?.new_followers)}，这份 ${c(a?.new_followers)}，数值范围和以前一致`],
    ['src_xhs_notes', '人均观看时长', null, null, sample.人均观看时长 ?? null, '未匹配', null, '工作台的笔记数据里没有这一项，可以先不导；以后想看，再给小红书数据加一列'],
    ['src_xhs_notes', '流量来源', 'xhs_note_stats.traffic', '含“推广”的记为投流，其余记为自然', sample.流量来源 ?? '自然推荐', '已确认', null, null],
  ]
}

const D = (cols: [string, string | null][], by: string, at: string) => cols.map(([col, field]) => ({ col, field, how: '你选的', by, at }))
type SeedRule = Omit<NewRule, 'amount_unit'> & { key: string }
const RULE: SeedRule =
  {
    key: 'notes', platform: '小红书', report: '专业号 · 笔记数据', channel_id: null, source_id: 'src_xhs_notes', target: 'xhs_note_stats', date_format: 'datetime', created_by: '小艾', created_at: '2026-09-23T09:30',
    last_used_at: '2026-10-26T07:48', use_count: 34, required: [],
    mapping: D([['笔记标题', 'xhs_notes.title'], ['发布时间', 'xhs_notes.published_at'], ['笔记类型', 'xhs_notes.kind'], ['曝光', 'xhs_note_stats.impressions'], ['阅读', 'xhs_note_stats.reads'], ['点赞', 'xhs_note_stats.likes'], ['收藏', 'xhs_note_stats.saves'], ['评论', 'xhs_note_stats.comments'], ['分享', 'xhs_note_stats.shares'], ['新增关注', 'xhs_note_stats.new_followers'], ['流量来源', 'xhs_note_stats.traffic']], '小艾', '2026-09-23T09:30'),
    signature: [], note: null,
  }

export function seedNotesSource() {
  // 先删掉上次写的（--only 重建、import-reset 之后都会再来一遍）
  run("DELETE FROM import_runs WHERE id LIKE 'run_xhs_%'")
  run('DELETE FROM field_mappings WHERE source_id = :s', { s: SOURCE })
  run("DELETE FROM import_rules WHERE id = 'rule_notes'")
  run('DELETE FROM data_sources WHERE id = :s', { s: SOURCE })

  // 数据源：排在门店日报后面（数据源模块的示例按 0、10、20…… 排，这里用 45）
  const s = SOURCE_ROW
  insert('data_sources', {
    id: s.id, name: s.name, kind: s.kind, feeds: s.feeds, method: s.method, schedule: s.schedule, owner: s.owner, status: s.status,
    last_run_at: s.last, last_ok_at: s.ok, next_run_at: s.next, data_through: s.through, note: s.note ?? null, sort: 45, channel_id: null, inbox_dir: s.dir,
  })
  mkdirSync(join(ROOT, DIR), { recursive: true })
  // 10/26 那两份（新表头、导失败的那次）放原件；现场已经导过（数据到了 10/26）就不重写
  const throughNotes = get<{ d: string | null }>('SELECT MAX(stats_date) AS d FROM xhs_note_stats')?.d ?? null
  let exp: ReturnType<typeof notesExport> = { rows: [], sample: {}, ref: null, gain: 0 }
  try { exp = notesExport() } catch { /* 没有内容模块：笔记数据这一块只有记录 */ }
  if (exp.rows.length > 1 && throughNotes === '2026-10-25') {
    writeFileSync(join(ROOT, NOTES_FILE), toCsv(exp.rows))
    let fans: (string | number)[][] | null = null
    try { fans = followersExport(exp.gain) } catch { /* 没有粉丝表 */ }
    if (fans) writeFileSync(join(ROOT, FANS_FILE), toCsv(fans))
  } else if (throughNotes && throughNotes > '2026-10-25') console.warn(`  笔记数据已经导到 ${throughNotes}：没重写 ${NOTES_FILE}（先 import-reset 撤销现场那次导入）`)

  const rule = createRule({ ...RULE, id: 'rule_notes', amount_unit: '元', origin: '示例', signature: RULE.mapping.map((m) => m.col) }, { quiet: true })

  const runs = runsOf(exp.sample).sort((a, b) => a.start.localeCompare(b.start))
  runs.forEach((r, i) => insert('import_runs', {
    id: `run_xhs_${String(i + 1).padStart(3, '0')}`, source_id: r.source, started_at: r.start, finished_at: r.end ?? null, status: r.status,
    file_name: r.file ?? null, data_date: r.date ?? null, date_from: r.date ?? null, rows_total: r.total ?? null, rows_ok: r.ok ?? null, rows_failed: r.failed ?? null,
    actor: r.actor, message: r.message, detail: r.detail ? JSON.stringify(r.detail) : null, origin: '示例',
    rule_id: r.source === SOURCE ? rule.id : null, batch_id: null,
  }))
  mappingRows(exp.ref, exp.sample).forEach(([source, field, target, transform, sample, status, confidence, reason], i) => {
    const ai = status === 'AI 建议' || status === '未匹配'
    insert('field_mappings', {
      id: `fm_xhs_${String(i + 1).padStart(2, '0')}`, source_id: source, source_field: field, target, transform, sample, status, confidence, reason,
      updated_at: ai ? '2026-10-27T07:51' : '2026-09-23T09:30', suggested_by: ai ? 'Codex 定时任务' : null, suggested_at: ai ? '2026-10-27T07:51' : null, suggested_target: ai ? target : null,
      decided_by: ai ? null : '小艾', decided_at: ai ? null : '2026-09-23T09:30',
    })
  })
}
