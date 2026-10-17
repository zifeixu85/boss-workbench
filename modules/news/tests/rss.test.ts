// 行业资讯模块：拆 RSS 的测试（纯函数，不碰数据库）。在仓库根目录运行：node --test modules/news/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRss, safeLink, plain, matches, dayOf } from '../files/server/modules/news/rss.ts'

const xml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixture-daily.xml'), 'utf8')

test('每期一条：标题、日期、一句总结、按类的条目', () => {
  const { title, issues } = parseRss(xml)
  assert.equal(title, '资讯日报（测试样例，内容全部虚构）')
  assert.equal(issues.length, 2)
  const [a, b] = issues
  assert.equal(a.title, '资讯日报 · 2030-03-05 — 某表格软件上线 AI 助手（虚构）')
  assert.equal(a.day, '2030-03-05')
  assert.equal(a.summary, '测试日报：小模型更好用了，客服工具陆续接入 AI & 自动回复。')
  assert.deepEqual(a.items.map((x) => [x.category, x.title]), [
    ['模型发布/更新', '示例模型 A 发布新版本（虚构）'],
    ['产品发布/更新', '某表格软件上线 AI 助手（虚构）'],
    ['产品发布/更新', '一条坏链接（虚构）'],
    ['行业动态', '某地发布中小企业 AI 补贴细则（虚构）'],
  ])
  assert.equal(a.items[2].link, null, 'javascript: 链接不留')
  assert.equal(b.summary, '只有一句话的一期，没有按类列条目。', '实体转义过的 HTML 也拆得开')
  assert.deepEqual(b.items, [])
})

test('不是 RSS 就说清楚；空频道是零期', () => {
  assert.throws(() => parseRss('<html><body>出错页</body></html>'), /不是 RSS/)
  assert.deepEqual(parseRss('<rss version="2.0"><channel><title>空的</title></channel></rss>').issues, [])
})

test('小工具：链接只认 http(s)、去标签截断、关注词不分大小写、日期按北京时间', () => {
  assert.equal(safeLink('https://example.com/x?a=1&amp;b=2'), 'https://example.com/x?a=1&b=2')
  assert.equal(safeLink('ftp://example.com'), null)
  assert.equal(plain('<b>很长</b>'.repeat(200), 20).length, 20)
  assert.equal(matches('OpenAI 发布新模型', ['openai']), true)
  assert.equal(matches('别的', ['openai', '']), false)
  assert.equal(dayOf('x', 'y', null, 'Mon, 04 Mar 2030 17:00:00 GMT'), '2030-03-05', '北京时间已经是第二天')
})
