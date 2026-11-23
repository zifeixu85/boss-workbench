// 知识库这一半的解析（约定 v0.2）：类型库、知识库档案里的“我关注的”“报告”“叫法”、对象文件（Obsidian 属性写法）、报告、角色。
// 运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TYPE_LIBRARY, PAGE_TYPES } from '../files/server/modules/pa/type-library.ts'
import { parseProfile } from '../files/server/modules/pa/profile.ts'
import { parseObject, objectNameFromPath } from '../files/server/modules/pa/object-parse.ts'
import { parseReport, periodOf, reportSummary } from '../files/server/modules/pa/report-parse.ts'
import { front, unlink } from '../files/server/modules/pa/text.ts'

test('类型库：九种类型，前四种出页面；每种有状态、列表字段、常关联', () => {
  assert.deepEqual(TYPE_LIBRARY.map((t) => t.name), ['项目', '客户', '产品', '案例', '作品', '渠道', '门店', '伙伴', '主题'])
  assert.deepEqual(PAGE_TYPES, ['项目', '客户', '产品', '案例'])
  const kh = TYPE_LIBRARY.find((t) => t.name === '客户')!
  assert.deepEqual([kh.statuses, kh.fields, kh.links], [['在谈', '合作中', '沉默'], ['上次联系', '下次跟进'], ['项目', '产品', '案例']])
})

const PROFILE = `# 知识库档案

## 我关注的

| 类型 | 文件夹 | 确认 |
|---|---|---|
| 项目 | 02-项目 | 已确认 |
| 客户 | \`10-客户\` | 已确认 |
| 产品 | 11-产品/ | 待确认 |
| 作品 | 12-作品 | 已确认 |
| 学员 | 13-学员 | 已确认 |

### 叫法

- 客户：在谈 → 跟进中
- 项目：搁着 → 暂停

## 候选类型

| 是什么 | 出现次数 | 记于 |
|---|---|---|
| 学员 | 6 | 2026-11-24 |

## 报告

| 报告 | 开关 | 什么时候出 |
|---|---|---|
| 日报 | 关 | 每天 22:00 |
| 周报 | 开 | 每周五 18:00 |
| 月报 | 开 | 每月最后一天 |
`

test('“我关注的”：只认类型库里的；还没做页面的、库里没有的都说清楚；状态和字段来自类型库，叫法换过来', () => {
  const r = parseProfile(PROFILE)
  assert.deepEqual(r.classes.map((c) => [c.name, c.folder, c.confirmed]), [['项目', '02-项目', true], ['客户', '10-客户', true], ['产品', '11-产品', false]])
  const kh = r.classes[1]
  assert.deepEqual(kh.statuses, ['跟进中', '合作中', '沉默'], '“在谈”换成本人的叫法')
  assert.deepEqual(kh.rename, { 在谈: '跟进中' })
  assert.deepEqual(kh.fields, ['上次联系', '下次跟进'])
  assert.ok(r.problems.some((p) => /作品.*还没做/.test(p)))
  assert.ok(r.problems.some((p) => /学员.*不在类型库/.test(p)))
  assert.deepEqual(r.candidates, [{ what: '学员', count: 6, at: '2026-11-24' }])
  assert.deepEqual(r.reports, { 日报: false, 周报: true, 月报: true })
})

test('知识库档案没写“报告”表：默认只开周报；表头改过、文件夹跑到库外：说清哪里不对', () => {
  assert.deepEqual(parseProfile('## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 客户 | 10-客户 | 已确认 |\n').reports, { 日报: false, 周报: true, 月报: false })
  assert.match(parseProfile('# 档案').problems[0], /没有“我关注的”/)
  assert.match(parseProfile('## 我关注的\n\n| 类名 | 文件夹 | 确认 |\n|---|---|---|\n').problems[0], /表头/)
  const bad = parseProfile('## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 客户 | ../外面 | 已确认 |\n')
  assert.equal(bad.classes.length, 0)
  assert.match(bad.problems[0], /知识库里面/)
})

test('属性写法：列表、带引号的双链、行内列表、空值；双链去掉括号和显示名', () => {
  const { meta } = front('---\n类型: 客户\n来源: "[[99-原始材料/a]]"\naliases:\n  - 云杉\n  - \'云杉林总\'\n关联: ["[[02-项目/春节茶礼]]", "[[11-产品/礼盒|礼盒]]"]\n空的:\n标签: []\n---\n正文')
  assert.equal(meta['类型'], '客户')
  assert.equal(meta['来源'], '[[99-原始材料/a]]')
  assert.deepEqual(meta['aliases'], ['云杉', '云杉林总'])
  assert.deepEqual(meta['关联'], ['[[02-项目/春节茶礼]]', '[[11-产品/礼盒|礼盒]]'])
  assert.equal(meta['空的'], '')
  assert.deepEqual(meta['标签'], [])
  assert.equal(unlink('[[02-项目/春节茶礼|茶礼]]'), '02-项目/春节茶礼')
  assert.equal(unlink('99-原始材料/a.md'), '99-原始材料/a.md')
})

const OBJ = `---
类型: 客户
名称: 云杉物流
状态: 合作中
更新: 2026-11-24
确认: 待确认
隐私: 内部
来源: "[[99-原始材料/飞书/2026-11-20-周会纪要]]"
aliases:
  - 云杉
  - 云杉林总
关联:
  - "[[02-项目/春节茶礼]]"
  - "[[11-产品/礼盒]]"
工作文件夹:
  - ~/工作/云杉
  - /tmp/yunshan
上次联系: 2026-11-20
---

## 现在
报价单 v2 做完待看；卡在供应商交期没回。

## 下一步
- [ ] 周四和孙蕾对一遍 · 11-26 · 林总
- [x] 发第一版报价

## 往来记录
- 2026-11-24｜电话｜客户要 120 份；来源：……（AI 记录，待确认）
- 2026-11-20|周会|定了分两档价位
- 没有日期的一行

## 来源
- 99-原始材料/飞书/2026-11-20-周会纪要.md
`

test('对象文件：属性、aliases、关联和来源的双链、工作文件夹列表、四个小节', () => {
  const o = parseObject(OBJ, '10-客户/云杉物流.md')
  assert.deepEqual([o.type, o.name, o.status, o.updated, o.confirm, o.privacy], ['客户', '云杉物流', '合作中', '2026-11-24', '待确认', '内部'])
  assert.deepEqual(o.source, ['99-原始材料/飞书/2026-11-20-周会纪要'])
  assert.deepEqual(o.aliases, ['云杉', '云杉林总'])
  assert.deepEqual(o.links, ['02-项目/春节茶礼', '11-产品/礼盒'])
  assert.deepEqual(o.workdirs, ['~/工作/云杉', '/tmp/yunshan'])
  assert.equal(o.fields['上次联系'], '2026-11-20')
  assert.match(o.now, /报价单 v2/)
  assert.deepEqual(o.next.map((n) => [n.done, n.text]), [[false, '周四和孙蕾对一遍 · 11-26 · 林总'], [true, '发第一版报价']])
  assert.deepEqual(o.log.map((l) => [l.date, l.channel, l.pending]), [['2026-11-24', '电话', true], ['2026-11-20', '周会', false], ['', '', false]])
  assert.deepEqual(o.sources, ['99-原始材料/飞书/2026-11-20-周会纪要.md'])
  assert.deepEqual(o.missing, [])
})

test('旧写法（v0.1 的“别名”、顿号隔开）也认，但标出来要改；缺必填字段列出来', () => {
  const o = parseObject('---\n类型: 项目\n状态: 进行中\n别名: 茶礼、春节礼\n关联: 10-客户/云杉物流、11-产品/礼盒\n---\n## 现在\n在做', '02-项目/春节茶礼/README.md')
  assert.equal(o.name, '春节茶礼')
  assert.deepEqual(o.aliases, ['茶礼', '春节礼'])
  assert.deepEqual(o.links, ['10-客户/云杉物流', '11-产品/礼盒'])
  assert.deepEqual(o.missing, ['名称', '更新', '确认', '隐私', '来源'])
  assert.ok(o.warnings.some((w) => /aliases/.test(w)))
  assert.ok(o.warnings.some((w) => /列表/.test(w)))
  assert.equal(objectNameFromPath('10-客户/云杉物流.md'), '云杉物流')
})

const WEEK = `---
类型: 周报
期间: 2026-W48
更新: 2026-11-29
确认: 待确认
隐私: 内部
---

## 做了什么
- 春节茶礼：方案两版、报价单、主图。
- 企业团购：折扣规则理了一半。

## 踩的坑
- 扫描版合同数字读错两处。

## 这周的你
第二家店的事，三次提起、三次往后放。
`

test('报告：类型、期间、小节（没内容的节可以不写）；摘要取“做了什么”；“写的人”不再必填', () => {
  const r = parseReport(WEEK, '90-日志与报告/周报/2026-W48.md')
  assert.deepEqual([r.kind, r.period, r.confirm], ['周报', '2026-W48', '待确认'])
  assert.deepEqual(r.sections.map((s) => s.title), ['做了什么', '踩的坑', '这周的你'])
  assert.deepEqual(reportSummary(r, 2), ['春节茶礼：方案两版、报价单、主图。', '企业团购：折扣规则理了一半。'])
  assert.deepEqual(r.problems, [])
})

test('报告没写期间就按文件名；期间换成起止日期（周一到周日）', () => {
  const r = parseReport('## 摘要\n- 一\n', '90-日志与报告/日报/2026-11-25.md')
  assert.deepEqual([r.kind, r.period], ['日报', '2026-11-25'])
  assert.ok(r.problems.some((p) => /类型/.test(p)))
  assert.deepEqual(periodOf('周报', '2026-W48'), { from: '2026-11-23', to: '2026-11-29' })
  assert.deepEqual(periodOf('月报', '2026-11'), { from: '2026-11-01', to: '2026-11-30' })
  assert.equal(periodOf('周报', '乱写'), null)
})
