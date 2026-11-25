// 知识库检测（约定 v0.6 第 9.6 节“检测怎么说”）：按档案看这个知识库现在能撑起哪些页面，对不上的说清缺什么、下一步说哪一句。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { checkKb, checkText, deriveClasses, NEXT_SAY } from './kb-check.mjs'

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
  for (const id of ['focus', 'roles', 'reports']) assert.equal(page(r, id).status, '要升级检查', id)
  assert.match(page(r, 'focus').need, /知识库档案/)
  assert.match(page(r, 'roles').need, /助理/)
  assert.equal(r.next, NEXT_SAY)
  const text = checkText(r)
  assert.match(text, /现在就能用/)
  assert.match(text, /要先做升级检查/)
  assert.match(text, /检查一下我的知识库/)
  assert.ok(text.split('\n').length <= 20, '一屏说清')
})

test('老板知识库工具建的旧结构（01-AI协作/建库档案.md）：没有“我关注的”表，按标准层推出客户、项目，标待确认', () => {
  const r = checkKb(kb({ '01-AI协作/建库档案.md': '---\n格式: 老板知识库/2\n---\n', '02-关于我/基本情况.md': 'x', '04-客户/README.md': 'x', '04-客户/云杉.md': 'x', '06-项目/春节茶礼.md': 'x', '00-收件箱/': '' }))
  assert.equal(r.profile.path, '01-AI协作/建库档案.md')
  assert.equal(r.profile.kind, '旧结构')
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

test('我关注的：登记了但文件夹不在、登记了类型库里没有的类，单独说；至少一类对得上就算能用（部分）', () => {
  const profile = '## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 项目 | 02-项目 | 已确认 |\n| 客户 | 10-客户 | 已确认 |\n| 学员 | 20-学员 | 已确认 |\n'
  const r = checkKb(kb({ '知识库档案.md': profile, '02-项目/a.md': 'x', '01-关于我/助理/': '', '90-日志与报告/': '', '00-收件箱/': '' }))
  const f = page(r, 'focus')
  assert.equal(f.status, '能用')
  assert.deepEqual(f.classes.map((c) => [c.name, c.ok]), [['项目', true], ['客户', false], ['学员', false]])
  assert.match(f.classes[1].why, /10-客户.*没有/)
  assert.match(f.classes[2].why, /类型库/)
  assert.equal(r.ready, false, '有一类对不上，提示做一次升级检查')
})

test('知识库文件夹不存在、不是文件夹：直接说清，不猜', () => {
  const r = checkKb('/没有这个文件夹/xyz')
  assert.equal(r.exists, false)
  assert.match(checkText(r), /找不到这个文件夹/)
})
