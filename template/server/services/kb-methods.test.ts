// 方法文件按知识库自己的“方法选择表”找、全局搜索带上知识库（2026-10-27 修审计 #1 #2）。临时知识库里测。运行：npm test
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const area = mkdtempSync(join(tmpdir(), 'kb-methods-'))
const root = join(area, '知识库')
mkdirSync(root, { recursive: true })
process.env.WORKBENCH_ROOT = root
process.env.WORKBENCH_DB = join(area, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const { methodFiles, methodTable, cellsOf } = await import('./kb-methods.ts')
const { searchKb, isPrivateNote } = await import('./kb.ts')
const { search } = await import('./today.ts')
after(() => rmSync(area, { recursive: true, force: true }))

const put = (rel: string, body: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body) }
const head = (type: string, privacy = '内部') => `---\n类型: ${type}\n更新: 2026-10-25\n确认: 待确认\n隐私: ${privacy}\n来源: 99-原始材料/采访记录/2026-10-20-建库采访.md\n---\n\n`
beforeEach(() => { rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }) })

test('空知识库：三样都找不到，返回 null，不报错', () => {
  assert.deepEqual(methodFiles(), { rules: null, price: null, care: null })
})

test('按 05 README 的方法选择表找：报价那行的判断规则、指到产品与服务的标价表、关怀那行的做法', () => {
  put('05-方法与判断/README.md', `# 05\n\n## 方法选择表（先选事，再读方法）\n\n| 要做的事 | 先读 | 再看 |\n|---|---|---|\n| 客户问价、报价、接不接 | [报价/README.md](报价/README.md) | [判断规则](报价/判断规则.md) → [价目表](../03-生意/产品与服务/价目表.md) |\n| 客户生日、过节问候 | [回访与问候.md](回访与问候.md) | 04-客户 |\n| 写小红书 | [小红书/README.md](小红书/README.md) | — |\n`)
  put('05-方法与判断/报价/README.md', '# 报价')
  put('05-方法与判断/报价/判断规则.md', head('判断规则'))
  put('05-方法与判断/回访与问候.md', head('做法'))
  put('03-生意/产品与服务/价目表.md', head('产品'))
  assert.deepEqual(methodFiles(), { rules: '05-方法与判断/报价/判断规则.md', price: '03-生意/产品与服务/价目表.md', care: '05-方法与判断/回访与问候.md' })
})

test('Obsidian 双链也认；表里只点了文件夹 README，就找同一文件夹的 判断规则.md', () => {
  put('05-方法与判断/README.md', '## 方法选择表\n\n| 要做的事 | 先读 | 再看 |\n|---|---|---|\n| 接单和定价 | [[05-方法与判断/接单/README\\|接单]] | [[03-生意/产品与服务/套餐]] |\n')
  put('05-方法与判断/接单/README.md', '# 接单')
  put('05-方法与判断/接单/判断规则.md', head('判断规则'))
  put('03-生意/产品与服务/套餐.md', head('产品'))
  const f = methodFiles()
  assert.equal(f.rules, '05-方法与判断/接单/判断规则.md')
  assert.equal(f.price, '03-生意/产品与服务/套餐.md')
  assert.equal(f.care, null)
})

test('没有方法选择表：按文件夹、文件名认；产品与服务里只有一份就当标价表', () => {
  put('05-方法与判断/README.md', '# 05\n')
  put('05-方法与判断/报价与接单/判断规则.md', head('判断规则'))
  put('05-方法与判断/客户关怀.md', head('做法'))
  put('03-生意/产品与服务/README.md', '# 产品')
  put('03-生意/产品与服务/服务价目.md', head('产品'))
  assert.deepEqual(methodFiles(), { rules: '05-方法与判断/报价与接单/判断规则.md', price: '03-生意/产品与服务/服务价目.md', care: '05-方法与判断/客户关怀.md' })
})

test('就地建图：方法层按“目录对应”找到老板原来的文件夹；标“不读”的不用', () => {
  put('01-AI协作/建库档案.md', '# 建库档案\n\n## 目录对应\n| 层 | 实际位置 | 说明 |\n|---|---|---|\n| 05-方法与判断 | `我的做法` | 原来的文件夹 |\n| 原有·不读 | `我的做法/私人` | 老板说别看 |\n')
  put('我的做法/README-知识库.md', '## 方法选择表\n\n| 要做的事 | 先读 | 再看 |\n|---|---|---|\n| 报价 | [私人/判断规则.md](私人/判断规则.md) | [报价规矩.md](报价规矩.md) |\n')
  put('我的做法/私人/判断规则.md', '不该读到')
  put('我的做法/报价规矩.md', '规则')
  assert.equal(methodFiles().rules, '我的做法/报价规矩.md')
})

test('表格切格子不切 [[路径|名字]] 和转义的 \\|', () => {
  assert.deepEqual(cellsOf('| a | [[x/y\\|名]] | b \\| c |'), ['a', '[[x/y|名]]', 'b | c'])
  assert.deepEqual(methodTable('## 方法选择表\n| 要做的事 | 先读 | 再看 |\n|---|---|---|\n| 报价 | [r](sub/r.md) | — |\n## 别的\n| 报价 | [x](x.md) | |', '05'), [{ task: '报价', links: ['05/sub/r.md'] }])
})

test('知识库搜索：文件名和正文都找；工作台/、私密的笔记、不读的文件夹都不出现', () => {
  put('01-AI协作/建库档案.md', '# 建库档案\n\n## 目录对应\n| 层 | 实际位置 | 说明 |\n|---|---|---|\n| 原有·不读 | `日记` | 老板说别看 |\n')
  put('04-客户/云杉物流.md', `${head('客户')}# 云杉物流\n\n## 往来记录\n- 2026-10-20｜微信｜问了冷链报价\n`)
  put('03-生意/冷链服务.md', `${head('产品')}# 冷链服务\n`)
  put('02-关于我/边界.md', `${head('边界', '私密')}冷链的事别提\n`)
  put('日记/冷链.md', '冷链')
  put('工作台/快照/冷链.md', '冷链')
  const hits = searchKb('冷链', { skipPrivate: true })
  assert.deepEqual(hits.map((h) => h.path).sort(), ['03-生意/冷链服务.md', '04-客户/云杉物流.md'])
  assert.equal(hits[0].path, '03-生意/冷链服务.md', '文件名命中的排在前面')
  assert.match(hits.find((h) => h.path === '04-客户/云杉物流.md')!.line, /问了冷链报价/)
  // AI 助手照样能搜到私密笔记（私密是给 AI 理解老板用的），不读的照样搜不到
  assert.ok(searchKb('冷链').some((h) => h.path === '02-关于我/边界.md'))
  assert.ok(!searchKb('冷链').some((h) => h.path.startsWith('日记/')))
  // 开头字段里的词不算正文命中
  assert.ok(!searchKb('建库采访', { skipPrivate: true }).length)
})

test('全局搜索带上“知识库”一组，id 是文件路径', () => {
  put('06-项目/新店开业.md', `${head('项目')}# 新店开业\n关键日期写在这里\n`)
  const kb = search('新店').filter((h) => h.type === 'kb')
  assert.deepEqual(kb, [{ type: 'kb', id: '06-项目/新店开业.md', title: '新店开业', sub: '06-项目' }])
  assert.equal(search('关键日期').find((h) => h.type === 'kb')?.sub, '关键日期写在这里')
})

test('隐私：私密或不认识的值都按私密；内部、可公开、没写不算', () => {
  assert.equal(isPrivateNote('---\n隐私: 私密\n---\n'), true)
  assert.equal(isPrivateNote('---\n隐私: 保密\n---\n'), true)
  assert.equal(isPrivateNote('﻿---\r\n隐私: 内部\r\n---\r\n'), false)
  assert.equal(isPrivateNote('---\n隐私: 可公开\n---\n'), false)
  assert.equal(isPrivateNote('# 没有开头'), false)
})
