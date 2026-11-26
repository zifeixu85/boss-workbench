// 同时跑好几条命令（总助写报告时连着跑 pa-report-template、pa-week，定时任务和老板同时在用）不能报 database is locked：
// 打开数据库时先设好等多久（busy_timeout），再切 WAL。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-lock-'))
const env = { ...process.env, WORKBENCH_ROOT: dir, WORKBENCH_DB: join(dir, 'wb.db'), DEMO_TODAY: 'off' }
const DB = new URL('../db.ts', import.meta.url).href
const script = `const { run, nowIso } = await import(${JSON.stringify(DB)}); for (let i = 0; i < 20; i++) run("INSERT INTO settings (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v", { k: 'lock-test-' + process.pid + '-' + i, v: nowIso() }); console.log('ok')`

test('八条命令同时开数据库、同时写：都成功，不报 database is locked', async () => {
  assert.equal(spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).status, 0, '先建好数据库')
  const runs = Array.from({ length: 8 }, () => new Promise<{ code: number | null; out: string }>((done) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', script], { env })
    let out = ''
    c.stdout.on('data', (b) => { out += b }); c.stderr.on('data', (b) => { out += b })
    c.on('close', (code) => done({ code, out }))
  }))
  for (const r of await Promise.all(runs)) assert.equal(r.code, 0, r.out)
})
