import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
// Only synthetic data, local Hono request() calls, and a per-run isolated SQLite DB.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
// Set an absolute BOSS_WORKBENCH_TEST_EVIDENCE_DIR only when retaining fixtures is intentional.
const evidenceBase = process.env.BOSS_WORKBENCH_TEST_EVIDENCE_DIR
if (evidenceBase && !isAbsolute(evidenceBase)) throw new Error('BOSS_WORKBENCH_TEST_EVIDENCE_DIR must be absolute')
if (evidenceBase) mkdirSync(evidenceBase, { recursive: true })
const dir = mkdtempSync(join(evidenceBase || tmpdir(), 'boss-workbench-nullable-'))
const cleanup = () => { if (!evidenceBase) rmSync(dir, { recursive: true, force: true }) }
// Also clean a failed top-level import/setup; normal test teardown closes SQLite first.
process.once('exit', cleanup)
mkdirSync(join(dir,'root'))
process.env.WORKBENCH_ROOT = join(dir,'root')
process.env.WORKBENCH_DB = join(dir,'workbench.db')
process.env.DEMO_TODAY = '2026-10-15'
process.env.TZ = 'Asia/Singapore'
const db = await import('../template/server/db.ts')
const {dataRoutes} = await import('../template/server/modules/data/routes.ts')
const {bizRoutes} = await import('../template/server/modules/biz/routes.ts')
const {anomalies} = await import('../template/server/modules/biz/service.ts')
const {agg, metricsOf, rowsBetween} = await import('../template/server/modules/biz/metrics.ts')
const {currentOf} = await import('../template/server/modules/data/batches.ts')
const optional = ['refund_amount','refund_orders','ad_spend','ad_gmv','new_buyers','old_buyers']
const headers = ['日期','成交额','订单数','访客数','退款金额','退款单数','推广花费','推广成交额','新客数','老客数']
const inputs: {name:string; csv:string}[] = []
const records: unknown[] = []
const csv = (date:string, options: (number|string)[] | null, core:(string|number)[]=[1000,10,100]) => [options===null ? headers.slice(0,4) : headers, [date,...core,...(options??[])]].map(r=>r.join(',')).join('\n')+'\n'
const snapshot = () => ({daily:db.all('SELECT * FROM channel_daily ORDER BY date,channel_id'),view:db.all('SELECT * FROM channel_daily_v ORDER BY date,channel_id'),batches:db.all('SELECT * FROM data_batches ORDER BY rowid'),audit:db.all('SELECT * FROM data_batch_rows ORDER BY rowid'),runs:db.all('SELECT * FROM import_runs ORDER BY rowid')})
dataRoutes.onError((e,c)=>c.json({ok:false,error:e.message},400))
async function api(kind:'data'|'biz',path:string,method='GET',body?:unknown) {
 const res=await (kind==='data'?dataRoutes:bizRoutes).request(`http://fixture.invalid${path}`,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})})
 const json=await res.json() as any
 records.push({kind,path,method,status:res.status,json})
 return {status:res.status,...json}
}
let sequence=0
async function draft(text:string,ch='tmall',ack=true) {
 const name=`synthetic-${++sequence}.csv`;inputs.push({name,csv:text});writeFileSync(join(dir,name),text)
 const d=await api('data','/drafts','POST',{file_name:name,content:text})
 assert.equal(d.status,200)
 return (await api('data',`/drafts/${d.data.draft.id}`,'PATCH',{channel_id:ch,...(ack?{ack_missing:optional}:{})})).data
}
async function commit(d:any) { const x=await api('data',`/drafts/${d.draft.id}/commit`,'POST',{save_rule:false});assert.equal(x.status,200,JSON.stringify(x));return x.data }
const row=(date:string,ch='tmall')=>db.get<any>('SELECT * FROM channel_daily_v WHERE date=:d AND channel_id=:c',{d:date,c:ch})!
const audit=(id:string)=>db.get<any>('SELECT * FROM data_batch_rows WHERE batch_id=:b',{b:id})!
function channel(id:string) {
 db.run('INSERT INTO channels(id,name,kind,sort) VALUES (:id,:name,\'线上\',0)',{id,name:`合成渠道 ${id}`})
 db.run("INSERT INTO data_sources(id,name,kind,feeds,method,schedule,status,channel_id) VALUES (:id,:name,'平台导出','经营','本地测试','手动','正常',:ch)",{id:`src_${id}`,name:`合成来源 ${id}`,ch:id})
}
channel('tmall')
after(() => {
 try { writeFileSync(join(dir,'evidence.json'),JSON.stringify({scope:'synthetic regression fixtures; not business data',inputs,records,final:snapshot()},null,2)) }
 finally {
  try { db.open().close() } finally { cleanup() }
  console.log(`${evidenceBase ? 'EVIDENCE' : 'CLEANED'} ${dir}`)
 }
})

test('真实 CSV → 草稿 API → commit → SQLite：缺列、空值、null、0 区分且 core 仍必需',async()=>{
 const absent=await draft(csv('2026-10-14',null));assert.equal(absent.analysis.blocking.length,0)
 assert.equal(absent.preview.rows[0].values.ad_spend,null)
 assert.equal(absent.preview.rows[0].field_states.ad_spend,'absent')
 const a=await commit(absent);assert.equal(row('2026-10-14').refund_amount,null)
 assert.equal(row('2026-10-14').roi,null);assert.equal(row('2026-10-14').refund_rate,null)
 assert.equal(JSON.parse(audit(a.batch.id).after_json).ad_gmv,null)
 assert.equal(JSON.parse(audit(a.batch.id).field_states_json).ad_gmv,'absent')
 assert.equal(currentOf('channel_daily','2026-10-14|tmall')!.ad_spend,null)
 for(const [date,value] of [['2026-10-13',''],['2026-10-12','null']] as const){
  const d=await draft(csv(date,Array(6).fill(value)));assert.equal(d.preview.rows[0].values.ad_spend,null)
  assert.equal(d.preview.rows[0].field_states.ad_spend,'empty');await commit(d);assert.equal(row(date).ad_spend,null)
 }
 const zero=await draft(csv('2026-10-11',Array(6).fill(0)));const z=await commit(zero)
 assert.equal(row('2026-10-11').ad_spend,0);assert.equal(row('2026-10-11').refund_rate,0);assert.equal(row('2026-10-11').roi,null)
 assert.equal(JSON.parse(audit(z.batch.id).field_states_json).ad_spend,'provided')
 const bad=await draft(csv('2026-10-10',Array(6).fill(0),['',10,100]));assert.equal(bad.preview.counts.ok,0)
 const before=snapshot();assert.equal((await api('data',`/drafts/${bad.draft.id}/commit`,'POST',{save_rule:false})).status,400);assert.deepEqual(snapshot(),before)
})

test('null → 明确 0 → 撤销恢复 null；空值沿用旧数，审计保留输入状态',async()=>{
 const zero=await draft(csv('2026-10-14',Array(6).fill(0)))
 assert(zero.preview.rows[0].changed.includes('ad_spend'))
 const z=await commit(zero);assert.equal(JSON.parse(audit(z.batch.id).before_json).ad_spend,null)
 assert.equal(row('2026-10-14').ad_spend,0)
 await api('data',`/batches/${z.batch.id}/undo`,'POST',{});assert.equal(row('2026-10-14').ad_spend,null)
 const full=await commit(await draft(csv('2026-10-13',[40,1,200,600,6,4])))
 const blank=await draft(csv('2026-10-13',Array(6).fill(''),[1200,12,120]))
 assert.equal(blank.preview.rows[0].values.ad_spend,200);assert.equal(blank.preview.rows[0].field_states.ad_spend,'kept_empty')
 const b=await commit(blank);assert.equal(row('2026-10-13').roi,3);assert.equal(JSON.parse(audit(b.batch.id).field_states_json).ad_spend,'kept_empty')
 await api('data',`/batches/${b.batch.id}/undo`,'POST',{});assert.equal(row('2026-10-13').gmv,1000)
 await api('data',`/batches/${full.batch.id}/undo`,'POST',{});assert.equal(row('2026-10-13').ad_spend,null)
 await commit(await draft(csv('2026-10-09',Array(6).fill(0))))
 const missing=await draft(csv('2026-10-10',null),'tmall',false);assert(missing.analysis.blocking.length>0,'已知 0 的历史也应触发缺列提醒')
 const acked=await draft(csv('2026-10-10',null));await commit(acked);assert.equal(row('2026-10-10').ad_gmv,null)
})

test('metrics 与 trace 真入口：未知不作零；0 分母的 ROI 明细保持 null；来源带审计状态',async()=>{
 const t=(await api('biz','/trace?metric=roi&channel=tmall&from=2026-10-11&to=2026-10-11')).data
 assert.equal(t.total.value,null);assert.equal(t.daily[0].cells[0],null);assert.equal(t.total.parts.ad_spend,0)
 const u=(await api('biz','/trace?metric=refund_rate&channel=tmall&from=2026-10-14&to=2026-10-14')).data
 assert.equal(u.total.value,null);assert.equal(u.total.parts.refund_amount,null)
 assert.equal(u.daily[0].provenance[0].field_states.refund_amount,'absent')
 assert.equal(u.total.coverage.known.refund_amount,0)
 const m=metricsOf(agg(rowsBetween('2026-10-11','2026-10-14','tmall'),{from:'2026-10-11',to:'2026-10-14',channels:['tmall']}),false)
 assert.equal(m.gmv,4000);assert.equal(m.refund_amount,null);assert.equal(m.roi,null)
})

test('多渠道/多日部分覆盖：不展示不完整合计，日均标明完整有数日',async()=>{
 channel('douyin')
 const single=(await api('biz','/summary?date=2026-10-14')).data
 assert.equal(single.total.gmv,null);assert.equal(single.total.coverage.present_rows,1);assert.equal(single.total.coverage.expected_rows,2)
 await commit(await draft(csv('2026-10-14',Array(6).fill(0)),'douyin'))
 const complete=(await api('biz','/summary?date=2026-10-14')).data
 assert.equal(complete.total.gmv,2000);assert.equal(complete.total.refund_amount,null)
 assert.equal(complete.total.coverage.known.refund_amount,1)
 const board=(await api('biz','/board?days=7')).data
 assert.equal(board.total.gmv,null);assert.equal(board.trend_avg,2000);assert.equal(board.trend_avg_days,1)
 assert.equal(board.total.daily_gmv,2000);assert.equal(board.total.daily_gmv_days,1)
 const tr=(await api('biz','/trace?metric=gmv&from=2026-10-13&to=2026-10-14')).data
 assert.equal(tr.total.value,null);assert.equal(tr.daily.find((x:any)=>x.date==='2026-10-13').value,null)
 assert.deepEqual(tr.daily.find((x:any)=>x.date==='2026-10-13').cells,[1000,null])
 const totals=(await api('biz','/totals?from=2026-10-13&to=2026-10-14')).data
 assert.equal(totals.find((x:any)=>x.channel_id==='douyin').gmv,null)
})

test('缺推广成交额不能触发低 ROI；明确 0 仍触发；旧值撤销后来源不列已撤销批次',async()=>{
 for(const date of ['2026-10-12','2026-10-13','2026-10-14']) await commit(await draft(csv(date,[0,0,200,'',0,0])))
 assert(!anomalies().some(x=>x.kind==='推广'&&x.channel_id==='tmall'))
 const unknownPage=(await api('biz','/channel/tmall?days=7')).data
 assert.equal(unknownPage.ads_shift.now.roi,null)
 for(const date of ['2026-10-12','2026-10-13','2026-10-14']) await commit(await draft(csv(date,[0,0,200,0,0,0])))
 assert(anomalies().some(x=>x.kind==='推广'&&x.channel_id==='tmall'))
 const ch=(await api('biz','/channel/tmall?days=7')).data
 assert.equal(ch.range.roi,null,'7 天范围不全不能拿 3 天 ROI 冒充')
 assert.equal(ch.ads_shift.now.roi,0);assert.equal(ch.ads_shift.now.known_days,3)
 const trace=(await api('biz','/trace?metric=roi&channel=tmall&from=2026-10-13&to=2026-10-13')).data
 const undone=new Set(db.all<any>("SELECT id FROM data_batches WHERE status='已撤销'").map(x=>x.id))
 for(const r of trace.runs){const b=db.get<any>('SELECT batch_id FROM import_runs WHERE id=:id',{id:r.id});assert(!undone.has(b.batch_id))}
})

test('仅部分已登记渠道有数时，完整单渠道范围仍可用；不把其他预置渠道当不适用',async()=>{
 for(const date of ['2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14']) await commit(await draft(csv(date,null)))
 const ch=(await api('biz','/channel/tmall?days=7')).data
 assert.equal(ch.range.gmv,7000);assert.deepEqual(ch.range.coverage.channel_ids,['tmall'])
 const b=(await api('biz','/board?days=7')).data
 assert.equal(b.total.gmv,null);assert.deepEqual(b.total.coverage.channel_ids,['tmall','douyin'])
 assert.deepEqual(b.total.coverage.missing_channel_ids,['douyin'])
 assert(b.total.coverage.note.includes('抖店'));assert(b.total.coverage.note.includes('有几天没数'))
})

test('非顺序撤销跳过已撤销覆盖层，恢复 null 并与来源一致；撤销底层后不复活旧值',async()=>{
 const date='2026-10-07'
 const a=await commit(await draft(csv(date,null)))
 const b=await commit(await draft(csv(date,Array(6).fill(0))))
 const c=await commit(await draft(csv(date,[5,1,5,5,5,5])))
 assert.equal(audit(c.batch.id).before_batch,b.batch.id)
 assert.equal(JSON.parse(audit(c.batch.id).before_json).ad_spend,0)
 const ub=await api('data',`/batches/${b.batch.id}/undo`,'POST',{})
 assert.equal(ub.status,200);assert.equal(ub.data.kept,1);assert.equal(row(date).ad_spend,5)
 const uc=await api('data',`/batches/${c.batch.id}/undo`,'POST',{})
 assert.equal(uc.status,200);assert.equal(row(date).ad_spend,null)
 const tr=(await api('biz',`/trace?metric=ad_spend&channel=tmall&from=${date}&to=${date}`)).data
 assert.equal(tr.total.value,null);assert.equal(tr.daily[0].provenance[0].batch_id,a.batch.id)
 assert.equal(tr.daily[0].provenance[0].field_states.ad_spend,'absent')
 const d=await commit(await draft(csv(date,Array(6).fill(0))))
 await api('data',`/batches/${a.batch.id}/undo`,'POST',{})
 assert.equal(row(date).ad_spend,0)
 await api('data',`/batches/${d.batch.id}/undo`,'POST',{})
 assert.equal(row(date),undefined,'所有历史批次都失效时应删除新增行')
})
