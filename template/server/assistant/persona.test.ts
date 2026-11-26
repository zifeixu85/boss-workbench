// 对话栏里叫哪位助理（约定 11.11）：选了，句首加“叫<名字>，”（自己写了就不重复）；发给常驻对话时“叫<名字>，”提到页面说明前面，
// 这样 Codex 那边的第一句就是“叫<名字>”。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-persona-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'wb.db')
const { callLead, hostText, personas } = await import('./service.ts')

const 小叶 = { key: '小红书助理-小叶', name: '小叶', avatar: '✍️', duty: '小红书助理', call: '叫小叶' }

test('句首加“叫<名字>，”：没选不加；自己已经这么写了不重复；怎么叫没写用“叫<名字>”', () => {
  assert.equal(callLead(null, '写一篇'), '')
  assert.equal(callLead(小叶, '写一篇年货清单'), '叫小叶，')
  assert.equal(callLead(小叶, '叫小叶，写一篇'), '')
  assert.equal(callLead({ ...小叶, call: '' }, '写'), '叫小叶，')
  assert.equal(callLead({ ...小叶, call: '叫小叶。' }, '写'), '叫小叶，', '怎么叫末尾带了标点的去掉')
})

test('发给常驻对话：“叫<名字>，”提到页面说明前面；没叫谁的照旧页面说明在前', () => {
  const page = { title: '驾驶舱', path: '/', text: '' }
  const t = hostText('叫小叶，写一篇年货清单', page)
  assert.ok(t.startsWith('叫小叶，'), t.slice(0, 30))
  assert.ok(t.endsWith('\n\n写一篇年货清单'))
  assert.ok(!hostText('写一篇', page).startsWith('叫'))
})

test('没装给助理的模块：一个都没有（对话栏不出这个选择）', () => {
  assert.deepEqual(personas(), [])
})
