import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanKnowledgeBase } from '../kb_scan.mjs'

const table = (rows, heading = '编号 | 标题') => `| ${heading} |\n|---|---|\n${rows.map(r => `| ${r} |`).join('\n')}`
async function count(t, body) {
  const root = mkdtempSync(join(tmpdir(), 'r2-work-rows-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '10-作品'))
  writeFileSync(join(root, 'AGENTS.md'), '<!-- 老板知识库 v2 -->\n# 测试\n<!-- 本段结束 -->\n')
  writeFileSync(join(root, '10-作品/作品索引.md'), body)
  return (await scanKnowledgeBase(root)).works.rows
}

test('单表：保留数据行，作品标题叫“标题”也不是表头', async t => {
  assert.equal(await count(t, table(['A | 标题', 'B | 另一篇'])), 2)
})
test('R2 同形最小复现：两平台各六条，第二个表头不是作品', async t => {
  const rows = prefix => Array.from({ length: 6 }, (_, i) => `${prefix}${i + 1} | 内容${i + 1}`)
  assert.equal(await count(t, `## 平台甲\n${table(rows('X'))}\n\n## 平台乙\n${table(rows('V'))}`), 12)
})
test('三表：分别排除表头；中间空表不虚增', async t => {
  assert.equal(await count(t, `## 平台甲\n${table(['A | 甲'])}\n\n## 空平台\n${table([])}\n\n## 平台乙\n${table(['B | 乙', 'C | 丙'])}`), 3)
})
test('空文件、仅标题、孤立表头与孤立竖线说明都不是作品', async t => {
  for (const text of ['', '# 作品索引\n## 小红书\n', '| 编号 | 标题 |', '| 这只是 | 一句说明 |\n普通文本\n| 另一句 | 说明 |']) assert.equal(await count(t, text), 0)
})
test('只有表头和分隔线，无数据为零', async t => {
  assert.equal(await count(t, table([])), 0)
})
test('全空/全占位行不计数，带编号而其他值未知的真实记录保留', async t => {
  assert.equal(await count(t, table([' | ', '（待填） | （还没有）', 'A | '])), 1)
})
test('CRLF、对齐分隔、转义竖线与双链别名不打断表格', async t => {
  assert.equal(await count(t, '| 编号 | 标题 |\n|-|:-:|\n| A | 甲 |\n'), 1, '保留旧扫描器支持的短分隔线')
  assert.equal(await count(t, '\uFEFF# 作品\r\n| 编号 | 标题 |\r\n|:---|---:|\r\n| A | [[原文|别名]] |\r\n| B | 甲\\|乙 |\r\n'), 2)
})
test('标题中有竖线但不是表格不计；正文结束后无表头的行不串入上表', async t => {
  assert.equal(await count(t, `${table(['A | 甲'])}\n\n## 乙 | 丙\n| 无表头 | 非数据 |`), 1)
})
