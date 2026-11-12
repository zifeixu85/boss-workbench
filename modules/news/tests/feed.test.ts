// 行业资讯模块 0.3：普通 RSS（一篇文章一条）和 Atom 也能拆；关注词连摘要一起看。运行：node --test modules/news/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFeed, matches, pubDay } from '../files/server/modules/news/rss.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(here, name), 'utf8')

test('AIHOT 那样的日报认成“每期一条”，普通 RSS 认成“一篇一条”', () => {
  const daily = parseFeed(read('fixture-daily.xml'))
  assert.equal(daily.shape, 'digest')
  assert.equal(daily.issues.length, 2)

  const blog = parseFeed(read('fixture-blog.xml'))
  assert.equal(blog.shape, 'articles')
  assert.equal(blog.title, '茶行业观察（测试样例，内容全部虚构）')
  const [a, b] = blog.issues
  assert.equal(a.title, '春节茶礼预订提前两周启动（虚构）')
  assert.equal(a.link, 'https://example.com/tea/gift?utm_source=rss&id=7#top')
  assert.equal(a.summary, '多家茶社把春节茶礼的预订提前到腊月初。企业客户更看重定制包装。', '摘要只取第一段')
  assert.equal(pubDay(a.published_at), '2030-03-05', '文章的日期看发布时间（北京时间）')
  assert.equal(b.summary, '没有分段的说明。', '没有 <p> 就取第一句')
  assert.deepEqual(a.items, [])
})

test('Atom 也能拆：标题、链接、摘要、发布时间', () => {
  const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>示例更新（虚构）</title>
  <entry>
    <title type="html"><![CDATA[工具 A 发布 2.0（虚构）]]></title>
    <link rel="self" href="https://example.com/api/a2"/>
    <link rel="alternate" type="text/html" href="https://example.com/a2"/>
    <id>tag:example.com,2030:a2</id>
    <published>2030-03-04T20:30:00Z</published>
    <summary type="html">&lt;p&gt;支持批量导入。&lt;/p&gt;&lt;p&gt;其他。&lt;/p&gt;</summary>
  </entry>
  <entry>
    <title>只有 updated 的一条（虚构）</title>
    <link href="javascript:alert(1)"/>
    <id>tag:example.com,2030:a1</id>
    <updated>2030-03-01T01:00:00+08:00</updated>
    <content type="html"><![CDATA[<p>正文第一段当摘要。</p>]]></content>
  </entry>
</feed>`
  const f = parseFeed(atom)
  assert.equal(f.shape, 'articles')
  assert.equal(f.title, '示例更新（虚构）')
  assert.deepEqual(f.issues.map((x) => [x.title, x.link, x.summary, pubDay(x.published_at)]), [
    ['工具 A 发布 2.0（虚构）', 'https://example.com/a2', '支持批量导入。', '2030-03-05'],
    ['只有 updated 的一条（虚构）', null, '正文第一段当摘要。', '2030-03-01'],
  ])
})

test('不是 RSS 也不是 Atom 就说清楚', () => {
  assert.throws(() => parseFeed('<html><body>登录页</body></html>'), /不是 RSS/)
})

test('关注词：标题或摘要里有就算，不分大小写', () => {
  assert.equal(matches('春节茶礼预订提前 企业客户更看重定制包装', ['定制']), true)
  assert.equal(matches('别的', ['定制', '']), false)
})
