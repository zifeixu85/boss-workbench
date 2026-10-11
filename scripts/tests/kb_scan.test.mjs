// kb_scan 的回归测试。在仓库根目录运行：node --test "scripts/tests/kb_scan.test.mjs"
// 每个用例在临时文件夹里造一个小知识库，跑完删掉；示例老板知识库只读。
// 安装 Skill 时不带 tests/，这个文件夹不会装到用户电脑上。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scanKnowledgeBase } from '../kb_scan.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'kb_scan.mjs')
const SAMPLE_KB = process.env.KB_SAMPLE || join(HERE, '..', '..', '..', '..', '..', '2026-10-10-示例老板ABC茶社', '示例老板知识库')

const V2_MARK = '<!-- 老板知识库 v2｜本段由知识库 Skill 维护；我自己的补充写在最后 -->'
const AGENTS = `${V2_MARK}\n# 测试老板的知识库\n\n## 地图\n| 文件夹 | 装什么 | 什么时候读 |\n|---|---|---|\n<!-- 本段结束 -->\n`
const note = (fields, body = '正文。') => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body}\n`
const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
const SNAP_HEAD = ['名称', '类型', '分组', '阶段', '联系人', '上次联系', '下次跟进', '文件']

/** 建库档案：fm 是多出来的开头字段；map 是目录对应表的行 [层, 实际位置]；extra 是追加的正文 */
function archive({ fm = {}, map = [], extra = '' } = {}) {
  const mapTable = map.length ? `\n## 目录对应\n${table(['层', '实际位置', '说明'], map.map(([a, b]) => [a, b, '接入时登记']))}\n` : ''
  return note({ 类型: '建库档案', 格式: '老板知识库/2', 结构: map.length ? '就地建图' : '标准', 更新: '2026-10-20', 确认: '已确认', 隐私: '内部', 来源: '测试', ...fm }, `# 建库档案\n${mapTable}${extra}`)
}

/** 在临时文件夹里造一个知识库；用完删掉 */
function kb(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'kb-scan-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), text)
  }
  return root
}

const names = (list) => list.map((x) => x.名称).sort()

test('示例老板知识库：10 个客户、3 个项目，待办只来自近期要事，作品、收件箱数对得上', { skip: !existsSync(SAMPLE_KB) && '找不到示例老板知识库' }, async () => {
  const r = await scanKnowledgeBase(SAMPLE_KB)
  assert.equal(r.format, '老板知识库/2')
  assert.equal(r.structure, '标准')
  assert.equal(r.customers.length, 10)
  assert.equal(new Set(r.customers.map((c) => c.file)).size, 10)
  assert.equal(r.projects.length, 3)
  assert.deepEqual(r.todos.files, ['06-项目/近期要事.md'])
  assert.equal(r.todos.open, 10)
  assert.equal(r.todos.doing, 3)
  assert.equal(r.works.index, '11-内容与作品/作品索引.md')
  assert.equal(r.works.rows, 41)
  assert.equal(r.works.cards, 10)
  assert.equal(r.inbox.length, 3)
  assert.deepEqual(r.unrecognized_files, [])
  assert.deepEqual(r.creators, [])
  assert.equal(r.legacy_map, false)
  assert.ok(r.skipped.raw_files > 0, '99-原始材料 只计数')
  assert.match(r.entry_excerpt, /老板知识库 v2/)
  assert.match(r.entry_excerpt, /## 地图/)
})

test('就地建图：快照“文件”栏的各种链接都拆开，客户不重复；模板、99 层、只读文件夹里的东西不进清单', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '知识库说明.md': '---\n格式: 老板知识库/1\n---\n旧地图\n',
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料/'], ['原有·只读', '私人/']] }),
    '06-项目/近期要事.md': note({ 类型: '待办' }, '- [ ] 给张总发方案 · 截止 2026-10-30\n- [/] 李姐报价 · 截止 2026-10-29\n- [x] 已经做完的'),
    '99-原始材料/待办导出.md': '- [ ] 旧导出里的待办\n',
    '客户资料/README-知识库.md': `# 客户资料｜这一层的说明\n\n## 建库快照\n${table(SNAP_HEAD, [
      ['张总', '客户', '企业', '谈判中', '张三', '2026-10-01', '2026-10-30', '[[张总]]'],
      ['李姐', '客户', '企业', '报价中', '李四', '2026-10-02', '2026-10-29', '[李姐](李姐.md)'],
      ['王总', '客户', '企业', '线索', '王五', '未知', '未定', '[[王总\\|老王]]'],
      ['赵姐', '客户', '门店', '老客', '赵六', '未知', '未定', '[赵姐](<../客户资料/赵 姐.md>)'],
      ['钱总', '客户', '企业', '线索', '钱七', '未知', '未定', '[钱总](%E9%92%B1%E6%80%BB.md)'],
      ['孙老板', '客户', '企业', '线索', '孙八', '未知', '未定', '<孙老板.md>'],
      ['训练营学员', '客户分组', '学员', '', '', '', '', '[学员](学员.md)'],
    ])}\n`,
    '客户资料/张总.md': '张总的笔记\n',
    '客户资料/李姐.md': '李姐\n',
    '客户资料/王总.md': '王总\n',
    '客户资料/赵 姐.md': '赵姐\n',
    '客户资料/钱总.md': '钱总\n',
    '客户资料/孙老板.md': '孙老板\n',
    '客户资料/学员.md': '学员名单\n',
    '客户资料/报价单模板.md': '报价模板\n',
    '客户资料/张总-往来记录.md': note({ 类型: '往来记录', 名称: '张总' }),
    '模板/客户模板.md': note({ 类型: '客户', 名称: '{{title}}' }),
    '私人/家庭待办.md': '- [ ] 带孩子打疫苗\n- [ ] 体检复查\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(names(r.customers), ['孙老板', '张总', '李姐', '王总', '赵姐', '钱总'].sort())
  assert.deepEqual(r.customers.map((c) => c.file).sort(), ['客户资料/孙老板.md', '客户资料/张总.md', '客户资料/李姐.md', '客户资料/王总.md', '客户资料/赵 姐.md', '客户资料/钱总.md'].sort())
  assert.ok(r.customers.every((c) => !c.找不到文件 && c.来源 === '客户资料/README-知识库.md 的建库快照'))
  assert.deepEqual(r.unrecognized_files, ['客户资料/报价单模板.md'])
  assert.deepEqual(r.todos.files, ['06-项目/近期要事.md'])
  assert.equal(r.todos.open, 1)
  assert.equal(r.todos.doing, 1)
  assert.deepEqual(r.readonly_folders, ['私人'])
  assert.deepEqual(r.skipped, { readonly_files: 1, raw_files: 1, template_files: 1, noread_folders: 0 })
  assert.equal(r.by_type['客户'], undefined, '模板不算客户')
  const out = JSON.stringify(r)
  for (const word of ['{{title}}', '带孩子打疫苗', '体检复查', '旧导出里的待办']) assert.ok(!out.includes(word), `输出里不该有：${word}`)
  // 格式是 /2：根目录残留的 知识库说明.md 不读
  assert.equal(r.legacy_map, false)
  assert.equal(r.legacy_ignored, true)
  assert.ok(!('知识库说明.md' in r.profile_files))
})

test('建库快照按表头取列：换了列序、多了别名和备注列都不错位；达人单列', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料']] }),
    '客户资料/README.md': `# 我自己的客户说明\n\n## 建库快照\n${table(['文件', '名称', '别名', '阶段', '类型', '分组', '联系人', '下次跟进', '上次联系', '备注'], [
      ['[[张总]]', '张总', '老张、张哥', '谈判中', '客户', '企业', '张三', '2026-10-30', '2026-10-01', '爱喝岩茶'],
      ['[[小美]]', '小美', '美美', '合作中', '达人', '美妆', '', '', '', ''],
    ])}\n`,
    '客户资料/张总.md': '张总\n',
    '客户资料/小美.md': '小美\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.equal(r.customers.length, 1)
  const c = r.customers[0]
  assert.equal(c.file, '客户资料/张总.md')
  assert.equal(c.阶段, '谈判中')
  assert.equal(c.上次联系, '2026-10-01')
  assert.equal(c.下次跟进, '2026-10-30')
  assert.deepEqual(c.别名, ['老张', '张哥'])
  assert.deepEqual(r.creators.map((x) => [x.名称, x.file, x.别名]), [['小美', '客户资料/小美.md', ['美美']]])
  assert.deepEqual(r.unrecognized_files, [])
})

test('“原有·不读”的文件夹：不进去、不计数，里面的文件名一个都不出现在输出里', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料/'], ['原有·不读', '家庭/'], ['原有·只读', '笔记/']] }),
    '客户资料/README-知识库.md': `## 建库快照\n${table(SNAP_HEAD, [
      ['张总', '客户', '企业', '谈判中', '张三', '未知', '未定', '[张总](张总.md)'],
      ['误登记', '客户', '', '', '', '', '', '[误登记](../家庭/离婚协议草稿.md)'],
    ])}\n`,
    '客户资料/张总.md': '张总\n',
    '家庭/离婚协议草稿.md': note({ 类型: '客户', 名称: '前夫' }, '- [ ] 签字'),
    '家庭/孩子/体检报告.md': '体检\n',
    '笔记/随手记.md': '- [ ] 随手记的事\n',
    '06-项目/近期要事.md': note({ 类型: '待办' }, '- [ ] 给张总发方案'),
  })
  const r = await scanKnowledgeBase(root)
  const out = JSON.stringify(r)
  for (const word of ['离婚协议草稿', '体检报告', '前夫', '孩子', '签字', '随手记的事']) assert.ok(!out.includes(word), `输出里不该有：${word}`)
  assert.deepEqual(r.noread_folders, ['家庭'])
  assert.deepEqual(r.readonly_folders, ['笔记'])
  assert.equal(r.skipped.noread_folders, 1)
  assert.equal(r.skipped.readonly_files, 1)
  assert.ok(!r.layers.some((l) => l.name === '家庭'))
  assert.equal(r.files, 6) // AGENTS、建库档案、客户层说明、张总、随手记、近期要事
  assert.equal(r.customers.find((c) => c.名称 === '误登记').file, '')
  assert.equal(r.todos.open, 1)
})

test('标准结构：达人单列，客户和老板都读别名；客户层里没写类型的文件列进 unrecognized_files', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive(),
    '02-关于我/基本情况.md': note({ 类型: '关于我' }, '# 基本情况\n\n- 怎么称呼：林总\n- 别的叫法：林总、老林（员工这么叫）'),
    '04-客户/张总.md': '---\n类型: 客户\n名称: 张总\n别名:\n  - 老张\n  - 张哥\n确认: 待确认\n---\n\n正文\n',
    '04-客户/品牌方甲.md': note({ 类型: '品牌方', 名称: '甲品牌', aliases: '[甲方, 甲]' }),
    '04-客户/随手记.md': '没写开头的随手记\n',
    '04-客户/李姐.md': '---\n类型: 客户\n名称: 李姐\n别名:\n- 李老师\n---\n',
    '12-达人库/小A.md': note({ 类型: '达人', 名称: '小A', 编号: 'DR-01', 赛道: '美妆', 合作方式: '独家', 合约到期: '2027-03-31', 经纪人: '阿花', 状态: '合作中', 别名: '阿A、A姐', 确认: '待确认' }),
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(names(r.customers), ['张总', '李姐', '甲品牌'].sort())
  assert.deepEqual(r.customers.find((c) => c.名称 === '李姐').别名, ['李老师'])
  assert.deepEqual(r.customers.find((c) => c.名称 === '张总').别名, ['老张', '张哥'])
  assert.deepEqual(r.customers.find((c) => c.名称 === '甲品牌').别名, ['甲方', '甲'])
  assert.equal(r.creators.length, 1)
  const { file, 名称, 编号, 赛道, 合作方式, 合约到期, 经纪人, 状态, 别名 } = r.creators[0]
  assert.deepEqual({ file, 名称, 编号, 赛道, 合作方式, 合约到期, 经纪人, 状态, 别名 }, { file: '12-达人库/小A.md', 名称: '小A', 编号: 'DR-01', 赛道: '美妆', 合作方式: '独家', 合约到期: '2027-03-31', 经纪人: '阿花', 状态: '合作中', 别名: ['阿A', 'A姐'] })
  assert.deepEqual(r.owner_aliases, ['林总', '老林'])
  assert.deepEqual(r.unrecognized_files, ['04-客户/随手记.md'])
  assert.deepEqual(r.growth_modules, ['12-达人库'])
})

test('同一件事写在好几处：待办只从近期要事算一次', async (t) => {
  const same = '- [ ] 给张总发方案 · 截止 2026-10-30'
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive(),
    '06-项目/近期要事.md': note({ 类型: '待办' }, `## 本周\n${same}`),
    '06-项目/张总项目.md': note({ 类型: '项目', 名称: '张总项目', 状态: '进行中' }, `## 下一步\n${same}`),
    '04-客户/张总.md': note({ 类型: '客户', 名称: '张总' }, `## 答应过的事\n${same}`),
    '03-生意/待办.md': note({ 类型: '待办' }, same),
    '90-持续生长/我的待办清单.md': same,
    '99-原始材料/待办导出.md': same,
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(r.todos.files, ['06-项目/近期要事.md'])
  assert.equal(r.todos.open, 1)
  assert.deepEqual(r.todos.samples, [same])
  assert.equal(r.projects.length, 1)
  assert.equal(r.customers.length, 1)
})

test('格式是 /2、根目录残留旧版 知识库说明.md：旧格式的必读文件和待办都不读', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '知识库说明.md': '---\n格式: 老板知识库/1\n---\n# 知识库说明\n',
    '01-AI协作/建库档案.md': archive(),
    '06-项目/近期要事.md': note({ 类型: '待办' }, '- [ ] 新库的待办'),
    '生意/近期要事.md': '- [ ] 旧库的待办\n',
    '关于我/基本情况.md': '旧的基本情况\n',
    '原始材料/2026-10-01-聊天.md': '旧的聊天\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.equal(r.format, '老板知识库/2')
  assert.equal(r.entry, 'AGENTS.md')
  assert.equal(r.legacy_map, false)
  assert.equal(r.legacy_ignored, true)
  for (const k of ['知识库说明.md', '生意/近期要事.md', '关于我/基本情况.md']) assert.ok(!(k in r.profile_files), `不该读：${k}`)
  assert.deepEqual(r.todos.files, ['06-项目/近期要事.md'])
  assert.deepEqual(r.inbox, [])
})

test('旧格式（老板知识库/1）照样能读：地图、待办、原始材料当收件箱', async (t) => {
  const root = kb(t, {
    '知识库说明.md': '---\n格式: 老板知识库/1\n---\n# 知识库说明\n',
    '生意/近期要事.md': '- [ ] 旧库待办\n- [/] 进行中的事\n',
    '生意/客户/王总.md': note({ 类型: '客户', 名称: '王总' }),
    '原始材料/2026-10-01-聊天.md': '聊天\n',
    '原始材料/采访记录/采访.md': note({ 类型: '客户', 名称: '采访里提到的人' }),
  })
  const r = await scanKnowledgeBase(root)
  assert.equal(r.format, '老板知识库/1')
  assert.equal(r.entry, '知识库说明.md')
  assert.equal(r.legacy_map, true)
  assert.equal(r.legacy_ignored, false)
  assert.ok('知识库说明.md' in r.profile_files)
  assert.deepEqual(r.todos.files, ['生意/近期要事.md'])
  assert.equal(r.todos.open, 1)
  assert.equal(r.todos.doing, 1)
  assert.deepEqual(names(r.customers), ['王总'])
  assert.deepEqual(r.inbox, ['原始材料/2026-10-01-聊天.md'])
})

test('建库档案写着 示例: 是 时输出 sample: true，没写是 false', async (t) => {
  const yes = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive({ fm: { 示例: '是' } }) })
  const no = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive() })
  assert.equal((await scanKnowledgeBase(yes)).sample, true)
  assert.equal((await scanKnowledgeBase(no)).sample, false)
})

test('Windows 换行和 BOM：建库档案、快照、开头元信息、待办都照样认', async (t) => {
  const win = (s) => `﻿${s.replace(/\r?\n/g, '\r\n')}`
  const root = kb(t, {
    'AGENTS.md': win(AGENTS),
    '01-AI协作/建库档案.md': win(archive({ map: [['04-客户', '客户资料/'], ['原有·只读', '私人/']], fm: { 示例: '是' } })),
    '客户资料/README-知识库.md': win(`## 建库快照\n${table(SNAP_HEAD, [['张总', '客户', '企业', '谈判中', '张三', '2026-10-01', '2026-10-30', '[[张总]]']])}\n`),
    '客户资料/张总.md': win('张总\n'),
    '04-客户/新客户.md': win(note({ 类型: '客户', 名称: '新客户', 阶段: '线索' })),
    '06-项目/近期要事.md': win(note({ 类型: '待办' }, '- [ ] 一\n- [/] 二')),
    '私人/家庭待办.md': win('- [ ] 带孩子打疫苗\n'),
  })
  const r = await scanKnowledgeBase(root)
  assert.equal(r.format, '老板知识库/2')
  assert.equal(r.structure, '就地建图')
  assert.equal(r.sample, true)
  assert.deepEqual(r.readonly_folders, ['私人'])
  assert.deepEqual(names(r.customers), ['张总', '新客户'].sort())
  assert.equal(r.customers.find((c) => c.名称 === '新客户').阶段, '线索')
  assert.equal(r.todos.open, 1)
  assert.equal(r.todos.doing, 1)
  assert.ok(!JSON.stringify(r).includes('疫苗'))
})

test('AGENTS.md：老板原有规矩很长、标记段追加在末尾时，摘要截的是标记段', async (t) => {
  const own = Array.from({ length: 80 }, (_, i) => `- 老板原来的第 ${i + 1} 条规矩`).join('\n')
  const tail = kb(t, { 'AGENTS.md': `# 我的规矩\n${own}\n\n${AGENTS.replace('# 测试', '## 测试')}\n## 我加的规矩\n` })
  const r = await scanKnowledgeBase(tail)
  assert.ok(r.entry_excerpt.startsWith(V2_MARK))
  assert.match(r.entry_excerpt, /## 地图/)
  assert.ok(!r.entry_excerpt.includes('老板原来的第 1 条规矩'))
  assert.equal(r.format, '老板知识库/2', '没有建库档案时，靠标记认出 v2')
  const top = kb(t, { 'AGENTS.md': `# 林总的知识库\n\n> 示例数据\n\n${AGENTS}` })
  assert.match((await scanKnowledgeBase(top)).entry_excerpt, /^# 林总的知识库/)
})

test('模板：Obsidian 设置的模板文件夹、_templates/、文件名或开头元信息里带 {{ 或 <% 的都不算', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive(),
    '.obsidian/templates.json': JSON.stringify({ folder: '我的模版' }),
    '我的模版/客户.md': note({ 类型: '客户', 名称: '张三' }),
    '04-客户/{{date}}-新客户.md': note({ 类型: '客户', 名称: '新客户' }),
    '04-客户/草稿.md': note({ 类型: '客户', 名称: '<% tp.file.title %>' }),
    '04-客户/_templates/空白客户.md': note({ 类型: '客户', 名称: '空白' }),
    '04-客户/真客户.md': note({ 类型: '客户', 名称: '真客户' }),
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(names(r.customers), ['真客户'])
  assert.equal(r.skipped.template_files, 4)
})

test('就地建图、客户层说明里还没有建库快照：才按文件名猜，标“需确认”；像模板的名字不猜', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料']] }),
    '客户资料/README-知识库.md': `## 建库快照\n${table(SNAP_HEAD, [['（待填）', '', '', '', '', '', '', '']])}\n`,
    '客户资料/张总.md': '张总\n',
    '客户资料/合同模板.md': '合同\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(r.customers.map((c) => [c.名称, c.file, c.确认]), [['张总', '客户资料/张总.md', '需确认']])
  assert.deepEqual(r.unrecognized_files, ['客户资料/合同模板.md'])
})

test('就地建图的项目层：按说明索引里“类型”是项目的行认项目，其余列进没认出来的文件', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['06-项目', '项目']] }),
    '项目/README-知识库.md': `## 索引\n${table(['名称', '类型', '分组', '一句话', '文件'], [
      ['春节预售', '项目', '', '春节礼盒', '[春节预售.md](春节预售.md)'],
      ['报价单', '产品', '', '', '[报价单.md](报价单.md)'],
    ])}\n`,
    '项目/春节预售.md': '春节\n',
    '项目/报价单.md': '报价\n',
    '项目/杂记.md': '杂记\n',
    '项目/近期要事.md': note({ 类型: '待办' }, '- [ ] 定包装'),
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(r.projects.map((p) => [p.名称, p.file]), [['春节预售', '项目/春节预售.md']])
  assert.deepEqual(r.unrecognized_files, ['项目/杂记.md'])
  assert.deepEqual(r.todos.files, ['项目/近期要事.md'])
})

test('建库快照：同名的两位各算一个；一份 CSV 里的几位都认；格子只写名字、路径带括号也找得到；达人带上合作方式、经纪人', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料/']] }),
    '客户资料/README-知识库.md': `## 建库快照\n${table([...SNAP_HEAD, '合作方式', '经纪人'], [
      ['张总', '客户', 'A公司', '', '', '未知', '未定', 'A公司/张总.md', '', ''],
      ['张总', '客户', 'B公司', '', '', '未知', '未定', '[[B公司/张总]]', '', ''],
      ['李姐', '客户', '', '', '', '未知', '未定', '李姐', '', ''],
      ['王总', '客户', '', '', '', '未知', '未定', '[王总](王总(老客).md)', '', ''],
      ['钱总', '客户', '', '', '', '未知', '未定', '[客户表.csv](客户表.csv) 钱总那一行', '', ''],
      ['孙总', '客户', '', '', '', '未知', '未定', '[客户表.csv](客户表.csv) 孙总那一行', '', ''],
      ['小美', '达人', '', '', '', '', '', '[[小美]]', '独家', '阿花'],
    ])}\n`,
    '客户资料/A公司/张总.md': 'A 公司的张总\n',
    '客户资料/B公司/张总.md': 'B 公司的张总\n',
    '客户资料/李姐.md': '李姐\n',
    '客户资料/王总(老客).md': '王总\n',
    '客户资料/客户表.csv': '名称,阶段\n钱总,线索\n孙总,线索\n',
    '客户资料/小美.md': '小美\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(r.customers.map((c) => [c.名称, c.file]), [
    ['张总', '客户资料/A公司/张总.md'], ['张总', '客户资料/B公司/张总.md'], ['李姐', '客户资料/李姐.md'],
    ['王总', '客户资料/王总(老客).md'], ['钱总', '客户资料/客户表.csv'], ['孙总', '客户资料/客户表.csv'],
  ])
  assert.ok(r.customers.every((c) => !c.找不到文件))
  const { 合作方式, 经纪人 } = r.creators[0]
  assert.deepEqual({ 合作方式, 经纪人 }, { 合作方式: '独家', 经纪人: '阿花' })
  assert.deepEqual(r.unrecognized_files, [])
})

test('就地建图、建库快照还没填：索引里登记成客户的照样认，不落成“没认出来的文件”', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料']] }),
    '客户资料/README.md': `# 客户资料｜这一层的说明\n\n## 索引\n${table(['名称', '类型', '分组', '一句话', '文件'], [
      ['张总', '客户', '企业', '老客户', '[张总.md](张总.md)'],
      ['报价单', '产品', '', '', '[报价单.md](报价单.md)'],
    ])}\n\n## 建库快照\n${table(SNAP_HEAD, [['（待填）', '', '', '', '', '', '', '']])}\n`,
    '客户资料/张总.md': '张总\n',
    '客户资料/报价单.md': '报价\n',
    '客户资料/李姐.md': '李姐\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(r.customers.map((c) => [c.名称, c.file, c.确认]), [['张总', '客户资料/张总.md', undefined], ['李姐', '客户资料/李姐.md', '需确认']])
  assert.match(r.customers[0].来源, /索引/)
  assert.deepEqual(r.unrecognized_files, [])
})

test('只读、不读、模板文件夹名不分大小写：表里写 Private/、实际是 private/ 也不读进来；标签写成“不读”“原有-不读”也认', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['原有·不读', 'Private/'], ['原有·只读', 'Notes/'], ['不读', '家里/'], ['原有-不读', '体检/']] }),
    'private/日记.md': note({ 类型: '客户', 名称: '不该出现的人' }, '- [ ] 不该出现的事'),
    '家里/账本.md': note({ 类型: '客户', 名称: '不该出现的人' }),
    '体检/报告.md': note({ 类型: '客户', 名称: '不该出现的人' }),
    'notes/随手记.md': note({ 类型: '客户', 名称: '随手记里的人' }),
    '_Templates/客户.md': note({ 类型: '客户', 名称: '模板客户' }),
    '04-客户/真客户.md': note({ 类型: '客户', 名称: '真客户' }),
  })
  const r = await scanKnowledgeBase(root)
  const out = JSON.stringify(r)
  for (const word of ['日记', '不该出现', '账本', '报告']) assert.ok(!out.includes(word), `输出里不该有：${word}`)
  assert.deepEqual(r.noread_folders, ['Private', '家里', '体检'])
  assert.deepEqual(r.layer_map, {})
  assert.deepEqual(names(r.customers), ['真客户'])
  assert.equal(r.skipped.readonly_files, 1)
  assert.equal(r.skipped.template_files, 1)
})

test('从旧版升级上来的库：06 层没有近期要事，就读 06 层说明索引里登记的那一份待办（只读一份）', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '知识库说明.md': '---\n格式: 老板知识库/1\n---\n已升级，见 AGENTS.md\n',
    '01-AI协作/建库档案.md': archive({ map: [['02-关于我', '关于我'], ['03-生意', '生意'], ['04-客户', '生意/客户']] }),
    '06-项目/README.md': `# 06-项目｜这一层的说明\n\n## 索引\n${table(['名称', '类型', '分组', '一句话', '文件'], [['近期要事', '待办', '', '旧版的近期要事', '[近期要事](../生意/近期要事.md)']])}\n`,
    '生意/近期要事.md': '- [ ] 旧库待办\n- [/] 进行中的事\n',
    '生意/客户/README-知识库.md': `## 建库快照\n${table(SNAP_HEAD, [['王总', '客户', '', '', '', '未知', '未定', '[王总](王总.md)']])}\n`,
    '生意/客户/王总.md': '王总\n',
    '生意/待办清单.md': '- [ ] 别的待办\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.equal(r.legacy_ignored, true)
  assert.deepEqual(r.todos.files, ['生意/近期要事.md'])
  assert.equal(r.todos.open, 1)
  assert.equal(r.todos.doing, 1)
  assert.deepEqual(names(r.customers), ['王总'])
})

test('建库档案里的占位行（还没有、待填）不当成模块', async (t) => {
  const extra = `\n## 启用的模块\n${table(['模块', '路径', '为什么启用', '证据'], [['（还没有）', '', '', ''], ['作品库', '（计划）', '靠内容获客', '第 9 题'], ['渠道与经营', '10-渠道与经营/', '多平台', '第 2 题']])}\n`
  const root = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive({ extra }) })
  const r = await scanKnowledgeBase(root)
  assert.deepEqual(r.enabled_modules.map((m) => [m.模块, m.路径]), [['渠道与经营', '10-渠道与经营']])
  assert.deepEqual(r.planned_modules.map((m) => m.模块), ['作品库'])
})

test('命令行：找不到文件夹退出 1；--max 截断时 truncated 为 true', async (t) => {
  const bad = spawnSync(process.execPath, [SCRIPT, join(tmpdir(), '没有这个文件夹-kb-scan')], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /找不到这个文件夹/)
  const root = kb(t, { 'AGENTS.md': AGENTS, 'a/1.md': '1', 'b/2.md': '2', 'c/3.md': '3' })
  const ok = spawnSync(process.execPath, [SCRIPT, root, '--max', '2'], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)
  const r = JSON.parse(ok.stdout)
  assert.equal(r.files, 2)
  assert.equal(r.truncated, true)
  const badMax = spawnSync(process.execPath, [SCRIPT, root, '--max', '0'], { encoding: 'utf8' })
  assert.equal(badMax.status, 1)
})

// ───── 2026-10-11 合并后补的：体检报告、没闭合的 [[、同名文件、编辑器、没有知识库 ─────

test('维护报告（90 层实际位置下的 体检/）不算待确认，也不当没整理的材料、没登记的文件或客户', async (t) => {
  const report = (date) => note({ 类型: '体检报告', 更新: date, 确认: '待确认', 隐私: '内部', 来源: '01-AI协作/建库档案.md' }, '# 维护报告')
  const std = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive(),
    '04-客户/张总.md': note({ 类型: '客户', 名称: '张总', 确认: '待确认' }),
    '90-持续生长/体检/2026-10-20-维护报告.md': report('2026-10-20'),
    '90-持续生长/体检/2026-10-27-维护报告.md': report('2026-10-27'),
    '体检/我的体检.md': note({ 类型: '关于我', 确认: '待确认' }), // 不是 90 层下的 体检/：照常算
  })
  const r = await scanKnowledgeBase(std)
  assert.equal(r.unconfirmed, 2, '张总、我的体检各算一份；两份维护报告不算')
  assert.equal(r.by_type['体检报告'], 2)
  // 就地建图：90 层换了位置，还放在客户层、收件箱里面
  const mapped = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料'], ['00-收件箱', '杂物'], ['90-持续生长', '客户资料/成长']] }),
    '客户资料/README-知识库.md': `## 建库快照\n${table(SNAP_HEAD, [['（待填）', '', '', '', '', '', '', '']])}\n`,
    '客户资料/张总.md': '张总\n',
    '客户资料/成长/体检/2026-10-20-维护报告.md': report('2026-10-20'),
    '客户资料/成长/体检/手写的体检笔记.md': '没写开头的笔记\n',
    '杂物/新材料.md': '新材料\n',
  })
  const m = await scanKnowledgeBase(mapped)
  assert.equal(m.unconfirmed, 0)
  assert.deepEqual(m.inbox, ['杂物/新材料.md'])
  assert.deepEqual(m.customers.map((c) => c.名称), ['张总'], '体检/ 里的文件不按文件名猜成客户')
  assert.deepEqual(m.unrecognized_files, [])
})

test('表格切列：没闭合的 [[ 不吞掉后面的竖线；有 ]] 才把 [[…]] 当一个整体；\\| 照旧当转义', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料']] }),
    '客户资料/README-知识库.md': `## 建库快照\n${table(SNAP_HEAD, [
      ['张总', '客户', '企业', '谈判中', '[[张三', '2026-10-01', '2026-10-30', '[[张总]]'],
      ['李姐', '客户', 'A\\|B 组', '报价中', '李四', '2026-10-02', '2026-10-29', '[[李姐\\|李老师]]'],
    ])}\n`,
    '客户资料/张总.md': '张总\n',
    '客户资料/李姐.md': '李姐\n',
  })
  const r = await scanKnowledgeBase(root)
  const z = r.customers.find((c) => c.名称 === '张总')
  assert.equal(z.联系人, '[[张三')
  assert.equal(z.上次联系, '2026-10-01')
  assert.equal(z.下次跟进, '2026-10-30')
  assert.equal(z.file, '客户资料/张总.md')
  const l = r.customers.find((c) => c.名称 === '李姐')
  assert.equal(l.分组, 'A|B 组')
  assert.equal(l.file, '客户资料/李姐.md')
  assert.deepEqual(r.unrecognized_files, [])
})

test('双链只写文件名、全库有几份同名：不悄悄取第一个，warnings 里写清是哪几份、这次按哪份认；“不读”文件夹里的不算也不露名', async (t) => {
  const root = kb(t, {
    'AGENTS.md': AGENTS,
    '01-AI协作/建库档案.md': archive({ map: [['04-客户', '客户资料'], ['原有·不读', '家庭']] }),
    '客户资料/README-知识库.md': `## 建库快照\n${table(SNAP_HEAD, [
      ['张总', '客户', '', '', '', '未知', '未定', '[[张总]]'],
      ['李姐', '客户', '', '', '', '未知', '未定', '[[李姐]]'],
      ['王总', '客户', '', '', '', '未知', '未定', '[[王总]]'],
    ])}\n`,
    '客户资料/A公司/张总.md': 'A 公司的张总\n',
    '客户资料/B公司/张总.md': 'B 公司的张总\n',
    '客户资料/李姐.md': '李姐\n',
    '归档/李姐.md': '旧的李姐\n',
    '客户资料/王总.md': '王总\n',
    '家庭/王总.md': '家里的王总\n',
  })
  const r = await scanKnowledgeBase(root)
  assert.ok(Array.isArray(r.warnings))
  const dup = (name) => r.warnings.find((w) => w.kind === '同名文件' && w.link === `[[${name}]]`)
  assert.deepEqual(dup('张总').files, ['客户资料/A公司/张总.md', '客户资料/B公司/张总.md'])
  assert.equal(dup('张总').picked, r.customers.find((c) => c.名称 === '张总').file)
  assert.match(dup('张总').message, /客户资料\/A公司\/张总\.md/)
  assert.match(dup('张总').message, /客户资料\/B公司\/张总\.md/)
  assert.equal(dup('张总').source, '客户资料/README-知识库.md')
  assert.deepEqual(dup('李姐').files, ['客户资料/李姐.md', '归档/李姐.md'].sort())
  assert.equal(dup('李姐').picked, '客户资料/李姐.md', '同一个文件夹里有的，按同文件夹那份认')
  assert.equal(dup('王总'), undefined, '“不读”文件夹里的同名文件不算')
  assert.equal(r.warnings.filter((w) => w.link === '[[张总]]').length, 1, '同一条提醒不重复')
  assert.ok(!JSON.stringify(r).includes('家庭/王总'))
})

test('建库档案写着 编辑器: Obsidian 时 editor 是 obsidian，没写是 plain；旧格式也是 plain', async (t) => {
  const obs = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive({ fm: { 编辑器: 'Obsidian' } }) })
  const lower = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive({ fm: { 编辑器: 'obsidian' } }) })
  const plain = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive() })
  const legacy = kb(t, { '知识库说明.md': '---\n格式: 老板知识库/1\n---\n# 知识库说明\n' })
  assert.equal((await scanKnowledgeBase(obs)).editor, 'obsidian')
  assert.equal((await scanKnowledgeBase(lower)).editor, 'obsidian')
  assert.equal((await scanKnowledgeBase(plain)).editor, 'plain')
  assert.equal((await scanKnowledgeBase(legacy)).editor, 'plain')
})

test('空文件夹、不是知识库的文件夹：退出 0，输出 kb: false 和原因，不猜客户；是知识库时 kb: true', async (t) => {
  const empty = kb(t, {})
  const run = (dir) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  const e = run(empty)
  assert.equal(e.status, 0, e.stderr)
  const er = JSON.parse(e.stdout)
  assert.equal(er.kb, false)
  assert.equal(er.empty, true)
  assert.ok(er.reason && typeof er.reason === 'string')
  assert.equal(er.customers, undefined)
  const notes = kb(t, {
    'README.md': '# 我的笔记\n',
    'AGENTS.md': '# 代码仓的规矩\n',
    '.obsidian/app.json': '{}',
    '客户/张总.md': note({ 类型: '客户', 名称: '张总' }),
  })
  const n = await scanKnowledgeBase(notes)
  assert.equal(n.kb, false)
  assert.equal(n.empty, false)
  assert.equal(n.obsidian_vault, true)
  assert.match(n.reason, /建库档案/)
  assert.equal(n.customers, undefined, '不是知识库时不猜客户')
  const real = kb(t, { 'AGENTS.md': AGENTS, '01-AI协作/建库档案.md': archive() })
  assert.equal((await scanKnowledgeBase(real)).kb, true)
})

test('注释和提示里不再提 boss-kb-access（已并进 boss-kb）', () => {
  assert.ok(!readFileSync(SCRIPT, 'utf8').includes('boss-kb-access'))
})
