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
const { dueTrigger, runJob, setJob, atOf, isOff, onceOf, setOnce, runsSince } = await import('./service.ts')
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

test('今天再自动跑一次（--once）：当天成功过也照样到点跑，跑过一次就不再跑；只管当天', async () => {
  const day = '2030-03-20'
  fail = false
  await runJob(job, '定时', t('09:16', day)) // 当天的每日任务已经成功（上一条测试把时间改成了 09:15）
  assert.equal(dueTrigger(job, t('11:00', day)), null)
  setOnce(job.id, '12:07', t('11:30', day))
  assert.deepEqual(onceOf(job, t('11:31', day)), { day, at: '12:07', done: false, pending: true })
  assert.equal(dueTrigger(job, t('12:06', day)), null, '没到点')
  // 任务停着也不跑：先打开
  const { run } = await import('../db.ts')
  run("DELETE FROM settings WHERE key = 'job_off:test.daily'")
  assert.equal(dueTrigger(job, t('12:07', day)), '单次')
  const before = calls
  const r = await runJob(job, '单次', t('12:07', day))
  assert.equal(r.ok, true)
  assert.equal(calls, before + 1)
  assert.equal(dueTrigger(job, t('12:20', day)), null, '这一次跑过了')
  assert.equal(onceOf(job, t('12:20', day))?.done, true)
  assert.equal(onceOf(job, t('12:20', '2030-03-21')), null, '第二天不算')
  assert.equal(runsSince(job.id, t('12:07', day)).length, 1)
})

test('--once 的时间：写错格式、已经过了的都不收；none 取消', () => {
  const day = '2030-03-22'
  assert.throws(() => setOnce(job.id, '25:00', t('10:00', day)), /HH:MM/)
  assert.throws(() => setOnce(job.id, '09:00', t('10:00', day)), /已经过了/)
  setOnce(job.id, '10:30', t('10:00', day))
  assert.equal(onceOf(job, t('10:01', day))?.at, '10:30')
  setOnce(job.id, 'none', t('10:02', day))
  assert.equal(onceOf(job, t('10:03', day)), null)
})

test('“单次”和每天那一次分开算：单次成功不占每天那一次；单次连败 3 次也不挡每天那一次；手动跑的不算单次', async () => {
  const day = '2030-03-25' // 每天 09:15（前面的测试改过）
  fail = false
  setOnce(job.id, '08:00', t('07:00', day))
  await runJob(job, '手动', t('08:01', day)) // 手动跑成功：不算单次
  assert.equal(onceOf(job, t('08:02', day))?.done, false)
  // 手动成功算当天每天那一次已经跑过（原来的规矩）；换一天测“单次不占每天那一次”
  const d2 = '2030-03-26'
  setOnce(job.id, '08:00', t('07:00', d2))
  assert.equal(dueTrigger(job, t('08:00', d2)), '单次')
  await runJob(job, '单次', t('08:00', d2))
  assert.equal(dueTrigger(job, t('09:16', d2)), '定时', '单次成功以后，每天那一次照常跑')
  const d3 = '2030-03-27'
  fail = true
  setOnce(job.id, '08:00', t('07:00', d3))
  await runJob(job, '单次', t('08:00', d3))
  await runJob(job, '单次', t('08:16', d3))
  await runJob(job, '单次', t('08:32', d3))
  assert.equal(onceOf(job, t('08:50', d3))?.pending, false, '试满 3 次就不再试，也不再提示')
  assert.equal(dueTrigger(job, t('08:50', d3)), null)
  fail = false
  assert.equal(dueTrigger(job, t('09:16', d3)), '定时', '单次连败 3 次，每天那一次照常跑')
})
