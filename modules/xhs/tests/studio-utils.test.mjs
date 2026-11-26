// 创作改版纯函数验收。2026-11-27 A梦要求改版。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountState, chatBounds, chatWidth, draftText, exportFilename, versionRows } from '../files/src/features/xhs/studio/studio-utils.ts'

test('分隔条：默认比例、上下限、异常值、缩窗后仍给稿件留位置', () => {
  assert.equal(chatWidth(null, 1000), 400)
  assert.equal(chatWidth(-100, 1000), 280)
  assert.equal(chatWidth(9999, 1000), Math.round((1000 - 24) * .6))
  for (const total of [728, 800, 1100, 1440]) {
    const width = chatWidth(2000, total)
    assert.ok(total - width - 24 >= 360)
    assert.ok(width >= chatBounds(total).min)
  }
  assert.equal(chatWidth(NaN, 1000), 400)
  assert.equal(chatWidth(null, 0), 0)
})
test('账号胶囊：零个有提示、一个只读、多个可选；不冒充已绑定', () => {
  assert.deepEqual(accountState([], null), { mode: 'empty', label: '还没登记账号' })
  assert.deepEqual(accountState(['木槿花艺'], '木槿花艺'), { mode: 'single', label: '木槿花艺' })
  assert.deepEqual(accountState(['木槿花艺', 'ABC茶社'], null), { mode: 'select', label: '选择账号' })
  assert.equal(accountState(['木槿花艺', 'ABC茶社'], 'ABC茶社').label, 'ABC茶社')
})
test('版本按编号倒序，不改原列表，缺作者和来源不猜测', () => {
  const items = [{ version: 1, author: '阿柚', origin: 'AI 写稿' }, { version: 3, author: null, origin: '' }, { version: 2, author: '老板', origin: '恢复' }]
  const rows = versionRows(items)
  assert.deepEqual(rows.map(v => v.version), [3, 2, 1])
  assert.equal(rows[0].author, '未记录')
  assert.equal(rows[0].origin, '未记录')
  assert.deepEqual(items.map(v => v.version), [1, 3, 2])
})
test('文字导出保留正文、每页换行、话题与备用标题；文件名不能带路径', () => {
  const d = { title: '礼盒怎么选', titles: ['礼盒怎么选', '送礼指南'], cover_text: '选礼盒\n先看预算', pages: [{ role: '封面', text: '礼盒' }, { role: '内页', text: '第一行\n第二行' }], body: '正文第一段\n\n正文第二段', tags: ['花艺', '送礼'] }
  const md = draftText(d)
  const txt = draftText(d, false)
  assert.ok(md.startsWith('# 礼盒怎么选\n'))
  assert.ok(txt.startsWith('礼盒怎么选\n'))
  for (const out of [md, txt]) for (const text of [d.body, d.cover_text, d.pages[1].text, '送礼指南', '#花艺 #送礼']) assert.ok(out.includes(text), text)
  assert.equal(exportFilename('a/b:c\n礼盒', 'md'), 'a b c 礼盒.md')
  assert.equal(exportFilename(' ', 'txt'), '小红书稿件.txt')
})
