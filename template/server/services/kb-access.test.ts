import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const area = mkdtempSync(join(tmpdir(), 'kb-access-'))
const root = join(area, '已有 中文资料')
for (const dir of ['01-AI协作', '资料/不读', '资料/不读二', '只读', '可用']) mkdirSync(join(root, dir), { recursive: true })
process.env.WORKBENCH_ROOT = root
process.env.WORKBENCH_DB = join(area, 'workbench.db')
const { kbTree, readKb, writeKb } = await import('./kb.ts')
const profile = join(root, '01-AI协作/建库档案.md')
const rules = '# 建库档案\n\n## 目录对应\n| 层 | 实际位置 |\n|---|---|\n| 原有·不读 | `资料/不读` |\n| 原有·只读 | `只读` |\n\n## 其他\n'
writeFileSync(profile, rules)
for (const f of ['资料/不读/原件.md', '资料/不读二/正常.md', '只读/旧记录.md']) writeFileSync(join(root, f), f)
symlinkSync(join(root, '资料/不读/原件.md'), join(root, '可用/链接.md'))
symlinkSync(join(root, '只读'), join(root, '可用/目录链接'))
after(() => rmSync(area, { recursive: true, force: true }))
test('不读目录不会出现在浏览、搜索来源中，直接读取与链接也拒绝', () => {
  const tree = JSON.stringify(kbTree())
  assert.ok(!tree.includes('原件'))
  assert.ok(!tree.includes('链接.md'))
  assert.throws(() => readKb('资料/不读/原件.md'), /不读/)
  assert.throws(() => readKb('可用/链接.md'), /不读/)
  assert.equal(readKb('资料/不读二/正常.md').body, '资料/不读二/正常.md')
})
test('只读可以查阅，直接写与目录链接新增都拒绝，原件不动', () => {
  assert.equal(readKb('只读/旧记录.md').body, '只读/旧记录.md')
  assert.throws(() => writeKb('只读/旧记录.md', '新'), /只读/)
  assert.throws(() => writeKb('可用/目录链接/新增.md', '新'), /只读/)
  assert.equal(readFileSync(join(root, '只读/旧记录.md'), 'utf8'), '只读/旧记录.md')
})
test('老板改了范围立刻生效；没有旧地图的库仍可读写', () => {
  writeFileSync(profile, '# 建库档案\n')
  assert.equal(readKb('资料/不读/原件.md').body, '资料/不读/原件.md')
  writeKb('只读/旧记录.md', '现在可改')
  assert.equal(readKb('只读/旧记录.md').body, '现在可改')
})

test('原件能读但不覆盖；新建笔记可写，原件链接也受保护', () => {
  const original = join(root, '可用/原客户.md')
  writeFileSync(original, '旧客户原文')
  writeFileSync(join(root, '01-AI协作/原件清单.md'), `| 文件 | 大小 | SHA-256 |\n|---|---|---|\n| 可用/原客户.md | 15 | ${'a'.repeat(64)} |\n`)
  symlinkSync(original, join(root, '可用/原件链接.md'))
  assert.equal(readKb('可用/原客户.md').body, '旧客户原文')
  assert.throws(() => writeKb('可用/原客户.md', '不能替换'), /原有资料/)
  assert.throws(() => writeKb('可用/原件链接.md', '不能替换'), /原有资料/)
  writeKb('可用/新补充.md', '新增背景，链接原件')
  assert.equal(readFileSync(original, 'utf8'), '旧客户原文')
})

test('旧客户整理接口也遵守只读，收件箱不读时不列文件', async () => {
  const { createClient } = await import('./clients.ts')
  const { listInbox, kbAppend } = await import('../modules/crm/materials.ts')
  mkdirSync(join(root, '00-收件箱'), { recursive: true })
  writeFileSync(join(root, '00-收件箱/不该看到.md'), '# 不能出现在材料页')
  const text = '# 客户\n\n## 往来记录\n\n'
  writeFileSync(join(root, '只读/客户.md'), text)
  writeFileSync(profile, rules.replace('## 其他', '| 原有·不读 | 00-收件箱 |\n\n## 其他'))
  assert.deepEqual(listInbox(), [])
  const c = createClient({ name: '只读客户', kb_path: '只读/客户.md' }, 'Codex')
  assert.throws(() => kbAppend(c.id, { line: '新的一行', date: '2026-10-16', today: '2026-10-16', rows: [] }, 'guard-test'), /只读/)
  assert.equal(readFileSync(join(root, '只读/客户.md'), 'utf8'), text)
  writeFileSync(profile, '# 建库档案\n')
  const c2 = createClient({ name: '原有客户', kb_path: '可用/原客户.md' }, 'Codex')
  assert.throws(() => kbAppend(c2.id, { line: '另一行', date: '2026-10-16', today: '2026-10-16', rows: [] }, 'guard-original'), /原有资料/)
})
