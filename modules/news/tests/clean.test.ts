// 行业资讯模块 0.3：Codex 写进来的资讯、来源、总结先过这一关（纯函数）。运行：node --test modules/news/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS, cleanDigest, cleanEntry, cleanSource, dayArg, entryKey, linkKey, parsePick, splitWords, whenArg } from '../files/server/modules/news/clean.ts'

const TODAY = '2030-03-05'

test('去重用的链接：去掉跟踪参数、# 后面的、末尾的斜杠，域名不分大小写', () => {
  assert.equal(linkKey('https://Example.com/a/?utm_source=x&id=7&spm=1.2#top'), 'https://example.com/a?id=7')
  assert.equal(linkKey('https://example.com/a?id=7'), linkKey('https://example.com/a/?id=7&utm_medium=rss'))
  assert.notEqual(linkKey('https://example.com/a?id=7'), linkKey('https://example.com/a?id=8'))
  assert.notEqual(linkKey('https://example.com/#/post/1'), linkKey('https://example.com/#/post/2'), '#/ 开头的是网站自己的路由，留着')
  assert.notEqual(linkKey('https://example.com/#!/post/1'), linkKey('https://example.com/#!/post/2'))
  assert.equal(entryKey({ link: 'https://example.com/a/', title: '随便', day: TODAY }), 'https://example.com/a')
  assert.equal(entryKey({ link: null, title: '  春节 茶礼　预订 ', day: TODAY }), `t:${TODAY}:春节 茶礼 预订`, '没有链接就用日期 + 标题（合并空白）')
  assert.notEqual(entryKey({ link: null, title: '今日精华', day: TODAY }), entryKey({ link: null, title: '今日精华', day: '2030-03-04' }), '每天都一样的标题不跨天合并')
})

test('一条资讯：标题必须有，链接只认 http(s)，摘要没写就取正文第一句，日期不能是以后的', () => {
  const e = cleanEntry({ title: '  春节茶礼预订提前（虚构） ', url: 'https://example.com/p/1', body: '第一句是结论。后面是展开。\n\n第二段。', date: 'today', category: '同行动态' }, TODAY)
  assert.deepEqual(e, { title: '春节茶礼预订提前（虚构）', link: 'https://example.com/p/1', summary: '第一句是结论。', body: '第一句是结论。后面是展开。\n\n第二段。', day: TODAY, published_at: null, category: '同行动态', cut: false })
  assert.deepEqual([cleanEntry({ title: 'x', date: '2030-03-05 07:12' }, TODAY).day, cleanEntry({ title: 'x', date: '2030-03-05 07:12' }, TODAY).published_at], [TODAY, '2030-03-05T07:12'], '日期可以带时间')
  assert.equal(cleanEntry({ title: '只有标题' }, TODAY).day, TODAY, '不写日期就是今天')
  assert.equal(cleanEntry({ title: '只有标题' }, TODAY).body, null)
  assert.throws(() => cleanEntry({ title: ' ' }, TODAY), /要写标题/)
  assert.throws(() => cleanEntry({ title: 'x', url: 'javascript:alert(1)' }, TODAY), /链接只认/)
  assert.throws(() => cleanEntry({ title: 'x', date: '2030-03-06' }, TODAY), /不能是以后的/)
  assert.throws(() => cleanEntry({ title: 'x', date: '3月5日' }, TODAY), /2026-11-12 这样/)
})

test('太长的截掉并说一声：摘要一句话，正文最多 5 万字', () => {
  const e = cleanEntry({ title: 'x', summary: '长'.repeat(500), body: '文'.repeat(LIMITS.body + 10) }, TODAY)
  assert.equal(e.summary!.length, LIMITS.summary)
  assert.equal(e.body!.length, LIMITS.body)
  assert.equal(e.cut, true)
})

test('来源：名字、类型、地址；公开的要有 RSS 地址，要登录的写说明就行', () => {
  assert.deepEqual(cleanSource({ name: ' 茶行业观察 ', kind: 'rss', url: 'https://example.com/feed.xml' }), { name: '茶行业观察', kind: 'rss', url: 'https://example.com/feed.xml', note: null })
  assert.deepEqual(cleanSource({ name: '会员社群', kind: '要登录', note: '用我接好的 MCP 取今天的精华帖' }), { name: '会员社群', kind: 'codex', url: null, note: '用我接好的 MCP 取今天的精华帖' })
  assert.equal(cleanSource({ name: 'AI HOT', url: 'https://aihot.example.com/api/mcp' }).kind, 'codex', '不写类型 = Codex 去取（默认的取法）')
  assert.equal(cleanSource({ name: 'x', kind: '公开', url: 'http://example.com/rss' }).kind, 'rss')
  assert.throws(() => cleanSource({ name: '', kind: 'rss', url: 'https://example.com/f' }), /要写名字/)
  assert.throws(() => cleanSource({ name: 'x', kind: 'rss' }), /RSS 地址/)
  assert.throws(() => cleanSource({ name: 'x', kind: 'rss', url: 'file:///etc/passwd' }), /http/)
  assert.throws(() => cleanSource({ name: 'x', kind: '别的' }), /类型/)
})

test('总结和“和生意有关的几条”', () => {
  assert.equal(cleanDigest('  今天三件事。 '), '今天三件事。')
  assert.throws(() => cleanDigest(''), /总结是空的/)
  assert.throws(() => cleanDigest('字'.repeat(LIMITS.digest + 1)), /太长/)
  assert.deepEqual(parsePick('nwe_ab12cd34=补贴细则可能影响春节茶礼的定价'), { id: 'nwe_ab12cd34', why: '补贴细则可能影响春节茶礼的定价' })
  assert.deepEqual(parsePick('nwe_ab12cd34'), { id: 'nwe_ab12cd34', why: null })
  assert.throws(() => parsePick('=没有编号'), /条目编号/)
})

test('日期时间：只写日期、带时间、带时区；时间写错、以后的都不行', () => {
  assert.deepEqual(whenArg('', TODAY), { day: TODAY, at: null })
  assert.deepEqual(whenArg('2030-03-04T22:05', TODAY), { day: '2030-03-04', at: '2030-03-04T22:05' })
  assert.equal(whenArg('2030-03-04T22:05:00Z', TODAY).at, '2030-03-04T22:05:00.000Z')
  assert.throws(() => whenArg('2030-03-05 25:00', TODAY), /07:12 这样/)
  assert.throws(() => whenArg('2030-03-06 08:00', TODAY), /不能是以后的/)
})

test('小工具：关注词拆分去重；日期写 today、今天或 2030-03-05', () => {
  assert.deepEqual(splitWords('补贴，茶礼, 补贴;小红书'), ['补贴', '茶礼', '小红书'])
  assert.equal(dayArg(undefined, TODAY), TODAY)
  assert.equal(dayArg('今天', TODAY), TODAY)
  assert.equal(dayArg('2030-03-01', TODAY), '2030-03-01')
  assert.throws(() => dayArg('2030-13-40', TODAY), /2026-11-12 这样/)
})
