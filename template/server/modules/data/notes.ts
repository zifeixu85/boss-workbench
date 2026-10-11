// 小红书笔记数据（线索 4 的后半段）：字段对照确认完以后，按新对照把专业号导出的“笔记数据”表重新导进内容模块的两张表——
// xhs_note_stats（每篇笔记截至某天的累计，自然 / 投流分开）和 xhs_note_daily（发布后第 1—30 天每天的累计）；
// 同一次导出的“粉丝数据”表（表头没变，跟着笔记数据一起没导进来）补进 xhs_followers_daily，今日页小红书卡片的“数据截至”跟着走。
// 写之前记下原来的样子（data_batches / data_batch_rows），能整批撤销；彩排后 import-reset 也靠它复原。归属：数据源与导入模块。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { all, get, run, tx, uid, ROOT, logChange } from '../../db.ts'
import { BadRequest, daysBetween } from '../../services/common.ts'
import { readTable } from './csv.ts'
import { parseNumber } from './fields.ts'
import { writeRows, type Tbl } from './batches.ts'
import { listRules, touchRule } from './rules.ts'
import { md, stamp } from './time.ts'

export const NOTES_SOURCE = 'src_xhs_notes'
const STAT: Record<string, string> = {
  'xhs_note_stats.impressions': 'impressions', 'xhs_note_stats.reads': 'reads', 'xhs_note_stats.likes': 'likes', 'xhs_note_stats.saves': 'saves',
  'xhs_note_stats.comments': 'comments', 'xhs_note_stats.shares': 'shares', 'xhs_note_stats.new_followers': 'new_followers',
}

/** 读文件：先按 UTF-8，读出乱码再按 GBK */
function decode(buf: Buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('gbk').decode(buf) }
}

type Pending = { n: number; cols: string[] }
const pendingOf = (): Pending => {
  const xs = all<{ source_field: string }>("SELECT source_field FROM field_mappings WHERE source_id = :s AND status IN ('AI 建议','未匹配')", { s: NOTES_SOURCE })
  return { n: xs.length, cols: xs.map((x) => x.source_field) }
}

const isFollowers = (f: string) => /粉丝/.test(f)
/** 导入文件夹里最新的一份笔记数据表（“粉丝数据”那份不算），和它有没有按现在的对照导进去过 */
export function notesFile(): { rel: string; name: string; data_date: string | null; imported_at: string | null } | null {
  const dir = get<{ d: string | null }>('SELECT inbox_dir AS d FROM data_sources WHERE id = :s', { s: NOTES_SOURCE })?.d
  if (!dir || !existsSync(join(ROOT, dir))) return null
  const files = readdirSync(join(ROOT, dir)).filter((f) => /\.(csv|txt|tsv)$/i.test(f) && !isFollowers(f) && statSync(join(ROOT, dir, f)).isFile()).sort()
  const name = files.at(-1)
  if (!name) return null
  const rel = relative(ROOT, join(ROOT, dir, name))
  const m = name.match(/(\d{4})(\d{2})(\d{2})/)
  const done = get<{ at: string }>(`SELECT r.started_at AS at FROM import_runs r JOIN data_batches b ON b.id = r.batch_id
    WHERE r.source_id = :s AND r.file_name = :f AND r.status IN ('成功','部分成功') AND b.status = '有效' ORDER BY r.started_at DESC LIMIT 1`, { s: NOTES_SOURCE, f: rel })
  return { rel, name, data_date: m ? `${m[1]}-${m[2]}-${m[3]}` : null, imported_at: done?.at ?? null }
}

/** 抽屉里“按新规则重新导入”那一块要的状态 */
export function notesState() {
  const pending = pendingOf()
  const file = notesFile()
  return { pending: pending.n, pending_cols: pending.cols, file, can_import: !pending.n && !!file && !file.imported_at }
}

/** 同一天的粉丝数据表（日期、粉丝总数、新增关注、取消关注；表头没改版）：只取工作台里还没有、或数不一样的那几天 */
function followerRows(notesRel: string, dataDate: string): { tbl: Tbl; key: string; values: Record<string, number> }[] {
  const p = join(ROOT, notesRel.replace(/[^/]+$/, ''), `粉丝数据_${dataDate.replaceAll('-', '')}.csv`)
  if (!existsSync(p)) return []
  const t = readTable(decode(readFileSync(p)))
  const col = (re: RegExp) => t.headers.findIndex((h) => re.test(h.trim()))
  const [iD, iF, iG, iL] = [col(/^日期$/), col(/粉丝总数|粉丝数/), col(/新增|涨粉/), col(/取消|取关|掉粉/)]
  if ([iD, iF, iG, iL].some((i) => i < 0)) return []
  const out: { tbl: Tbl; key: string; values: Record<string, number> }[] = []
  for (const r of t.rows) {
    const date = r.cells[iD]?.trim().replaceAll('/', '-')
    const [f, g, l] = [iF, iG, iL].map((i) => parseNumber(r.cells[i] ?? '', null))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || date > dataDate || [f, g, l].some((x) => x === null || Number.isNaN(x))) continue
    const prev = get<{ followers: number; gained: number; lost: number }>('SELECT followers, gained, lost FROM xhs_followers_daily WHERE date = :d', { d: date })
    if (prev && prev.followers === f && prev.gained === g && prev.lost === l) continue
    out.push({ tbl: 'xhs_followers_daily', key: date, values: { followers: f!, gained: g!, lost: l! } })
  }
  return out
}

type Note = { id: string; title: string; published_at: string }
type StatRow = { impressions: number; reads: number; likes: number; saves: number; comments: number; shares: number; new_followers: number; spend: number; stats_date: string }

/** 按新对照重新导入笔记数据表 */
export function reimportNotes(actor: string) {
  const pending = pendingOf()
  if (pending.n) throw new BadRequest(`还有 ${pending.n} 列对照没确认（${pending.cols.join('、')}）：先在“等你确认”里定下来，再重新导入`)
  const file = notesFile()
  if (!file) throw new BadRequest('导入文件夹里没有笔记数据表：小艾从专业号后台导出“笔记数据”，放进 工作台/导入/小红书笔记/ 再点')
  if (file.imported_at) throw new BadRequest(`这份 ${file.name} 已经在 ${file.imported_at.replace('T', ' ')} 导过了；要重来，先在运行记录里撤销那次导入`)

  const table = readTable(decode(readFileSync(join(ROOT, file.rel))))
  const maps = all<{ source_field: string; target: string | null }>("SELECT source_field, target FROM field_mappings WHERE source_id = :s AND status IN ('已确认','忽略')", { s: NOTES_SOURCE })
  const colOf = (target: string) => {
    const m = maps.find((x) => x.target === target)
    return m ? table.headers.findIndex((h) => h.trim() === m.source_field.trim()) : -1
  }
  const lost = maps.filter((m) => m.target && !table.headers.some((h) => h.trim() === m.source_field.trim())).map((m) => m.source_field)
  if (lost.length) throw new BadRequest(`这份表里没有「${lost.join('」「')}」：表头又变了，先回“等你确认”看一眼`)
  const iTitle = colOf('xhs_notes.title')
  const iPub = colOf('xhs_notes.published_at')
  const iTraffic = colOf('xhs_note_stats.traffic')
  if (iTitle < 0) throw new BadRequest('对照里没有“笔记标题”，认不出是哪篇笔记')

  const dataDate = file.data_date ?? get<{ d: string }>("SELECT data_date AS d FROM import_runs WHERE source_id = :s AND status = '失败' ORDER BY started_at DESC LIMIT 1", { s: NOTES_SOURCE })?.d
  if (!dataDate) throw new BadRequest('看不出这份表是哪天的数据：文件名里写上日期（例：笔记数据_20261026.csv）')
  const notes = all<Note>('SELECT id, title, published_at FROM xhs_notes')
  const byTitle = new Map(notes.map((n) => [n.title.trim(), n]))
  const byPub = new Map(notes.map((n) => [n.published_at.slice(0, 16), n]))

  const rows: { tbl: Tbl; key: string; values: Record<string, string | number | null> }[] = []
  const problems: { 行: number; 原因: string }[] = []
  const seen = new Set<string>()
  const fresh: string[] = []
  for (const r of table.rows) {
    const title = r.cells[iTitle]?.trim() ?? ''
    const pub = iPub >= 0 ? r.cells[iPub]?.trim().replace(' ', 'T').slice(0, 16) ?? '' : ''
    const note = byTitle.get(title) ?? byPub.get(pub)
    if (!note) { problems.push({ 行: r.line, 原因: `找不到「${title || '没有标题'}」这篇笔记（工作台的笔记里没有）` }); continue }
    const traffic = iTraffic >= 0 && /推广|投流|薯条|聚光/.test(r.cells[iTraffic] ?? '') ? '投流' : '自然'
    const key = `${note.id}|${traffic}`
    if (seen.has(key)) { problems.push({ 行: r.line, 原因: `「${note.title}」的${traffic}数据重复了，只导第一行` }); continue }
    const v: Partial<StatRow> = {}
    let bad = ''
    for (const [target, col] of Object.entries(STAT)) {
      const i = colOf(target)
      if (i < 0) continue
      const n = parseNumber(r.cells[i] ?? '', null)
      if (n === null || Number.isNaN(n)) { bad = `「${table.headers[i]}」是“${r.cells[i] ?? ''}”，不是数，不能当 0`; break }
      ;(v as Record<string, number>)[col] = Math.round(n)
    }
    if (bad) { problems.push({ 行: r.line, 原因: bad }); continue }
    seen.add(key)
    const prev = get<StatRow>('SELECT * FROM xhs_note_stats WHERE note_id = :n AND traffic = :t', { n: note.id, t: traffic })
    if (!prev && traffic === '自然') fresh.push(note.title)
    const stats: StatRow = {
      impressions: v.impressions ?? prev?.impressions ?? 0, reads: v.reads ?? prev?.reads ?? 0, likes: v.likes ?? prev?.likes ?? 0, saves: v.saves ?? prev?.saves ?? 0,
      comments: v.comments ?? prev?.comments ?? 0, shares: v.shares ?? prev?.shares ?? 0, new_followers: v.new_followers ?? prev?.new_followers ?? 0,
      spend: prev?.spend ?? 0, stats_date: dataDate, // 导出表里没有投流花费，沿用原来记的
    }
    rows.push({ tbl: 'xhs_note_stats', key, values: stats })
    const day = daysBetween(note.published_at.slice(0, 10), dataDate) + 1
    if (day >= 1 && day <= 30) {
      rows.push({ tbl: 'xhs_note_daily', key: `${note.id}|${traffic}|${day}`, values: {
        date: dataDate, impressions: stats.impressions, reads: stats.reads, likes: stats.likes, saves: stats.saves, comments: stats.comments, new_followers: stats.new_followers, spend: stats.spend,
      } })
    }
  }
  const statRows = rows.filter((r) => r.tbl === 'xhs_note_stats')
  if (!statRows.length) throw new BadRequest(`一行都没对上：${problems[0]?.原因 ?? '表是空的'}`)
  const fans = followerRows(file.rel, dataDate)
  rows.push(...fans)
  const lastFans = fans.find((f) => f.key === dataDate)?.values

  const at = stamp()
  const rule = listRules().find((r) => r.source_id === NOTES_SOURCE && r.target === 'xhs_note_stats')
  const noteCount = new Set(statRows.map((r) => r.key.split('|')[0])).size
  const message = `按新对照重新导入了 ${md(dataDate)} 的笔记数据：${noteCount} 篇（${statRows.length} 行，投流的单独一行）${fresh.length ? `；「${fresh[0]}」第一次有数` : ''}${lastFans ? `；粉丝数补到 ${md(dataDate)}（${lastFans.followers.toLocaleString('zh-CN')}）` : ''}${problems.length ? `；${problems.length} 行没导` : ''}`
  return tx(() => {
    const batchId = writeRows({
      origin: '自己的', source_id: NOTES_SOURCE, rule_id: rule?.id ?? null, channel_id: null, label: `小红书笔记数据 ${md(dataDate)} · ${noteCount} 篇`,
      file_name: file.rel, date_from: dataDate, date_to: dataDate, created_by: actor, target: 'xhs_note_stats',
    }, rows)
    const runId = uid('run')
    run(`INSERT INTO import_runs (id, source_id, started_at, finished_at, status, file_name, data_date, date_from, rows_total, rows_ok, rows_failed, actor, message, detail, rule_id, batch_id, origin)
      VALUES (:id, :s, :at, :at, :st, :f, :d, :d, :total, :ok, :bad, :actor, :msg, :detail, :rule, :batch, '自己的')`, {
      id: runId, s: NOTES_SOURCE, at, st: problems.length ? '部分成功' : '成功', f: file.rel, d: dataDate, total: statRows.length + problems.length, ok: statRows.length, bad: problems.length,
      actor, msg: message, detail: JSON.stringify({ 有问题的行: problems, 第一次有数: fresh }), rule: rule?.id ?? null, batch: batchId,
    })
    run('UPDATE data_batches SET run_id = :r WHERE id = :b', { r: runId, b: batchId })
    run("UPDATE data_sources SET status = '正常', note = NULL, last_run_at = :at, last_ok_at = :at, data_through = :d WHERE id = :s", { at, d: dataDate, s: NOTES_SOURCE })
    if (rule) touchRule(rule.id)
    logChange('导入', 'data', NOTES_SOURCE, '导入', `${message}（${actor}）`)
    return { batch_id: batchId, run_id: runId, notes: noteCount, rows: statRows.length, problems, fresh, data_date: dataDate, message }
  })
}
