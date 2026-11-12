// 新材料提取和关怀不再写死示例库的文件和项目（2026-10-27 修审计 #1）：知识库里没有报价规则、标价表、关怀做法时跳过核对、不报错；
// 有的话按方法选择表找到的那份核对；停业区间从任意项目的里程碑认，不认“门店改造”这个名字。临时数据库和临时知识库里测。运行：npm test
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const area = mkdtempSync(join(tmpdir(), 'crm-kb-'))
const root = join(area, '知识库')
mkdirSync(root, { recursive: true })
process.env.WORKBENCH_ROOT = root
process.env.WORKBENCH_DB = join(area, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const { checkPromises, catalog, priceRule } = await import('./rules.ts')
const { buildPrompt } = await import('./extract.ts')
const { careRules } = await import('./care.ts')
const { storeClosure } = await import('./closure.ts')
const projects = await import('../../services/projects.ts')
after(() => rmSync(area, { recursive: true, force: true }))

const put = (rel: string, body: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body) }
const promise = [{ text: '每份做到 150', quote: '我：那就每份做到 150' }]

test('知识库里还没有报价规则和标价表：不核对、不报错，提示词如实写“还没有”', () => {
  assert.deepEqual(catalog(), [])
  assert.equal(priceRule(), null)
  assert.deepEqual(checkPromises(promise, '基础套餐每份 150', true), [null])
  const p = buildPrompt('客户问基础套餐能不能每份 150', '粘贴的文字', null)
  assert.match(p, /知识库里还没有报价规则/)
  assert.match(p, /知识库里还没有标价表/)
  assert.doesNotMatch(p, /企业茶礼|礼盒|门店改造/)
})

test('关怀做法也没有：found 为 false、file 为 null', () => {
  const r = careRules()
  assert.equal(r.found, false)
  assert.equal(r.file, null)
})

test('有方法选择表：按它找到的规则和标价表核对，写明是哪条规则', () => {
  put('05-方法与判断/README.md', '## 方法选择表\n\n| 要做的事 | 先读 | 再看 |\n|---|---|---|\n| 报价、接单 | [判断规则](报价/判断规则.md) | [价目](../03-生意/产品与服务/价目表.md) |\n| 生日和节日问候 | [问候.md](问候.md) | — |\n')
  put('05-方法与判断/报价/判断规则.md', '---\n类型: 判断规则\n确认: 待确认\n---\n\n## 规则 3｜新客户不让单价，改送安装\n\n- 状态：待确认\n')
  put('03-生意/产品与服务/价目表.md', '---\n类型: 产品\n---\n\n## 套餐\n\n| 名称 | 说明 | 每份（元） |\n|---|---|---|\n| 基础套餐 | 上门一次 | 180 |\n| 全年维护 | 每月一次 | 1200 |\n\n## 来源\n- 采访\n')
  put('05-方法与判断/问候.md', '---\n确认: 已确认\n---\n\n## 我的几条\n\n- “过节只问候，不推销。”\n\n## 别这样做\n\n- 群发\n')
  assert.deepEqual(catalog().map((x) => [x.name, x.price]), [['基础套餐', 180], ['全年维护', 1200]])
  assert.deepEqual(priceRule(), { id: '规则 3', text: '新客户不让单价，改送安装', pending: true })
  const [c] = checkPromises(promise, '基础套餐能不能便宜点', true)
  assert.ok(c)
  assert.equal(c.rule, '规则 3｜新客户不让单价，改送安装（待确认）')
  assert.equal(c.rule_file, '05-方法与判断/报价/判断规则.md')
  assert.match(c.why, /基础套餐标价 180 元/)
  assert.deepEqual(checkPromises(promise, '基础套餐', false), [null], '老客户可能有约定价，不核对')
  const p = buildPrompt('客户问基础套餐能不能每份 150', '粘贴的文字', null)
  assert.match(p, /## 判断规则（05-方法与判断\/报价\/判断规则.md）/)
  assert.match(p, /基础套餐/)
  assert.doesNotMatch(p, /来源\n- 采访/)
  const r = careRules()
  assert.equal(r.file, '05-方法与判断/问候.md')
  assert.deepEqual(r.rules, ['过节只问候，不推销'])
  assert.deepEqual(r.donts, ['群发'])
})

test('停业区间从任意项目的里程碑认：不看项目名；“通知…停业”不算停业那天', () => {
  assert.equal(storeClosure('2030-01-01'), null)
  const p = projects.createProject({ name: '搬新址', stage: '进行中' }, '网页')
  projects.addMilestones(p.project.id, [
    { date: '2030-03-01', title: '通知老客户停业时间' },
    { date: '2030-03-05', title: '旧店停业搬家' },
    { date: '2030-03-12', title: '新址恢复营业' },
  ], '网页')
  const c = storeClosure('2030-01-01')
  assert.deepEqual(c, { from: '2030-03-05', to: '2030-03-11', label: '搬新址停业（3/5—3/11）', source: null })
})
