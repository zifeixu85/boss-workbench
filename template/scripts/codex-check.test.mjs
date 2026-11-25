// 找本机 Codex：桌面版装在哪都认得出（/Applications、~/Applications、自带的 CodexCLI.app），命令行装的常见位置也找；
// 搭建、接进 Codex 时找到过的位置记下来，工作台服务以后照着用（服务起来时 PATH 往往和对话里不一样）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { codexCandidates, findCodexBin, NOT_FOUND } from './codex-check.mjs'

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
