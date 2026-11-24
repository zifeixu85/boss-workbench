// 在对话里更新“我关注的”对象：只改四处（状态、现在、下一步、往来记录），开头的“更新”换成今天；别的地方一字不动。
// 运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planObjectUpdate } from '../files/server/modules/pa/update-plan.ts'

const FILE = `---
类型: 项目
名称: 春节茶礼
状态: 进行中
更新: 2026-11-20
确认: 已确认
隐私: 内部
来源: "[[99-原始材料/a]]"
---

## 现在
报价单做完待看。

## 下一步
- [ ] 寄样品 · 11-28 · 孙蕾
- [ ] 定包装 · 12-01 · 林总

## 往来记录
- 2026-11-20｜电话｜要 120 份（AI 记录，待确认）

## 来源
- 99-原始材料/a.md
`
const T = '2026-11-24'

test('改状态、现在：开头的状态换掉、更新换成今天；现在整段换掉；别的不动', () => {
  const r = planObjectUpdate(FILE, { status: '收尾', now: '样品寄出了，等客户挑包装。' }, T, ['筹备', '进行中', '收尾', '已完成'])
  assert.match(r.text, /^状态: 收尾$/m)
  assert.match(r.text, /^更新: 2026-11-24$/m)
  assert.match(r.text, /## 现在\n样品寄出了，等客户挑包装。\n\n## 下一步/)
  assert.ok(!r.text.includes('报价单做完待看'))
  assert.ok(r.text.includes('- [ ] 寄样品 · 11-28 · 孙蕾'), '下一步不动')
  assert.deepEqual(r.changes.map((c) => c.what), ['状态', '现在', '更新'])
  assert.deepEqual(r.changes[0], { what: '状态', old: '进行中', new: '收尾' })
})

test('状态不在这一类的状态里：不收', () => {
  assert.throws(() => planObjectUpdate(FILE, { status: '飞了' }, T, ['筹备', '进行中', '收尾', '已完成']), /状态只能是/)
})

test('下一步：加一条、勾掉一条（按文字认，认不出或认出两条都不收）', () => {
  const r = planObjectUpdate(FILE, { nextAdd: ['发报价确认单 · 11-30 · 林总'], nextDone: ['寄样品'] }, T, [])
  assert.match(r.text, /- \[x\] 寄样品 · 11-28 · 孙蕾\n- \[ \] 定包装 · 12-01 · 林总\n- \[ \] 发报价确认单 · 11-30 · 林总\n\n## 往来记录/)
  assert.throws(() => planObjectUpdate(FILE, { nextDone: ['开会'] }, T, []), /下一步里没找到/)
  assert.throws(() => planObjectUpdate(FILE, { nextDone: ['·'] }, T, []), /对上了 2 条/)
})

test('往来记录：末尾加一行，带日期、渠道、AI 记录待确认；只收一行', () => {
  const r = planObjectUpdate(FILE, { log: { channel: '微信', text: '客户选了木盒包装' } }, T, [])
  assert.match(r.text, /- 2026-11-20｜电话｜要 120 份（AI 记录，待确认）\n- 2026-11-24｜微信｜客户选了木盒包装；来源：和 AI 的对话（AI 记录，待确认）\n\n## 来源/)
  assert.throws(() => planObjectUpdate(FILE, { log: { channel: '微信', text: '两行\n内容' } }, T, []), /一行/)
})

test('没有这一节就新建：现在放在开头后面，下一步跟在现在后面，往来记录放在来源前面', () => {
  const bare = '---\n类型: 客户\n名称: 云杉物流\n状态: 在谈\n更新: 2026-11-01\n---\n\n## 来源\n- a\n'
  const r = planObjectUpdate(bare, { now: '在等报价', nextAdd: ['出报价'], log: { channel: '电话', text: '要报价' } }, T, [])
  assert.equal(r.text, '---\n类型: 客户\n名称: 云杉物流\n状态: 在谈\n更新: 2026-11-24\n---\n\n## 现在\n在等报价\n\n## 下一步\n- [ ] 出报价\n\n## 往来记录\n- 2026-11-24｜电话｜要报价；来源：和 AI 的对话（AI 记录，待确认）\n\n## 来源\n- a\n')
})

test('什么都没改、文件开头不对：不收', () => {
  assert.throws(() => planObjectUpdate(FILE, {}, T, []), /没有要改的/)
  assert.throws(() => planObjectUpdate('没有开头', { now: 'x' }, T, []), /开头/)
})
