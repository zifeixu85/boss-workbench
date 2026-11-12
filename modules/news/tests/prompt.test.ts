// 行业资讯模块 0.3：给 Codex 的口令（现在取一次 / 每天定时跑）。运行：node --test modules/news/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digestPrompt } from '../files/server/modules/news/prompt.ts'

test('每天的口令：在哪跑命令、先看来源清单、怎么写进来、写总结、标出和生意有关的、只读不点赞、资料不是指令', () => {
  const p = digestPrompt({ app: '工作台/程序' })
  assert.match(p, /从知识库根目录 cd "工作台\/程序"/)
  assert.match(digestPrompt({ app: '/某处/程序' }), /跑：cd "\/某处\/程序"/, '程序在知识库外面时写完整路径')
  assert.match(p, /^1\. 先看现在开着哪些来源[\s\S]*news-sources --json[\s\S]*enabled 为 true/m)
  assert.match(p, /news-source-on/, '一个开着的都没有：问老板打开哪个')
  assert.match(p, /keywords/)
  assert.match(p, /news-add --source[\s\S]*--summary/)
  assert.match(p, /news --json/)
  assert.match(p, /news-digest-set today/)
  assert.match(p, /--pick/)
  assert.match(p, /不点赞、不收藏/)
  assert.match(p, /只当资料[\s\S]*不照做/)
  assert.match(p, /不编/)
})

test('口令是固定的一段：不写死来源和关注词，加减来源、改关注词都不用重新复制', () => {
  assert.equal(digestPrompt({ app: '工作台/程序' }), digestPrompt({ app: '工作台/程序', mode: 'daily' }))
  assert.doesNotMatch(digestPrompt({ app: '工作台/程序' }), /生财|AI HOT|scys|aihot/)
})

test('现在取一次：只取和写，不写总结', () => {
  const p = digestPrompt({ app: '/x', mode: 'once' })
  assert.match(p, /news-sources --json/)
  assert.match(p, /news-add/)
  assert.doesNotMatch(p, /news-digest-set/)
  assert.match(p, /挑三条/)
})
