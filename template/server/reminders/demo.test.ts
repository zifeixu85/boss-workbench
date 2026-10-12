// 演示模式下的提醒：按演示日期算；默认不弹电脑系统通知，设置里打开后才弹。运行：npm test
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const DEMO = '2026-10-27'
const dir = mkdtempSync(join(os.tmpdir(), 'wb-remind-demo-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = DEMO
const { tick, _setHooksForTest } = await import('./service.ts')
const { now } = await import('../clock.ts')
const schedule = await import('../services/schedule.ts')
const { saveSettings } = await import('../services/today.ts')

const sent: string[] = []
const pad = (n: number) => String(n).padStart(2, '0')
/** 现在（演示日 + 真实钟点）往后 n 分钟 */
const later = (n: number) => { const d = new Date(now().getTime() + n * 60000); return { due: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, due_time: `${pad(d.getHours())}:${pad(d.getMinutes())}` } }
const real = new Date()
const realDay = `${real.getFullYear()}-${pad(real.getMonth() + 1)}-${pad(real.getDate())}`

before(() => {
  _setHooksForTest({ browsers: () => 0, push: () => {}, send: async (n) => { sent.push(n.subtitle ?? n.title); return { ok: true, how: '假的' } }, platform: 'darwin' })
  saveSettings({ quiet_start: '', quiet_end: '' }, '网页') // 测试可能在夜里跑：先不设免打扰
})

test('“现在”是演示日：按演示日期算到期', () => {
  assert.equal(now().getDate(), 27)
  assert.equal(later(0).due.slice(0, 7), '2026-10')
})

test('演示模式：到期前 1 小时照样算、记下，但默认不弹系统通知', async () => {
  const soon = later(20)
  schedule.createTodo({ title: '演示：二十分钟后', ...soon }, '网页')
  const rows = (await tick()).filter((r) => r.title.includes('演示：二十分钟后'))
  assert.equal(rows.length, 1, '按演示日期算出来了')
  assert.equal(rows[0].via, '只记')
  assert.match(rows[0].note ?? '', /演示模式/)
  assert.equal(sent.length, 0, '没弹系统通知')
})

test('演示模式：设置里打开“演示时也弹系统通知”后才弹', async () => {
  saveSettings({ remind_demo_system: '1' }, '网页')
  schedule.createTodo({ title: '演示：五分钟后', ...later(5) }, '网页')
  const rows = (await tick()).filter((r) => r.title.includes('演示：五分钟后'))
  assert.equal(rows[0].via, '系统通知')
  assert.equal(rows[0].body.startsWith('还有 5 分钟') || rows[0].body.startsWith('还有 4 分钟'), true, rows[0].body)
  assert.deepEqual(sent, [rows[0].title])
})

test('演示模式：真实日期那天的待办不算（除非真实日期就是演示日）', { skip: realDay === DEMO && '今天就是演示日' }, async () => {
  const d = new Date(Date.now() + 20 * 60000)
  schedule.createTodo({ title: '真实日期的事', due: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, due_time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }, '网页')
  assert.equal((await tick()).filter((r) => r.title.includes('真实日期的事')).length, 0)
})
