import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
// Three compatibility edges only; synthetic DB, native module entries, no server or notifications.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DailyValues } from '../template/server/modules/data/preview.ts'

// Set an absolute BOSS_WORKBENCH_TEST_EVIDENCE_DIR only when retaining fixtures is intentional.
const evidenceBase = process.env.BOSS_WORKBENCH_TEST_EVIDENCE_DIR
if (evidenceBase && !isAbsolute(evidenceBase)) throw new Error('BOSS_WORKBENCH_TEST_EVIDENCE_DIR must be absolute')
if (evidenceBase) mkdirSync(evidenceBase, { recursive: true })
const dir = mkdtempSync(join(evidenceBase || tmpdir(), 'boss-workbench-undo-compat-'))
const cleanup = () => { if (!evidenceBase) rmSync(dir, { recursive: true, force: true }) }
// Also clean a failed top-level import/setup; normal test teardown closes SQLite first.
process.once('exit', cleanup)
mkdirSync(join(dir, 'root'))
process.env.WORKBENCH_ROOT = join(dir, 'root')
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = '2026-10-15'
process.env.TZ = 'Asia/Singapore'
const db = await import('../template/server/db.ts')
const { readTable } = await import('../template/server/modules/data/csv.ts')
const { analyze } = await import('../template/server/modules/data/recognize.ts')
const { commitTable } = await import('../template/server/modules/data/importer.ts')
const { writeRows, currentOf, getBatch, clearSamples, restoreSamples, undoBatch } = await import('../template/server/modules/data/batches.ts')
const { trace } = await import('../template/server/modules/biz/trace.ts')
const records: unknown[] = []
const inputs: { file: string; channel: string; content: string }[] = []
const date = '2026-10-14'
const actor = 'technical-undo-compat'
const optional = ['refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers'] as const
const headers = ['日期', '成交额', '订单数', '访客数', '退款金额', '退款单数', '推广花费', '推广成交额', '新客数', '老客数']
const values: DailyValues = { gmv: 1000, orders: 10, visitors: 100, refund_amount: null, refund_orders: 0,
  ad_spend: null, ad_gmv: 0, new_buyers: null, old_buyers: 0 }
const snapshot = () => ({ daily: db.all('SELECT * FROM channel_daily ORDER BY channel_id,date'),
  batches: db.all('SELECT * FROM data_batches ORDER BY rowid'), audit: db.all('SELECT * FROM data_batch_rows ORDER BY rowid'),
  trash: db.all('SELECT * FROM data_sample_trash ORDER BY id') })
const key = (channel: string) => `${date}|${channel}`
const owner = (channel: string) => db.get<{ id: string }>(`SELECT b.id FROM data_batch_rows r JOIN data_batches b ON b.id=r.batch_id
  WHERE r.tbl='channel_daily' AND r.row_key=:key AND b.status='有效' ORDER BY b.rowid DESC LIMIT 1`, { key: key(channel) })?.id ?? null
const provenance = (channel: string) => trace({ metric: 'ad_spend', channel, from: date, to: date }).daily[0].provenance[0]

for (const channel of ['tmall', 'douyin', 'xhs']) db.run("INSERT INTO channels(id,name,kind) VALUES (:id,:name,'线上')", {
  id: channel, name: `合成兼容测试 ${channel}`,
})

function importZero(channel: string) {
  const content = [headers, [date, 1000, 10, 100, 0, 0, 0, 0, 0, 0]].map((r) => r.join(',')).join('\n') + '\n'
  const file = `synthetic-${channel}-explicit-zero.csv`
  inputs.push({ file, channel, content }); writeFileSync(join(dir, file), content)
  const table = readTable(content)
  const analysis = analyze(table, { channel_id: channel, ack_missing: [...optional] })
  assert.deepEqual(analysis.blocking, [])
  return commitTable(table, analysis, { fileName: file, saveRule: false, actor })
}

function sample(channel: string) {
  const id = `batch_sample_${channel}`
  db.tx(() => writeRows({ id, origin: '示例', source_id: null, rule_id: null, channel_id: channel,
    label: `纯合成 nullable 预置兼容测试 ${channel}`, file_name: null, date_from: date, date_to: date, created_by: actor },
  [{ tbl: 'channel_daily', key: key(channel), values: { ...values } }]))
  return id
}

test('旧无批次快照：明确 0 覆盖后撤销，原 null/0 原样恢复且没有虚构有效来源', () => {
  // Deliberately bootstrap legacy data without an audit batch, as required by this compatibility case.
  db.run(`INSERT INTO channel_daily(date,channel_id,gmv,orders,visitors,refund_amount,refund_orders,ad_spend,ad_gmv,new_buyers,old_buyers)
    VALUES (:date,'tmall',1000,10,100,NULL,0,NULL,0,NULL,0)`, { date })
  assert.equal(owner('tmall'), null)
  const before = snapshot()
  const batch = importZero('tmall').batch.id
  const audit = db.get<{ before_json: string; before_batch: string | null; after_json: string }>('SELECT * FROM data_batch_rows WHERE batch_id=:id', { id: batch })!
  assert.equal(audit.before_batch, null)
  assert.deepEqual(JSON.parse(audit.before_json), values)
  assert.equal(JSON.parse(audit.after_json).ad_spend, 0)
  assert.equal(currentOf('channel_daily', key('tmall'))!.ad_spend, 0)
  const overwritten = snapshot()
  const undo = undoBatch(batch, actor)
  assert.equal(undo.restored, 1); assert.equal(undo.removed, 0)
  assert.equal(getBatch(batch).status, '已撤销')
  assert.deepEqual(currentOf('channel_daily', key('tmall')), values)
  assert.equal(owner('tmall'), null)
  const source = provenance('tmall')
  assert.equal(source.batch_id, null); assert.equal(source.field_states, null)
  records.push({ case: 'legacy-unbatched', before, overwritten, undo, source, after: snapshot() })
})

test('清除被覆盖的示例后再撤销普通导入：失效示例不复活，新增行被删除', () => {
  const preset = sample('douyin')
  const before = snapshot()
  const batch = importZero('douyin').batch.id
  const audit = db.get<{ before_json: string; before_batch: string | null }>('SELECT * FROM data_batch_rows WHERE batch_id=:id', { id: batch })!
  assert.equal(audit.before_batch, preset)
  assert.equal(JSON.parse(audit.before_json).ad_spend, null)
  const cleared = clearSamples(actor, 'douyin')
  assert.equal(cleared.cleared, 0); assert.equal(cleared.kept, 1)
  assert.equal(getBatch(preset).status, '已清除')
  assert.equal(getBatch(batch).status, '有效')
  assert.equal(currentOf('channel_daily', key('douyin'))!.ad_spend, 0)
  assert.equal(owner('douyin'), batch)
  const afterClear = snapshot()
  const undo = undoBatch(batch, actor)
  assert.equal(undo.removed, 1); assert.equal(undo.restored, 0)
  assert.equal(currentOf('channel_daily', key('douyin')), null)
  assert.equal(getBatch(preset).status, '已清除'); assert.equal(getBatch(batch).status, '已撤销')
  assert.equal(owner('douyin'), null)
  const source = provenance('douyin')
  assert.equal(source.batch_id, null)
  records.push({ case: 'cleared-preset-is-not-revived', before, batch, cleared, afterClear, undo, source, after: snapshot() })
})

test('清除→普通导入→恢复示例→撤销：回退到已重新有效的示例，保留 null/0 并对齐来源', () => {
  const preset = sample('xhs')
  const before = snapshot()
  const cleared = clearSamples(actor, 'xhs')
  assert.equal(cleared.cleared, 1); assert.equal(getBatch(preset).status, '已清除')
  assert.equal(currentOf('channel_daily', key('xhs')), null)
  const batch = importZero('xhs').batch.id
  const audit = db.get<{ before_json: string | null; before_batch: string | null }>('SELECT * FROM data_batch_rows WHERE batch_id=:id', { id: batch })!
  assert.equal(audit.before_json, null); assert.equal(audit.before_batch, null)
  assert.equal(currentOf('channel_daily', key('xhs'))!.ad_spend, 0)
  const restored = restoreSamples(actor, 'xhs')
  assert.equal(restored.restored, 0); assert.equal(restored.skipped, 1, '自己的有效行不能被恢复示例覆盖')
  assert.equal(getBatch(preset).status, '有效'); assert.equal(getBatch(batch).status, '有效')
  assert.equal(currentOf('channel_daily', key('xhs'))!.ad_spend, 0)
  assert.equal(owner('xhs'), batch); assert.equal(provenance('xhs').batch_id, batch)
  const afterRestore = snapshot()
  const undo = undoBatch(batch, actor)
  assert.equal(undo.restored, 1); assert.equal(undo.removed, 0)
  assert.deepEqual(currentOf('channel_daily', key('xhs')), values)
  assert.equal(getBatch(preset).status, '有效'); assert.equal(getBatch(batch).status, '已撤销')
  assert.equal(owner('xhs'), preset)
  const source = provenance('xhs')
  assert.equal(source.batch_id, preset); assert.equal(source.field_states, null)
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM data_sample_trash WHERE batch_id=:id', { id: preset })!.n, 0)
  records.push({ case: 'restored-preset-remains-eligible', before, cleared, batch, restored, afterRestore, undo, source, after: snapshot() })
})

after(() => {
 try {
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ scope: 'three synthetic undo compatibility cases; not R1 or a real database',
    environment: { root: process.env.WORKBENCH_ROOT, db: process.env.WORKBENCH_DB, demoToday: process.env.DEMO_TODAY }, inputs, records }, null, 2))
 } finally {
  try { db.open().close() } finally { cleanup() }
  console.log(`${evidenceBase ? 'EVIDENCE' : 'CLEANED'} ${dir}`)
 }
})
