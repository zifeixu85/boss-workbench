// 知识库这一半的解析（约定 v0.2）：类型库、知识库档案里的“我关注的”“报告”“叫法”、对象文件（Obsidian 属性写法）、报告、角色。
// 运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TYPE_LIBRARY, PAGE_TYPES } from '../files/server/modules/pa/type-library.ts'
import { parseProfile } from '../files/server/modules/pa/profile.ts'
import { parseObject, objectNameFromPath } from '../files/server/modules/pa/object-parse.ts'
import { parseReport, periodOf, reportSummary } from '../files/server/modules/pa/report-parse.ts'
import { front, unlink } from '../files/server/modules/pa/text.ts'
import { cardLines, memoryStats, CARD_MAX_LINES, MEMORY_MAX_LINES } from '../files/server/modules/pa/role-parse.ts'

test('类型库：九种类型都出页面（渠道、门店、伙伴、主题 2026-11-26 起用通用的列表和详情）；每种有状态、列表字段、常关联', () => {
  assert.deepEqual(TYPE_LIBRARY.map((t) => t.name), ['项目', '客户', '产品', '案例', '作品', '渠道', '门店', '伙伴', '主题'])
  assert.deepEqual(PAGE_TYPES, ['项目', '客户', '产品', '案例', '作品', '渠道', '门店', '伙伴', '主题'])
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
| 渠道 | 12-渠道 | 已确认 |
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

test('“我关注的”：类型库里的照类型库；还没做页面的说清楚；库里没有的（学员）是自定义的一类（约定 11.8），没写状态对照要说；叫法换过来', () => {
  const r = parseProfile(PROFILE)
  assert.deepEqual(r.classes.map((c) => [c.name, c.folder, c.confirmed, !!c.custom]), [['项目', '02-项目', true, false], ['客户', '10-客户', true, false], ['产品', '11-产品', false, false], ['渠道', '12-渠道', true, false], ['学员', '13-学员', true, true]])
  const kh = r.classes[1]
  assert.deepEqual(kh.statuses, ['跟进中', '合作中', '沉默', '未开始', '进行中', '已结束'], '“在谈”换成本人的叫法；阶段名本身也收')
  assert.deepEqual(kh.rename, { 在谈: '跟进中' })
  assert.deepEqual(kh.fields, ['上次联系', '下次跟进'])
  assert.ok(r.classes.some((c) => c.name === '渠道'), '渠道也出页面了')
  assert.ok(r.problems.some((p) => /学员.*自定义.*状态对照/.test(p)))
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

test('角色文件（约定 v0.4 第 5.3、5.5 节）：人设数正文行数，记忆按行数算门槛、数没带日期的条目', () => {
  assert.equal(CARD_MAX_LINES, 50)
  assert.equal(MEMORY_MAX_LINES, 60)
  // 正文行数：不算开头属性、不算空行，小节标题算
  assert.equal(cardLines('## 我是谁\n小茶。\n\n## 我怎么说话\n- 先说结论\n'), 4)
  const m = memoryStats('# 记忆\n\n- 2026-11-20｜报价单不写“折扣”；林总说过\n- 2026-11-24｜周五下午不排会；他要接孩子\n- 不用表情包；林总不喜欢\n* 2026-1-3｜日期写错了；不算带日期\n')
  assert.deepEqual(m, { lines: 5, entries: 4, undated: 2, first: '2026-11-20', last: '2026-11-24' })
  assert.deepEqual(memoryStats(''), { lines: 0, entries: 0, undated: 0, first: '', last: '' })
  // 全角竖线、半角竖线都认
  assert.equal(memoryStats('- 2026-11-24 | 规矩；原因\n').undated, 0)
})

test('详情里“这个对象里的东西”：来源写的是一句话（和 AI 的对话）不当成文件；双链、路径照常补 .md', async () => {
  const { kbFiles } = await import('../files/server/modules/pa/text.ts')
  assert.deepEqual(kbFiles(['13-作品/一篇.md', '和内容助理的对话', '99-原始材料/a', '工作台内容页：/content/studio/p_1', '知识库档案.md']), ['13-作品/一篇.md', '99-原始材料/a.md', '知识库档案.md'])
})

// ── v0.8 第 10.2 节：状态分三个阶段，叫法是用户自己的
test('三个阶段：类型库每类原来的状态是默认叫法，各归一个阶段；项目“搁着”归已结束、客户“沉默”归进行中（2026-11-26 A梦 定）；案例不套阶段', async () => {
  const { STAGES } = await import('../files/server/modules/pa/stages.ts')
  assert.deepEqual([...STAGES], ['未开始', '进行中', '已结束'])
  const stagesOf = (n: string) => TYPE_LIBRARY.find((t) => t.name === n)?.stages
  assert.deepEqual(stagesOf('项目'), { 还没开始: '未开始', 进行中: '进行中', 搁着: '已结束', 已结束: '已结束' })
  assert.deepEqual(stagesOf('客户'), { 在谈: '未开始', 合作中: '进行中', 沉默: '进行中' })
  assert.deepEqual(stagesOf('产品'), { 筹备: '未开始', 在卖: '进行中', 下架: '已结束' })
  assert.deepEqual(stagesOf('作品'), { 草稿: '未开始', 已发: '已结束', 下线: '已结束' })
  assert.equal(stagesOf('案例'), undefined)
  // 和知识库工具 scripts/mapping.mjs 的 TYPE_LIBRARY 同一份（2026-11-26 对齐）
  assert.deepEqual(stagesOf('渠道'), { 观察: '未开始', 在做: '进行中', 停了: '已结束' })
  assert.deepEqual(stagesOf('门店'), { 筹备: '未开始', 营业: '进行中', 关停: '已结束' })
  assert.deepEqual(stagesOf('伙伴'), { 在合作: '进行中', 暂停: '已结束', 不再合作: '已结束' })
  assert.deepEqual(stagesOf('主题'), { 想学: '未开始', 在学: '进行中', 放着: '已结束' })
})

test('“我关注的”的状态字段、状态对照（右边写三个阶段之一）；“叫法”里换的叫法跟着原来那个归阶段；对照写错的说出来、不采用', () => {
  const md = `## 我关注的

| 类型 | 文件夹 | 确认 | 文件怎么认 | 名称取自 | 状态字段 | 状态对照 |
|---|---|---|---|---|---|---|
| 项目 | 30-项目实验室 | 已确认 | */*/项目总览.md | | status | active=进行中；waiting=已结束；completed=已结束 |
| 客户 | 10-客户 | 已确认 | | | 阶段 | 意向=未开始; 已流失=已结束; 签了=成交 |
| 案例 | 12-案例 | 已确认 | | | | |

### 叫法

- 客户：在谈 → 跟进中
`
  const r = parseProfile(md)
  const [xm, kh, al] = r.classes
  assert.equal(xm.statusField, 'status')
  assert.deepEqual(xm.stageOf, { 还没开始: '未开始', 进行中: '进行中', 搁着: '已结束', 已结束: '已结束', 未开始: '未开始', active: '进行中', waiting: '已结束', completed: '已结束' })
  assert.deepEqual(xm.statuses, ['还没开始', '进行中', '搁着', '已结束', '未开始', 'active', 'waiting', 'completed'])
  assert.equal(kh.statusField, '阶段')
  assert.equal(kh.stageOf['跟进中'], '未开始', '换了叫法的跟着原来的“在谈”归未开始')
  assert.equal(kh.stageOf['意向'], '未开始')
  assert.equal(kh.stageOf['签了'], undefined, '右边不是三个阶段之一，不采用')
  assert.ok(r.problems.some((p) => /签了=成交/.test(p) && /未开始、进行中、已结束/.test(p)))
  assert.deepEqual(al.stageOf, {}, '案例不套阶段')
  assert.equal(al.statusField, '状态')
})

test('状态写的就是阶段名（未开始、进行中、已结束）：哪一类都直接归那个阶段，不用写进对照；写了对照，类型库的默认叫法照样兜底（和知识库工具一致）', async () => {
  const { stageOf } = await import('../files/server/modules/pa/stages.ts')
  // 知识库工具升级检查写出来的样子：原话恰好是阶段名的不进对照；产品那行对照空着
  const md = `## 我关注的

| 类型 | 文件夹 | 确认 | 文件怎么认 | 名称取自 | 状态字段 | 状态对照 |
|---|---|---|---|---|---|---|
| 项目 | 7-正在做的事 | 已确认 |  |  |  | 暂停=已结束；弄完了=已结束 |
| 客户 | 3-客户需求库 | 已确认 | 企业客户/*.md |  |  | 报了价没回=未开始；在合作=进行中 |
| 产品 | 2-产品库 | 已确认 |  |  |  |  |
| 案例 | 12-案例 | 已确认 |  |  |  |  |
`
  const { classes, problems } = parseProfile(md)
  assert.deepEqual(problems, [])
  const [xm, kh, cp, al] = classes
  assert.equal(stageOf(kh, '进行中'), '进行中')
  assert.equal(stageOf(kh, '已结束'), '已结束')
  assert.equal(stageOf(kh, '未开始'), '未开始')
  assert.equal(stageOf(kh, '报了价没回'), '未开始')
  assert.equal(stageOf(kh, '合作中'), '进行中', '默认叫法照样认')
  assert.equal(stageOf(xm, '进行中'), '进行中')
  assert.equal(stageOf(xm, '暂停'), '已结束')
  assert.equal(stageOf(cp, '在卖'), '进行中', '对照空着，默认叫法兜底')
  assert.equal(stageOf(kh, '有点悬'), '未归类')
  assert.equal(stageOf(kh, ''), '没标')
  assert.ok(kh.statuses.includes('已结束'), '对话里 pa-update 写阶段名也收')
  assert.equal(stageOf(al, '进行中'), null, '案例不套阶段，阶段名也不加')
  assert.ok(!al.statuses.includes('进行中'))
})

test('老板自己结构的对象（开头没写“类型”，按对照表登记进来的）：不报缺字段、不报写法要改，标成自己的写法；照我们格式写的照常提示', () => {
  // 木槿花艺这种：升级检查只在开头补了一行状态，正文是老板自己的写法
  const own = parseObject('---\n状态: 进行中\n别名: 青岚、青岚设计工作室\n---\n\n# 青岚设计\n\n合作两年，每季度一单。\n', '3-客户需求库/企业客户/青岚设计.md')
  assert.equal(own.own, true)
  assert.deepEqual(own.missing, [])
  assert.deepEqual(own.warnings, [])
  assert.equal(own.status, '进行中')
  assert.equal(own.now, '')
  const plain = parseObject('# 半亩书店\n\n只写了正文\n', '3-客户需求库/企业客户/半亩书店.md')
  assert.deepEqual([plain.own, plain.missing.length, plain.name], [true, 0, '半亩书店'])
  const ours = parseObject('---\n类型: 客户\n名称: 云杉物流\n---\n\n## 现在\n在谈\n', '10-客户/云杉物流.md')
  assert.equal(ours.own, false)
  assert.deepEqual(ours.missing, ['状态', '更新', '确认', '隐私', '来源'])
})

test('自定义的一类（约定 11.8，比如“学员”）：类型库里没有、登记在“我关注的”里就出页面，用通用的列表和详情；状态对照必须写，没写照样显示、说出来', async () => {
  const { stageOf } = await import('../files/server/modules/pa/stages.ts')
  const md = `## 我关注的

| 类型 | 文件夹 | 确认 | 文件怎么认 | 名称取自 | 状态字段 | 状态对照 |
|---|---|---|---|---|---|---|
| 学员 | 11-学员 | 已确认 |  |  |  | 报名=未开始；在读=进行中；毕业=已结束 |
| 讲师 | 12-讲师 | 待确认 |  |  |  |  |
`
  const r = parseProfile(md)
  const [xy, js] = r.classes
  assert.deepEqual(r.classes.map((c) => [c.name, c.folder, c.custom, c.icon]), [['学员', '11-学员', true, 'Tag'], ['讲师', '12-讲师', true, 'Tag']])
  assert.equal(stageOf(xy, '在读'), '进行中')
  assert.equal(stageOf(xy, '进行中'), '进行中', '阶段名本身也认')
  assert.equal(stageOf(js, '上课中'), '未归类')
  assert.ok(!r.problems.some((p) => /学员.*不在类型库/.test(p)))
  assert.ok(r.problems.some((p) => /讲师.*状态对照/.test(p)))
  assert.deepEqual(xy.fields, [])
})
