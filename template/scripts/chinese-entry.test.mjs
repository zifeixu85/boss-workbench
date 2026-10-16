import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, cpSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

test('中文空格目录：体检和 MCP stdio 真正启动并返回结果', t => {
  const area = mkdtempSync(join(tmpdir(), '中文 启动-'))
  const app = join(area, '老板工作台/程序')
  const root = join(area, '知识库')
  mkdirSync(root, { recursive: true })
  cpSync(join(import.meta.dirname, '..'), app, { recursive: true, filter: p => !['node_modules', 'dist', 'dist-mobile', '数据', '备份'].includes(basename(p)) && !/\.db(?:-|$)/.test(basename(p)) })
  symlinkSync(join(import.meta.dirname, '../node_modules'), join(app, 'node_modules'), 'dir')
  t.after(() => rmSync(area, { recursive: true, force: true }))
  const env = { ...process.env, WORKBENCH_ROOT: root, WORKBENCH_DB: join(area, 'test.db') }
  const shell = spawnSync(process.execPath, [join(app, 'scripts/shell-check.mjs')], { env, encoding: 'utf8', timeout: 10000 })
  assert.equal(shell.status, 0, shell.stderr)
  assert.match(shell.stdout, /外壳完整/)
  const mcp = spawnSync(process.execPath, [join(app, 'server/assistant/mcp.ts')], { env, input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n', encoding: 'utf8', timeout: 10000 })
  assert.equal(mcp.status, 0, mcp.stderr)
  assert.equal(JSON.parse(mcp.stdout.trim()).id, 1)
  assert.ok(JSON.parse(mcp.stdout.trim()).result.serverInfo)
  const codex = spawnSync(process.execPath, [join(app, 'scripts/codex-check.mjs')], { env, encoding: 'utf8', timeout: 20000 })
  assert.equal(typeof JSON.parse(codex.stdout).ready, 'boolean', '没安装 Codex 也要真实输出检查结果，不能静默退出')
})
