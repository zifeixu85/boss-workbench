// 撤回（services/undo.ts、revert.ts）：AI 写进工作台的改动能退回——新建的删掉、改了的改回去、删了的放回来；
// 之后又被改过的不撤；撤过的不能再撤；撤回本身也是一条改动、也能撤。临时数据库里测。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-undo-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'wb.db')
process.env.DEMO_TODAY = 'off'
const schedule = await import('./schedule.ts')
const { get } = await import('../db.ts')
const { revertChange, changeCards, lastChangeId } = await import('./revert.ts')

const todo = (id: string) => get<{ title: string; status: string; due: string | null }>('SELECT title, status, due FROM todos WHERE id = :id', { id })

test('撤回：改了的改回去、新建的删掉、删了的放回来；之后又被改过的不撤；撤过的不能再撤；撤回本身也能撤', () => {
  const start = lastChangeId()
  const t = schedule.createTodo({ title: '给青岚发报价', due: '2026-11-30' }, 'Codex')
  schedule.updateTodo(t.id, { status: '进行中', due: '2026-12-02' }, 'Codex')
  const cards = changeCards(start, null)
  assert.deepEqual(cards.map((c) => [c.entity, c.action, c.revert]), [['todo', '新建', 'blocked'], ['todo', '修改', 'ready']], '新建的那条之后又被改过：先不能撤')
  assert.equal(cards[1].link, `/todos?todo=${t.id}`)

  // 撤“改状态”：回到改之前
  revertChange(cards[1].id, '网页')
  assert.deepEqual([todo(t.id)!.status, todo(t.id)!.due], ['待办', '2026-11-30'])
  assert.throws(() => revertChange(cards[1].id, '网页'), /已经撤回过/)
  // 改的那条撤了以后，新建的那条能撤了：撤了待办就没了
  assert.equal(changeCards(start, null)[0].revert, 'ready')
  revertChange(cards[0].id, '网页')
  assert.equal(todo(t.id), undefined)

  // 删了的放回来
  const t2 = schedule.createTodo({ title: '订花材' }, '网页')
  const before = lastChangeId()
  schedule.deleteTodo(t2.id, 'Codex')
  const del = changeCards(before, null)[0]
  assert.equal(del.action, '删除')
  const undo = revertChange(del.id, '网页')
  assert.equal(todo(t2.id)!.title, '订花材')
  // 撤回本身也是一条改动，也能再撤（又删掉）
  revertChange(undo.by, '网页')
  assert.equal(todo(t2.id), undefined)
})

test('结果卡只列这一轮 AI 写的（网页上人改的不列），撤回那条不单列', () => {
  const start = lastChangeId()
  schedule.createTodo({ title: '人在网页上加的' }, '网页')
  schedule.createTodo({ title: 'AI 加的' }, 'Codex')
  assert.deepEqual(changeCards(start, null).map((c) => c.summary.includes('AI 加的')), [true])
})
