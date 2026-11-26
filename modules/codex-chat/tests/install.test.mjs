// 内嵌 Codex 模块：装上 → 核心多一个常驻对话引擎（接入点 assistantHost），AI 助手默认常驻对话、设置里有开关；
// 拿掉 → 回到一问一答，开关也没了。引擎的类型对得上核心的约定。运行（仓库根目录）：node --test modules/codex-chat/tests/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const PACK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(PACK, '..', '..', 'template')
const skip = !existsSync(join(TEMPLATE, 'node_modules', 'hono')) && '先在 template/ 里 npm install'

test('装上有常驻对话引擎、拿掉就没有；引擎的类型对得上核心', { skip }, () => {
  const tmp = mkdtempSync(join(os.tmpdir(), 'wb-codex-chat-'))
  const KB = join(tmp, '知识库'); const APP = join(tmp, '程序')
  mkdirSync(APP, { recursive: true }); mkdirSync(KB, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: join(tmp, '数据', 'workbench.db'), NO_COLOR: '1', DEMO_TODAY: 'off' }
  const sh = (...a) => { const r = spawnSync(process.execPath, a, { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  const probe = () => {
    const r = sh('--input-type=module', '-e', `
      import { loadHooks } from './server/module-hooks.ts'
      const hs = await loadHooks()
      console.log(JSON.stringify(hs.filter((x) => x.hooks.assistantHost).map((x) => x.module)))`)
    assert.equal(r.code, 0, r.out)
    return JSON.parse(r.out.trim().split('\n').pop())
  }
  assert.equal(sh('server/cli.ts', 'modules').code, 0)
  assert.deepEqual(probe(), [], '没装：没有常驻对话引擎')
  const add = sh('scripts/module.mjs', 'add', 'codex-chat', '--from', PACK, '--no-build')
  assert.equal(add.code, 0, add.out)
  assert.deepEqual(probe(), ['codex-chat'], '装上：核心拿到引擎')
  const tsc = spawnSync(process.execPath, [join(APP, 'node_modules', 'typescript', 'bin', 'tsc'), '--ignoreConfig', '--noEmit', '--strict', '--allowImportingTsExtensions', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2023', '--lib', 'ES2023', '--types', 'node', '--skipLibCheck', '--erasableSyntaxOnly', '--verbatimModuleSyntax', 'server/modules/codex-chat/hooks.ts', 'server/modules/codex-chat/host.ts'], { cwd: APP, encoding: 'utf8' })
  assert.equal(tsc.status, 0, `${tsc.stdout}${tsc.stderr}`)
  const rm = sh('scripts/module.mjs', 'remove', 'codex-chat', '--no-build')
  assert.equal(rm.code, 0, rm.out)
  assert.deepEqual(probe(), [], '拿掉：回到一问一答')
})
