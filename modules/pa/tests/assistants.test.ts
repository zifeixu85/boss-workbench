// 助理页（约定 11.11，2026-11-27 A梦 定）：都叫助理，不分种类。读 IDENTITY 开头的固定项（旧的缺了照样显示）、同事清单、派单记录；
// 对话归到哪个助理：常驻对话 → 标题“<头像> <名字>｜<职责>”（旧的没有竖线）→ 第一句“叫<名字>” → 派单记录里交出去的 → 工作台对话栏开的；认不出不硬归。
// 运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistantProps, matchAssistant, parseColleagues, parseDispatch, parseRetired, skillNames, worksFor, titleKey, type AssistantKey } from '../files/server/modules/pa/assistant-parse.ts'

const NEW_ID = `---
类型: 角色
名称: 阿栀
名字: 阿栀
头像: 🧑‍💼
职责: 总助
管什么: 盯各项目进度、派活、回来核对
不管什么: 替你回客户、答应价钱
怎么叫: 叫阿栀
能做什么:
  - 读知识库
  - 写知识库
  - 派活给别的对话
总协调: 是
信条: 先把关，再动手
---

## 我是谁
二十八岁的总助。
`
const OLD_ID = `---
类型: 角色
角色: 内容助理
名称: 小红
---

## 我是谁
林总的小红书内容助理，叫小红。

## 我管什么，不管什么
管：出选题、写稿、配图建议。不管：发布、回评论。
`

test('新格式：开头的几项全读出来；总协调是总助', () => {
  const a = assistantProps('总助-阿栀', NEW_ID)
  assert.deepEqual({ ...a }, { key: '总助-阿栀', name: '阿栀', avatar: '🧑‍💼', duty: '总助', owns: '盯各项目进度、派活、回来核对', notOwns: '替你回客户、答应价钱', call: '叫阿栀', can: ['读知识库', '写知识库', '派活给别的对话'], chief: true, motto: '先把关，再动手', legacy: false, missing: [] })
})

test('旧格式：缺的从文件夹名、“角色”、“我管什么，不管什么”那一节补；还缺的留空并列出来，不报错', () => {
  const a = assistantProps('内容-小红', OLD_ID)
  assert.equal(a.name, '小红'); assert.equal(a.duty, '内容助理'); assert.equal(a.avatar, '')
  assert.equal(a.owns, '出选题、写稿、配图建议。'); assert.equal(a.notOwns, '发布、回评论。')
  assert.equal(a.call, '叫小红'); assert.equal(a.chief, false); assert.equal(a.legacy, true); assert.equal(a.motto, '', '没写信条就是空的，不算缺')
  assert.deepEqual(a.missing, ['头像', '职责', '管什么', '不管什么', '怎么叫', '能做什么', '总协调'])
  assert.equal(assistantProps('总助-小茶', '---\n角色: 总助\n名称: 小茶\n---\n').chief, true, '旧的总助文件夹也算总协调')
  assert.equal(assistantProps('分身-阿远', '').name, '阿远', '没有 IDENTITY 也能显示')
  const many = assistantProps('分身-阿远', '## 我管什么，不管什么\n管：提醒你当初为什么开店。\n管：问一句这样还认得出产地吗。\n不管：具体报价，这些问总助。\n不管：合同、税。\n')
  assert.equal(many.owns, '提醒你当初为什么开店。 问一句这样还认得出产地吗。', '一行一条的接起来')
  assert.equal(many.notOwns, '具体报价，这些问总助。 合同、税。')
  assert.equal(assistantProps('a', '## 我管什么，不管什么\n主管：x\n').owns, '', '“主管：”不是“管：”')
})

test('同事清单：一行一个助理，名字一栏的双链拆出路径和显示名；常驻对话去掉括号里的说明', () => {
  const md = `---\n类型: 规则\n---\n\n| 头像 | 名字 | 职责 | 管什么 | 不管什么 | 怎么叫 | 常驻对话 |\n|---|---|---|---|---|---|---|\n| 🧑‍💼 | [[01-关于我/助理/总助-阿栀/IDENTITY\\|阿栀]] | 总助 | 派活 | 回客户 | 叫阿栀 | 🧑‍💼 阿栀｜总助（我的知识库，置顶） |\n| ✍️ | 小叶 | 小红书助理 | 写稿 | 发布 | 叫小叶 | 还没有 |\n\n## 不用了的\n\n| 名字 | 哪天停的 | 为什么 |\n|---|---|---|\n| 老王 | 2026-11-20 | 不用了 |\n`
  const rows = parseColleagues(md)
  assert.equal(rows.length, 2, '“不用了的”那张表不算')
  assert.deepEqual(rows[0], { avatar: '🧑‍💼', name: '阿栀', path: '01-关于我/助理/总助-阿栀/IDENTITY', duty: '总助', owns: '派活', notOwns: '回客户', call: '叫阿栀', thread: '🧑‍💼 阿栀｜总助' })
  assert.equal(rows[1].thread, '', '“还没有”就是没有')
})

test('派单记录：读表格每一行；交给谁去掉括号里的位置', () => {
  const md = `| 哪天 | 什么事 | 交给谁（怎么打开） | 做完怎么算 | 到哪一档 | 备注 |\n|---|---|---|---|---|---|\n| 2026-11-26 | [[10-客户/青岚设计]]圣诞礼盒三档报价 | 💼 圣诞礼盒报价（我的知识库项目） | 三档价 | 对方说做完了 | 先别给客户看 |\n| 2026-11-27 | 年货清单 | ✍️ 小叶｜小红书助理 | 十条 | 已交出 |  |\n`
  const rows = parseDispatch(md)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { day: '2026-11-26', what: '青岚设计圣诞礼盒三档报价', to: '💼 圣诞礼盒报价', done: '三档价', stage: '对方说做完了', note: '先别给客户看', open: true })
  assert.equal(parseDispatch('| 哪天 | 什么事 | 交给谁 | 做完怎么算 | 到哪一档 | 备注 |\n|---|---|---|---|---|---|\n| 2026-11-20 | a | b | c | 用户验收了 | |\n')[0].open, false, '验收了的不算没回')
})

const KEYS: AssistantKey[] = [
  { key: '总助-阿栀', name: '阿栀', avatar: '🧑‍💼', thread: '🧑‍💼 阿栀｜总助', chief: true },
  { key: '小红书助理-小叶', name: '小叶', avatar: '✍️', thread: '', chief: false },
  { key: '内容-小红', name: '小红', avatar: '', thread: '', chief: false },
]

test('对话归到哪个助理：常驻对话、新旧两种标题、第一句、派单记录、对话栏；认不出的不归', () => {
  const m = (title: string, first = '', extra: { dispatched?: string[]; dock?: boolean; persona?: string } = {}) => matchAssistant({ title, first, dock: !!extra.dock, persona: extra.persona }, KEYS, extra.dispatched ?? [])
  assert.deepEqual(m('🧑‍💼 阿栀｜总助'), { key: '总助-阿栀', by: '常驻对话' })
  assert.deepEqual(m('✍️ 小叶｜小红书助理'), { key: '小红书助理-小叶', by: '标题' })
  assert.deepEqual(m('✍️ 小叶 写年货清单'), { key: '小红书助理-小叶', by: '标题' }, '旧格式没有竖线也认')
  assert.deepEqual(m('小红｜内容助理'), { key: '内容-小红', by: '标题' }, '没有头像的：名字后面跟竖线也认')
  assert.equal(m('小红书怎么涨粉'), null, '名字只是开头几个字的不算')
  assert.deepEqual(m('写年货清单', '叫小叶，帮我写十条年货清单'), { key: '小红书助理-小叶', by: '第一句' })
  assert.equal(m('写年货清单', '小叶说的那个清单'), null)
  assert.deepEqual(m('💼 圣诞礼盒报价', '', { dispatched: ['💼 圣诞礼盒报价'] }), { key: '总助-阿栀', by: '派单记录' })
  assert.deepEqual(m('问个事', '', { dock: true }), { key: '总助-阿栀', by: '工作台对话栏' }, '对话栏里没说叫谁：默认总协调')
  assert.deepEqual(m('问个事', '叫小叶，看看这篇', { dock: true }), { key: '小红书助理-小叶', by: '第一句' })
  assert.deepEqual(m('对话栏：问个事', '【工作台】他正在看…', { dock: true, persona: '小红书助理-小叶' }), { key: '小红书助理-小叶', by: '工作台对话栏' }, '对话栏里选了叫小叶：记在对话上，按它认')
  assert.deepEqual(m('问个事', '', { dock: false, persona: '小红书助理-小叶' }), null, '不是对话栏开的不看这一项')
  assert.equal(m('随便聊聊'), null)
  assert.equal(titleKey('🧑‍💼 阿栀｜总助（我的知识库，置顶）'), '🧑‍💼 阿栀｜总助')
})

test('看家本领（约定 11.12）：每条“**叫什么**。什么时候用……”，取名字；没有加粗的才认小节标题、列表开头的名字；开头属性和说明段不算', () => {
  const md = `---\n类型: 角色\n名称: 看家本领\n---\n\n每条三句。\n\n- **金字塔原理**。什么时候用：汇报。用了我会：先给结论。\n- **要事第一**。什么时候用：排先后。\n\n**关键节点和依赖**。什么时候用：盯进度。\n\n## 复盘四问\n什么时候用：收尾。\n`
  assert.deepEqual(skillNames(md), ['金字塔原理', '要事第一', '关键节点和依赖'], '有加粗的条目就只认加粗的，小节标题不算')
  assert.deepEqual(skillNames('## 复盘四问\n什么时候用：收尾。\n## 要事第一\n'), ['复盘四问', '要事第一'], '全用小节标题写的：认标题')
  assert.deepEqual(skillNames('- 选题的钩子：什么时候用……\n- 标题套路。什么时候用……\n'), ['选题的钩子', '标题套路'])
  assert.deepEqual(skillNames(''), [])
})

test('不用了的助理（约定 11.11）：花名册“不用了的”那张小表里的名字；名字一栏是双链的取显示名', () => {
  const md = `| 头像 | 名字 | 职责 | 管什么 | 不管什么 | 怎么叫 | 常驻对话 |\n|---|---|---|---|---|---|---|\n| ✍️ | 小叶 | 小红书助理 | 写稿 | 发布 | 叫小叶 | 还没有 |\n\n## 不用了的\n\n| 名字 | 哪天停的 | 为什么 |\n|---|---|---|\n| [[01-关于我/助理/报价助理-阿算/IDENTITY\\|阿算]] | 2026-11-20 | 报价归总助了 |\n| 老王 | 2026-11-21 |  |\n`
  assert.deepEqual(parseRetired(md), [{ name: '阿算', day: '2026-11-20', why: '报价归总助了' }, { name: '老王', day: '2026-11-21', why: '' }])
  assert.deepEqual(parseRetired('| 名字 |\n|---|\n| 小叶 |\n'), [], '没有“不用了的”那一节就是空的')
})

test('引导工具新版的写法（2026-11-27）：信条写在“我是谁”正文里也认；看家本领有招牌打法、自查清单这些小节时，只取加粗的本领名', () => {
  const id = `---\n名字: 小满\n职责: 总助\n---\n\n## 我是谁\n- 我的信条：槿姐的时间，只花在非她不可的事上。\n- 我叫小满。\n`
  assert.equal(assistantProps('总助-小满', id).motto, '槿姐的时间，只花在非她不可的事上。')
  assert.equal(assistantProps('a', `---\n信条: 开头写的优先\n---\n\n## 我是谁\n- 我的信条：正文里的\n`).motto, '开头写的优先')
  const md = `# 小满的看家本领\n\n## 七条本领\n\n1. **把关**。什么时候用：……\n2. **紧急重要四象限**。什么时候用：……\n\n## 三套招牌打法\n\n### A. 一句含糊的话，变成派出去的活（五步）\n1. 先问清楚\n\n## 交活前的自查清单（八条）\n- 有没有写清哪天前\n`
  assert.deepEqual(skillNames(md), ['把关', '紧急重要四象限'])
})

test('助理的产出（约定 11.13）：按命令里记的名字认，名字单独出现的也算；前后紧挨着别的字的不算；按时间倒序', () => {
  const w = (id: string, by: string[], at: string) => ({ id, kind: '小红书', title: id, status: '草稿', by, at, to: `/content/studio/${id}` })
  const items = [w('a', ['阿柚'], '2026-11-27T01:00:00Z'), w('b', ['本机 Codex', '✍️ 阿柚'], '2026-11-27T03:00:00Z'), w('c', ['小红书助理 阿柚'], '2026-11-26T00:00:00Z'), w('d', ['阿柚子'], '2026-11-25T00:00:00Z'), w('e', ['小满'], '2026-11-27T05:00:00Z')]
  assert.deepEqual(worksFor(items, '阿柚').map((x) => x.id), ['b', 'a', 'c'], '“阿柚子”不是阿柚')
  assert.deepEqual(worksFor([w('x', ['小满'], '1'), w('y', ['满'], '2')], '满').map((x) => x.id), ['y'], '“小满”里的“满”不算')
  assert.deepEqual(worksFor(items, ''), [])
})
