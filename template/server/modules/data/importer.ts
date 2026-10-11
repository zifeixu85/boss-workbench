// 导入四步的服务端：① 收下拖进来的文件（存成草稿，刷新不丢）② 认表 + 对字段（recognize.ts）③ 预览（preview.ts）④ 导入：写经营表、记一批、记导入记录、存规则。
// 网页、“立即同步”、命令行都走这里。归属：数据源与导入模块。
import { all, get, run, tx, uid, logChange } from '../../db.ts'
import { BadRequest, NotFound, addDays, today } from '../../services/common.ts'
import { readTable, type Table } from './csv.ts'
import { analyze, type Analysis, type Choices } from './recognize.ts'
import { buildPreview, type Preview } from './preview.ts'
import { refreshThrough, writeBatch, getBatch, sampleTrashRows } from './batches.ts'
import { isPresetBatch, isSampleFile, provenance, type Provenance } from './origin.ts'
import { createRule, getRule, reviseRule, touchRule, type Rule } from './rules.ts'
import { CHANNELS, CORE, DATE_FMT_LABEL, FIELD, NUMERIC, type DateFmt, type FieldKey } from './fields.ts'
import { span, stamp } from './time.ts'
import type { CodexAdvice } from './codex.ts'

export type DraftRow = {
  id: string; file_name: string; file_size: number | null; encoding: string | null; content: string; choices: string; codex: string | null
  status: '对字段' | '已导入' | '已放弃'; run_id: string | null; batch_id: string | null; rule_id: string | null; created_at: string; updated_at: string
}
const MAX_CHARS = 3_000_000

function draftRow(id: string): DraftRow {
  const d = get<DraftRow>('SELECT * FROM import_drafts WHERE id = :id', { id })
  if (!d) throw new NotFound('找不到这份文件，可能已经放弃了；重新拖进来就行')
  return d
}

export function sourceOfChannel(ch: string | null): string | null {
  if (!ch) return null
  return get<{ id: string }>('SELECT id FROM data_sources WHERE channel_id = :c ORDER BY sort LIMIT 1', { c: ch })?.id ?? null
}

/** 收下一份文件：只认 CSV（Excel 请另存为 CSV）；读不出表头的不收 */
export function createDraft(input: unknown): DraftView {
  const b = (input ?? {}) as { file_name?: unknown; size?: unknown; encoding?: unknown; content?: unknown }
  const name = typeof b.file_name === 'string' ? b.file_name.trim().slice(0, 200) : ''
  if (!name) throw new BadRequest('没收到文件名')
  if (/\.(xlsx|xls|xlsm|numbers|et)$/i.test(name)) throw new BadRequest('这台工作台还读不了 Excel 文件：在 Excel 里点“另存为 → CSV UTF-8（逗号分隔）”，再把 .csv 拖进来')
  if (!/\.(csv|txt|tsv)$/i.test(name)) throw new BadRequest('只认表格文件（.csv）。平台后台导出时选 CSV；是 Excel 的话先另存为 CSV')
  if (typeof b.content !== 'string' || !b.content.trim()) throw new BadRequest('文件是空的')
  if (b.content.length > MAX_CHARS) throw new BadRequest('文件太大了（超过 3 MB）：一次导一个月的日数据就够，先在平台上缩小日期范围')
  const table = readTable(b.content)
  if (table.headers.length < 2 || !table.rows.length) throw new BadRequest('没读到表头和数据：这份文件像是空的，或者不是表格')
  const id = uid('draft')
  const at = stamp()
  run(`INSERT INTO import_drafts (id, file_name, file_size, encoding, content, choices, status, created_at, updated_at)
    VALUES (:id, :n, :s, :e, :c, '{}', '对字段', :at, :at)`, {
    id, n: name, s: typeof b.size === 'number' ? Math.round(b.size) : b.content.length, e: typeof b.encoding === 'string' ? b.encoding.slice(0, 20) : 'UTF-8', c: b.content, at,
  })
  return draftView(id)
}

export type DraftView = {
  draft: Omit<DraftRow, 'content' | 'choices' | 'codex'>
  table: { headers: string[]; rows: string[][]; row_count: number; preamble: string[] }
  choices: Choices
  analysis: Analysis
  codex: CodexAdvice | null
  preview: Preview | null
  result: ImportResult | null
}

/** 演示样例表（文件名对得上，或开头写了“示例数据”）：只用来提示“数字和预置示例一样”，导进来仍算现场导的 */
export const withSampleFlag = (a: Analysis, fileName: string): Analysis => (isSampleFile(fileName) && !a.sample_file ? { ...a, sample_file: true } : a)

function load(d: DraftRow) {
  const table = readTable(d.content)
  const choices = JSON.parse(d.choices || '{}') as Choices
  return { table, choices, analysis: withSampleFlag(analyze(table, choices), d.file_name) }
}

/** 预览里“一样”的行，有几行现在是预置示例数据、归哪几个渠道（“先清掉示例数据”只清这几个渠道） */
function sameFromSamples(p: Preview): Preview {
  if (!p.all_same) return p
  const rows = p.rows.filter((r) => r.status === '一样').filter((r) => isPresetBatch(get<{ id: string }>(`SELECT b.id FROM data_batch_rows r JOIN data_batches b ON b.id = r.batch_id
    WHERE r.tbl = 'channel_daily' AND r.row_key = :k AND b.status = '有效' ORDER BY b.rowid DESC LIMIT 1`, { k: `${r.date}|${r.channel_id}` })?.id))
  const by = new Map<string, number>()
  rows.forEach((r) => by.set(r.channel_id, (by.get(r.channel_id) ?? 0) + 1))
  return { ...p, same_from_samples: rows.length, sample_channels: [...by.entries()].map(([id, n]) => ({ id, name: CHANNELS[id]?.name ?? id, rows: n })) }
}

export function draftView(id: string): DraftView {
  const d = draftRow(id)
  const { table, choices, analysis } = load(d)
  const { content: _c, choices: _ch, codex, ...draft } = d
  return {
    draft, choices, analysis,
    table: { headers: table.headers, rows: table.rows.slice(0, 5).map((r) => r.cells), row_count: table.rows.length, preamble: table.preamble },
    codex: codex ? JSON.parse(codex) : null,
    preview: !analysis.blocking.length && d.status === '对字段' ? sameFromSamples(buildPreview(table, analysis)) : null,
    result: d.status === '已导入' && d.batch_id ? resultOf(d.batch_id) : null,
  }
}

export function listDrafts() {
  return all<Omit<DraftRow, 'content'>>(`SELECT id, file_name, file_size, encoding, choices, status, run_id, batch_id, rule_id, created_at, updated_at
    FROM import_drafts WHERE status = '对字段' ORDER BY created_at DESC LIMIT 8`).map(({ choices: _c, ...d }) => d)
}

/** 老板改了对照、渠道、日期格式、单位、缺列怎么办：合并进草稿 */
export function updateChoices(id: string, input: unknown): DraftView {
  const d = draftRow(id)
  if (d.status !== '对字段') throw new BadRequest('这份文件已经导入了；要重来，先撤销那次导入')
  const patch = (input ?? {}) as Choices & { reset?: boolean }
  const cur = patch.reset ? {} : (JSON.parse(d.choices || '{}') as Choices)
  const fieldOk = (f: unknown) => f === null || (typeof f === 'string' && f in FIELD)
  if (patch.columns) {
    for (const [k, v] of Object.entries(patch.columns)) {
      if (v !== null && (!fieldOk(v.field) || (v.by !== '你选的' && v.by !== 'Codex'))) throw new BadRequest(`第 ${Number(k) + 1} 列选的字段不认识`)
    }
  }
  if (patch.channel_id && !(patch.channel_id in CHANNELS)) throw new BadRequest('渠道不认识')
  if (patch.date_fmt && !(patch.date_fmt in DATE_FMT_LABEL)) throw new BadRequest('日期格式不认识')
  if (patch.amount_unit && patch.amount_unit !== '元' && patch.amount_unit !== '万元') throw new BadRequest('金额单位只能是元或万元')
  if (patch.ack_missing && (!Array.isArray(patch.ack_missing) || patch.ack_missing.some((f) => !(f in FIELD) || CORE.includes(f)))) throw new BadRequest('只有非必需的字段可以先不导')
  const columns = { ...(cur.columns ?? {}) }
  Object.entries(patch.columns ?? {}).forEach(([k, v]) => { if (v === null) delete columns[k]; else columns[k] = v })
  const next: Choices = {
    ...cur, ...(patch.channel_id !== undefined ? { channel_id: patch.channel_id } : {}), ...(patch.date_fmt !== undefined ? { date_fmt: patch.date_fmt } : {}),
    ...(patch.amount_unit !== undefined ? { amount_unit: patch.amount_unit } : {}), ...(patch.ack_missing !== undefined ? { ack_missing: patch.ack_missing } : {}), columns,
  }
  run('UPDATE import_drafts SET choices = :c, updated_at = :at WHERE id = :id', { c: JSON.stringify(next), at: stamp(), id })
  return draftView(id)
}

export function saveCodexAdvice(id: string, advice: CodexAdvice) {
  run('UPDATE import_drafts SET codex = :c, updated_at = :at WHERE id = :id', { c: JSON.stringify(advice), at: stamp(), id })
}

export function draftForCodex(id: string): { table: Table; analysis: Analysis; file_name: string } {
  const d = draftRow(id)
  const { table, analysis } = load(d)
  return { table, analysis, file_name: d.file_name }
}

export function discardDraft(id: string) {
  const d = draftRow(id)
  if (d.status === '已导入') throw new BadRequest('这份已经导入了；要去掉数据，用“撤销这次导入”')
  run("UPDATE import_drafts SET status = '已放弃', updated_at = :at WHERE id = :id", { at: stamp(), id })
  return { ok: true }
}

export type ImportResult = {
  batch: ReturnType<typeof getBatch>
  runs: { id: string; source_id: string; source_name: string; rows: number }[]
  rule: { id: string; name: string; action: '新存' | '更新' | '沿用' | '没存' } | null
  rows: number; new: number; update: number; same: number; problems: number
  /** 导进去的行和原来一模一样：这次只是核对，没改数 */
  all_same: boolean
  provenance: Provenance
  channels: { id: string; name: string; rows: number; date_from: string; date_to: string }[]
  date_from: string | null; date_to: string | null
  /** 只导了一个渠道时：导进来的每天成交额，从第一天到昨天，没导进来的天是 null（画成缺口，不当 0） */
  series: { date: string; gmv: number | null }[]
  problem_rows: { 行: number; 原因: string }[]
  /** 导进来的有几天、成交额合计 */
  days: number; gmv_total: number
  /** 这次导的渠道里，预置示例数据清掉了的（撤销这次导入后，可以放回去） */
  sample_cleared: { id: string; name: string; rows: number }[]
}

/** 一批导入的结果（完成页、导入记录抽屉都用它）：只算经营每天的数那种批次 */
export function resultOf(batchId: string): ImportResult {
  const batch = getBatch(batchId)
  const runs = all<{ id: string; source_id: string; source_name: string; rows: number; detail: string | null }>(`SELECT r.id, r.source_id, s.name AS source_name, r.rows_ok AS rows, r.detail
    FROM import_runs r JOIN data_sources s ON s.id = r.source_id WHERE r.batch_id = :b ORDER BY r.started_at`, { b: batchId })
  const detail = runs[0]?.detail ? JSON.parse(runs[0].detail) as { 新增?: number; 覆盖?: number; 一样?: number; 有问题?: number; 规则?: ImportResult['rule']; 有问题的行?: { 行: number; 原因: string }[] } : {}
  const chans = all<{ ch: string; n: number; f: string; t: string }>(`SELECT substr(row_key, 12) AS ch, COUNT(*) AS n, MIN(substr(row_key, 1, 10)) AS f, MAX(substr(row_key, 1, 10)) AS t
    FROM data_batch_rows WHERE batch_id = :b GROUP BY ch`, { b: batchId })
  const series: ImportResult['series'] = []
  if (chans.length === 1 && batch.date_from) {
    const got = new Map(all<{ k: string; a: string }>('SELECT row_key AS k, after_json AS a FROM data_batch_rows WHERE batch_id = :b', { b: batchId })
      .map((r) => [r.k.slice(0, 10), (JSON.parse(r.a) as { gmv: number }).gmv]))
    const end = addDays(today(), -1) > (batch.date_to ?? '') ? addDays(today(), -1) : batch.date_to!
    for (let d = batch.date_from; d <= end && series.length < 120; d = addDays(d, 1)) series.push({ date: d, gmv: got.get(d) ?? null })
  }
  const totals = get<{ days: number; gmv: number }>(`SELECT COUNT(DISTINCT substr(row_key, 1, 10)) AS days, COALESCE(SUM(json_extract(after_json, '$.gmv')), 0) AS gmv
    FROM data_batch_rows WHERE batch_id = :b AND tbl = 'channel_daily'`, { b: batchId })
  return {
    series, problem_rows: detail.有问题的行 ?? [], days: totals?.days ?? 0, gmv_total: Math.round(totals?.gmv ?? 0),
    sample_cleared: chans.map((c) => ({ id: c.ch, name: CHANNELS[c.ch]?.name ?? c.ch, rows: sampleTrashRows(c.ch) })).filter((c) => c.rows > 0),
    batch, runs: runs.map(({ detail: _d, ...r }) => r), rule: detail.规则 ?? null, rows: batch.rows, new: detail.新增 ?? 0, update: detail.覆盖 ?? 0, same: detail.一样 ?? 0, problems: detail.有问题 ?? 0,
    all_same: batch.rows > 0 && !(detail.新增 ?? 0) && !(detail.覆盖 ?? 0), provenance: provenance(batch.origin, batch.file_name),
    channels: chans.map((c) => ({ id: c.ch, name: CHANNELS[c.ch]?.name ?? c.ch, rows: c.n, date_from: c.f, date_to: c.t })), date_from: batch.date_from, date_to: batch.date_to,
  }
}

/** 存规则：没有规则就新存；按规则导、但这次改了对照或表头变了，就更新规则；原样就只记一次“用过” */
function settleRule(a: Analysis, table: Table, saveRule: boolean, by: string): ImportResult['rule'] {
  const at = stamp()
  const who = by === '网页' ? '你' : by
  // 人点过头的列（你选的、采用 Codex 的）记下谁、哪天确认的
  // 按停用的旧规则对上的列，沿用旧规则里谁、哪天确认的
  const mapping = a.columns.map((c) => ({ col: c.header, field: c.field, how: c.how, ...(c.how === '你选的' || c.how === 'Codex' ? { by: who, at } : c.how === '旧规则' && c.by ? { by: c.by, at: c.at } : {}) }))
  const required = [...new Set([...CORE, ...a.columns.filter((c) => c.state === '已对上' && c.field && (NUMERIC as string[]).includes(c.field)).map((c) => c.field as FieldKey)])]
  const patch = { signature: table.headers, mapping, required, date_format: (a.date?.fmt ?? null) as DateFmt | null, amount_unit: a.amount_unit, channel_id: a.channel_id }
  if (a.rule) {
    const rule = getRule(a.rule.id)
    // 缺列（老板选了“这次先不导”）时不改规则：下次还要提醒；多了新列、改了对照才更新
    const changed = a.columns.some((c) => c.how !== '规则') && !a.rule.missing_cols.length
    if (changed && saveRule) {
      reviseRule(rule.id, { ...patch, required: [...new Set([...rule.required, ...patch.required])] }, by)
      return { id: rule.id, name: a.rule.name, action: '更新' }
    }
    touchRule(rule.id)
    return { id: rule.id, name: a.rule.name, action: '沿用' }
  }
  if (!saveRule) return null
  const platform = a.recognized?.platform ?? (a.channel_id ? CHANNELS[a.channel_id]?.name : null) ?? '自己的表'
  const report = a.recognized?.report ?? '自定义表格'
  const rule: Rule = createRule({ ...patch, platform, report, target: 'channel_daily', source_id: sourceOfChannel(a.channel_id), created_by: by })
  touchRule(rule.id)
  return { id: rule.id, name: `${rule.platform} · ${rule.report}`, action: '新存' }
}

/** 第 ④ 步：导入。整个过程在一个事务里，出错就什么都不写 */
export function commitTable(table: Table, analysis: Analysis, opts: { fileName: string; saveRule: boolean; actor: string; draftId?: string; by?: string }): ImportResult {
  if (analysis.target !== 'channel_daily') throw new BadRequest(analysis.blocking[0] ?? '这张表不能在这里导')
  if (analysis.blocking.length) throw new BadRequest(`还不能导：${analysis.blocking[0]}`)
  const preview = buildPreview(table, analysis)
  if (!preview.rows.length) throw new BadRequest('没有能导的行：先看看预览里每一行的问题')
  const at = stamp()
  const by = opts.by ?? opts.actor
  return tx(() => {
    const rule = settleRule(analysis, table, opts.saveRule, by)
    const chans = preview.channels
    const label = `${chans.map((c) => c.name).join('、')} ${span(preview.date_from, preview.date_to)}`
    const batchId = writeBatch({
      origin: '自己的', source_id: chans.length === 1 ? sourceOfChannel(chans[0].id) : null, rule_id: rule?.id ?? null,
      channel_id: chans.length === 1 ? chans[0].id : null, label, file_name: opts.fileName, date_from: preview.date_from, date_to: preview.date_to, created_by: by,
    }, preview.rows.map((r) => ({ date: r.date, channel_id: r.channel_id, values: r.values })))
    const summary = { 新增: preview.counts.new, 覆盖: preview.counts.update, 一样: preview.counts.same, 有问题: preview.counts.bad, 跳过: preview.counts.skipped, 规则: rule }
    const problems = preview.problems.filter((p) => p.kind === '有问题').slice(0, 30).map((p) => ({ 行: p.line, 原因: p.reason }))
    const skipped = preview.problems.filter((p) => p.kind === '跳过').slice(0, 10).map((p) => ({ 行: p.line, 原因: p.reason }))
    const runIds: string[] = []
    for (const c of chans) {
      const sid = sourceOfChannel(c.id)
      if (!sid) continue
      const runId = uid('run')
      runIds.push(runId)
      const bad = preview.problems.filter((p) => p.kind === '有问题' && (p.channel_id === c.id || p.channel_id === null)).length
      run(`INSERT INTO import_runs (id, source_id, started_at, finished_at, status, file_name, data_date, date_from, rows_total, rows_ok, rows_failed, actor, message, detail, rule_id, batch_id, draft_id, origin)
        VALUES (:id, :s, :at, :at, :st, :f, :to, :from, :total, :ok, :bad, :actor, :msg, :detail, :rule, :batch, :draft, :origin)`, {
        id: runId, s: sid, at, st: bad ? '部分成功' : '成功', f: opts.fileName, to: c.date_to, from: c.date_from, total: c.rows + bad, ok: c.rows, bad, actor: by,
        msg: preview.all_same
          ? `${c.name} ${span(c.date_from, c.date_to)} 核对了 ${c.rows} 行，都和工作台一样，没改数`
          : `${c.name} ${span(c.date_from, c.date_to)} 导入 ${c.rows} 行${bad ? `，${bad} 行有问题没导` : ''}${summary.覆盖 ? `（覆盖原来的 ${summary.覆盖} 行）` : ''}`,
        detail: JSON.stringify({ ...summary, 有问题的行: problems, 跳过的行: skipped }), rule: rule?.id ?? null, batch: batchId, draft: opts.draftId ?? null, origin: '自己的',
      })
      run(`UPDATE data_sources SET last_run_at = :at, last_ok_at = :at,
          note = CASE WHEN status IN ('失败','超时') THEN NULL ELSE note END, status = CASE WHEN status IN ('失败','超时') THEN '正常' ELSE status END WHERE id = :s`, { at, s: sid })
    }
    run('UPDATE data_batches SET run_id = :r WHERE id = :b', { r: runIds[0] ?? null, b: batchId })
    refreshThrough(chans.map((c) => c.id))
    if (opts.draftId) run("UPDATE import_drafts SET status = '已导入', run_id = :r, batch_id = :b, rule_id = :rule, updated_at = :at WHERE id = :id", { r: runIds[0] ?? null, b: batchId, rule: rule?.id ?? null, at, id: opts.draftId })
    logChange('导入', 'data', chans.length === 1 ? sourceOfChannel(chans[0].id) ?? batchId : batchId, '导入', `${label} 经营数据${preview.all_same ? '核对' : '导入'} ${preview.rows.length} 行（${opts.actor}）${rule?.action === '新存' ? `，存了规则「${rule.name}」` : ''}`)
    return resultOf(batchId)
  })
}

export function commitDraft(id: string, input: unknown, actor: string): ImportResult {
  const d = draftRow(id)
  if (d.status !== '对字段') throw new BadRequest(d.status === '已导入' ? '这份文件已经导入过了' : '这份文件已经放弃了')
  const { table, analysis } = load(d)
  const saveRule = (input as { save_rule?: unknown } | null)?.save_rule !== false
  return commitTable(table, analysis, { fileName: d.file_name, saveRule, actor, draftId: id, by: actor === '网页' ? '网页' : actor })
}
