// 创作改版接口验收：不监听端口，直接跑真实路由和数据库。2026-11-27 A梦要求改版。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const pack = resolve('modules/xhs')
const template = resolve('template')
test('账号接口严格验证并留痕，命令和助理产出同步；恢复只增版本；发现页保留模板封面并隐藏对标点赞', () => {
  const root = mkdtempSync(join(tmpdir(), 'wb-xhs-studio-'))
  const app = join(root, '程序')
  const kb = join(root, '知识库')
  mkdirSync(kb)
  writeFileSync(join(kb, '知识库档案.md'), '## 位置\n\n| 是什么 | 在哪 |\n|---|---|\n| 关于我 | 关于我 |\n')
  cpSync(template, app, { recursive: true, filter: src => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(template.length)) })
  symlinkSync(join(template, 'node_modules'), join(app, 'node_modules'), 'junction')
  const env = { ...process.env, WORKBENCH_ROOT: kb, WORKBENCH_DB: join(root, '数据', 'workbench.db'), DEMO_TODAY: 'off' }
  const run = args => {
    const result = spawnSync(process.execPath, args, { cwd: app, env, encoding: 'utf8' })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    return result.stdout
  }
  run(['scripts/module.mjs', 'add', 'xhs', '--from', pack, '--no-build'])
  run(['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
    import { join } from 'node:path'
    import { spawnSync } from 'node:child_process'
    import { xhsRoutes } from './server/modules/xhs/routes.ts'
    import { saveAccount } from './server/modules/xhs/accounts.ts'
    import { createPiece, pieceRow, saveVersion, versions } from './server/modules/xhs/pieces.ts'
    import { findPieces } from './server/modules/xhs/finder.ts'
    import { ASSET_DIR } from './server/modules/xhs/chat-image.ts'
    import { xhsHooks } from './server/modules/xhs/hooks.ts'
    import { get, run, ROOT } from './server/db.ts'
    const request = async (path, method = 'GET', body) => {
      const response = await xhsRoutes.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    }
    assert.deepEqual((await request('/accounts')).body.data, [])
    const first = saveAccount({ name: '木槿花艺' }, '阿柚')
    assert.equal((await request('/accounts')).body.data.length, 1)
    const second = saveAccount({ name: 'ABC茶社' }, '阿柚')
    const original = [first, second].map(a => readFileSync(join(ROOT, a.path), 'utf8'))
    const p = createPiece({ title: '行政别慌，送客户的圣诞礼盒这样选', status: '写稿中' }, '阿柚')
    const before = get('SELECT COUNT(*) AS n FROM changes').n
    for (const account of ['', '未登记', null, 12, {}, ['木槿花艺']]) {
      const result = await request('/pieces/' + p.id, 'PATCH', { account })
      assert.equal(result.status, 400, JSON.stringify(result))
    }
    assert.equal(get('SELECT COUNT(*) AS n FROM changes').n, before)
    assert.equal((await request('/pieces/' + p.id, 'PATCH', { account: '木槿花艺' })).status, 200)
    assert.equal((await request('/pieces/' + p.id, 'PATCH', { account: 'ABC茶社' })).status, 200)
    assert.equal(pieceRow(p.id).account, 'ABC茶社')
    assert.equal(pieceRow(p.id).created_by, '阿柚')
    assert.equal(findPieces({ account: 'ABC茶社' }).some(x => x.id === p.id), true)
    assert.equal(findPieces({ account: '木槿花艺' }).some(x => x.id === p.id), false)
    assert.equal(xhsHooks.works().find(x => x.id === 'xhs:' + p.id).kind, '小红书 · ABC茶社')
    const cli = spawnSync(process.execPath, ['server/cli.ts', 'xhs-pieces', '--account', 'ABC茶社', '--json'], { encoding: 'utf8' })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(JSON.parse(cli.stdout).some(x => x.id === p.id && x.account === 'ABC茶社'), true)
    assert.match(get('SELECT summary FROM changes WHERE entity_id = :id ORDER BY id DESC LIMIT 1', { id: p.id }).summary, /ABC茶社/)
    assert.deepEqual([first, second].map(a => readFileSync(join(ROOT, a.path), 'utf8')), original)
    const d = { title: p.title, body: '木槿花艺的礼盒指南', pages: [{ role: '封面', text: '礼盒' }, { role: '内页', text: '先看预算' }], tags: ['送礼'], cover: { template: 'a_cover1', pad: 'a_pad0', tone: '米白' } }
    saveVersion(p.id, d, { origin: 'AI 写稿', author: '阿柚' })
    const old = versions(p.id)[0]
    const saved = await request('/pieces/' + p.id + '/versions', 'POST', { data: { ...d, body: '手动修改' }, note: '手动修改' })
    assert.equal(saved.body.data.version, 2)
    const restored = await request('/pieces/' + p.id + '/restore', 'POST', { version: 1 })
    assert.equal(restored.body.data.version, 3)
    assert.deepEqual(versions(p.id).find(v => v.version === 1), old)
    assert.equal(versions(p.id)[0].data.body, d.body)
    const listed = (await request('/starts')).body.data.recent.find(x => x.id === p.id)
    assert.equal(listed.version, 3)
    assert.ok(listed.writer)
    assert.equal((await request('/pieces/' + p.id + '/versions/1')).body.data.data.pages[1].text, '先看预算')
    const empty = (await request('/feed')).body.data
    assert.deepEqual(empty, { own: [], bench: [] })
    run("INSERT INTO xhs_benchmarks (id, account, title, cover_text, pad, likes, saved_at) VALUES ('bench', 'ABC茶社', '自家收藏', '封面', 'a_pad1', 23, '2026-11-27')")
    assert.equal((await request('/feed')).body.data.bench.length, 1)
    assert.equal((await request('/feed')).body.data.bench[0].cover_text, '封面')
    mkdirSync(ASSET_DIR(), { recursive: true })
    const imageFile = join(ASSET_DIR(), '测试.png')
    writeFileSync(imageFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZAAAAAASUVORK5CYII=', 'base64'))
    run("INSERT INTO xhs_assets (id, kind, name, file, created_at) VALUES ('a_gen_12345678', '垫图', '测试封面', :file, '2026-11-27')", { file: imageFile })
    run("UPDATE xhs_benchmarks SET pad = 'a_gen_12345678' WHERE id = 'bench'")
    const feed = (await request('/feed')).body.data.bench[0]
    assert.equal(feed.likes, null)
    assert.equal(feed.generated, true)
    assert.equal(feed.image, '/api/m/xhs/assets/a_gen_12345678/file')
    run("INSERT INTO xhs_notes (id, title, kind, published_at) VALUES ('note', '库里的笔记', '图文', '2026-11-27')")
    run("UPDATE xhs_pieces SET note_id = 'note' WHERE id = :id", { id: p.id })
    const templateNote = (await request('/feed')).body.data.own[0]
    assert.equal(templateNote.account, 'ABC茶社')
    assert.equal(templateNote.cover.template, 'a_cover1')
    assert.equal(templateNote.image, null)
    saveVersion(p.id, { ...d, cover: { ...d.cover, pad: 'a_gen_12345678' } }, { origin: 'AI 写稿', author: '阿柚' })
    const own = (await request('/feed')).body.data.own[0]
    assert.equal(own.account, 'ABC茶社')
    assert.equal(own.likes, null)
    assert.equal(own.image, '/api/m/xhs/assets/a_gen_12345678/file')
    run("UPDATE xhs_assets SET file = '找不到.png' WHERE id = 'a_gen_12345678'")
    const missingImage = (await request('/feed')).body.data
    assert.equal(missingImage.own.length, 1)
    assert.equal(missingImage.bench.length, 1)
    assert.equal(missingImage.own[0].image, null)
    assert.equal(missingImage.bench[0].likes, null)
    console.log('接口和数据验收通过')
  `])
})
