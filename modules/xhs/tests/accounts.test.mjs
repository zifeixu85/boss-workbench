// 小红书账号（约定 11.14）：知识库为准，一个账号一份文件；工作台读它，不在数据库里另存。登记、改（只改给了的几项，正文不动）、列出；
// 选题和稿子挂在账号下（只有一个账号时不用写），按账号找。运行（仓库根目录）：node --test modules/xhs/tests/accounts.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const PACK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(PACK, '..', '..', 'template')
const skip = !existsSync(join(TEMPLATE, 'node_modules', 'hono')) && '先在 template/ 里 npm install'

test('账号在知识库里：登记、改、列出；选题挂在账号下；两个账号时要写哪一个', { skip }, () => {
  const tmp = mkdtempSync(join(os.tmpdir(), 'wb-xhs-acc-'))
  const KB = join(tmp, '知识库'); const APP = join(tmp, '程序')
  mkdirSync(APP, { recursive: true }); mkdirSync(join(KB, '1-老板说明书'), { recursive: true })
  writeFileSync(join(KB, '知识库档案.md'), '## 位置\n\n| 是什么 | 在哪 |\n|---|---|\n| 关于我 | 1-老板说明书 |\n')
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(tmp, '数据', 'workbench.db'), NO_COLOR: '1', DEMO_TODAY: 'off' }
  const sh = (...a) => { const r = spawnSync(process.execPath, ['server/cli.ts', ...a], { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  const json = (...a) => { const r = sh(...a, '--json'); assert.equal(r.code, 0, r.out); return JSON.parse(r.out) }
  assert.equal(spawnSync(process.execPath, ['scripts/module.mjs', 'add', 'xhs', '--from', PACK, '--no-build'], { cwd: APP, env }).status, 0)

  assert.deepEqual(json('xhs-accounts').accounts, [], '一个都没登记')
  const a = json('xhs-account-save', '--name', '木槿花艺', '--positioning', '杭州小花艺工作室的日常', '--audience', '公司行政、要送花的上班族', '--persona', '店里的花艺师，说话实在', '--style', '短句、实拍', '--avoid', '贬低同行、全杭州最好', '--by', '阿柚')
  assert.equal(a.path, '1-老板说明书/小红书账号/木槿花艺.md', '没登记位置：放在“关于我”下的 小红书账号/')
  const file = join(KB, a.path)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /^---\n类型: 账号\n平台: 小红书\n名称: "木槿花艺"\n/)
  assert.match(text, /不碰:\n  - "贬低同行"\n  - "全杭州最好"/)
  // 老板在 Obsidian 里加了正文；只改风格，正文和别的项不动
  writeFileSync(file, `${text}\n## 我们怎么拍\n自然光，不修过头。\n`)
  json('xhs-account-save', '--name', '木槿花艺', '--style', '短句、实拍、不用滤镜', '--by', '阿柚')
  const after = readFileSync(file, 'utf8')
  assert.match(after, /风格: "短句、实拍、不用滤镜"/)
  assert.match(after, /定位: "杭州小花艺工作室的日常"/)
  assert.match(after, /## 我们怎么拍\n自然光，不修过头。/)
  const list = json('xhs-accounts').accounts
  assert.deepEqual(list.map((x) => [x.name, x.positioning, x.audience, x.avoid]), [['木槿花艺', '杭州小花艺工作室的日常', '公司行政、要送花的上班族', ['贬低同行', '全杭州最好']]])

  // 只有一个账号：选题不写 --account 也挂上
  const t1 = json('xhs-topic-add', '--title', '圣诞礼盒怎么挑', '--by', '阿柚')
  assert.equal(t1.account, '木槿花艺')
  // 两个账号：要写是哪一个；写了不存在的不收
  json('xhs-account-save', '--name', '槿姐的花店日记', '--positioning', '老板自己的号', '--by', '阿柚')
  assert.notEqual(sh('xhs-topic-add', '--title', '第二篇', '--by', '阿柚').code, 0, '两个账号时要写 --account')
  assert.notEqual(sh('xhs-topic-add', '--title', '第二篇', '--account', '没有这个号', '--by', '阿柚').code, 0)
  const t2 = json('xhs-topic-add', '--title', '第二篇', '--account', '槿姐的花店日记', '--by', '阿柚')
  assert.equal(t2.account, '槿姐的花店日记')
  const d = json('xhs-draft-save', '--draft', JSON.stringify({ title: '不写选题直接写', body: '正文', pages: ['不写选题直接写'] }), '--account', '木槿花艺', '--by', '阿柚')
  assert.deepEqual(json('xhs-pieces', '--account', '木槿花艺').map((p) => p.id).sort(), [t1.id, d.id].sort())
  assert.equal(json('xhs-pieces', '--account', '槿姐的花店日记')[0].account, '槿姐的花店日记')
})
