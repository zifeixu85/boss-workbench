// 小红书助理用内容工作台（约定 11.13）：存选题 → 在选题下存稿 → 改稿存新版 → 放图（封面、内页）→ 列出和找到 → 拿到打开地址；
// 每一步记下是哪位助理做的（--by），工作台的“产出”接入点能按名字认出来。运行（仓库根目录）：node --test modules/xhs/tests/assistant-flow.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const PACK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(PACK, '..', '..', 'template')
const skip = !existsSync(join(TEMPLATE, 'node_modules', 'hono')) && '先在 template/ 里 npm install'

test('存选题 → 存稿 → 改稿 → 放图 → 找到；都记着是阿柚做的，产出接入点认得出', { skip }, () => {
  const tmp = mkdtempSync(join(os.tmpdir(), 'wb-xhs-flow-'))
  const KB = join(tmp, '知识库'); const APP = join(tmp, '程序')
  mkdirSync(APP, { recursive: true }); mkdirSync(KB, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(tmp, '数据', 'workbench.db'), NO_COLOR: '1', DEMO_TODAY: 'off' }
  const sh = (...a) => { const r = spawnSync(process.execPath, a, { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  const json = (...a) => { const r = sh('server/cli.ts', ...a, '--json'); assert.equal(r.code, 0, r.out); return JSON.parse(r.out) }
  assert.equal(sh('server/cli.ts', 'modules').code, 0)
  assert.equal(sh('scripts/module.mjs', 'add', 'xhs', '--from', PACK, '--no-build').code, 0)

  const t = json('xhs-topic-add', '--title', '圣诞礼盒怎么挑', '--angle', '给公司采购的三档', '--by', '阿柚')
  assert.match(t.id, /^p_/); assert.equal(t.existed, false); assert.equal(t.path, `/content/studio/${t.id}`)
  assert.equal(json('xhs-topic-add', '--title', '圣诞礼盒怎么挑', '--by', '阿柚').id, t.id, '同名的不重复存，回已有那篇')

  const draft = { title: '圣诞礼盒怎么挑', summary: '给公司采购的三档礼盒', pages: ['圣诞礼盒怎么挑', '198 元一档', '398 元一档'], body: '三档怎么选。', tags: ['圣诞'] }
  const d1 = json('xhs-draft-save', '--id', t.id, '--draft', JSON.stringify(draft), '--by', '阿柚')
  assert.equal(d1.id, t.id, '写在选题下面，是同一篇'); assert.equal(d1.version, 1); assert.equal(d1.path, `/content/studio/${t.id}`)
  const d2 = json('xhs-draft-save', '--id', t.id, '--draft', JSON.stringify({ ...draft, body: '改过的正文' }), '--by', '阿柚')
  assert.equal(d2.version, 2, '改稿存成新的一版')

  const png = join(tmp, '封面.png')
  writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ff1f0003030200efa3a5c70000000049454e44ae426082', 'hex'))
  const i0 = json('xhs-image-add', '--id', t.id, '--file', png, '--by', '阿柚')
  assert.equal(i0.where, '封面'); assert.equal(i0.version, 3)
  const i2 = json('xhs-image-add', '--id', t.id, '--file', png, '--page', '2', '--by', '阿柚')
  assert.equal(i2.where, '第 2 张内页'); assert.equal(i2.version, 4)
  assert.notEqual(sh('server/cli.ts', 'xhs-image-add', '--id', t.id, '--file', png, '--page', '9').code, 0, '没有第 9 张内页：不收')
  assert.notEqual(sh('server/cli.ts', 'xhs-image-add', '--id', t.id, '--file', join(tmp, '没有.png')).code, 0)

  const found = json('xhs-pieces', '--by', '阿柚')
  assert.deepEqual(found.map((p) => [p.id, p.stage, p.version]), [[t.id, '草稿', 4]])
  assert.deepEqual(json('xhs-pieces', '--q', '礼盒').map((p) => p.id), [t.id])
  assert.deepEqual(json('xhs-pieces', '--status', '定稿'), [])

  const works = sh('--input-type=module', '-e', `
    import { loadHooks } from './server/module-hooks.ts'
    const hs = await loadHooks()
    console.log(JSON.stringify(hs.flatMap((x) => x.hooks.works?.() ?? [])))`)
  assert.equal(works.code, 0, works.out)
  const w = JSON.parse(works.out.trim().split('\n').pop())
  assert.equal(w.length, 1)
  assert.equal(w[0].kind, '小红书'); assert.equal(w[0].status, '草稿'); assert.ok(w[0].by.includes('阿柚')); assert.equal(w[0].to, `/content/studio/${t.id}`)
})
