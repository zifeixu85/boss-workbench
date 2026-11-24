import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { writeMacLauncher } from './launcher.mjs'

test('Mac 启动文件：放在工作台文件夹里，指到这个工作台的程序、数据库和端口；已经有了不覆盖', () => {
  const root = mkdtempSync(join(os.tmpdir(), 'wb-launch-'))
  const ctx = { app: join(root, '程序'), root, db: join(root, '数据', 'workbench.db'), port: 4527 }
  const file = writeMacLauncher(ctx)
  assert.equal(file, join(root, '启动工作台.command'))
  const s = readFileSync(file, 'utf8')
  assert.match(s, /^#!\/bin\/zsh/)
  assert.ok(s.includes(`cd "${ctx.app}"`))
  assert.ok(s.includes(`WORKBENCH_DB="${ctx.db}"`) && s.includes('PORT=4527') && s.includes('http://127.0.0.1:4527'))
  assert.ok(!s.includes('/api/health'), '不探不存在的地址')
  assert.ok(statSync(file).mode & 0o100, '能双击运行')
  writeFileSync(file, '老板自己改过的')
  assert.equal(writeMacLauncher(ctx), null)
  assert.equal(readFileSync(file, 'utf8'), '老板自己改过的')
})

test('路径里有引号、美元符号的不写（免得启动文件跑错）', () => {
  const root = mkdtempSync(join(os.tmpdir(), 'wb-launch-$x-'))
  assert.equal(writeMacLauncher({ app: join(root, '程序'), root, db: join(root, 'db'), port: 4517 }), null)
  assert.ok(!existsSync(join(root, '启动工作台.command')))
})
