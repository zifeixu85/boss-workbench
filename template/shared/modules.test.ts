// 模块开关的规则（shared/modules.ts）：npm test 会跑
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODULE_IDS, enabledModules, normalizeModules, neededBy, splitIds } from './modules.ts'

test('没设过 = 全部打开', () => {
  assert.deepEqual(enabledModules(null), MODULE_IDS)
  assert.deepEqual(enabledModules(''), MODULE_IDS)
})

test('逗号、顿号、空格都能分开，去重', () => {
  assert.deepEqual(splitIds('tasks、kb, inbox  kb'), ['tasks', 'kb', 'inbox'])
})

test('基础版（今日、待办与日程、项目、收件箱、知识库、设置）一定带上；按固定顺序排', () => {
  const r = normalizeModules('kb,clients')
  assert.deepEqual(r.ids, ['today', 'tasks', 'projects', 'inbox', 'clients', 'kb', 'settings'])
  assert.deepEqual(r.added, ['today', 'tasks', 'projects', 'inbox', 'settings'])
  assert.deepEqual(r.unknown, [])
})

test('打开经营或内容，自动带上数据源与导入', () => {
  assert.ok(normalizeModules('biz').ids.includes('data'))
  assert.ok(normalizeModules('content').ids.includes('data'))
  assert.ok(!normalizeModules('clients').ids.includes('data'))
})

test('模板里没有的模块单独列出来，不悄悄忽略', () => {
  const r = normalizeModules('tasks,money,team')
  assert.deepEqual(r.unknown, ['money', 'team'])
  assert.ok(!r.ids.includes('money'))
})

test('关数据源前能查到谁还在用它', () => {
  assert.deepEqual(neededBy('data', ['biz', 'content', 'data']), ['biz', 'content'])
  assert.deepEqual(neededBy('data', ['tasks', 'data']), [])
})
