// “知识库”这一页叫什么（设置 kb_name）：临时数据库里测。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-identity-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const { identity } = await import('./identity.ts')
const { getSettings, saveSettings } = await import('./today.ts')

test('没设过：这一页叫“知识库”', () => {
  assert.equal(identity().kb, '知识库')
  assert.equal(getSettings().kb, '知识库')
  assert.equal(getSettings().kb_name, '')
})

test('设成“资料”：设置和称呼信息里都跟着变', () => {
  const s = saveSettings({ kb_name: '资料' }, '网页')
  assert.equal(s.kb, '资料')
  assert.equal(s.kb_name, '资料')
  assert.equal(identity().kb, '资料')
})

test('写空：改回“知识库”', () => {
  const s = saveSettings({ kb_name: '' }, '网页')
  assert.equal(s.kb, '知识库')
  assert.equal(s.kb_name, '')
})
