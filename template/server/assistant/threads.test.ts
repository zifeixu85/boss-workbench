// AI 助手的对话（历史）：列出来带最后一句、改名、归档 / 找回；消息按对话分开；以前的记录并成“以前的对话”。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-threads-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'wb.db')
const { run } = await import('../db.ts')
const svc = await import('./service.ts')

test('对话：按最后动的时间排、带最后一句；改名、归档、找回；消息按对话分开；空名字不行', () => {
  run("INSERT INTO assistant_threads (id, title, created_at, updated_at) VALUES ('at_a', '云杉报价', '2026-11-25T01:00:00Z', '2026-11-25T02:00:00Z'), ('at_b', '春茶主图', '2026-11-26T01:00:00Z', '2026-11-26T03:00:00Z')")
  run("INSERT INTO assistant_messages (id, thread_id, role, text, status, created_at) VALUES ('m1', 'at_a', 'user', '云杉的报价怎么定', 'done', '2026-11-25T01:00:00Z'), ('m2', 'at_a', 'assistant', '按两档：  120 和 150', 'done', '2026-11-25T02:00:00Z'), ('m3', 'at_b', 'user', '主图换米白', 'done', '2026-11-26T03:00:00Z')")
  assert.deepEqual(svc.threads().map((t) => [t.id, t.last]), [['at_b', '主图换米白'], ['at_a', '按两档： 120 和 150']])
  assert.deepEqual(svc.messages('at_a').map((m) => m.id), ['m1', 'm2'])
  assert.deepEqual(svc.messages().map((m) => m.id), ['m3'], '没给对话：最近的那个')
  svc.updateThread('at_a', { title: '  云杉 团购 报价 ' })
  assert.equal(svc.threads().find((t) => t.id === 'at_a')!.title, '云杉 团购 报价')
  assert.throws(() => svc.updateThread('at_a', { title: ' ' }), /不能是空的/)
  svc.updateThread('at_a', { archived: true })
  assert.deepEqual(svc.threads().map((t) => t.id), ['at_b'])
  assert.deepEqual(svc.threads({ archived: true }).map((t) => t.id), ['at_a'])
  svc.updateThread('at_a', { archived: false })
  assert.equal(svc.threads().length, 2)
  assert.throws(() => svc.updateThread('at_x', { title: 'x' }), /没有这个对话/)
})
