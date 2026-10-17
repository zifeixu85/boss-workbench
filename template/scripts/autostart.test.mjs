// 开机自启的测试：全部在临时文件夹里做，HOME 换成临时的，launchctl、schtasks 换成只记录参数的假程序，
// 绝不碰这台电脑真的登录项和任务计划。运行：npm test（或 node --test scripts/autostart.test.mjs）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { autostart, batText, plistXml, taskXml, vbsText, winFiles } from './autostart.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const tmp = () => mkdtempSync(join(os.tmpdir(), 'wb-autostart-'))

/** 临时的“知识库/工作台/程序”和 HOME */
function sandbox() {
  const base = tmp()
  const home = join(base, 'home')
  const app = join(base, 'kb', '工作台', '程序')
  mkdirSync(home, { recursive: true })
  mkdirSync(app, { recursive: true })
  return { base, home, app, root: join(base, 'kb') }
}

/** 假的命令：记下调用参数，launchctl print 按“装没装”回答 */
function fakeRun(state = { loaded: false }) {
  const calls = []
  const run = (cmd, args) => {
    calls.push([cmd, ...args])
    if (cmd === 'launchctl' && args[0] === 'print') return state.loaded ? { status: 0, out: 'state = running\n\tpid = 4242', err: '' } : { status: 113, out: '', err: 'Could not find service' }
    if (cmd === 'launchctl' && args[0] === 'bootstrap') { state.loaded = true; return { status: 0, out: '', err: '' } }
    if (cmd === 'launchctl' && args[0] === 'bootout') { const was = state.loaded; state.loaded = false; return { status: was ? 0 : 3, out: '', err: was ? '' : 'No such process' } }
    if (cmd === 'schtasks' && args[0] === '/Query') return { status: state.task ? 0 : 1, out: '', err: '' }
    if (cmd === 'schtasks' && args[0] === '/Create') { if (state.denied) return { status: 1, out: '', err: '错误: 拒绝访问。' }; state.task = true; return { status: 0, out: '成功', err: '' } }
    if (cmd === 'schtasks' && args[0] === '/Delete') { state.task = false; return { status: 0, out: '', err: '' } }
    return { status: 0, out: '', err: '' }
  }
  return { calls, run, state }
}

test('Mac：on 写 plist、bootstrap 到 gui/<uid>；status 说在运行；off bootout 并删掉 plist', async () => {
  const sb = sandbox()
  const f = fakeRun()
  const out = []
  const ctx = { platform: 'darwin', home: sb.home, uid: 501, app: sb.app, root: sb.root, port: 4517, node: '/opt/homebrew/bin/node', env: { PATH: '/usr/bin:/bin' }, run: f.run, isRunning: async () => false, say: (x) => out.push(x), name: 'abc' }
  assert.equal(await autostart('on', ctx), 0)
  const plist = join(sb.home, 'Library', 'LaunchAgents', 'com.boss-workbench.abc.plist')
  assert.ok(existsSync(plist), '写了 plist')
  const xml = readFileSync(plist, 'utf8')
  assert.match(xml, /<key>Label<\/key><string>com\.boss-workbench\.abc<\/string>/)
  assert.match(xml, /<string>\/opt\/homebrew\/bin\/node<\/string><string>server\/index\.ts<\/string>/)
  assert.ok(xml.includes(`<key>WorkingDirectory</key><string>${sb.app}</string>`))
  assert.match(xml, /<key>PORT<\/key><string>4517<\/string>/)
  assert.match(xml, /<key>SuccessfulExit<\/key><false\/>/)
  assert.ok(xml.includes(join(sb.app, '日志', '服务.log')))
  assert.ok(existsSync(join(sb.app, '日志')), '建好了日志文件夹')
  assert.deepEqual(f.calls.filter((c) => c[1] === 'bootstrap'), [['launchctl', 'bootstrap', 'gui/501', plist]])
  assert.ok(existsSync(join(sb.root, '工作台', '关掉开机自启.command')), '放了双击关掉的文件')

  out.length = 0
  assert.equal(await autostart('status', ctx), 0)
  assert.match(out.join('\n'), /开机自启：开着（Mac 登录项 com\.boss-workbench\.abc）/)
  assert.match(out.join('\n'), /在运行（进程号 4242）/)
  assert.match(out.join('\n'), /日志：.*服务\.log/)

  assert.equal(await autostart('off', { ...ctx, name: undefined }), 0)
  assert.ok(!existsSync(plist), 'plist 删掉了')
  assert.deepEqual(f.calls.at(-1), ['launchctl', 'bootout', 'gui/501/com.boss-workbench.abc'])
  out.length = 0
  await autostart('status', ctx)
  assert.match(out.join('\n'), /开机自启：关着/)
})

test('Mac：已经有一个工作台开着时只写 plist，不再 bootstrap 一个（免得端口打架）', async () => {
  const sb = sandbox()
  const f = fakeRun()
  const out = []
  const code = await autostart('on', { platform: 'darwin', home: sb.home, uid: 501, app: sb.app, root: sb.root, port: 4517, node: '/usr/local/bin/node', env: {}, run: f.run, isRunning: async () => true, say: (x) => out.push(x) })
  assert.equal(code, 0)
  assert.equal(f.calls.filter((c) => c[1] === 'bootstrap').length, 0)
  assert.match(out.join('\n'), /下次登录电脑会自动启动/)
  // 没给 --name：知识库文件夹名是 kb
  assert.ok(existsSync(join(sb.home, 'Library', 'LaunchAgents', 'com.boss-workbench.kb.plist')))
})

test('Mac：程序在知识库外时 plist 带上 WORKBENCH_ROOT、WORKBENCH_DB；路径里的 & 转义', () => {
  const xml = plistXml({ app: '/x/A&B/程序', port: 4527, node: '/n', env: { PATH: '/p', WORKBENCH_ROOT: '/云盘/库', WORKBENCH_DB: '/x/数据/workbench.db' } }, 'com.boss-workbench.t')
  assert.match(xml, /<key>WORKBENCH_ROOT<\/key><string>\/云盘\/库<\/string>/)
  assert.match(xml, /<key>WORKBENCH_DB<\/key><string>\/x\/数据\/workbench\.db<\/string>/)
  assert.ok(xml.includes('/x/A&amp;B/程序'))
})

test('短名只能用英文字母、数字和连字符', async () => {
  const sb = sandbox()
  await assert.rejects(() => autostart('on', { platform: 'darwin', home: sb.home, app: sb.app, root: sb.root, port: 1, node: 'n', env: {}, run: fakeRun().run, isRunning: async () => false, say: () => {}, name: '茶社' }), /英文字母/)
})

test('Windows：bat 是 UTF-8 不带 BOM、第二行 chcp 65001；vbs 是 UTF-16；任务计划登录时运行 vbs', async () => {
  const sb = sandbox()
  const f = fakeRun()
  const started = []
  const out = []
  const ctx = { platform: 'win32', home: sb.home, app: sb.app, root: sb.root, port: 4517, node: 'C:\\Program Files\\nodejs\\node.exe', env: { APPDATA: join(sb.home, 'AppData'), WORKBENCH_DB: 'D:\\老板工作台\\数据\\workbench.db' }, run: f.run, isRunning: async () => false, startDetached: (c, a) => started.push([c, ...a]), say: (x) => out.push(x) }
  assert.equal(await autostart('on', ctx), 0)
  const w = winFiles(ctx)
  const bat = readFileSync(w.bat)
  assert.notEqual(bat[0], 0xef, 'bat 不带 BOM')
  const lines = bat.toString('utf8').split('\r\n')
  assert.equal(lines[0], '@echo off')
  assert.equal(lines[1], 'chcp 65001 >nul')
  assert.ok(lines.includes('set PORT=4517'))
  assert.ok(lines.includes('set "WORKBENCH_DB=D:\\老板工作台\\数据\\workbench.db"'))
  assert.ok(lines.some((l) => l.startsWith('"C:\\Program Files\\nodejs\\node.exe" server\\index.ts >> 日志\\服务.log')))
  const vbs = readFileSync(w.vbs)
  assert.deepEqual([...vbs.subarray(0, 2)], [0xff, 0xfe], 'vbs 是 UTF-16（带 BOM）')
  assert.ok(vbs.toString('utf16le').includes('.Run """'))
  const create = f.calls.find((c) => c[0] === 'schtasks')
  assert.deepEqual(create.slice(0, 5), ['schtasks', '/Create', '/TN', '老板工作台', '/XML'])
  assert.equal(create.at(-1), '/F')
  assert.ok(!existsSync(create[5]), '建完把 XML 删了')
  const x = taskXml({ ...ctx, env: { ...ctx.env, USERDOMAIN: 'PC', USERNAME: '林总' } })
  assert.match(x, /<LogonTrigger><Enabled>true<\/Enabled><UserId>PC\\林总<\/UserId><\/LogonTrigger>/, '只在这个用户登录时')
  assert.match(x, /<DisallowStartIfOnBatteries>false</, '用电池也启动')
  assert.match(x, /<StopIfGoingOnBatteries>false</, '切到电池不停')
  assert.match(x, /<ExecutionTimeLimit>PT0S</, '不限运行时长')
  assert.match(x, /<Command>wscript\.exe<\/Command><Arguments>&quot;.*启动工作台\.vbs&quot;<\/Arguments>/, '任务运行的是 启动工作台.vbs（装环境的清空认这个名字）')
  assert.deepEqual(started, [['wscript.exe', w.vbs]], '马上在后台启动了一个')
  assert.ok(existsSync(join(sb.root, '工作台', '关掉开机自启.bat')))

  f.state.task = true
  out.length = 0
  await autostart('status', ctx)
  assert.match(out.join('\n'), /开机自启：开着（任务计划“老板工作台”/)
  await autostart('off', ctx)
  assert.deepEqual(f.calls.find((c) => c[1] === '/Delete'), ['schtasks', '/Delete', '/TN', '老板工作台', '/F'])
  assert.ok(!existsSync(w.bat) && !existsSync(w.vbs))
})

test('Windows：建任务计划被拒（要管理员）时退回“启动”文件夹快捷方式', async () => {
  const sb = sandbox()
  const f = fakeRun({ denied: true })
  const out = []
  const ctx = { platform: 'win32', home: sb.home, app: sb.app, root: sb.root, port: 4517, node: 'node.exe', env: { APPDATA: join(sb.home, 'AppData'), SystemRoot: 'C:\\Windows' }, run: f.run, isRunning: async () => true, say: (x) => out.push(x) }
  assert.equal(await autostart('on', ctx), 0)
  const ps = f.calls.find((c) => c[0].endsWith('powershell.exe'))
  assert.ok(ps, '用 PowerShell 建快捷方式')
  assert.ok(ps.includes('-EncodedCommand'))
  assert.match(out.join('\n'), /“启动”文件夹里的快捷方式/)
})

test('vbs、bat 文本：路径里有引号也不会拼坏（Windows 路径本来不能有引号，直接去掉）', () => {
  const ctx = { app: 'C:\\a"b\\程序', port: 1, node: 'n', env: {} }
  assert.ok(!batText(ctx).includes('a"b'))
  assert.ok(!vbsText(ctx).includes('a"b'))
})

test('从 install.mjs 命令行跑一遍（假的 launchctl 放在 PATH 最前面，HOME 是临时文件夹）', { skip: process.platform !== 'darwin' && '只在 Mac 上跑' }, () => {
  const sb = sandbox()
  cpSync(join(HERE, 'install.mjs'), join(sb.app, 'scripts', 'install.mjs'))
  cpSync(join(HERE, 'autostart.mjs'), join(sb.app, 'scripts', 'autostart.mjs'))
  for (const f of ['shell-check.mjs', 'codex-check.mjs', 'is-main.mjs', 'module.mjs']) cpSync(join(HERE, f), join(sb.app, 'scripts', f)) // install.mjs 体检时要用
  const bin = join(sb.base, 'fakebin')
  const logFile = join(sb.base, 'launchctl.log')
  const mark = join(sb.base, 'loaded')
  mkdirSync(bin)
  writeFileSync(join(bin, 'launchctl'), `#!/bin/bash
# PATH 里没有系统命令，用完整路径
echo "$@" >> "${logFile}"
case "$1" in
  print) [ -f "${mark}" ] && { echo "state = running"; echo "pid = 777"; exit 0; }; exit 113 ;;
  bootstrap) /usr/bin/touch "${mark}" ;;
  bootout) /bin/rm -f "${mark}" ;;
esac
exit 0
`)
  chmodSync(join(bin, 'launchctl'), 0o755)
  // PATH 里只有假的 launchctl 和 node 所在的文件夹：真的 /bin/launchctl 根本找不到
  const env = { HOME: sb.home, PATH: `${bin}:${dirname(process.execPath)}`, PORT: '4599' }
  assert.notEqual(env.HOME, os.homedir())
  const node = (...a) => spawnSync(process.execPath, [join(sb.app, 'scripts', 'install.mjs'), ...a], { env, encoding: 'utf8' })
  const on = node('--autostart', 'on', '--name', 'abc')
  assert.equal(on.status, 0, on.stdout + on.stderr)
  const uid = process.getuid()
  const plist = join(sb.home, 'Library', 'LaunchAgents', 'com.boss-workbench.abc.plist')
  assert.ok(existsSync(plist))
  const st = node('--autostart', 'status')
  assert.match(st.stdout, /开机自启：开着/)
  assert.match(st.stdout, /进程号 777/)
  const off = node('--autostart', 'off')
  assert.equal(off.status, 0)
  assert.ok(!existsSync(plist))
  const calls = readFileSync(logFile, 'utf8').trim().split('\n')
  assert.ok(calls.includes(`bootstrap gui/${uid} ${plist}`), calls.join('\n'))
  assert.ok(calls.includes(`bootout gui/${uid}/com.boss-workbench.abc`), calls.join('\n'))
  const bad = node('--autostart', 'maybe')
  assert.equal(bad.status, 1)
})
