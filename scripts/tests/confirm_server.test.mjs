// 确认页服务（scripts/confirm_ui/server.mjs）的测试。在仓库根目录（boss-workbench 文件夹）运行：node --test scripts/tests/confirm_server.test.mjs
// 每个用例在临时文件夹里起一次确认页（--daemon --no-open，不开浏览器），用完 --shutdown 关掉，不留进程。
// 安装 Skill 时不带 tests/。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const UI = join(HERE, '..', 'confirm_ui')
const SERVER = join(UI, 'server.mjs')
const run = (...args) => spawnSync(process.execPath, [SERVER, ...args], { encoding: 'utf8', timeout: 20_000 })

// 浏览器（Chrome、Edge、Safari、Firefox）一律拒绝打开的端口（1024 以上的那些），开在这上面老板根本看不到页面
const BROWSER_BLOCKED = [1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]

function workDir() {
  const dir = mkdtempSync(join(tmpdir(), 'boss-workbench-confirm-'))
  copyFileSync(join(UI, 'example', 'recommendations.json'), join(dir, 'recommendations.json'))
  return dir
}

const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
function waitGone(pid) {
  const until = Date.now() + 5000
  while (alive(pid) && Date.now() < until) spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 100)'])
  return !alive(pid)
}

/** 起一次确认页，返回它实际用的端口；不管成败最后都关掉，并等进程真的退出 */
function startAndStop(extra) {
  const dir = workDir()
  let pid = null
  try {
    const r = run(dir, '--daemon', '--no-open', ...extra)
    assert.equal(r.status, 0, r.stderr || r.stdout)
    pid = JSON.parse(readFileSync(join(dir, '.confirm_ui.lock'), 'utf8')).pid
    const m = r.stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//)
    assert.ok(m, `没打印网址：${r.stdout}`)
    return Number(m[1])
  } finally {
    run(dir, '--shutdown')
    assert.ok(!existsSync(join(dir, '.confirm_ui.lock')), '关掉以后不该留下锁文件')
    if (pid) assert.ok(waitGone(pid), `确认页进程 ${pid} 关不掉`)
  }
}

test('确认页不开在浏览器拒绝的端口上（5060、5061 这类）：跳到下一个能打开的', () => {
  for (const p of [5060, 6665]) {
    const port = startAndStop(['--port', String(p)])
    assert.ok(!BROWSER_BLOCKED.includes(port), `从 ${p} 起，结果开在了浏览器打不开的 ${port}`)
    assert.ok(port > p && port < p + 25, `从 ${p} 起，应该就近往后找，结果是 ${port}`)
  }
})

test('不写 --port 时，默认端口浏览器能打开', () => {
  const port = startAndStop([])
  assert.ok(!BROWSER_BLOCKED.includes(port), `默认开在了浏览器打不开的 ${port}`)
})
