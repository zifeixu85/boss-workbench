// 内容助理写完一篇：xhs-draft-save 存成内容页里的一篇草稿（写稿中），同时在知识库里存一份“作品”；给 Codex 只回标题、一句说明、位置和打开方式。
// 运行（仓库根目录）：node --test modules/xhs/tests/draft-save.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const PACK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(PACK, '..', '..', 'template')
const skip = !existsSync(join(TEMPLATE, 'node_modules', 'hono')) && '先在 template/ 里 npm install'

function bench() {
  const tmp = mkdtempSync(join(os.tmpdir(), 'wb-xhs-draft-'))
  const KB = join(tmp, '知识库')
  const APP = join(tmp, '程序')
  mkdirSync(APP, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  mkdirSync(KB, { recursive: true })
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(tmp, '数据', 'workbench.db'), NO_COLOR: '1', DEMO_TODAY: 'off' }
  const sh = (...a) => { const r = spawnSync(process.execPath, a, { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  const cli = (...a) => sh('server/cli.ts', ...a)
  const json = (...a) => { const r = cli(...a, '--json'); assert.equal(r.code, 0, r.out); return JSON.parse(r.out) }
  assert.equal(cli('modules').code, 0)
  assert.equal(sh('scripts/module.mjs', 'add', 'xhs', '--from', PACK, '--no-build').code, 0)
  return { tmp, KB, APP, cli, json }
}

const DRAFT = {
  title: '第一次买茶，最容易踩的三个坑',
  summary: '写给第一次买茶送人的上班族，讲三个常见的坑',
  cover_text: '买茶别踩这三个坑',
  pages: ['买茶别踩这三个坑', '坑一：只看包装', '坑二：只问价格', '坑三：不问年份'],
  body: '第一次买茶送人，最怕买贵了还不对。\n\n先看这三条。',
  tags: ['#买茶', '送礼'],
  sources: ['11-产品/白茶饼.md', '[[01-关于我/USER]]'],
}

test('写一篇：内容页多一篇草稿，知识库多一份作品；改稿是同一篇的新版本，作品文件跟着更新', { skip }, () => {
  const b = bench()
  // 知识库档案里登记了作品放哪
  writeFileSync(join(b.KB, '知识库档案.md'), '## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 作品 | 13-作品 | 已确认 |\n')
  const r = b.json('xhs-draft-save', '--draft', JSON.stringify(DRAFT), '--by', '内容助理 小红')
  assert.equal(r.title, DRAFT.title)
  assert.equal(r.summary, DRAFT.summary)
  assert.equal(r.status, '草稿')
  assert.equal(r.version, 1)
  assert.deepEqual(r.open, { kind: 'xhs-piece', id: r.id })
  assert.match(r.kb, /^13-作品\/\d{4}-\d{2}-\d{2} 第一次买茶，最容易踩的三个坑\.md$/)
  assert.match(r.where, /内容页/)

  const piece = b.json('xhs').plan // 命令能读
  assert.ok(piece)
  const kbText = readFileSync(join(b.KB, r.kb), 'utf8')
  assert.match(kbText, /^---\n类型: 作品\n名称: "第一次买茶，最容易踩的三个坑"\n状态: 草稿\n平台: 小红书\n日期: \d{4}-\d{2}-\d{2}\n/, '名称按 YAML 加引号（约定 11.9：标题里有冒号、# 也不坏）')
  assert.match(kbText, new RegExp(`工作台: xhs-piece:${r.id}`))
  assert.match(kbText, /确认: 待确认/)
  assert.match(kbText, /## 现在\n写给第一次买茶送人的上班族/)
  assert.match(kbText, /1\. 买茶别踩这三个坑（封面）\n2\. 坑一：只看包装/)
  assert.match(kbText, /#买茶 #送礼/)
  assert.match(kbText, /来源:\n  - "\[\[11-产品\/白茶饼\]\]"\n  - "\[\[01-关于我\/USER\]\]"/, '用到的知识库文件记成来源')

  // 改稿：同一篇存新版本，作品文件跟着换，不另起一份
  const r2 = b.json('xhs-draft-save', '--id', r.id, '--draft', JSON.stringify({ ...DRAFT, body: '改过的正文' }), '--by', '内容助理 小红')
  assert.equal(r2.id, r.id)
  assert.equal(r2.version, 2)
  assert.equal(r2.kb, r.kb)
  assert.match(readFileSync(join(b.KB, r.kb), 'utf8'), /改过的正文/)
  assert.equal(readdirSync(join(b.KB, '13-作品')).length, 1)
})

test('知识库档案里没登记作品（2026-11-27 改）：稿子照样存进工作台，但不新建顶层文件夹、不写作品文件，回一句“还没登记作品放哪”；库里本来就有 13-作品/ 的照旧放进去', { skip }, () => {
  const b = bench()
  const { sources: _s, ...noSources } = DRAFT
  const none = b.json('xhs-draft-save', '--draft', JSON.stringify(noSources))
  assert.equal(none.kb, null)
  assert.match(none.note, /还没登记作品放哪/)
  assert.ok(!existsSync(join(b.KB, '13-作品')), '没登记时不新建顶层文件夹')
  assert.match(none.id, /^p_/, '稿子照样存进工作台')
  mkdirSync(join(b.KB, '13-作品'))
  const r = b.json('xhs-draft-save', '--draft', JSON.stringify(noSources))
  assert.match(r.kb, /^13-作品\//)
  assert.match(readFileSync(join(b.KB, r.kb), 'utf8'), /^来源:\n  - 和内容助理的对话$/m, '没给来源也写一句，照样是列表（同一个属性名在库里类型一致，约定 11.9）')
  assert.ok(!('body' in r) && !('pages' in r), '只回标题、一句说明和位置')
  const bad = b.cli('xhs-draft-save', '--draft', JSON.stringify({ body: 'x' }), '--json')
  assert.notEqual(bad.code, 0)
  assert.match(bad.out, /标题/)
  const empty = b.cli('xhs-draft-save', '--draft', JSON.stringify({ title: '只有标题' }), '--json')
  assert.notEqual(empty.code, 0)
  assert.match(empty.out, /正文/)
  // 标题里有半角冒号、#、引号：开头照样是合法 YAML，读得回原标题（约定 11.9）
  const tricky = b.json('xhs-draft-save', '--draft', JSON.stringify({ ...DRAFT, title: '春茶: 别再"踩坑" #新手' }))
  const head = readFileSync(join(b.KB, tricky.kb), 'utf8').split('\n---\n')[0]
  assert.equal(JSON.parse(head.match(/^名称: (.*)$/m)[1]), '春茶: 别再"踩坑" #新手')
  const text = b.cli('xhs-draft-save', '--draft', JSON.stringify(DRAFT))
  assert.match(text.out, /存好了/)
  assert.doesNotMatch(text.out, /坑二：只问价格/)
  // Codex 能看到这条写入命令
  assert.ok(b.json('capabilities').write.some((w) => w.command === 'xhs-draft-save'))
})

