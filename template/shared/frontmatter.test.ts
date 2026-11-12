// 知识库文档开头那几行换成给人看的标签（shared/frontmatter.ts）：不原样贴字段。npm test 会跑
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metaLabels, splitFrontmatter } from './frontmatter.ts'

test('拆开头：BOM、Windows 换行、多行来源都认，正文不带开头', () => {
  const md = '﻿---\r\n类型: 客户\r\n更新: 2026-10-25\r\n确认: 已确认\r\n隐私: 内部\r\n来源:\r\n  - 99-原始材料/采访记录/2026-10-20-建库采访.md\r\n  - 04-客户/README.md\r\n---\r\n# 云杉物流\r\n'
  const { meta, body } = splitFrontmatter(md)
  assert.deepEqual(meta.map((m) => m.key), ['类型', '更新', '确认', '隐私', '来源'])
  assert.deepEqual(meta[4].list, ['99-原始材料/采访记录/2026-10-20-建库采访.md', '04-客户/README.md'])
  assert.equal(body, '# 云杉物流\r\n')
})

test('只给人看三样：确认状态、私密 / 可公开、来源；类型、更新这些键不显示', () => {
  const { meta } = splitFrontmatter('---\n类型: 客户\n更新: 2026-10-25\n确认: 已确认\n隐私: 内部\n来源: 99-原始材料/采访记录/a.md\n工作台ID: c_1\n---\n正文')
  assert.deepEqual(metaLabels(meta), [
    { kind: 'confirm', text: '已确认' },
    { kind: 'source', text: '来源：a', paths: ['99-原始材料/采访记录/a.md'] },
  ])
})

test('不认识的值从严：确认按待确认，隐私按私密；没有开头就什么都不显示', () => {
  assert.deepEqual(metaLabels(splitFrontmatter('---\n确认: 差不多\n隐私: 保密\n---\n').meta), [
    { kind: 'confirm', text: '待确认' }, { kind: 'privacy', text: '私密' },
  ])
  assert.deepEqual(metaLabels(splitFrontmatter('---\n确认: 已过期\n隐私: 可公开\n---\n').meta).map((l) => l.text), ['已过期', '可公开'])
  assert.deepEqual(splitFrontmatter('# 没有开头').meta, [])
})
