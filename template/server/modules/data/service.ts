// 数据源与导入模块：数据源清单和状态、运行记录、字段对照（含 AI 建议的确认）、今日页的“数据源出问题了”。归属：数据源与导入模块。
// 今日页会调用 issues()（见 services/today.ts）：改它的返回形状，要在 README 的改动记录里写一笔。
// 状态的三条提醒规则（数据源页“提醒规则”一栏写的就是这里）：
//   ① 超时：过了约定时间 30 分钟还没新数据 → “没按时更新”；② 读取失败：记一条失败、数据停在哪天就是哪天，经营页显示缺口，不当 0；
//   ③ 数字异常：导入预览里和近 30 天中位数差 3 倍以上的数要核对（preview.ts）。
// 时间：示例里的运行记录写到 10/27 早上；“现在”是演示日 + 真实时分。演示日期开着时，飞书、RSS、Codex 定时任务这几个示例没连真账号的来源
// 不按真实钟点算“已过多久”（它们本来就不会再跑），如实写“示例没连飞书 · 停在今天 07:30”；关掉演示日期（真用）时照常按约定时间提醒。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { all, get, run, ROOT, logChange } from '../../db.ts'
import { demoDate } from '../../clock.ts'
import { BadRequest, NotFound } from '../../services/common.ts'
import type { Alert } from '../biz/service.ts'
import { CHANNELS, NOTE_TARGETS, targetLabel, FIELD } from './fields.ts'
import { sampleTrashRows } from './batches.ts'
import { listRules, getRule, writeRuleFile } from './rules.ts'
import { provenance } from './origin.ts'
import { notesState, NOTES_SOURCE } from './notes.ts'
import { stamp, md, whenText } from './time.ts'

const json = <T extends { detail?: unknown }>(r: T) => ({ ...r, detail: r.detail ? JSON.parse(String(r.detail)) : null })
/** 网页、命令行传来的条数：不是数字就用默认值，最多 500 条（底座审查 #10） */
export const limitOf = (v: string | number | undefined | null, def = 60, max = 500) => Math.min(Math.max(Number.parseInt(String(v ?? ''), 10) || def, 1), max)

type SourceRow = {
  id: string; name: string; kind: string; feeds: string; method: string; schedule: string; owner: string | null; status: string
  last_run_at: string | null; last_ok_at: string | null; next_run_at: string | null; data_through: string | null; note: string | null; sort: number
  channel_id: string | null; inbox_dir: string | null
}
export type Display = '正常' | '没按时更新' | '读取失败' | '没数据' | '停用'
export const WAY: Record<string, string> = { 平台导出: '导入文件', 飞书多维表格: '飞书多维表格', 飞书日历与妙记: '飞书日历', 知识库文件夹: '本地文件', RSS: 'RSS 订阅', 'Codex 定时任务': '定时任务' }
/** 提醒、命令行里用的短名字 */
const SHORT: Record<string, string> = {
  src_douyin: '抖店经营数据', src_tmall: '天猫经营数据', src_xhs_shop: '小红书店经营数据', src_wechat: '视频号小店经营数据', src_store: '门店日报',
  src_xhs_notes: '小红书笔记数据', src_lark: '飞书日历与妙记', src_kb: '知识库', src_rss: 'RSS 订阅', src_codex: 'Codex 定时任务',
}
const GRACE_MIN = 30
/** 示例里没连真账号的来源（演示日期开着时不会再跑）：写“示例没连飞书” */
const DEMO_HOLD: Record<string, string> = { 飞书多维表格: '飞书', 飞书日历与妙记: '飞书', RSS: 'RSS', 'Codex 定时任务': 'Codex' }
const held = (s: { kind: string }) => !!demoDate() && s.kind in DEMO_HOLD

const toDate = (local: string) => new Date(`${local.length === 16 ? local : `${local}T00:00`}:00`)
const minutesBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 60000)
const addMin = (local: string, m: number) => { const d = toDate(local); d.setMinutes(d.getMinutes() + m); return stamp(d) }
const durText = (min: number) => (min < 60 ? `${min} 分钟` : min < 60 * 24 ? `${Math.round(min / 60)} 小时` : `${Math.round(min / 1440)} 天`)

/** 现在该显示什么状态：经营表里这个渠道一行都没有 → 没数据；数据库里记的失败、超时为准；“正常”的过了约定时间 30 分钟还没跑，也算没按时更新 */
function displayOf(s: SourceRow, now = stamp()): { display: Display; reason: string | null } {
  if (s.status === '停用') return { display: '停用', reason: '停用了，不再读取' }
  if (s.channel_id && !s.data_through) {
    const name = CHANNELS[s.channel_id]?.name ?? s.channel_id
    const n = sampleTrashRows(s.channel_id)
    return { display: '没数据', reason: n ? `经营表里现在没有${name}的数：示例数据清掉了（${n} 行放在一边，能放回）。导一份自己的表，或者在导入记录页把示例数据放回去` : `经营表里还没有${name}的数：导一份平台导出的表就有了` }
  }
  if (s.status === '失败') return { display: '读取失败', reason: s.note }
  if (s.status === '超时') return { display: '没按时更新', reason: s.note }
  if (!held(s) && s.next_run_at && addMin(s.next_run_at, GRACE_MIN) < now) return { display: '没按时更新', reason: `约定 ${s.next_run_at.slice(11)} 更新，过了 ${GRACE_MIN} 分钟还没有新数据` }
  return { display: '正常', reason: null }
}

/** “下一次”一格：没到点写几点；过了点还没跑写“该在几点 · 已过多久”（警示色）；示例没连真账号的写“示例没连飞书”（灰字，同步那一格写“停在 07:30”） */
function nextOf(s: SourceRow, now: string): { text: string; overdue_min: number; held: boolean } {
  if (!s.next_run_at) return { text: s.schedule, overdue_min: 0, held: false }
  const late = minutesBetween(s.next_run_at, now)
  if (late > 0 && held(s)) return { text: `示例没连${DEMO_HOLD[s.kind]}`, overdue_min: 0, held: true }
  if (late > GRACE_MIN && s.status !== '停用') return { text: `该在 ${whenText(s.next_run_at, now.slice(0, 10)).replace('今天 ', '')} · 已过 ${durText(late)}`, overdue_min: late, held: false }
  const d = s.next_run_at.slice(0, 10)
  const t = s.next_run_at.slice(11, 16)
  const tomorrow = stamp(new Date(toDate(`${now.slice(0, 10)}T00:00`).getTime() + 864e5)).slice(0, 10)
  const evening = Number(t.slice(0, 2)) >= 18
  return { text: d === now.slice(0, 10) ? `${evening ? '今晚' : '今天'} ${t}` : d === tomorrow ? `${Number(t.slice(0, 2)) < 10 ? '明早' : '明天'} ${t}` : `${md(d)} ${t}`, overdue_min: 0, held: false }
}

/** 不能现场拉的来源：操作列写什么时候自动来（示例没有连真的飞书、RSS、Codex 定时任务）；过了点还没来的，如实写“示例没连飞书” */
function autoText(s: SourceRow, now: string): string | null {
  if (s.kind === '平台导出' || s.kind === '知识库文件夹') return null
  if (held(s) && s.next_run_at && s.next_run_at < now) return `${s.kind === '飞书日历与妙记' ? '日历' : ''}停在 ${s.last_run_at ? whenText(s.last_run_at, now.slice(0, 10)).replace('今天 ', '') : '—'}`
  if (s.kind === '飞书日历与妙记') return '每 30 分钟自动'
  if (!s.next_run_at) return s.schedule
  const d = s.next_run_at.slice(0, 10)
  const t = s.next_run_at.slice(11, 16)
  const day = d === now.slice(0, 10) ? (Number(t.slice(0, 2)) >= 18 ? '今晚' : '今天') : Number(t.slice(0, 2)) < 10 ? '明早' : '明天'
  return `${day} ${t} 自动`
}

let kbCache: { at: number; notes: number; latest: { path: string; at: string } | null } | null = null
/** 文件开头的“更新: 2026-10-25”（演示日期开着时用它当“最近改”，文件的真实修改时间是搭示例那天，和故事对不上） */
function updatedField(p: string): string | null {
  try {
    const head = readFileSync(p, 'utf8').slice(0, 600)
    return head.match(/^更新:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null
  } catch { return null }
}
/** 知识库现在有多少份笔记、最近改的是哪份（不算 README、AGENTS 这类说明文件，不进 工作台/ 和隐藏文件夹）。
 *  演示日期开着时按文件开头的“更新”字段算（只到天，不晚于今天）；真用时按文件的修改时间 */
export function kbNow() {
  if (kbCache && Date.now() - kbCache.at < 15_000) return kbCache
  const demo = demoDate()
  let notes = 0
  let latest: { f: string; t: number; day?: string } | null = null
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.') || name === '工作台' || name === 'node_modules') continue
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (name.endsWith('.md') && !/^(README|AGENTS|CLAUDE)\.md$/i.test(name)) {
        notes++
        if (demo) {
          const day = updatedField(p)
          if (day && day <= demo && (!latest || day > (latest.day ?? '') || (day === latest.day && st.mtimeMs > latest.t))) latest = { f: relative(ROOT, p), t: st.mtimeMs, day }
        } else if (!latest || st.mtimeMs > latest.t) latest = { f: relative(ROOT, p), t: st.mtimeMs }
      }
    }
  }
  try { walk(ROOT) } catch { /* 读不了就当 0 */ }
  const l = latest as { f: string; t: number; day?: string } | null
  kbCache = { at: Date.now(), notes, latest: l ? { path: l.f, at: l.day ?? stamp(new Date(l.t)) } : null }
  return kbCache
}

type Part = { label: string; text: string; tone: 'ok' | 'warn' | 'danger' }
/** 飞书日历与妙记：日历、妙记分两行说（一个正常、一个超时，别混成一句） */
function larkParts(id: string): Part[] {
  const runs = all<{ status: string; started_at: string; finished_at: string | null; detail: string | null }>('SELECT status, started_at, finished_at, detail FROM import_runs WHERE source_id = :id ORDER BY started_at DESC LIMIT 30', { id })
  const sub = (k: string) => runs.find((r) => r.detail && (JSON.parse(r.detail) as { sub?: string }).sub === k)
  const cal = sub('日历')
  const mins = sub('妙记')
  const out: Part[] = []
  if (cal) out.push({ label: '日历', text: `${whenText((cal.finished_at ?? cal.started_at))} ${cal.status}`, tone: cal.status === '成功' ? 'ok' : 'warn' })
  if (mins) {
    const d = JSON.parse(mins.detail!) as { meeting?: string }
    out.push({ label: '妙记', text: mins.status === '超时' ? `${d.meeting ?? ''}还没生成` : `${d.meeting ?? ''}${mins.status}`, tone: mins.status === '成功' ? 'ok' : 'warn' })
  }
  return out
}

export function sources() {
  const now = stamp()
  const rules = listRules()
  return all<SourceRow & { runs_7d: number; problems_7d: number; last_status: string | null; last_message: string | null; pending: number }>(`SELECT s.*,
    (SELECT COUNT(*) FROM import_runs r WHERE r.source_id = s.id AND r.started_at >= date(:now, '-6 days')) AS runs_7d,
    (SELECT COUNT(*) FROM import_runs r WHERE r.source_id = s.id AND r.status IN ('失败','超时','部分成功') AND r.started_at >= date(:now, '-6 days')) AS problems_7d,
    (SELECT status FROM import_runs r WHERE r.source_id = s.id ORDER BY r.started_at DESC LIMIT 1) AS last_status,
    (SELECT message FROM import_runs r WHERE r.source_id = s.id ORDER BY r.started_at DESC LIMIT 1) AS last_message,
    (SELECT COUNT(*) FROM field_mappings m WHERE m.source_id = s.id AND m.status IN ('AI 建议','未匹配')) AS pending
    FROM data_sources s ORDER BY s.sort`, { now }).map((s) => {
    const rule = rules.find((r) => r.source_id === s.id && r.status === '在用')
    const next = nextOf(s, now)
    const live = s.kind === '知识库文件夹' ? kbNow() : null
    return {
      ...s, ...displayOf(s, now), way: WAY[s.kind] ?? s.kind, short: SHORT[s.id] ?? s.name, rule: rule ? { id: rule.id, name: `${rule.platform} · ${rule.report}` } : null,
      next_text: next.text, overdue_min: next.overdue_min, next_held: next.held, auto: autoText(s, now), realtime: s.kind === '知识库文件夹',
      sample_rows: s.channel_id ? sampleTrashRows(s.channel_id) : 0,
      kb: live ? { notes: live.notes, latest: live.latest } : null,
      parts: s.kind === '飞书日历与妙记' ? larkParts(s.id) : [],
    }
  })
}

/** 最近 7 天每天的运行结果（表格、抽屉里那一排小格子）。今天还没到点的写“还没到点”，不算没跑 */
function strip(s: { id: string; next_run_at: string | null }) {
  const now = stamp()
  // 撤销了的那次导入不算（它写进去的数已经不在了）
  const days = all<{ d: string; st: string }>(`SELECT substr(r.started_at, 1, 10) AS d, r.status AS st FROM import_runs r LEFT JOIN data_batches b ON b.id = r.batch_id
    WHERE r.source_id = :id AND r.started_at >= date(:now, '-6 days') AND (b.id IS NULL OR b.status <> '已撤销') ORDER BY r.started_at`, { id: s.id, now })
  const out: { date: string; status: string | null; runs: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${now.slice(0, 10)}T00:00:00`)
    d.setDate(d.getDate() - i)
    const date = stamp(d).slice(0, 10)
    const xs = days.filter((x) => x.d === date)
    // 一天里出过问题、最后一次成功了的，算“补上了”（不再画成红色）；否则按当天最坏的结果
    const last = xs.at(-1)?.st ?? null
    const bad = xs.some((x) => x.st !== '成功')
    const worst = last === '成功' && bad ? '补上了' : ['失败', '超时', '部分成功', '成功'].find((st) => xs.some((x) => x.st === st)) ?? null
    const notYet = !worst && i === 0 && !!s.next_run_at && s.next_run_at.slice(0, 10) === date && s.next_run_at > now
    out.push({ date, status: worst ?? (notYet ? '还没到点' : null), runs: xs.length })
  }
  return out
}

export const strips = () => Object.fromEntries(all<{ id: string; next_run_at: string | null; kind: string }>('SELECT id, next_run_at, kind FROM data_sources')
  .filter((s) => s.kind !== '知识库文件夹').map((s) => [s.id, strip(s)]))

/** 数据源页顶上四张卡（只放表格里看不出来的）：经营数据到哪天、近 7 天运行、导入规则（哪个平台还没有）、今早几点导完 */
export function summary() {
  const now = stamp()
  const t = now.slice(0, 10)
  const list = sources()
  const biz = list.filter((s) => s.channel_id)
  const yesterday = (() => { const d = new Date(`${t}T00:00:00`); d.setDate(d.getDate() - 1); return stamp(d).slice(0, 10) })()
  const fresh = biz.filter((s) => s.data_through && s.data_through >= yesterday)
  const r7 = get<{ n: number; bad: number; part: number; late: number }>(`SELECT COUNT(*) AS n, SUM(status = '失败') AS bad, SUM(status = '部分成功') AS part, SUM(status = '超时') AS late FROM import_runs WHERE started_at >= date(:now, '-6 days')`, { now })
  // 今早：平台导出 10 点前到的（导入文件夹 / 定时任务 / 手动导都算），撤销了的不算
  const morning = all<{ id: string; s: string; f: string | null }>(`SELECT d.id, r.started_at AS s, r.finished_at AS f FROM import_runs r JOIN data_sources d ON d.id = r.source_id LEFT JOIN data_batches b ON b.id = r.batch_id
    WHERE d.channel_id IS NOT NULL AND substr(r.started_at, 1, 10) = :t AND substr(r.started_at, 12, 5) < '10:00' AND r.status IN ('成功','部分成功')
      AND (b.id IS NULL OR b.status <> '已撤销') ORDER BY r.started_at`, { t })
  const arrived = new Set(morning.map((m) => m.id))
  // 晚上才来的（门店 22:00）：下一次在今天之后的时间
  const later = biz.filter((s) => !arrived.has(s.id) && s.next_run_at?.slice(0, 10) === t && s.next_run_at > now).map((s) => ({ name: SHORT[s.id]?.replace(/经营数据$|日报$/, '') ?? s.name, at: s.next_run_at!.slice(11, 16) }))
  const rules = listRules()
  const active = rules.filter((r) => r.status === '在用')
  const noRule = list.filter((s) => s.kind === '平台导出' && s.channel_id && !active.some((r) => r.source_id === s.id)).map((s) => ({ id: s.id, name: CHANNELS[s.channel_id!]?.name ?? s.short }))
  return {
    fresh: { ok: fresh.length, total: biz.length, through: biz.map((s) => s.data_through).filter(Boolean).sort()[0] ?? null, behind: biz.filter((s) => !fresh.includes(s)).map((s) => s.short), empty: biz.filter((s) => s.display === '没数据').map((s) => s.short) },
    runs_7d: { total: r7?.n ?? 0, failed: r7?.bad ?? 0, partial: r7?.part ?? 0, late: r7?.late ?? 0 },
    rules: { active: active.length, stopped: rules.length - active.length, mine: rules.filter((r) => r.origin === '自己的').length, missing: noRule },
    morning: morning.length ? { first: morning[0].s, last: morning.at(-1)!.f ?? morning.at(-1)!.s, arrived: arrived.size, total: biz.length, later } : null,
    problems: list.filter((s) => s.display === '读取失败' || s.display === '没按时更新' || s.display === '没数据').map((s) => s.short),
  }
}

export function source(id: string) {
  const s = sources().find((x) => x.id === id)
  if (!s) throw new NotFound('找不到这个数据源')
  return {
    ...s, strip: s.realtime ? [] : strip(s), runs: runs({ source: id, limit: 40 }), mappings: mappings(id), rules: listRules().filter((r) => r.source_id === id),
    notes: id === NOTES_SOURCE ? notesState() : null,
  }
}

export type RunRow = {
  id: string; source_id: string; source_name: string; source_kind: string; started_at: string; finished_at: string | null; status: string
  file_name: string | null; data_date: string | null; date_from: string | null; rows_total: number | null; rows_ok: number | null; rows_failed: number | null
  actor: string; message: string | null; detail: unknown; rule_id: string | null; rule_name: string | null; batch_id: string | null; origin: string
  batch_status: string | null; batch_origin: string | null; batch_label: string | null; batch_file: string | null; batch_rows: number | null
}
export function runs({ source, limit, origin, files }: { source?: string; limit?: number | string; origin?: string; files?: boolean } = {}) {
  return all<RunRow>(`SELECT r.*, s.name AS source_name, s.kind AS source_kind, b.status AS batch_status, b.origin AS batch_origin, b.label AS batch_label, b.file_name AS batch_file, b.rows AS batch_rows,
      (SELECT platform || ' · ' || report FROM import_rules WHERE id = r.rule_id) AS rule_name
    FROM import_runs r JOIN data_sources s ON s.id = r.source_id LEFT JOIN data_batches b ON b.id = r.batch_id
    WHERE (:s IS NULL OR r.source_id = :s) AND (:o IS NULL OR r.origin = :o) AND (:files = 0 OR r.file_name IS NOT NULL) ORDER BY r.started_at DESC, r.rowid DESC LIMIT :n`,
  { s: source ?? null, o: origin ?? null, files: files ? 1 : 0, n: limitOf(limit) }).map(json)
    .map((r) => ({
      ...r, preset: r.origin === '示例', provenance: provenance(r.origin, r.file_name), source_short: SHORT[r.source_id]?.replace(/经营数据$/, '') ?? r.source_name.split(' · ')[0],
      file_exists: !!r.file_name && r.file_name.includes('/') && existsSync(join(ROOT, r.file_name)),
    }))
}

export function mappings(sourceId?: string) {
  return all<Record<string, unknown> & { target: string | null }>(`SELECT m.*, s.name AS source_name FROM field_mappings m JOIN data_sources s ON s.id = m.source_id
    WHERE (:s IS NULL OR m.source_id = :s) ORDER BY m.source_id, CASE m.status WHEN 'AI 建议' THEN 0 WHEN '未匹配' THEN 1 ELSE 2 END, m.id`, { s: sourceId ?? null })
    .map((m) => ({ ...m, target_label: targetLabel(m.target) }))
}

export const mappingTargets = () => ({ notes: NOTE_TARGETS, daily: Object.values(FIELD).map((f) => ({ value: `channel_daily.${f.key}`, label: f.label })) })

/** 确认一条字段对照：采用建议 / 改成别的 / 不导 / 改回（回到“等你确认”，按 AI 原来的建议） */
export function decideMapping(id: string, input: unknown, actor: string) {
  const m = get<{ id: string; source_id: string; source_field: string; target: string | null; status: string; suggested_by: string | null; suggested_target: string | null }>('SELECT * FROM field_mappings WHERE id = :id', { id })
  if (!m) throw new NotFound('找不到这条对照')
  const b = (input ?? {}) as { action?: string; target?: string | null }
  const valid = new Set([...NOTE_TARGETS.map((t) => t.value), ...Object.keys(FIELD).map((k) => `channel_daily.${k}`)])
  const at = stamp()
  if (b.action === 'revert') {
    if (!m.suggested_by) throw new BadRequest('这一列原来就对好了，没有可以改回的建议')
    if (m.source_id === NOTES_SOURCE && notesState().file?.imported_at) throw new BadRequest('已经按这套对照重新导入了：要改，先在运行记录里撤销那次导入')
    run(`UPDATE field_mappings SET target = :t, status = CASE WHEN :t IS NULL THEN '未匹配' ELSE 'AI 建议' END, decided_by = NULL, decided_at = NULL, updated_at = :at WHERE id = :id`, { t: m.suggested_target, at, id })
    run(`UPDATE import_rules SET note = :n, updated_at = :at WHERE source_id = :s AND target = 'xhs_note_stats'`, { n: `「${m.source_field}」改回等你确认，对照还没定`, at, s: m.source_id })
    logChange('网页', 'data', m.source_id, '改回', `字段对照「${m.source_field}」改回“等你确认”`)
    return mappings(m.source_id)
  }
  let target = m.target
  let status = '已确认'
  if (b.action === 'accept') { if (!m.target) throw new BadRequest('这一列没有建议，选一个字段或者点“不导”') }
  else if (b.action === 'ignore') { target = null; status = '忽略' }
  else if (b.action === 'set') { if (!b.target || !valid.has(b.target)) throw new BadRequest('选的字段不认识'); target = b.target }
  else throw new BadRequest('要说清是采用、改成别的、不导，还是改回')
  run('UPDATE field_mappings SET target = :t, status = :st, decided_by = :by, decided_at = :at, updated_at = :at WHERE id = :id', { t: target, st: status, by: actor, at, id })
  logChange('网页', 'data', m.source_id, '确认', `字段对照「${m.source_field}」→ ${targetLabel(target)}（${status === '忽略' ? '不导' : b.action === 'accept' ? '采用了建议' : '改了'}）`)
  settleNotesRule(m.source_id)
  return mappings(m.source_id)
}

/** 小红书笔记数据：等确认的都确认完了，就把规则换成新表头（下次按新列名导） */
function settleNotesRule(sourceId: string) {
  const left = get<{ n: number }>("SELECT COUNT(*) AS n FROM field_mappings WHERE source_id = :s AND status IN ('AI 建议','未匹配')", { s: sourceId })?.n ?? 0
  if (left) return
  const rule = listRules().find((r) => r.source_id === sourceId && r.target === 'xhs_note_stats')
  if (!rule) return
  const maps = all<{ source_field: string; target: string | null; status: string; decided_by: string | null; decided_at: string | null }>('SELECT source_field, target, status, decided_by, decided_at FROM field_mappings WHERE source_id = :s ORDER BY id', { s: sourceId })
  const at = stamp()
  const who = (by: string | null) => (by === '网页' ? '你' : by ?? undefined)
  run(`UPDATE import_rules SET signature = :sig, mapping = :map, updated_at = :at, note = :note WHERE id = :id`, {
    id: rule.id, sig: JSON.stringify(maps.map((x) => x.source_field)), at,
    map: JSON.stringify(maps.map((x) => ({ col: x.source_field, field: x.target, how: '你选的', by: who(x.decided_by), at: x.decided_at ?? undefined }))),
    note: `${md(at.slice(0, 10))} ${at.slice(11)} 按平台新表头改了对照（原来的曝光、阅读、新增关注改名了）`,
  })
  run("UPDATE data_sources SET note = :n WHERE id = :s AND status = '失败'", { s: sourceId, n: `字段对照 ${at.slice(11)} 确认完了、规则已换成新表头；今天这份还没重新导入，笔记数据仍停在 ${md(get<{ d: string }>('SELECT data_through AS d FROM data_sources WHERE id = :s', { s: sourceId })?.d)}。点“按新规则重新导入”就能补上` })
  writeRuleFile(getRule(rule.id))
}

/** 有问题的数据源（今日页“数据异常提醒”里的后两条就是这里来的）：读取失败 > 没数据 > 没按时更新 */
const ISSUE_RANK: Record<string, number> = { 读取失败: 0, 没数据: 1, 没按时更新: 2 }
export function issues(): Alert[] {
  const t = stamp().slice(0, 10)
  return sources().filter((s) => s.display in ISSUE_RANK)
    .sort((a, b) => ISSUE_RANK[a.display] - ISSUE_RANK[b.display] || a.sort - b.sort)
    .map((s): Alert => {
      const failed = s.display === '读取失败'
      const empty = s.display === '没数据'
      const mins = s.parts.find((p) => p.label === '妙记' && p.tone !== 'ok')
      const title = failed
        ? `${s.short}${s.last_run_at?.slice(0, 10) === t && (s.last_run_at ?? '') < `${t}T12:00` ? '今早' : ''}没导进来`
        : empty ? `${s.short}现在没有数`
        : mins ? `${mins.text.replace('还没生成', '')}纪要还没生成（日历正常）` : `${s.short}没按时更新`
      return {
        id: `source_${s.id}`, level: failed ? '高' : '中', module: 'data', kind: failed ? '导入失败' : empty ? '没有数据' : '更新超时', channel_id: empty ? s.channel_id : null, title,
        detail: empty ? (sampleTrashRows(s.channel_id!) ? '示例数据清掉了，导入记录页能放回去' : '还没导过这个渠道的表')
          : s.parts.length ? s.parts.map((p) => `${p.label} ${p.text}`).join(' · ')
          : s.data_through ? `数据停在 ${md(s.data_through)}${s.pending ? ` · ${s.pending} 列对照等你确认` : ''}` : '还没有成功导入过',
        cause: s.reason, since: s.last_run_at?.slice(0, 10) ?? null, link: `/sources?source=${s.id}`,
      }
    })
}

/** 导入规则加上“现在用不用得上”：来源因为表头变了读取失败、还有对照等你确认的，标“表头变了” */
export function rulesView() {
  const src = new Map(sources().map((s) => [s.id, s]))
  return listRules().map((r) => {
    const s = r.source_id ? src.get(r.source_id) : undefined
    const changed = !!s && r.status === '在用' && s.pending > 0
    return { ...r, alert: changed ? { kind: '表头变了' as const, pending: s!.pending, source_id: s!.id, source_display: s!.display } : null }
  })
}
export const ruleView = (id: string) => {
  const r = rulesView().find((x) => x.id === id)
  if (!r) throw new NotFound('找不到这条导入规则')
  return r
}
