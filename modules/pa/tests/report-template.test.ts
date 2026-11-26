// 报告模板（2026-11-26 A梦 定）：报告有哪几节、每节叫什么、用哪种块、数据从哪来，写在知识库报告文件夹里的“报告模板.md”，
// 老板在对话里说一句就能加节、去掉、改名；工作台按模板显示，不认死标题。没有模板文件用默认的一套。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_TEMPLATE, parseTemplate, templateFor, BLOCKS, DATA } from '../files/server/modules/pa/report-template.ts'

test('默认模板：周报九节（七节总助写，两节有分身才写），以对话为主；日报、月报也有', () => {
  const t = parseTemplate(DEFAULT_TEMPLATE)
  assert.deepEqual(t.problems, [])
  assert.deepEqual(t.kinds['周报'].map((s) => s.title), ['一句话', '这周在推进什么', '做成了什么', '卡在哪', '用 AI 的情况', '使用习惯', '说了但没沉淀的', '这周的你', '目标对照'])
  const use = t.kinds['周报'].find((s) => s.title === '用 AI 的情况')!
  assert.deepEqual([use.source, use.blocks], ['工作台', ['数字卡', '柱图']])
  assert.deepEqual(use.data, ['对话数', '做完', 'token', '连续天数', '按天对话'])
  assert.equal(t.kinds['周报'].find((s) => s.title === '这周的你')!.who, '分身')
  assert.equal(t.kinds['周报'].find((s) => s.title === '说了但没沉淀的')!.blocks[0], '待你点头')
  assert.ok(t.kinds['日报'].length >= 3 && t.kinds['月报'].length >= 4)
})

test('老板改过的模板：加节、去掉、改名都照着来；块和数据名写错的说出来、那一项不用；没写的那种报告用默认', () => {
  const md = `---\n类型: 报告模板\n---\n\n# 周报\n\n## 这周的客户\n- 块：要点\n- 来源：AI\n- 写法：按客户分，每家一句\n\n## 用量\n- 块：数字卡、饼图\n- 来源：工作台\n- 数据：token、心情\n`
  const t = parseTemplate(md)
  assert.deepEqual(t.kinds['周报'].map((s) => s.title), ['这周的客户', '用量'])
  assert.equal(t.kinds['周报'][0].note, '按客户分，每家一句')
  assert.deepEqual(t.kinds['周报'][1].blocks, ['数字卡'])
  assert.deepEqual(t.kinds['周报'][1].data, ['token'])
  assert.ok(t.problems.some((p) => /用量.*饼图/.test(p)))
  assert.ok(t.problems.some((p) => /用量.*心情/.test(p)))
  assert.deepEqual(t.kinds['日报'], parseTemplate(DEFAULT_TEMPLATE).kinds['日报'], '没写日报：用默认')
})

test('一节只写了标题：按 AI 写的一段话算；中英文冒号、顿号逗号都认；来源写“工作台＋AI”的两样都要', () => {
  const t = parseTemplate('# 周报\n\n## 随手记\n\n## 混合\n- 块: 数字卡, 要点\n- 来源：工作台＋AI\n- 数据：做完、出图\n')
  assert.deepEqual([t.kinds['周报'][0].blocks, t.kinds['周报'][0].source], [['一段话'], 'AI'])
  assert.deepEqual([t.kinds['周报'][1].blocks, t.kinds['周报'][1].source, t.kinds['周报'][1].data], [['数字卡', '要点'], '工作台+AI', ['做完', '出图']])
  assert.equal(templateFor(null, '周报').length, 9, '没有模板文件：默认')
})

test('块和数据的清单：六种块（图表分柱图、线图、占比），数据名都有说明', () => {
  assert.deepEqual(BLOCKS, ['一段话', '要点', '数字卡', '柱图', '线图', '占比', '表格', '待你点头'])
  for (const d of Object.values(DATA)) assert.ok(d.what && d.kind)
})
