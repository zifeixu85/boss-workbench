// 技能的署名和版本（2026-11-27 A梦：“至少 skill.md 里面也要写上版本信息、github 仓库信息和作者版权信息”）：
// SKILL.md 开头的 metadata 写作者、版本、仓库、许可，正文标题下一行署名；版本就是 template/package.json 的版本（发包时涨这一个，两边一起变）；
// 自带的模块和接进 Codex 的插件清单也写作者、许可、主页。description 不超过 1024 个字（Claude Code 和 Codex 都按这个上限）。
// 运行（仓库根目录）：node --test tests/skill-meta.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = 'https://github.com/zifeixu85/boss-workbench'
const read = (p) => readFileSync(join(REPO, p), 'utf8')
const pkg = JSON.parse(read('template/package.json'))

test('SKILL.md：开头有 name、description（不超过 1024 字）和 metadata（作者、版本 = 模板版本、仓库、许可）；标题下一行署名', () => {
  const s = read('SKILL.md')
  const head = s.match(/^---\n([\s\S]*?)\n---\n/)[1]
  assert.match(head, /^name: boss-workbench$/m, '技能名不改')
  const desc = head.match(/^description: (.*)$/m)[1]
  assert.ok([...desc].length <= 1024, `description ${[...desc].length} 字`)
  assert.match(head, /^metadata:\n  author: A梦 \(ameng\)\n  version: "([^"]+)"\n  homepage: (\S+)\n  license: Apache-2\.0$/m)
  const [, version, homepage] = head.match(/^  version: "([^"]+)"\n  homepage: (\S+)$/m)
  assert.equal(version, pkg.version, 'SKILL.md 的版本跟着 template/package.json 走')
  assert.equal(homepage, HOME)
  assert.match(s, /\n# 老板工作台\n\n> 作者：A梦 \(ameng\) · Apache-2\.0 · 自由使用和分享，请保留署名 · 仓库 https:\/\/github\.com\/zifeixu85\/boss-workbench\n/)
})

test('LICENSE 是 Apache-2.0；NOTICE 写着版权人和年份', () => {
  assert.match(read('LICENSE'), /Apache License\s+Version 2\.0, January 2004/)
  assert.match(read('NOTICE.md'), /Copyright 2026 A梦 \(ameng\)/)
})

test('自带的模块：module.json 写作者、许可、主页', () => {
  for (const id of readdirSync(join(REPO, 'modules'))) {
    const f = join(REPO, 'modules', id, 'module.json')
    if (!existsSync(f)) continue
    const m = JSON.parse(readFileSync(f, 'utf8'))
    assert.equal(m.author, 'A梦 (ameng)', id)
    assert.equal(m.license, 'Apache-2.0', id)
    assert.equal(m.homepage, HOME, id)
  }
})

test('接进 Codex 的插件清单：作者、主页、仓库、许可', async () => {
  const src = read('template/scripts/codex-plugin.mjs')
  assert.match(src, /author: \{ name: 'A梦 \(ameng\)', url: 'https:\/\/ameng\.blog' \}/)
  assert.match(src, /homepage: 'https:\/\/github\.com\/zifeixu85\/boss-workbench'/)
  assert.match(src, /repository: 'https:\/\/github\.com\/zifeixu85\/boss-workbench'/)
  assert.match(src, /license: 'Apache-2\.0'/)
})
