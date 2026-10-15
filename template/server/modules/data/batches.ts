// 一批数据：每次导入写进去的行算一批。写之前先记下原来的样子，所以能整批撤销。
// 写的表：经营每天的数（channel_daily）；小红书笔记数据（xhs_note_stats 累计数、xhs_note_daily 发布后每天的累计、xhs_followers_daily 粉丝数）。
// 预置的示例数据也按渠道记成批（ID 以 batch_sample_ 开头），能按渠道清掉、也能恢复；你导的数都不动。归属：数据源与导入模块。
import { all, get, run, tx, uid, logChange } from '../../db.ts'
import { BadRequest, NotFound } from '../../services/common.ts'
import { CHANNELS, NUMERIC } from './fields.ts'
import type { DailyValues, FieldState } from './preview.ts'
import { isPresetBatch, provenance } from './origin.ts'
import { md, span, stamp } from './time.ts'

export type Batch = {
  id: string; origin: '示例' | '自己的'; source_id: string | null; rule_id: string | null; run_id: string | null; channel_id: string | null
  label: string; file_name: string | null; target: string; date_from: string | null; date_to: string | null; rows: number
  status: '有效' | '已撤销' | '已清除'; created_at: string; created_by: string; undone_at: string | null; undone_by: string | null; note: string | null
}

/** 能写、能撤销的表：主键列 + 值列 */
export const TABLES = {
  channel_daily: { keys: ['date', 'channel_id'], cols: NUMERIC as string[] },
  xhs_note_stats: { keys: ['note_id', 'traffic'], cols: ['impressions', 'reads', 'likes', 'saves', 'comments', 'shares', 'new_followers', 'spend', 'stats_date'] },
  xhs_note_daily: { keys: ['note_id', 'traffic', 'day'], cols: ['date', 'impressions', 'reads', 'likes', 'saves', 'comments', 'new_followers', 'spend'] },
  xhs_followers_daily: { keys: ['date'], cols: ['followers', 'gained', 'lost'] },
} as const
/** 只算“附带”写进去的行，不算进一批的行数（每天的累计、粉丝数） */
const SIDE: Tbl[] = ['xhs_note_daily', 'xhs_followers_daily']
export type Tbl = keyof typeof TABLES
type Vals = Record<string, string | number | null>

const splitKey = (tbl: Tbl, k: string): Vals => Object.fromEntries(TABLES[tbl].keys.map((c, i) => [c, c === 'day' ? Number(k.split('|')[i]) : k.split('|')[i]]))
const where = (tbl: Tbl) => TABLES[tbl].keys.map((c) => `${c} = :k_${c}`).join(' AND ')
const keyParams = (tbl: Tbl, k: string) => Object.fromEntries(Object.entries(splitKey(tbl, k)).map(([c, v]) => [`k_${c}`, v]))

export function currentOf(tbl: Tbl, key: string): Vals | null {
  const r = get<Vals>(`SELECT * FROM ${tbl} WHERE ${where(tbl)}`, keyParams(tbl, key))
  if (!r) return null
  return Object.fromEntries(TABLES[tbl].cols.map((c) => [c, r[c] === null ? null : typeof r[c] === 'string' ? r[c] : Number(r[c])]))
}

function upsertRow(tbl: Tbl, key: string, v: Vals) {
  const { keys, cols } = TABLES[tbl]
  const all = [...keys, ...cols]
  run(`INSERT INTO ${tbl} (${all.join(', ')}) VALUES (${all.map((c) => `:${c}`).join(', ')})
    ON CONFLICT(${keys.join(', ')}) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`, { ...splitKey(tbl, key), ...Object.fromEntries(cols.map((c) => [c, tbl === 'channel_daily' ? v[c] ?? null : v[c] ?? 0])) })
}
const deleteRow = (tbl: Tbl, key: string) => run(`DELETE FROM ${tbl} WHERE ${where(tbl)}`, keyParams(tbl, key))

/** 这一行现在归哪一批：最后写它、还有效的那一批 */
function ownerOf(tbl: Tbl, key: string): string | null {
  return get<{ id: string }>(`SELECT b.id FROM data_batch_rows r JOIN data_batches b ON b.id = r.batch_id
    WHERE r.tbl = :t AND r.row_key = :k AND b.status = '有效' ORDER BY b.rowid DESC LIMIT 1`, { t: tbl, k: key })?.id ?? null
}

export type NewBatch = Pick<Batch, 'origin' | 'source_id' | 'rule_id' | 'channel_id' | 'label' | 'file_name' | 'date_from' | 'date_to' | 'created_by'> & { created_at?: string; note?: string | null; target?: string; id?: string }

/** 新建一批并写入（调用方负责包在事务里）。rows 里每行说清写哪张表、主键、值。返回批次 ID */
export function writeRows(meta: NewBatch, rows: { tbl: Tbl; key: string; values: Vals; field_states?: Record<string, FieldState> }[]): string {
  const id = meta.id ?? uid('batch')
  run(`INSERT INTO data_batches (id, origin, source_id, rule_id, channel_id, label, file_name, target, date_from, date_to, rows, status, created_at, created_by, note)
    VALUES (:id, :origin, :source_id, :rule_id, :channel_id, :label, :file_name, :target, :date_from, :date_to, :rows, '有效', :at, :by, :note)`, {
    id, origin: meta.origin, source_id: meta.source_id, rule_id: meta.rule_id, channel_id: meta.channel_id, label: meta.label, file_name: meta.file_name,
    target: meta.target ?? 'channel_daily', date_from: meta.date_from, date_to: meta.date_to, rows: rows.filter((r) => !SIDE.includes(r.tbl)).length,
    at: meta.created_at ?? stamp(), by: meta.created_by, note: meta.note ?? null,
  })
  for (const r of rows) {
    const prev = currentOf(r.tbl, r.key)
    run(`INSERT INTO data_batch_rows (batch_id, tbl, row_key, before_json, before_batch, after_json, field_states_json) VALUES (:b, :t, :k, :before, :owner, :after, :states)`, {
      b: id, t: r.tbl, k: r.key, before: prev ? JSON.stringify(prev) : null, owner: prev ? ownerOf(r.tbl, r.key) : null, after: JSON.stringify(r.values), states: r.field_states ? JSON.stringify(r.field_states) : null,
    })
    upsertRow(r.tbl, r.key, r.values)
  }
  return id
}

/** 经营每天的数写一批（导入页、立即同步、命令行都走这里） */
export function writeBatch(meta: NewBatch, rows: { date: string; channel_id: string; values: DailyValues; field_states?: Record<string, FieldState> }[]): string {
  return writeRows(meta, rows.map((r) => ({ tbl: 'channel_daily' as const, key: `${r.date}|${r.channel_id}`, values: r.values, field_states: r.field_states })))
}

/** 数据源的“数据截至”跟着经营表走：导入、撤销、清示例之后都重算 */
export function refreshThrough(channelIds: string[]) {
  for (const ch of new Set(channelIds)) {
    const d = get<{ d: string | null }>('SELECT MAX(date) AS d FROM channel_daily WHERE channel_id = :c', { c: ch })?.d ?? null
    run('UPDATE data_sources SET data_through = :d WHERE channel_id = :c', { d, c: ch })
  }
}

/** 撤销之后，数据源的“最近更新 / 最近成功”退回到上一条还算数的记录（撤销了的那次不算），经营页的“几点导进来”跟着变 */
export function refreshSourceTimes(sourceIds: (string | null | undefined)[]) {
  for (const id of new Set(sourceIds.filter((x): x is string => !!x))) {
    const live = `FROM import_runs r LEFT JOIN data_batches b ON b.id = r.batch_id WHERE r.source_id = :s AND (b.id IS NULL OR b.status <> '已撤销')`
    const last = get<{ at: string }>(`SELECT r.started_at AS at ${live} ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1`, { s: id })?.at ?? null
    const ok = get<{ at: string }>(`SELECT r.started_at AS at ${live} AND r.status IN ('成功','部分成功') ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1`, { s: id })?.at ?? null
    run('UPDATE data_sources SET last_run_at = :last, last_ok_at = :ok WHERE id = :s', { last, ok, s: id })
  }
}

/** 某个渠道的预置示例数据现在清掉了几行（在回收区里，能放回去） */
export const sampleTrashRows = (channelId: string) => get<{ n: number }>('SELECT COUNT(*) AS n FROM data_sample_trash WHERE batch_id = :b', { b: `batch_sample_${channelId}` })?.n ?? 0

/** 小红书笔记数据撤销之后：数据截至按笔记数据算；最近一次没撤销的运行是失败，就回到“读取失败” */
export function refreshNotesSource(sourceId = 'src_xhs_notes') {
  const through = get<{ d: string | null }>('SELECT MAX(stats_date) AS d FROM xhs_note_stats')?.d ?? null
  const last = get<{ status: string; message: string | null; started_at: string }>(`SELECT r.status, r.message, r.started_at FROM import_runs r LEFT JOIN data_batches b ON b.id = r.batch_id
    WHERE r.source_id = :s AND (b.id IS NULL OR b.status = '有效') ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1`, { s: sourceId })
  const failed = last?.status === '失败'
  const pending = get<{ n: number }>("SELECT COUNT(*) AS n FROM field_mappings WHERE source_id = :s AND status IN ('AI 建议','未匹配')", { s: sourceId })?.n ?? 0
  const note = !failed ? null : pending
    ? `${md(last!.started_at.slice(0, 10))} ${last!.started_at.slice(11, 16)} 那次导入失败：${last!.message ?? ''}`
    : `重新导入撤销了，笔记数据回到 ${md(through)}；对照已经确认过，可以再点“按新规则重新导入”`
  run(`UPDATE data_sources SET data_through = :d, status = CASE WHEN :f THEN '失败' ELSE status END,
      note = CASE WHEN :f THEN :n ELSE note END WHERE id = :s`, { d: through, f: failed ? 1 : 0, n: note, s: sourceId })
}

export function getBatch(id: string): Batch {
  const b = get<Batch>('SELECT * FROM data_batches WHERE id = :id', { id })
  if (!b) throw new NotFound('找不到这一批导入')
  return b
}

export function listBatches(origin?: string) {
  return all<Batch & { source_name: string | null; rule_name: string | null; run_count: number }>(`SELECT b.*, s.name AS source_name,
      (SELECT platform || ' · ' || report FROM import_rules WHERE id = b.rule_id) AS rule_name,
      (SELECT COUNT(*) FROM import_runs WHERE batch_id = b.id) AS run_count
    FROM data_batches b LEFT JOIN data_sources s ON s.id = b.source_id
    WHERE (:o IS NULL OR b.origin = :o) ORDER BY b.rowid DESC`, { o: origin ?? null })
    .map((b) => ({ ...b, preset: isPresetBatch(b.id), provenance: provenance(b.origin, b.file_name) }))
}

type BeforeRow = { tbl: Tbl; row_key: string; before_json: string | null; before_batch: string | null }
/** 非顺序撤销时跳过已经失效的覆盖层，避免复活已撤销的数。旧的无批次快照仍原样保留。 */
function undoValue(id: string, row: BeforeRow): string | null {
  let prior = row
  const seen = new Set([id])
  while (prior.before_batch) {
    const previous = prior.before_batch
    if (seen.has(previous)) throw new BadRequest('撤销记录存在循环，尚未修改任何数据')
    seen.add(previous)
    const batch = get<{ status: string }>('SELECT status FROM data_batches WHERE id = :id', { id: previous })
    if (!batch) throw new BadRequest('撤销所需的历史批次缺失，尚未修改任何数据')
    if (batch.status === '有效') return prior.before_json
    const next = get<BeforeRow>('SELECT tbl, row_key, before_json, before_batch FROM data_batch_rows WHERE batch_id = :b AND tbl = :t AND row_key = :k', { b: previous, t: row.tbl, k: row.row_key })
    if (!next) throw new BadRequest('撤销所需的历史快照缺失，尚未修改任何数据')
    prior = next
  }
  if (prior.before_json !== null) return prior.before_json
  // 原来是空的，但中途恢复过更早的示例批次：退回目前仍有效的旧批次。
  return get<{ a: string }>(`SELECT r.after_json AS a FROM data_batch_rows r JOIN data_batches b ON b.id = r.batch_id
    WHERE r.tbl = :t AND r.row_key = :k AND b.status = '有效' AND b.rowid < (SELECT rowid FROM data_batches WHERE id = :id)
    ORDER BY b.rowid DESC LIMIT 1`, { t: row.tbl, k: row.row_key, id })?.a ?? null
}

/** 撤销一次导入：仍归这一批的行恢复到有效的前值；后来被其他导入覆盖的行不动。 */
export function undoBatch(id: string, actor: string) {
  const b = getBatch(id)
  if (isPresetBatch(id)) throw new BadRequest('这一批是预置的示例数据，用导入记录页的“清掉示例数据”来去掉')
  if (b.status !== '有效') throw new BadRequest(`这一批${b.status}了`)
  const rows = all<BeforeRow>('SELECT tbl, row_key, before_json, before_batch FROM data_batch_rows WHERE batch_id = :b', { b: id })
  let restored = 0, removed = 0, kept = 0
  const at = stamp()
  const chans: string[] = []
  tx(() => {
    for (const r of rows) {
      if (!(r.tbl in TABLES)) continue
      if (ownerOf(r.tbl, r.row_key) !== id) { if (!SIDE.includes(r.tbl)) kept++; continue }
      const back = undoValue(id, r)
      const counts = !SIDE.includes(r.tbl)
      if (back) { upsertRow(r.tbl, r.row_key, JSON.parse(back)); if (counts) restored++ }
      else { deleteRow(r.tbl, r.row_key); if (counts) removed++ }
      if (r.tbl === 'channel_daily') chans.push(String(splitKey('channel_daily', r.row_key).channel_id))
    }
    run("UPDATE data_batches SET status = '已撤销', undone_at = :at, undone_by = :by WHERE id = :id", { at, by: actor, id })
    run("UPDATE import_drafts SET status = '对字段', run_id = NULL, batch_id = NULL WHERE batch_id = :id", { id })
    refreshThrough(chans)
    refreshSourceTimes([b.source_id, ...all<{ s: string }>('SELECT DISTINCT source_id AS s FROM import_runs WHERE batch_id = :b', { b: id }).map((x) => x.s)])
    if (rows.some((r) => r.tbl === 'xhs_note_stats')) refreshNotesSource(b.source_id ?? undefined)
    logChange('网页', 'data', id, '撤销', `撤销了导入「${b.label}」：恢复 ${restored} 行${removed ? `、删掉新增的 ${removed} 行` : ''}${kept ? `；${kept} 行后来又被别的导入改过，没动` : ''}`)
  })
  // 撤销后这个渠道一行数都没有了、示例数据又是清掉的：告诉网页，可以把示例数据放回去
  const empty = [...new Set(chans)].filter((ch) => !get<{ n: number }>('SELECT COUNT(*) AS n FROM channel_daily WHERE channel_id = :c', { c: ch })?.n)
    .map((ch) => ({ id: ch, name: CHANNELS[ch]?.name ?? ch, sample_rows: sampleTrashRows(ch) }))
  return { batch: getBatch(id), restored, removed, kept, empty_channels: empty }
}

// ———— 预置的示例数据 ————

const presetBatches = (channel?: string) => all<Batch>("SELECT * FROM data_batches WHERE id LIKE 'batch_sample_%' AND (:c IS NULL OR channel_id = :c) ORDER BY channel_id", { c: channel ?? null })
/** 网页、命令行传来的渠道：不认识就报错，不传就是全部 */
export function channelArg(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !(v in CHANNELS)) throw new BadRequest(`渠道不认识（可以是：${Object.keys(CHANNELS).join('、')}）`)
  return v
}

export function sampleStatus() {
  const batches = presetBatches()
  const live = get<{ n: number }>(`SELECT COUNT(*) AS n FROM data_batch_rows r JOIN data_batches b ON b.id = r.batch_id
    WHERE b.id LIKE 'batch_sample_%' AND b.status = '有效' AND r.tbl = 'channel_daily'`)?.n ?? 0
  const trash = get<{ n: number }>('SELECT COUNT(*) AS n FROM data_sample_trash')?.n ?? 0
  const mine = get<{ n: number }>("SELECT COUNT(*) AS n FROM data_batches WHERE id NOT LIKE 'batch_sample_%' AND status = '有效'")?.n ?? 0
  const valid = batches.filter((b) => b.status === '有效')
  return {
    batches: batches.map((b) => ({
      id: b.id, label: b.label, channel_id: b.channel_id, channel: b.channel_id ? CHANNELS[b.channel_id]?.name ?? b.channel_id : null, rows: b.rows, status: b.status,
      range: span(b.date_from, b.date_to), cleared_rows: b.channel_id ? sampleTrashRows(b.channel_id) : 0,
    })),
    rows_live: live, rows_cleared: trash, my_batches: mine,
    /** 预置的示例批次都清掉了（没有预置批次时不算“清掉”） */
    cleared: batches.length > 0 && valid.length === 0,
    /** 清掉了一部分：哪几个渠道 */
    cleared_channels: batches.filter((b) => b.status === '已清除' && b.channel_id).map((b) => CHANNELS[b.channel_id!]?.name ?? b.channel_id!),
    has_presets: batches.length > 0,
  }
}

/** 清掉预置示例（channel 不传 = 5 个渠道都清）：只删还归示例批次的行（后来导过、覆盖了的不动），删掉的行放进回收区，能恢复 */
export function clearSamples(actor: string, channel?: string) {
  const batches = presetBatches(channel).filter((b) => b.status === '有效')
  const name = channel ? CHANNELS[channel]?.name ?? channel : ''
  if (!batches.length) throw new BadRequest(channel ? `${name}的示例数据已经清掉了` : '预置的示例数据已经清掉了')
  let cleared = 0, kept = 0
  const at = stamp()
  const chans: string[] = []
  tx(() => {
    for (const b of batches) {
      for (const r of all<{ row_key: string }>("SELECT row_key FROM data_batch_rows WHERE batch_id = :b AND tbl = 'channel_daily'", { b: b.id })) {
        if (ownerOf('channel_daily', r.row_key) !== b.id) { kept++; continue }
        const cur = currentOf('channel_daily', r.row_key)
        if (!cur) continue
        run('INSERT INTO data_sample_trash (batch_id, tbl, row_key, row_json, cleared_at) VALUES (:b, :t, :k, :j, :at)', { b: b.id, t: 'channel_daily', k: r.row_key, j: JSON.stringify(cur), at })
        deleteRow('channel_daily', r.row_key)
        chans.push(String(splitKey('channel_daily', r.row_key).channel_id))
        cleared++
      }
      run("UPDATE data_batches SET status = '已清除', undone_at = :at, undone_by = :by WHERE id = :id", { at, by: actor, id: b.id })
    }
    refreshThrough(chans)
    logChange('网页', 'data', 'samples', '清除', `清掉了${name ? `${name}的` : ''}预置示例数据：经营每天的数 ${cleared} 行${kept ? `（${kept} 行后来导过，没动）` : ''}`)
  })
  return { cleared, kept, channel: channel ?? null, status: sampleStatus() }
}

/** 恢复预置示例（channel 不传 = 全部放回）：回收区里的行放回去；那一天那个渠道已经有你导的数了就不放 */
export function restoreSamples(actor: string, channel?: string) {
  const trash = all<{ id: number; batch_id: string; row_key: string; row_json: string }>('SELECT * FROM data_sample_trash WHERE (:b IS NULL OR batch_id = :b) ORDER BY id', { b: channel ? `batch_sample_${channel}` : null })
  const name = channel ? CHANNELS[channel]?.name ?? channel : ''
  if (!trash.length) throw new BadRequest(channel ? `${name}没有清掉的示例数据可以恢复` : '没有清掉的示例数据可以恢复')
  let restored = 0, skipped = 0
  const chans: string[] = []
  tx(() => {
    for (const t of trash) {
      if (currentOf('channel_daily', t.row_key)) { skipped++; continue }
      upsertRow('channel_daily', t.row_key, JSON.parse(t.row_json))
      chans.push(String(splitKey('channel_daily', t.row_key).channel_id))
      restored++
    }
    const ids = [...new Set(trash.map((t) => t.batch_id))]
    for (const b of ids) {
      run("UPDATE data_batches SET status = '有效', undone_at = NULL, undone_by = NULL WHERE id = :b AND status = '已清除'", { b })
      run('DELETE FROM data_sample_trash WHERE batch_id = :b', { b })
    }
    refreshThrough(chans)
    logChange('网页', 'data', 'samples', '恢复', `恢复了${name ? `${name}的` : ''}预置示例数据：${restored} 行${skipped ? `（${skipped} 行那天已经有你导的数，没放回）` : ''}（${actor}）`)
  })
  return { restored, skipped, channel: channel ?? null, status: sampleStatus() }
}
