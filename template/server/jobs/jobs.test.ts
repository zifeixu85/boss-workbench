// 定时任务（公共调度）的测试：临时文件夹里的空数据库，假的任务，假的“现在”。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-jobs-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const { dueTrigger, runJob, setJob, atOf, isOff } = await import('./service.ts')
const { all, open } = await import('../db.ts')
open()

const t = (hm: string, day = '2030-03-05') => new Date(`${day}T${hm}:00`)
let fail = false
let calls = 0
const job = { id: 'test.daily', name: '测试任务', at: '08:30', run: () => { calls++; if (fail) throw new Error('网络不通'); return '取到 3 条' } }
const runs = () => all<{ status: string; trigger: string; note: string | null }>('SELECT status, trigger, note FROM job_runs WHERE job_id = :id ORDER BY id', { id: job.id })

test('没到点不跑；到点跑一次（定时），成功了当天不再跑', async () => {
  assert.equal(dueTrigger(job, t('08:29')), null)
  assert.equal(dueTrigger(job, t('08:31')), '定时')
  const r = await runJob(job, '定时', t('08:31'))
  assert.equal(r.ok, true)
  assert.equal(r.note, '取到 3 条')
  assert.equal(dueTrigger(job, t('12:00')), null, '今天成功过了')
  assert.equal(dueTrigger(job, t('08:31', '2030-03-06')), '定时', '第二天照常')
})

test('到点时工作台没开：晚 5 分钟以后第一次跑记成补跑', () => {
  assert.equal(dueTrigger(job, t('08:34', '2030-03-07')), '定时')
  assert.equal(dueTrigger(job, t('10:00', '2030-03-07')), '补跑')
})

test('失败了隔 15 分钟再试，一天最多 3 次；出错原因记下来', async () => {
  fail = true
  const day = '2030-03-08'
  const r = await runJob(job, '定时', t('08:30', day))
  assert.equal(r.ok, false)
  assert.equal(r.note, '网络不通')
  assert.equal(dueTrigger(job, t('08:40', day)), null, '15 分钟内不再试')
  assert.equal(dueTrigger(job, t('08:46', day)), '补跑')
  await runJob(job, '补跑', t('08:46', day))
  await runJob(job, '补跑', t('09:02', day))
  assert.equal(dueTrigger(job, t('11:00', day)), null, '三次都失败，今天不再试')
  assert.deepEqual(runs().slice(-3).map((x) => x.status), ['失败', '失败', '失败'])
  fail = false
})

test('“在跑”超过 10 分钟当作没跑完；10 分钟内不重复跑', async () => {
  const day = '2030-03-09'
  const { run } = await import('../db.ts')
  run("INSERT INTO job_runs (job_id, day, trigger, status, started_at) VALUES (:id, :day, '定时', '在跑', :at)", { id: job.id, day, at: t('08:30', day).toISOString() })
  assert.equal(dueTrigger(job, t('08:35', day)), null)
  assert.equal(dueTrigger(job, t('08:50', day)), '补跑')
})

test('老板改时间、停掉、再打开', async () => {
  // 改时间要先能找到这个任务：测试里没有装模块，直接写设置
  const { run } = await import('../db.ts')
  run("INSERT INTO settings (key, value) VALUES ('job_at:test.daily', '09:15') ON CONFLICT(key) DO UPDATE SET value = '09:15'")
  assert.equal(atOf(job), '09:15')
  assert.equal(dueTrigger(job, t('09:00', '2030-03-10')), null)
  assert.equal(dueTrigger(job, t('09:16', '2030-03-10')), '定时')
  run("INSERT INTO settings (key, value) VALUES ('job_off:test.daily', '1')")
  assert.equal(isOff(job), true)
  assert.equal(dueTrigger(job, t('10:00', '2030-03-10')), null)
  await assert.rejects(setJob('nope.job', { at: '08:00' }), /没有“nope.job”这个定时任务/)
})

test('归属的模块收起来了就不跑', async () => {
  const { setModules } = await import('../services/modules.ts')
  setModules(['today', 'tasks', 'projects', 'inbox', 'kb', 'settings'], '网页')
  assert.equal(dueTrigger({ ...job, id: 'test.other', module: 'clients' }, t('10:00', '2030-03-11')), null)
  assert.equal(dueTrigger({ ...job, id: 'test.other2' }, t('10:00', '2030-03-11')), '补跑')
})
