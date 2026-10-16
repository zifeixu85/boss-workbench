import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const area = mkdtempSync(join(tmpdir(), 'assistant-busy-'))
const fake = join(area, 'codex')
writeFileSync(fake, `#!/usr/bin/env node
setTimeout(() => { console.log(process.argv.includes('--version') ? 'codex test' : 'Logged in'); }, 200)
`, { mode: 0o755 })
process.env.WORKBENCH_ROOT = area
process.env.WORKBENCH_DB = join(area, 'test.db')
process.env.WORKBENCH_CODEX_BIN = fake
const { ask, stop, messages } = await import('./service.ts')
after(() => rmSync(area, { recursive: true, force: true }))
test('正在检查 Codex 时第二条请求被拒绝；停止后第一条不会悄悄开跑', async () => {
  const first = ask({ text: '测试一' })
  await assert.rejects(ask({ text: '测试二' }), /上一个问题还在答/)
  assert.equal(stop().stopped, true)
  await assert.rejects(first, /已停止/)
  assert.equal(messages().length, 0)
})
