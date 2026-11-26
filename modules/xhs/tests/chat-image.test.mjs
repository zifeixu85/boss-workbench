// 对话里生成的图“放进当前稿子”：复制一份到 小红书素材/、记成垫图素材、封面垫图换成它、存成新的一版；原图不动，乱给的不收。
// 运行（仓库根目录）：node --test modules/xhs/tests/chat-image.test.mjs
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

test('放进当前稿子：封面垫图换成对话里的图，存新版本；文件复制进素材夹；没有这张图就说清楚', { skip }, () => {
  const tmp = mkdtempSync(join(os.tmpdir(), 'wb-xhs-img-'))
  const KB = join(tmp, '知识库'); const APP = join(tmp, '程序'); const DATA = join(tmp, '数据')
  mkdirSync(APP, { recursive: true }); mkdirSync(KB, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(DATA, 'workbench.db'), NO_COLOR: '1', DEMO_TODAY: 'off' }
  const sh = (...a) => { const r = spawnSync(process.execPath, a, { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  assert.equal(sh('server/cli.ts', 'modules').code, 0)
  assert.equal(sh('scripts/module.mjs', 'add', 'xhs', '--from', PACK, '--no-build').code, 0)
  const saved = sh('server/cli.ts', 'xhs-draft-save', '--draft', JSON.stringify({ title: '办公室泡茶三件套', body: '一只杯子就够。', pages: ['办公室泡茶三件套', '杯子'] }), '--by', '内容助理 小红', '--json')
  assert.equal(saved.code, 0, saved.out)
  const piece = JSON.parse(saved.out).id
  const png = join(tmp, 'codex-生成.png')
  writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ff1f0003030200efa3a5c70000000049454e44ae426082', 'hex'))
  const script = `
    import { run } from './server/db.ts'
    import { putChatImage, assetFile, ASSET_DIR } from './server/modules/xhs/chat-image.ts'
    import { latestDraft } from './server/modules/xhs/pieces.ts'
    run("INSERT INTO assistant_messages (id, role, text, status, steps_json, created_at) VALUES ('m_img', 'assistant', '画好了', 'done', :s, '2026-11-26T10:00:00Z')", { s: JSON.stringify([{ tool: 'imageGeneration', label: '生成图片', state: 'ok', image: ${JSON.stringify(png)} }]) })
    const r = await putChatImage(${JSON.stringify(piece)}, { message: 'm_img', step: 0 })
    const d = latestDraft(${JSON.stringify(piece)})
    let missing = ''
    try { await putChatImage(${JSON.stringify(piece)}, { message: 'm_img', step: 3 }) } catch (e) { missing = e.message }
    console.log(JSON.stringify({ r, pad: d.draft.cover.pad, version: d.version, file: assetFile(r.asset), dir: ASSET_DIR(), missing }))`
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: APP, env, encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  const j = JSON.parse(out.stdout.trim().split('\n').pop())
  assert.match(j.r.asset, /^a_gen_[0-9a-z]{8}$/, '对话里生成的图编号是 a_gen_，页面上标 AI 生成')
  assert.equal(j.pad, j.r.asset, '封面垫图换成了这张')
  assert.equal(j.version, 2, '存成新的一版，旧版留着')
  assert.equal(dirname(j.file), j.dir)
  assert.ok(existsSync(j.file) && existsSync(png), '复制了一份，原图还在')
  assert.match(j.missing, /没有这张图/)
})
