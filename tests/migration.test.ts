import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Set an absolute BOSS_WORKBENCH_TEST_EVIDENCE_DIR only when retaining fixtures is intentional.
const evidenceBase = process.env.BOSS_WORKBENCH_TEST_EVIDENCE_DIR
if (evidenceBase && !isAbsolute(evidenceBase)) throw new Error('BOSS_WORKBENCH_TEST_EVIDENCE_DIR must be absolute')
if (evidenceBase) mkdirSync(evidenceBase, { recursive: true })
const root = mkdtempSync(join(evidenceBase || tmpdir(), 'boss-workbench-migration-'))
const cleanup = () => { if (!evidenceBase) rmSync(root, { recursive: true, force: true }) }
// Also clean a failed top-level import/setup; normal test teardown closes SQLite first.
process.once('exit', cleanup)
const dbPath=join(root,'legacy.db')
mkdirSync(join(root,'root'))
process.env.WORKBENCH_ROOT=join(root,'root');process.env.WORKBENCH_DB=dbPath;process.env.DEMO_TODAY='2026-10-15';process.env.TZ='Asia/Singapore'
const migrationDir=fileURLToPath(new URL('../template/server/migrations/',import.meta.url))
const old=new DatabaseSync(dbPath)
old.exec('PRAGMA foreign_keys=ON; CREATE TABLE _migrations(name TEXT PRIMARY KEY, at TEXT NOT NULL)')
for(const file of readdirSync(migrationDir).filter(f=>f.endsWith('.sql')&&f<'018').sort()) {
 old.exec(readFileSync(join(migrationDir,file),'utf8'))
 old.prepare('INSERT INTO _migrations VALUES (?,?)').run(file,'2026-10-14T00:00:00Z')
}
old.exec("INSERT INTO channels(id,name,kind) VALUES ('tmall','合成旧库','线上'); INSERT INTO channel_daily VALUES ('2026-10-14','tmall',1000,10,100,0,0,0,0,0,0)")
const oldRow=old.prepare('SELECT * FROM channel_daily').get()
const values={gmv:1000,orders:10,visitors:100,refund_amount:0,refund_orders:0,ad_spend:0,ad_gmv:0,new_buyers:0,old_buyers:0}
old.prepare("INSERT INTO data_batches(id,origin,label,rows,status,created_at,created_by) VALUES ('legacy','自己的','旧库合成夹具',1,'有效','2026-10-14T00:00','technical')").run()
old.prepare("INSERT INTO data_batch_rows(batch_id,tbl,row_key,before_json,after_json) VALUES ('legacy','channel_daily','2026-10-14|tmall',?,?)").run(JSON.stringify(values),JSON.stringify(values))
const oldAudit=old.prepare('SELECT * FROM data_batch_rows').get()
const before={row:oldRow,audit:oldAudit,schema:old.prepare("SELECT sql FROM sqlite_master WHERE name='channel_daily'").get()}
old.close()
const db=await import('../template/server/db.ts')
const {readTable}=await import('../template/server/modules/data/csv.ts')
const {analyze}=await import('../template/server/modules/data/recognize.ts')
const {commitTable}=await import('../template/server/modules/data/importer.ts')
const {undoBatch}=await import('../template/server/modules/data/batches.ts')
test('新增迁移保留旧 0、旧审计和索引；只让未来未知可为空；必填值仍拒绝 null',()=>{
 db.open()
 assert.deepEqual(db.get('SELECT * FROM channel_daily'),oldRow)
 const audit=db.get<any>('SELECT * FROM data_batch_rows')!
 assert.equal(audit.after_json,(oldAudit as any).after_json);assert.equal(audit.before_json,(oldAudit as any).before_json);assert.equal(audit.field_states_json,null)
 assert.equal(db.all('PRAGMA foreign_key_check').length,0)
 assert(db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_daily_channel'"))
 assert.throws(()=>db.run("UPDATE channel_daily SET gmv=NULL WHERE channel_id='tmall'"),/NOT NULL/)
 const csv='日期,成交额,订单数,访客数\n2026-10-13,500,5,50\n';writeFileSync(join(root,'synthetic.csv'),csv)
 const table=readTable(csv);const a=analyze(table,{channel_id:'tmall',ack_missing:['refund_amount','refund_orders','ad_spend','ad_gmv','new_buyers','old_buyers']})
 const out=commitTable(table,a,{fileName:'synthetic.csv',saveRule:false,actor:'technical'})
 assert.equal(db.get<any>("SELECT * FROM channel_daily WHERE date='2026-10-13'")!.ad_spend,null)
 undoBatch(out.batch.id,'technical')
 assert.deepEqual(db.get('SELECT * FROM channel_daily'),oldRow)
 writeFileSync(join(root,'evidence.json'),JSON.stringify({scope:'legacy schema migration, not real database',before,after:{rows:db.all('SELECT * FROM channel_daily'),audit:db.all('SELECT * FROM data_batch_rows'),schema:db.get("SELECT sql FROM sqlite_master WHERE name='channel_daily'"),migrations:db.all('SELECT * FROM _migrations'),foreign_keys:db.all('PRAGMA foreign_key_check')}},null,2))
})

after(() => {
 try { db.open().close() } finally {
  cleanup()
  console.log(`${evidenceBase ? 'EVIDENCE' : 'CLEANED'} ${root}`)
 }
})
