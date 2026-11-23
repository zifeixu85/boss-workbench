// 知识库这一半的解析：知识库档案里“我关注的”表、对象文件、报告文件、角色文件。运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFocusTable } from '../files/server/modules/pa/profile.ts'
import { parseObject, objectNameFromPath } from '../files/server/modules/pa/object-parse.ts'
import { parseReport, periodOf, reportSummary } from '../files/server/modules/pa/report-parse.ts'

const PROFILE = `# 知识库档案

谁的：林总

## 我关注的

| 类名 | 文件夹 | 状态可选值 | 列表上显示 | 确认 |
|---|---|---|---|---|
| 项目 | 02-项目 | 进行中、搁着、已结束 | 截止、负责人 | 已确认 |
| 客户 | \`10-客户\` | 在谈、合作中、沉默 | 上次联系、下次跟进 | 已确认 |
| 产品 | 11-产品/ | 在卖、筹备、下架 | 价格 | 待确认 |

## 别的
| 类名 | 文件夹 |
|---|---|
| 不算 | 99 |
`

test('“我关注的”表：有几行出几类，字段最多两个，待确认的照常出', () => {
  const r = parseFocusTable(PROFILE)
  assert.deepEqual(r.classes.map((c) => [c.name, c.folder, c.confirmed]), [['项目', '02-项目', true], ['客户', '10-客户', true], ['产品', '11-产品', false]])
  assert.deepEqual(r.classes[0].statuses, ['进行中', '搁着', '已结束'])
  assert.deepEqual(r.classes[1].fields, ['上次联系', '下次跟进'])
  assert.deepEqual(r.classes[2].fields, ['价格'])
  assert.deepEqual(r.problems, [])
})

test('表头被改过、没有这一节、文件夹跑到库外：说清哪里不对，不悄悄出错', () => {
  assert.match(parseFocusTable('# 档案\n没有表').problems[0], /没有“我关注的”/)
  assert.match(parseFocusTable('## 我关注的\n\n| 类 | 目录 |\n|---|---|\n| 客户 | 10-客户 |\n').problems[0], /表头/)
  const bad = parseFocusTable('## 我关注的\n\n| 类名 | 文件夹 | 状态可选值 | 列表上显示 | 确认 |\n|---|---|---|---|---|\n| 客户 | ../外面 | 在谈 | 上次联系 | 已确认 |\n| 客户 | 10-客户 | 在谈 | 甲、乙、丙 | 已确认 |\n')
  assert.equal(bad.classes.length, 1)
  assert.deepEqual(bad.classes[0].fields, ['甲', '乙'], '列表上显示最多两个')
  assert.equal(bad.problems.length, 2)
})

const OBJ = `---
类型: 客户
名称: 云杉物流
状态: 合作中
更新: 2026-11-24
确认: 待确认
隐私: 内部
来源: 99-原始材料/飞书/2026-11-20-周会纪要.md
别名: 云杉、云杉林总
关联: 02-项目/春节茶礼、11-产品/礼盒
工作文件夹: ~/工作/云杉、/tmp/yunshan
上次联系: 2026-11-20
---

## 现在
报价单 v2 做完待看；卡在供应商交期没回。

## 下一步
- [ ] 周四和孙蕾对一遍 · 11-26 · 林总
- [x] 发第一版报价

## 往来记录
- 2026-11-24｜电话｜客户要 120 份，每份 150 以内；答应：周五前回；来源：99-原始材料/电话.md（AI 记录，待确认）
- 2026-11-20|周会|定了分两档价位
- 没有日期的一行

## 来源
- 99-原始材料/飞书/2026-11-20-周会纪要.md
`

test('对象文件：开头字段、别名、关联、工作文件夹、四个小节', () => {
  const o = parseObject(OBJ, '10-客户/云杉物流.md')
  assert.deepEqual([o.type, o.name, o.status, o.updated, o.confirm, o.privacy], ['客户', '云杉物流', '合作中', '2026-11-24', '待确认', '内部'])
  assert.deepEqual(o.aliases, ['云杉', '云杉林总'])
  assert.deepEqual(o.links, ['02-项目/春节茶礼', '11-产品/礼盒'])
  assert.deepEqual(o.workdirs, ['~/工作/云杉', '/tmp/yunshan'])
  assert.equal(o.fields['上次联系'], '2026-11-20')
  assert.match(o.now, /报价单 v2/)
  assert.deepEqual(o.next.map((n) => [n.done, n.text]), [[false, '周四和孙蕾对一遍 · 11-26 · 林总'], [true, '发第一版报价']])
  assert.deepEqual(o.log.map((l) => [l.date, l.channel, l.pending]), [['2026-11-24', '电话', true], ['2026-11-20', '周会', false], ['', '', false]])
  assert.match(o.log[0].text, /120 份/)
  assert.deepEqual(o.sources, ['99-原始材料/飞书/2026-11-20-周会纪要.md'])
  assert.deepEqual(o.missing, [])
})

test('对象文件缺必填字段：列出来；名称没写用文件名，文件夹式的取文件夹名', () => {
  const o = parseObject('---\n类型: 项目\n状态: 进行中\n---\n## 现在\n在做', '02-项目/春节茶礼/README.md')
  assert.equal(o.name, '春节茶礼')
  assert.deepEqual(o.missing, ['名称', '更新', '确认', '隐私', '来源'])
  assert.equal(objectNameFromPath('10-客户/云杉物流.md'), '云杉物流')
  assert.equal(parseObject('没有开头', '10-客户/甲.md').missing.length, 7)
})

const WEEK = `---
类型: 周报
期间: 2026-W48
写的人: 总助、分身
更新: 2026-11-29
确认: 待确认
隐私: 内部
---

## 做了什么
- 春节茶礼：方案两版、报价单、主图。
- 企业团购：折扣规则理了一半。

## 踩的坑
- 扫描版合同数字读错两处。

## 建议更新进知识库
- 企业客户每份预算一般在 130—150

## 这周的你
第二家店的事，三次提起、三次往后放。

## 目标对照
- 春节茶礼签 5 家：2 / 5
`

test('报告文件：类型、期间、五个小节；摘要取“做了什么”的前几条', () => {
  const r = parseReport(WEEK, '90-日志与报告/周报/2026-W48.md')
  assert.deepEqual([r.kind, r.period, r.by, r.confirm], ['周报', '2026-W48', '总助、分身', '待确认'])
  assert.deepEqual(r.sections.map((s) => s.title), ['做了什么', '踩的坑', '建议更新进知识库', '这周的你', '目标对照'])
  assert.deepEqual(reportSummary(r, 2), ['春节茶礼：方案两版、报价单、主图。', '企业团购：折扣规则理了一半。'])
  assert.deepEqual(r.problems, [])
})

test('报告没写期间就按文件名；期间换成起止日期（周一到周日）', () => {
  const r = parseReport('## 摘要\n- 一\n', '90-日志与报告/日报/2026-11-25.md')
  assert.deepEqual([r.kind, r.period], ['日报', '2026-11-25'])
  assert.ok(r.problems.some((p) => /类型/.test(p)))
  assert.deepEqual(periodOf('周报', '2026-W48'), { from: '2026-11-23', to: '2026-11-29' })
  assert.deepEqual(periodOf('日报', '2026-11-25'), { from: '2026-11-25', to: '2026-11-25' })
  assert.deepEqual(periodOf('月报', '2026-11'), { from: '2026-11-01', to: '2026-11-30' })
  assert.equal(periodOf('周报', '乱写'), null)
})
