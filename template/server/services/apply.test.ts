// 一张清单一次写入（apply）、模块开关、待办“谁做”：临时数据库里测。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-apply-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const clients = await import('./clients.ts')
const schedule = await import('./schedule.ts')
const projects = await import('./projects.ts')
const modules = await import('./modules.ts')
const { applyPlan } = await import('./apply.ts')
const { all, get } = await import('../db.ts')

const count = (sql: string, p = {}) => Number(get<{ n: number }>(sql, p)?.n ?? 0)

test('预演：照样检查、什么都不留；加 yes 才写，待办带上谁做和来源', () => {
  const c = clients.createClient({ name: '云杉物流', stage: '需求确认' }, '网页')
  const plan = {
    material: '00-收件箱/2030-10-28-云杉物流-电话.md',
    steps: [
      { do: 'log', client: '云杉物流', text: '王总要两套年会礼盒报价', date: '2030-10-28', channel: '电话' },
      { do: 'todo', title: '做两套报价方案', owner: '小周', due: '2030-10-30', client: '云杉物流' },
      { do: 'promise', client: '云杉物流', text: '10/30 前发两套方案', to: '王总', due: '2030-10-30' },
      { do: 'stage', client: '云杉物流', stage: '方案中', reason: '王总要两套方案' },
    ],
  }
  const dry = applyPlan(plan, { yes: false, actor: 'Codex' })
  assert.equal(dry.done, false)
  assert.equal(dry.steps.length, 4)
  assert.equal(count('SELECT COUNT(*) AS n FROM todos WHERE client_id = :id', { id: c.id }), 0, '预演不留待办')
  assert.equal(count('SELECT COUNT(*) AS n FROM interactions WHERE client_id = :id', { id: c.id }), 0, '预演不留往来')
  assert.equal(clients.findClient(c.id).stage, '需求确认', '预演不改阶段')

  const done = applyPlan(plan, { yes: true, actor: 'Codex' })
  assert.equal(done.done, true)
  const todo = all<{ owner: string; source: string }>("SELECT owner, source FROM todos WHERE client_id = :id AND title = '做两套报价方案'", { id: c.id })[0]
  assert.equal(todo.owner, '小周')
  assert.equal(todo.source, '00-收件箱/2030-10-28-云杉物流-电话.md')
  assert.equal(clients.findClient(c.id).stage, '方案中')
  assert.equal(count("SELECT COUNT(*) AS n FROM client_promises WHERE client_id = :id AND status = '待兑现'", { id: c.id }), 1)
})

test('中间一步不行：整张都不写，报第几步、说人话', () => {
  clients.createClient({ name: '禾木瑜伽', stage: '方案中' }, '网页')
  const before = count('SELECT COUNT(*) AS n FROM todos')
  assert.throws(() => applyPlan({ steps: [
    { do: 'todo', title: '这条不该留下', owner: '小周' },
    { do: 'stage', client: '禾木瑜伽', stage: '成交了', reason: '测试' },
  ] }, { yes: true, actor: 'Codex' }), (e: Error) => /第 2 步.*阶段只能是/.test(e.message) && !e.message.includes('"code"'))
  assert.equal(count('SELECT COUNT(*) AS n FROM todos'), before)
})

test('项目：下一步、在等谁、里程碑一起写', () => {
  projects.createProject({ name: '年底企业团购', stage: '进行中' }, '网页')
  applyPlan({ steps: [
    { do: 'project', project: '年底企业团购', next_step: '等云杉定预算', waiting_on: '云杉财务' },
    { do: 'milestone', project: '年底企业团购', date: '2030-12-20', title: '云杉年会' },
  ] }, { yes: true, actor: 'Codex' })
  const p = projects.getProject('年底企业团购')
  assert.equal(p.project.waiting_on, '云杉财务')
  assert.equal(p.milestones.length, 1)
})

test('待办“谁做”空着就是老板自己（存成空，不存空字符串）', () => {
  const t = schedule.createTodo({ title: '自己的事', owner: '  ' }, '网页') as { owner: string | null }
  assert.equal(t.owner, null)
})

test('通用接口改阶段要写原因；阶段没变照常保存别的字段', () => {
  const c = clients.createClient({ name: '南屿精品酒店', stage: '合作中' }, '网页')
  assert.throws(() => clients.updateClient(c.id, { stage: '暂停' }, '网页'), /改阶段要写一句原因/)
  const after = clients.updateClient(c.id, { stage: '合作中', note: '月结' }, '网页')
  assert.equal(after.stage, '合作中')
})

test('模块开关：整组设、打开、收起，关依赖要先关用它的', () => {
  assert.equal(modules.list().all_on, true)
  modules.setModules('tasks,kb', 'Codex')
  assert.deepEqual(modules.enabled(), ['today', 'tasks', 'kb', 'settings'])
  modules.toggleModules(['biz'], [], 'Codex')
  assert.ok(modules.isOn('data'))
  assert.throws(() => modules.toggleModules([], ['data'], 'Codex'), /还在被经营用着/)
  assert.throws(() => modules.toggleModules([], ['today'], 'Codex'), /一定要开着/)
  assert.throws(() => modules.setModules('tasks,money', 'Codex'), /模板里没有这些模块：money/)
  modules.setModules('all', 'Codex')
  assert.equal(modules.list().all_on, true)
})
