import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
// Synthetic SQLite only: evidenceFor() is the production evidence entry; no server or notification runs.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AnomalyItem } from '../template/server/modules/biz/anomaly.ts'

// Set an absolute BOSS_WORKBENCH_TEST_EVIDENCE_DIR only when retaining fixtures is intentional.
const evidenceBase = process.env.BOSS_WORKBENCH_TEST_EVIDENCE_DIR
if (evidenceBase && !isAbsolute(evidenceBase)) throw new Error('BOSS_WORKBENCH_TEST_EVIDENCE_DIR must be absolute')
if (evidenceBase) mkdirSync(evidenceBase, { recursive: true })
const dir = mkdtempSync(join(evidenceBase || tmpdir(), 'boss-workbench-evidence-gaps-'))
const cleanup = () => { if (!evidenceBase) rmSync(dir, { recursive: true, force: true }) }
// Also clean a failed top-level import/setup; normal test teardown closes SQLite first.
process.once('exit', cleanup)
mkdirSync(join(dir, 'root'))
process.env.WORKBENCH_ROOT = join(dir, 'root')
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = '2026-10-15'
process.env.TZ = 'Asia/Singapore'
const db = await import('../template/server/db.ts')
const { evidenceFor } = await import('../template/server/modules/biz/evidence.ts')
const { DEFAULT_CONFIG } = await import('../template/server/modules/biz/config.ts')
const records: unknown[] = []
db.run("INSERT INTO channels(id,name,kind) VALUES ('tmall','合成证据渠道','线上')")
const inputs = [
  ['2026-09-25', 700, 0, 0, 0],
  ['2026-10-01', 1000, 100, 200, 800],
  ['2026-10-03', 1200, null, 200, null],
  ['2026-10-04', 0, 0, 0, 0],
  ['2026-10-05', 800, 0, 200, 0],
  ['2026-10-14', 400, 0, 100, 200],
] as const
for (const [date, gmv, refund, spend, adGmv] of inputs) db.run(`INSERT INTO channel_daily
  (date,channel_id,gmv,orders,visitors,refund_amount,refund_orders,ad_spend,ad_gmv,new_buyers,old_buyers)
  VALUES (:date,'tmall',:gmv,:orders,:visitors,:refund,0,:spend,:adGmv,0,0)`,
{ date, gmv, orders: gmv ? 10 : 0, visitors: gmv ? 100 : 0, refund, spend, adGmv })

function evidence(kind: string) {
  const item: AnomalyItem = { id: `synthetic_${kind}`, level: '高', module: 'biz', kind, channel_id: 'tmall',
    title: '合成异常描述（仅用于证据入口验证）', detail: '', cause: null, since: '2026-10-01', link: '',
    channel_name: '合成证据渠道', status: '待处理', owner: null, note: null, suggestions: [], suggested_by: null,
    suggested_at: null, first_seen: '2026-10-01', updated_at: null, updated_by: null, active: true, quiet: false }
  const result = evidenceFor(item, '2026-10-14', DEFAULT_CONFIG)
  records.push({ kind, result })
  return result.evidence.series
}

test('退款与 ROI 证据逐日保留整行缺失、字段 null、零分母和明确 0', () => {
  for (const [kind, known] of [['退款', 10], ['推广', 4]] as const) {
    const series = evidence(kind)
    assert.equal(series.length, 21)
    assert.equal(series[0].date, '2026-09-24')
    assert.equal(series.at(-1)!.date, '2026-10-14')
    const point = (date: string) => series.find((p) => p.date === date)!
    assert.equal(point('2026-10-01').value, known)
    assert.equal(point('2026-10-02').value, null, '整天缺记录要有 null 点，不能跨日连线')
    assert.equal(point('2026-10-03').value, null, '现存行未知字段仍是 null')
    assert.equal(point('2026-10-04').value, null, '明确 0 分母不可计算')
    assert.equal(point('2026-10-05').value, 0, '明确 0 分子仍是已知数')
  }
})

test('成交证据补齐日期，两条线各自保留真实基准，不随当前缺日清空', () => {
  const series = evidence('成交')
  assert.equal(series.length, 14)
  const point = (date: string) => series.find((p) => p.date === date)!
  assert.deepEqual(point('2026-10-02'), { date: '2026-10-02', value: null, base: 700 })
  assert.deepEqual(point('2026-10-08'), { date: '2026-10-08', value: null, base: 1000 })
  assert.deepEqual(point('2026-10-04'), { date: '2026-10-04', value: 0, base: null })
  assert.deepEqual(point('2026-10-11'), { date: '2026-10-11', value: null, base: 0 })
  assert.deepEqual(point('2026-10-14'), { date: '2026-10-14', value: 400, base: null })
})

after(() => {
 try {
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ scope: 'synthetic evidence module verification; not browser acceptance', inputs, records }, null, 2))
 } finally {
  try { db.open().close() } finally { cleanup() }
  console.log(`${evidenceBase ? 'EVIDENCE' : 'CLEANED'} ${dir}`)
 }
})
