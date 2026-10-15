import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
// Run only the sample CLI against synthetic fixtures with explicit local ROOT/DB/date.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Set an absolute BOSS_WORKBENCH_TEST_EVIDENCE_DIR only when retaining fixtures is intentional.
const evidenceBase = process.env.BOSS_WORKBENCH_TEST_EVIDENCE_DIR
if (evidenceBase && !isAbsolute(evidenceBase)) throw new Error('BOSS_WORKBENCH_TEST_EVIDENCE_DIR must be absolute')
if (evidenceBase) mkdirSync(evidenceBase, { recursive: true })
const dir = mkdtempSync(join(evidenceBase || tmpdir(), 'boss-workbench-sample-files-'))
const cleanup = () => { if (!evidenceBase) rmSync(dir, { recursive: true, force: true }) }
// Also clean a failed top-level import/setup; normal test teardown closes SQLite first.
process.once('exit', cleanup)
const migrationDir = fileURLToPath(new URL('../template/server/migrations/', import.meta.url))
const script = fileURLToPath(new URL('../template/server/modules/data/sample-files.ts', import.meta.url))
const records: unknown[] = []
const channels = ['douyin', 'tmall', 'xhs', 'wechat', 'store']
const fields = ['gmv', 'orders', 'visitors', 'refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers']
const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 27 + i)).toISOString().slice(0, 10))
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const tree = (path: string) => Object.fromEntries(readdirSync(path).sort().map((name) => [name, readFileSync(join(path, name), 'utf8')]))

function fixture(name: string, change?: (db: DatabaseSync) => void) {
  const root = join(dir, name)
  const output = join(root, 'root/工作台/示例数据')
  const copy = join(root, 'copy')
  mkdirSync(output, { recursive: true }); mkdirSync(copy)
  writeFileSync(join(output, 'existing.txt'), 'existing sample output must survive a refusal')
  writeFileSync(join(copy, 'existing.txt'), 'existing copy must survive a refusal')
  const dbPath = join(root, 'workbench.db')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys=ON')
  for (const file of readdirSync(migrationDir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(migrationDir, file), 'utf8'))
  db.prepare("INSERT INTO settings(key,value) VALUES ('business','真实店名不得进入样例')").run()
  for (const ch of channels) {
    db.prepare("INSERT INTO channels(id,name,kind) VALUES (?,?,'线上')").run(ch, `合成 ${ch}`)
    db.prepare(`INSERT INTO data_batches (id,origin,channel_id,label,date_from,date_to,rows,status,created_at,created_by)
      VALUES (?,'示例',?,'合成预置测试',?,?,30,'有效','2026-10-01T00:00','technical-fixture')`).run(`batch_sample_${ch}`, ch, dates[0], dates.at(-1)!)
    for (const date of dates) {
      const values = ch === 'tmall' && date === dates[0] ? fields.map(() => 0) : [1000, 10, 100, 0, 0, 200, 600, 6, 4]
      db.prepare(`INSERT INTO channel_daily(date,channel_id,${fields.join(',')}) VALUES (${Array(11).fill('?').join(',')})`).run(date, ch, ...values)
      db.prepare("INSERT INTO data_batch_rows(batch_id,tbl,row_key,after_json) VALUES (?,'channel_daily',?,?)")
        .run(`batch_sample_${ch}`, `${date}|${ch}`, JSON.stringify(Object.fromEntries(fields.map((k, i) => [k, values[i]]))))
    }
  }
  // This auxiliary table is deliberately not trusted as a source of fictional sample percentages.
  db.prepare("INSERT INTO channel_traffic(date,channel_id,source,visitors) VALUES ('2026-10-14','douyin','直播',999999)").run()
  change?.(db)
  db.close()
  const before = { hash: digest(dbPath), output: tree(output), copy: tree(copy) }
  const result = spawnSync(process.execPath, [script, '--copy', copy], { cwd: fileURLToPath(new URL('../template/', import.meta.url)), encoding: 'utf8',
    env: { PATH: process.env.PATH, WORKBENCH_ROOT: join(root, 'root'), WORKBENCH_DB: dbPath, DEMO_TODAY: '2026-10-15', TZ: 'Asia/Singapore' } })
  const after = { hash: digest(dbPath), output: tree(output), copy: tree(copy) }
  records.push({ name, dbPath, result: { status: result.status, stdout: result.stdout, stderr: result.stderr }, before, after })
  assert.equal(result.error, undefined)
  assert.equal(after.hash, before.hash, '生成脚本只能读取数据库')
  return { result, before, after }
}

const rejected: [string, (db: DatabaseSync) => void, RegExp][] = [
  ['unknown', (db) => { db.exec("UPDATE channel_daily SET refund_amount=NULL WHERE channel_id='tmall' AND date='2026-10-14'") }, /未知或无效数字/],
  ['missing-day', (db) => { db.exec("DELETE FROM channel_daily WHERE channel_id='tmall' AND date='2026-10-14'") }, /覆盖不完整/],
  ['own-latest-batch', (db) => {
    db.exec("INSERT INTO data_batches(id,origin,channel_id,label,rows,status,created_at,created_by) VALUES ('own','自己的','tmall','合成自有数据',1,'有效','2026-10-15T00:00','technical')")
    db.exec("INSERT INTO data_batch_rows(batch_id,tbl,row_key,after_json) SELECT 'own',tbl,row_key,after_json FROM data_batch_rows WHERE batch_id='batch_sample_tmall' AND row_key='2026-10-14|tmall'")
  }, /不属于当前有效的预置示例批次/],
  ['cleared-batch', (db) => { db.exec("UPDATE data_batches SET status='已清除' WHERE id='batch_sample_tmall'") }, /不属于当前有效的预置示例批次/],
  ['missing-audit', (db) => { db.exec("DELETE FROM data_batch_rows WHERE batch_id='batch_sample_tmall' AND row_key='2026-10-14|tmall'") }, /不属于当前有效的预置示例批次/],
  ['changed-value', (db) => { db.exec("UPDATE channel_daily SET gmv=9999 WHERE channel_id='tmall' AND date='2026-10-14'") }, /与预置示例审计不一致/],
]
for (const [name, change, reason] of rejected) test(`样例 CLI 拒绝 ${name}，数据库与已有输出完全不变`, () => {
  const { result, before, after } = fixture(name, change)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, reason)
  assert.match(result.stderr, /未写任何文件/)
  assert.deepEqual(after.output, before.output)
  assert.deepEqual(after.copy, before.copy)
})

test('完整合成预置批次生成 7 份 CSV；保留明确 0，不复制真实店名、不输出 NaN/Infinity', () => {
  const { result, after } = fixture('complete')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(Object.keys(after.output).filter((x) => x.endsWith('.csv')).length, 7)
  for (const [name, content] of Object.entries(after.output)) {
    if (name === 'existing.txt') continue
    assert.equal(after.copy[name], content)
    assert.doesNotMatch(content, /真实店名不得进入样例|NaN|Infinity|999999/)
  }
  const tmall = after.output['天猫_生意参谋取数_店铺日报_20260927-20261026.csv']
  assert(tmall.includes('20260927,0,0,0,0.00,0,,,0.00,0,0.00,0.00,0,0'), '明确 0 保留，两个零分母衍生格留空')
  assert(after.output['README.md'].includes('示例茶社'))
})

after(() => {
 try {
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ scope: 'synthetic CLI verification; not a real database or industry round', records }, null, 2))
 } finally {
  cleanup()
  console.log(`${evidenceBase ? 'EVIDENCE' : 'CLEANED'} ${dir}`)
 }
})
