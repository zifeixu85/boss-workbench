// 找本机 Codex：桌面版装在哪都认得出（/Applications、~/Applications、自带的 CodexCLI.app），命令行装的常见位置也找；
// 搭建、接进 Codex 时找到过的位置记下来，工作台服务以后照着用（服务起来时 PATH 往往和对话里不一样）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { codexCandidates, findCodex, findCodexBin, NOT_FOUND } from './codex-check.mjs'

const onlyUnix = process.platform === 'win32'
const tmp = () => mkdtempSync(join(os.tmpdir(), 'wb-codex-'))
function exe(p) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, '#!/bin/sh\necho codex-cli 0.200.0\n'); chmodSync(p, 0o755); return p }

test('找 Codex：家目录 Applications 里的桌面版、桌面版里的 CodexCLI.app、常见命令行位置都在候选里；CODEX_BIN 也认', { skip: onlyUnix }, () => {
  const home = tmp()
  const list = codexCandidates({ HOME: home, PATH: '', CODEX_BIN: '/指定/codex' })
  assert.equal(list[0], '/指定/codex')
  for (const p of [
    '/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex',
    '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    join(home, 'Applications/Codex.app/Contents/Resources/codex-cli/bin/codex'),
    '/opt/homebrew/bin/codex', '/usr/local/bin/codex', join(home, '.local/bin/codex'), join(home, '.npm-global/bin/codex'),
  ]) assert.ok(list.includes(p), p)
})

test('PATH 里没有 codex，桌面版装在家目录的 Applications：照样找到，并记下位置；下次候选都不在时照记下的用', { skip: onlyUnix }, () => {
  const home = tmp()
  const remember = join(tmp(), 'codex-bin.txt')
  const app = exe(join(home, 'Applications/Codex.app/Contents/Resources/codex-cli/bin/codex'))
  assert.equal(findCodexBin({ HOME: home, PATH: '' }, { remember, spotlight: false, system: false }), app)
  assert.equal(readFileSync(remember, 'utf8').trim(), app)
  // 换一个空的家目录（服务的环境不一样），还认记下的
  assert.equal(findCodexBin({ HOME: tmp(), PATH: '' }, { remember, spotlight: false, system: false }), app)
})

test('都找不到：返回 null，文案不断言“没装”；记下的位置失效了不用', { skip: onlyUnix }, () => {
  const remember = join(tmp(), 'codex-bin.txt')
  writeFileSync(remember, '/早就删了/codex\n')
  assert.equal(findCodexBin({ HOME: tmp(), PATH: '' }, { remember, spotlight: false, system: false }), null)
  assert.ok(!/^这台电脑上没找到/.test(NOT_FOUND) && /没认出/.test(NOT_FOUND), NOT_FOUND)
  assert.ok(existsSync(remember))
})

// 2026-11-26 Mac mini 实测：Codex 桌面版现在叫 ChatGPT.app（包名还是 com.openai.codex），PATH 里没有 codex。三种都要认：
// 只有 Codex.app、只有 ChatGPT.app、只装了命令行；应用改了名、只要包里带着 codex-cli 也认（ChatGPT Classic、Atlas 这类不带的不算）
const appBin = (home, name) => exe(join(home, 'Applications', `${name}.app`, 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'))
for (const [what, make] of [
  ['只有 Codex.app', (home) => appBin(home, 'Codex')],
  ['只有 ChatGPT.app', (home) => appBin(home, 'ChatGPT')],
  ['应用改了名（包里带 codex-cli）', (home) => appBin(home, 'Codex Beta')],
  ['只装了命令行（~/.local/bin）', (home) => exe(join(home, '.local', 'bin', 'codex'))],
]) {
  test(`找 Codex：${what}`, { skip: onlyUnix }, () => {
    const home = tmp()
    mkdirSync(join(home, 'Applications', 'ChatGPT Classic.app', 'Contents', 'Resources'), { recursive: true })
    const bin = make(home)
    assert.equal(findCodexBin({ HOME: home, PATH: '' }, { remember: null, spotlight: false, system: false }), bin)
  })
}

test('找不到时的说法：在用 Codex（有 ~/.codex）就不说“没装”，说工作台没认出命令在哪、怎么让它记下；没有 ~/.codex 才说去装，并说明现在在 ChatGPT 应用里', { skip: onlyUnix }, async () => {
  const used = tmp()
  mkdirSync(join(used, '.codex'))
  const a = await findCodex({ HOME: used, PATH: '' }, { remember: null, spotlight: false, system: false })
  assert.equal(a.ready, false)
  assert.doesNotMatch(`${a.detail}${a.fix}`, /还不能把工作台接进 Codex|装好 Codex/)
  assert.match(a.detail, /在用 Codex/)
  assert.match(a.fix, /把工作台接进 Codex/)
  const none = await findCodex({ HOME: tmp(), PATH: '' }, { remember: null, spotlight: false, system: false })
  assert.match(`${none.detail}${none.fix}`, /ChatGPT 应用/)
})
