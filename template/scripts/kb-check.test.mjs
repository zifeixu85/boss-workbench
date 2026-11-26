// 知识库检测（约定 v0.6 第 9.6 节“检测怎么说”）：按档案看这个知识库现在能撑起哪些页面，对不上的说清缺什么、下一步说哪一句。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { checkKb, checkText, deriveClasses, objectFiles, isSummaryName, splitPatterns, NEXT_SAY, ASSISTANT_SAY, DEFAULT_POSITIONS } from './kb-check.mjs'

function kb(files) {
  const root = mkdtempSync(join(os.tmpdir(), 'wb-kbcheck-'))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    if (rel.endsWith('/')) { mkdirSync(abs, { recursive: true }); continue }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}
const page = (r, id) => r.pages.find((p) => p.id === id)
const PROFILE = '## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 项目 | 02-项目 | 已确认 |\n| 客户 | 10-客户 | 待确认 |\n'

test('个人助理版骨架：档案、我关注的、助理、报告、收件箱都在，全部能用，不用升级检查', () => {
  const r = checkKb(kb({ '知识库档案.md': PROFILE, '02-项目/春节茶礼.md': 'x', '10-客户/云杉.md': 'x', '01-关于我/USER.md': 'x', '01-关于我/助理/': '', '90-日志与报告/': '', '00-收件箱/': '' }))
  assert.equal(r.profile.path, '知识库档案.md')
  assert.equal(r.ready, true)
  assert.deepEqual(r.pages.filter((p) => p.status !== '能用').map((p) => p.id), [])
  assert.deepEqual(page(r, 'focus').classes.map((c) => [c.name, c.folder, c.ok]), [['项目', '02-项目', true], ['客户', '10-客户', true]])
  assert.match(checkText(r), /都能用/)
})

test('没有档案的已有知识库（比如自己一直在用的 Obsidian）：进展、产出照常能用；我关注的、助理、报告要先做升级检查，各说缺什么；下一步说哪一句', () => {
  const r = checkKb(kb({ '30-项目实验室/产品实验/2026-03-10-某项目/项目总览.md': 'x', '10-自我说明书/01-身份与经历/a.md': 'x', 'AGENTS.md': '# 我的库' }))
  assert.equal(r.profile.path, null)
  assert.equal(r.ready, false)
  assert.equal(page(r, 'progress').status, '能用')
  assert.equal(page(r, 'outputs').status, '能用')
  for (const id of ['focus', 'reports']) assert.equal(page(r, id).status, '要升级检查', id)
  assert.equal(page(r, 'roles').status, '还没建助理')
  assert.match(page(r, 'focus').need, /知识库档案/)
  assert.equal(r.next, NEXT_SAY)
  const text = checkText(r)
  assert.match(text, /现在就能用/)
  assert.match(text, /要先做升级检查/)
  assert.match(text, /检查一下我的知识库/)
  assert.ok(text.split('\n').length <= 22, '一屏说清')
})

test('老板知识库工具建的旧结构（01-AI协作/建库档案.md）：没有“我关注的”表，按标准层推出客户、项目，标待确认', () => {
  const r = checkKb(kb({ '01-AI协作/建库档案.md': '---\n格式: 老板知识库/2\n---\n', '02-关于我/基本情况.md': 'x', '04-客户/README.md': 'x', '04-客户/云杉.md': 'x', '06-项目/春节茶礼.md': 'x', '00-收件箱/': '' }))
  assert.equal(r.profile.path, '01-AI协作/建库档案.md')
  assert.equal(r.profile.kind, '旧结构的建库档案')
  const f = page(r, 'focus')
  assert.equal(f.status, '能用')
  assert.deepEqual(f.classes.map((c) => [c.name, c.folder, c.ok, c.derived]), [['客户', '04-客户', true, true], ['项目', '06-项目', true, true]])
  assert.match(f.note, /目录对应.*待确认/)
  assert.equal(r.ready, false, '推出来的要用户确认：提示做一次升级检查登记下来')
  assert.equal(page(r, 'confirm').status, '能用', '收件箱在默认位置，“要你确认的资料”能用')
  assert.match(checkText(r), /推出来/)
})

test('就地建图的旧结构：按“目录对应”表找客户、项目的实际文件夹', () => {
  const archive = '---\n格式: 老板知识库/2\n结构: 就地建图\n---\n\n## 目录对应\n\n| 层 | 实际位置 | 说明 |\n|---|---|---|\n| 04-客户 | 我的客户 | 接入时登记 |\n| 06-项目 | 在做的事/ | 接入时登记 |\n| 原有·只读 | 老资料 | |\n'
  const r = checkKb(kb({ '01-AI协作/建库档案.md': archive, '我的客户/张总.md': 'x', '在做的事/开店.md': 'x' }))
  assert.deepEqual(page(r, 'focus').classes.map((c) => [c.name, c.folder]), [['客户', '我的客户'], ['项目', '在做的事']])
  assert.deepEqual(deriveClasses(archive, () => true).map((c) => c.folder), ['我的客户', '在做的事'])
})

test('旧结构里找不到客户、项目（文件夹没有，或里面没有文件）：要升级检查，说清是资料没存还是散着', () => {
  const r = checkKb(kb({ '01-AI协作/建库档案.md': '---\n格式: 老板知识库/2\n---\n', '04-客户/README.md': 'x', '00-收件箱/': '' }))
  const f = page(r, 'focus')
  assert.equal(f.status, '要升级检查')
  assert.match(f.need, /推不出来/)
  assert.match(f.need, /04-客户.*没有文件/)
  assert.match(f.need, /06-项目.*没有/)
})

test('旧结构只推出一部分：推出来的照常用，没推出来的说清为什么', () => {
  const r = checkKb(kb({ '01-AI协作/建库档案.md': '---\n格式: 老板知识库/2\n---\n', '04-客户/张总.md': 'x', '06-项目/README.md': 'x' }))
  const f = page(r, 'focus')
  assert.equal(f.status, '能用')
  assert.match(f.note, /项目没推出来（06-项目 里没有文件）/)
})

test('档案的“位置”小节：助理、报告、收件箱、你是谁这一页按登记的路径找；登记的文件夹不在，说出来', () => {
  const profile = `${PROFILE}\n## 位置\n\n| 是什么 | 在哪 |\n|---|---|\n| 关于我 | 10-自我说明书 |\n| 你是谁这一页 | 10-自我说明书/USER.md |\n| 助理 | 10-自我说明书/助理 |\n| 报告 | 00-系统工作台/报告 |\n| 收件箱 | 00-临时方案草稿 |\n`
  const r = checkKb(kb({ '知识库档案.md': profile, '02-项目/a.md': 'x', '10-客户/': '', '10-自我说明书/USER.md': 'x', '10-自我说明书/助理/': '', '00-临时方案草稿/': '' }))
  assert.equal(page(r, 'roles').status, '能用')
  assert.equal(page(r, 'roles').where, '10-自我说明书/助理')
  assert.equal(page(r, 'confirm').where, '00-临时方案草稿')
  assert.equal(page(r, 'reports').status, '要升级检查')
  assert.match(page(r, 'reports').need, /00-系统工作台\/报告/)
  assert.equal(r.positions['你是谁这一页'], '10-自我说明书/USER.md')
})

test('我关注的：登记了但文件夹不在的单独说（类型库里没有的是自定义的一类，文件夹在就算对得上）；至少一类对得上就算能用（部分）', () => {
  const profile = '## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 项目 | 02-项目 | 已确认 |\n| 客户 | 10-客户 | 已确认 |\n| 学员 | 20-学员 | 已确认 |\n'
  const r = checkKb(kb({ '知识库档案.md': profile, '02-项目/a.md': 'x', '01-关于我/助理/': '', '90-日志与报告/': '', '00-收件箱/': '' }))
  const f = page(r, 'focus')
  assert.equal(f.status, '能用')
  assert.deepEqual(f.classes.map((c) => [c.name, c.ok]), [['项目', true], ['客户', false], ['学员', false]])
  assert.match(f.classes[1].why, /10-客户.*没有/)
  assert.match(f.classes[2].why, /20-学员.*没有/)
  assert.equal(f.classes[2].custom, true)
  assert.equal(r.ready, false, '有一类对不上，提示做一次升级检查')
})

test('知识库文件夹不存在、不是文件夹：直接说清，不猜', () => {
  const r = checkKb('/没有这个文件夹/xyz')
  assert.equal(r.exists, false)
  assert.match(checkText(r), /找不到这个文件夹/)
})

// ── v0.7（2026-11-26 知识库和助理解耦）
test('只缺助理：不算知识库有问题，不指向升级检查；下一步说“认识一下我的总助”', () => {
  const r = checkKb(kb({ '知识库档案.md': PROFILE, '02-项目/a.md': 'x', '10-客户/b.md': 'x', '90-日志与报告/': '', '00-收件箱/': '' }))
  const roles = page(r, 'roles')
  assert.equal(roles.status, '还没建助理')
  assert.doesNotMatch(roles.need, /升级检查/)
  assert.deepEqual(r.says.map((s) => s.say), [ASSISTANT_SAY])
  const text = checkText(r)
  assert.match(text, /知识库对得上/)
  assert.match(text, /认识一下我的总助/)
  assert.doesNotMatch(text, /检查一下我的知识库/)
  assert.doesNotMatch(text, /要先做升级检查/)
})

test('知识库和助理都缺：两句都给，先知识库后助理', () => {
  const r = checkKb(kb({ 'AGENTS.md': '# 库' }))
  assert.deepEqual(r.says.map((s) => s.say), [NEXT_SAY, ASSISTANT_SAY])
  const text = checkText(r)
  assert.ok(text.indexOf('检查一下我的知识库') < text.indexOf('认识一下我的总助'))
  assert.equal(page(r, 'roles').status, '还没建助理')
  assert.equal(page(r, 'focus').status, '要升级检查')
})

test('位置认七行：往来记录（写不进原文件时放这）有默认，也能登记', () => {
  assert.equal(Object.keys(DEFAULT_POSITIONS).length, 7)
  assert.equal(DEFAULT_POSITIONS['往来记录（写不进原文件时放这）'], '90-日志与报告/往来记录')
  const profile = `${PROFILE}\n## 位置\n\n| 是什么 | 在哪 |\n|---|---|\n| 往来记录（写不进原文件时放这） | 00-系统工作台/往来记录 |\n`
  const r = checkKb(kb({ '知识库档案.md': profile, '02-项目/a.md': 'x', '10-客户/': '' }))
  assert.equal(r.positions['往来记录（写不进原文件时放这）'], '00-系统工作台/往来记录')
})

test('文件怎么认：分号隔开几种放法（中英文分号都认）；开头写了别的类型的、README 和索引不算，除非写明了文件名', () => {
  const root = kb({
    '04-客户/README.md': 'x', '04-客户/张总.md': '---\n类型: 客户\n---\n', '04-客户/企业客户/云杉物流.md': 'x', '04-客户/企业客户/索引.md': 'x',
    '06-项目/近期要事.md': '---\n类型: 待办\n---\n', '06-项目/春茶预售.md': '---\n类型: 项目\n---\n', '06-项目/开店/README.md': 'x', '06-项目/README.md': 'x',
  })
  assert.deepEqual(objectFiles(root, '04-客户', ['*.md', '*/*.md'], '客户'), ['04-客户/企业客户/云杉物流.md', '04-客户/张总.md'])
  assert.deepEqual(objectFiles(root, '06-项目', undefined, '项目'), ['06-项目/春茶预售.md', '06-项目/开店/README.md'])
  assert.deepEqual(splitPatterns('*.md；*/*.md; */README.md'), ['*.md', '*/*.md', '*/README.md'])
  const profile = '## 我关注的\n\n| 类型 | 文件夹 | 确认 | 文件怎么认 |\n|---|---|---|---|\n| 客户 | 04-客户 | 已确认 | *.md；*/*.md |\n'
  writeFileSync(join(root, '知识库档案.md'), profile)
  assert.equal(page(checkKb(root), 'focus').classes[0].count, 2)
})

test('旧结构推客户：客户在分组文件夹里（04-客户/企业客户/云杉物流.md）也推得出来；项目层里的“近期要事”不算项目', () => {
  const r = checkKb(kb({ '01-AI协作/建库档案.md': '---\n格式: 老板知识库/2\n---\n', '04-客户/README.md': 'x', '04-客户/企业客户/云杉物流.md': 'x', '06-项目/近期要事.md': '---\n类型: 待办\n---\n', '06-项目/README.md': 'x' }))
  const f = page(r, 'focus')
  assert.deepEqual(f.classes.map((c) => [c.name, c.count]), [['客户', 1]])
  assert.match(f.note, /项目没推出来（06-项目 里没有文件）/)
})

test('汇总文件不算对象（约定 9.7，和知识库工具 SUMMARY_NAME 同一份词表）：用 * 认到的原话集、反馈、价格表这类跳过；写明了文件名的照认', () => {
  const root = kb({
    '3-客户需求库/客户原话集.md': 'x', '3-客户需求库/成交反馈.md': 'x', '3-客户需求库/未成交记录.md': 'x', '3-客户需求库/评论区痛点.md': 'x',
    '3-客户需求库/企业客户/青禾书店.md': 'x', '3-客户需求库/企业客户/商机总表.md': 'x', '3-客户需求库/企业客户/目录.md': 'x',
    '2-产品库/花束订阅.md': 'x', '2-产品库/价格表.md': 'x', '2-产品库/报价单.md': 'x', '2-产品库/文案模板.md': 'x',
  })
  assert.deepEqual(objectFiles(root, '3-客户需求库', ['企业客户/*.md'], '客户'), ['3-客户需求库/企业客户/青禾书店.md'])
  assert.deepEqual(objectFiles(root, '2-产品库', ['*.md'], '产品'), ['2-产品库/花束订阅.md'])
  // 没被词表盖住的（未成交记录、评论区痛点）照认，要不要算客户由升级检查问
  assert.deepEqual(objectFiles(root, '3-客户需求库', ['*.md'], '客户'), ['3-客户需求库/评论区痛点.md', '3-客户需求库/未成交记录.md'])
  assert.deepEqual(objectFiles(root, '2-产品库', ['价格表.md'], '产品'), ['2-产品库/价格表.md'])
  for (const name of ['总表', '汇总', '清单', '列表', '价格表', '价目表', '报价单', '原话集', '合集', '集锦', '反馈', '模板', '索引', '目录']) assert.ok(isSummaryName(`客户${name}.md`), name)
  assert.ok(!isSummaryName('青禾书店.md'))
})

test('自定义的一类（约定 11.8）：类型库里没有的也算对得上，数得出几份，标“自定义”', () => {
  const root = kb({ '11-学员/张同学.md': '---\n类型: 学员\n状态: 在读\n---\n', '知识库档案.md': '## 我关注的\n\n| 类型 | 文件夹 | 确认 | 状态对照 |\n|---|---|---|---|\n| 学员 | 11-学员 | 已确认 | 在读=进行中 |\n' })
  const c = page(checkKb(root), 'focus').classes[0]
  assert.deepEqual([c.name, c.ok, c.count, c.custom], ['学员', true, 1, true])
})

test('建库还没做完（知识库档案开头的“建库方式”是 梳理进行中 / 快速版进行中 / 完整版进行中）：说一句资料还在整理，下一步先说“继续建库”；档案的叫法不写“个人助理版”', () => {
  const root = kb({ '知识库档案.md': `---\n类型: 知识库档案\n建库方式: 梳理进行中\n---\n\n${PROFILE}`, '02-项目/a.md': 'x', '10-客户/b.md': 'x', '01-关于我/助理/': '', '90-日志与报告/': '', '00-收件箱/': '' })
  const r = checkKb(root)
  assert.equal(r.profile.kind, '知识库档案')
  assert.equal(r.building, '梳理进行中')
  assert.equal(r.says[0].say, '继续建库')
  assert.equal(r.ready, false)
  const t = checkText(r)
  assert.match(t, /资料还在整理/)
  assert.match(t, /继续建库/)
  assert.doesNotMatch(t, /个人助理版/)
  const done = checkKb(kb({ '知识库档案.md': `---\n建库方式: 梳理完成\n---\n\n${PROFILE}`, '02-项目/a.md': 'x', '10-客户/b.md': 'x', '01-关于我/助理/': '', '90-日志与报告/': '', '00-收件箱/': '' }))
  assert.equal(done.building, null)
  assert.notEqual(done.says[0]?.say, '继续建库')
})
