// 助理档案的分组和界面用语（2026-11-27 A梦 定）：设定、能力、协作、资料四组；没有文件的组和页签不显示；认不出的进资料、显示原文件名。
// 运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archiveGroups } from '../files/src/features/pa/archive-groups.ts'

const f = (name: string) => ({ name, path: `助理/x/${name}.md` })
const show = (files: ReturnType<typeof f>[]) => archiveGroups(files).map((g) => [g.label, g.items.map((i) => i.label)])

test('总助全套：四组都有，按约定的顺序和叫法', () => {
  const all = ['IDENTITY', 'SOUL', 'MEMORY', '看家本领', '行业门道', '会用的家伙', '示范', '路由表', '派单记录', '起名规则', '画像', '岗位调研'].map(f)
  assert.deepEqual(show(all), [['设定', ['身份', '准则', '记忆']], ['能力', ['方法', '行业知识', '工具', '示范']], ['协作', ['路由表', '派单记录', '起名规则']], ['资料', ['完整画像', '岗位调研']]])
})

test('别的助理没有协作那三份：不显示协作；缺的文件不出页签；认不出的（底稿）进资料、用原文件名', () => {
  assert.deepEqual(show(['SOUL', 'IDENTITY', '看家本领', '底稿'].map(f)), [['设定', ['身份', '准则']], ['能力', ['方法']], ['资料', ['底稿']]])
})

test('旧格式的三份归设定，页签写“身份（旧）”这样；页签带着真实文件', () => {
  const g = archiveGroups(['角色', '规矩', '记忆'].map(f))
  assert.deepEqual(g.map((x) => [x.label, x.items.map((i) => i.label)]), [['设定', ['身份（旧）', '准则（旧）', '记忆（旧）']]])
  assert.equal(g[0].items[0].file.path, '助理/x/角色.md')
})
