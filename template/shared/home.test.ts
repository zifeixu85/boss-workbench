// 今日页重点卡的排法（shared/home.ts）：npm test 会跑
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkHome, homeFocus } from './home.ts'

const BASE = ['today', 'tasks', 'projects', 'inbox', 'kb', 'settings']

test('没设过：基础版放项目、收件箱', () => {
  assert.deepEqual(homeFocus(null, BASE), ['projects', 'inbox'])
})

test('没设过：开着的业务模块在前，最多 3 张', () => {
  assert.deepEqual(homeFocus('', [...BASE, 'clients']), ['clients', 'projects'])
  assert.deepEqual(homeFocus('', [...BASE, 'clients', 'biz', 'content', 'data']), ['sales', 'clients', 'xhs'])
})

test('老板定了顺序就按他的；模块没开的卡片跳过', () => {
  assert.deepEqual(homeFocus('inbox,clients,projects', BASE), ['inbox', 'projects'])
  assert.deepEqual(homeFocus('projects、inbox', [...BASE, 'clients']), ['projects', 'inbox'])
})

test('写错的 id 单独列出来', () => {
  assert.deepEqual(checkHome('projects,money'), { ids: ['projects'], unknown: ['money'] })
})
