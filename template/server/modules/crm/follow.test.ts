// 自动跟进待办：那天已经有这家的待办或日程就不再多建一条（10-12 修）。临时数据库里测。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-follow-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const clients = await import('../../services/clients.ts')
const schedule = await import('../../services/schedule.ts')
const { all } = await import('../../db.ts')

const openTodos = (cid: string) => all<{ id: string; title: string; priority: string; due: string }>("SELECT id, title, priority, due FROM todos WHERE client_id = :cid AND status IN ('待办','进行中','等别人')", { cid })

test('那天已有这家没做完的待办：记一笔、约了那天，不再建“跟进某某”', () => {
  const c = clients.createClient({ name: '锦川置业', stage: '售后' }, '网页')
  schedule.createTodo({ title: '去锦川送补发 6 盒、当面道歉', due: '2030-10-28', client_id: c.id, priority: '重要' }, '网页')
  clients.logInteraction({ client_id: c.id, date: '2030-10-27', summary: '孙蕾回了：明天上午在', next_step: '送补发的 6 盒、当面道歉', next_follow: '2030-10-28' }, 'Codex')
  const xs = openTodos(c.id)
  assert.equal(xs.length, 1, xs.map((x) => x.title).join('；'))
  assert.equal(xs[0].title, '去锦川送补发 6 盒、当面道歉')
})

test('那天已有这家的日程：也不再建', () => {
  const c = clients.createClient({ name: '澜拓科技', stage: '待复购' }, '网页')
  schedule.createEvent({ title: '去澜拓谈春节方案', start: '2030-11-03T10:00', client_id: c.id }, '网页')
  clients.logInteraction({ client_id: c.id, date: '2030-10-27', summary: '电话约了 11/3 见面', next_follow: '2030-11-03' }, 'Codex')
  assert.equal(openTodos(c.id).length, 0)
})

test('那天没别的安排：照常自动建一条，优先级“重要”（不沉到第一屏下面）', () => {
  const c = clients.createClient({ name: '禾木瑜伽', stage: '方案中' }, '网页')
  clients.logInteraction({ client_id: c.id, date: '2030-10-27', summary: '发了方案', next_step: '问方案看了没有', next_follow: '2030-10-30' }, 'Codex')
  const xs = openTodos(c.id)
  assert.equal(xs.length, 1)
  assert.equal(xs[0].title, '跟进禾木瑜伽：问方案看了没有')
  assert.equal(xs[0].priority, '重要')
})

test('自动待办改到一个已经有安排的日子：自动那条取消，只留原来那条', () => {
  const c = clients.createClient({ name: '南屿酒店', stage: '交付中', next_follow: '2030-11-01' }, '网页')
  assert.equal(openTodos(c.id).length, 1, '建客户时填了下次跟进，自动建了一条')
  schedule.createTodo({ title: '南屿第二批茶包送货', due: '2030-11-05', client_id: c.id }, '网页')
  clients.updateClient(c.id, { next_follow: '2030-11-05' }, '网页')
  const xs = openTodos(c.id)
  assert.deepEqual(xs.map((x) => x.title), ['南屿第二批茶包送货'])
})
