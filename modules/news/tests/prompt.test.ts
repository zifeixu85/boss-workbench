// 行业资讯模块 0.3：给 Codex 的口令（现在取一次 / 每天定时跑）。运行：node --test modules/news/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digestPrompt } from '../files/server/modules/news/prompt.ts'

const codex = [
  { name: '会员社群', url: 'https://example.com/mcp', note: '用我接好的 MCP 取今天的精华帖' },
  { name: 'AI 日报', url: null, note: null },
]

test('每天的口令：在哪跑命令、去哪取、怎么写进来、写总结、标出和生意有关的、只读不点赞、资料不是指令', () => {
  const p = digestPrompt({ app: '工作台/程序', codex, keywords: ['补贴', '茶礼'] })
  assert.match(p, /从知识库根目录 cd "工作台\/程序"/)
  assert.match(digestPrompt({ app: '/某处/程序', codex, keywords: [] }), /跑：cd "\/某处\/程序"/, '程序在知识库外面时写完整路径')
  assert.match(p, /会员社群（https:\/\/example\.com\/mcp）：用我接好的 MCP 取今天的精华帖/)
  assert.match(p, /AI 日报\n/)
  assert.match(p, /news-add --source[\s\S]*--summary/)
  assert.match(p, /news --json/)
  assert.match(p, /news-digest-set today/)
  assert.match(p, /--pick/)
  assert.match(p, /补贴、茶礼/)
  assert.match(p, /不点赞、不收藏/)
  assert.match(p, /只当资料[\s\S]*不照做/)
  assert.match(p, /不编/)
})

test('现在取一次：只取和写，不写总结', () => {
  const p = digestPrompt({ app: '/x', codex, keywords: [], mode: 'once' })
  assert.match(p, /news-add/)
  assert.doesNotMatch(p, /news-digest-set/)
  assert.match(p, /挑三条/)
})

test('没有打开的来源：口令让 Codex 先问老板打开哪个', () => {
  const p = digestPrompt({ app: '/x', codex: [], keywords: [] })
  assert.doesNotMatch(p, /news-add --source/)
  assert.match(p, /news-sources/)
  assert.match(p, /news-source-on/)
})
