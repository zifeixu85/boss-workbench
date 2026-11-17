// 接进 Codex（scripts/codex-plugin.mjs）的测试：临时文件夹里一个最小的“程序”，一个假的 codex（把收到的命令记下来、
// 用几个小文件装作“加了市场 / 装了插件”），CODEX_HOME 也指到临时文件夹。不碰这台电脑真的 Codex。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { MARKETPLACE, OUT_DIR, PLUGIN, SERVER, buildPlugin, installPlugin, marketplaceRoot, pluginCodexCandidates, pluginFiles, pluginStatus, makeContext, uninstallPlugin } from './codex-plugin.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const tmp = realpathSync(mkdtempSync(join(os.tmpdir(), 'wb-codex-plugin-'))) // Mac 的临时文件夹是个链接，先换成真实路径再比
const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text) }
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const onlyUnix = process.platform === 'win32' && '假的 codex 是 bash 脚本，Windows 上不跑'

/** 一个最小的程序：路径里带中文和空格（老板的知识库常常这样） */
function makeApp(name) {
  const root = join(tmp, name, '我的 知识库')
  const app = join(root, '工作台', '程序')
  put(join(app, 'package.json'), JSON.stringify({ name: 'boss-workbench', version: '0.3.0' }))
  put(join(app, 'server', 'assistant', 'mcp.ts'), '// 假的\n')
  cpSync(join(HERE, 'codex-plugin-skill.md'), join(app, 'scripts', 'codex-plugin-skill.md'))
  return { app, root }
}

/** 假的 codex：命令记进 log；state/ 里的 market、plugin 两个文件装作“加了市场”“装了插件” */
function fakeCodex(name, { old = false, slowList = 0 } = {}) {
  const dir = join(tmp, name)
  const state = join(dir, 'state')
  mkdirSync(state, { recursive: true })
  const bin = join(dir, 'codex')
  const log = join(dir, 'codex.log')
  writeFileSync(bin, `#!/bin/bash
echo "$@" >> "${log}"
${old ? 'echo "error: unrecognized subcommand \'plugin\'" >&2; exit 2' : ''}
case "$1 $2 $3" in
  "plugin marketplace list") echo "MARKETPLACE     ROOT"; [ -f "${state}/market" ] && echo "${MARKETPLACE}  $(/bin/cat "${state}/market")"; exit 0 ;;
  "plugin marketplace add") [ -f "$4/.agents/plugins/marketplace.json" ] || { echo "not a marketplace" >&2; exit 1; }; echo "$4" > "${state}/market"; exit 0 ;;
  "plugin marketplace remove") /bin/rm -f "${state}/market"; exit 0 ;;
  "plugin add ${PLUGIN}@${MARKETPLACE}") [ -f "${state}/market" ] || exit 1; /usr/bin/touch "${state}/plugin"; exit 0 ;;
  "plugin remove ${PLUGIN}@${MARKETPLACE}") [ -f "${state}/plugin" ] || exit 1; /bin/rm -f "${state}/plugin"; exit 0 ;;
  "plugin list --json") [ "$4" = "" ] && { /bin/sleep ${slowList}; }; if [ -f "${state}/plugin" ]; then echo '{"installed":[{"pluginId":"${PLUGIN}@${MARKETPLACE}","name":"${PLUGIN}","marketplaceName":"${MARKETPLACE}","installed":true,"enabled":true}],"available":[]}'; else echo '{"installed":[],"available":[]}'; fi; exit 0 ;;
esac
exit 1
`)
  chmodSync(bin, 0o755)
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [])
  return { bin, state, calls }
}

/** 测试用的上下文：只认假的 codex，不去找这台电脑上真的那个 */
const ctxOf = (a, codex, extra = {}) => {
  const said = []
  return { said, o: { app: a.app, env: { PATH: '/usr/bin:/bin', HOME: join(tmp, 'home'), CODEX_HOME: join(tmp, 'codex-home') }, candidates: codex ? [codex.bin] : [], say: (x) => said.push(x), ...extra } }
}

test('生成插件目录：市场清单、插件清单、工具配置（绝对路径）、短技能；格式和 Codex 认的一致', () => {
  const a = makeApp('build')
  const r = buildPlugin({ app: a.app, env: {} })
  const dir = join(a.app, OUT_DIR)
  assert.equal(r.dir, dir)
  assert.equal(r.changed.length, 5)

  const market = readJson(join(dir, '.agents', 'plugins', 'marketplace.json'))
  assert.equal(market.name, MARKETPLACE)
  assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [[PLUGIN, { source: 'local', path: `./plugins/${PLUGIN}` }]])

  const base = join(dir, 'plugins', PLUGIN)
  const plugin = readJson(join(base, '.codex-plugin', 'plugin.json'))
  assert.equal(plugin.name, PLUGIN)
  assert.equal(plugin.version, r.version)
  assert.match(plugin.version, /^0\.3\.0\+codex\.[0-9a-f]{10}$/)
  assert.equal(plugin.skills, './skills/')
  assert.equal(plugin.mcpServers, './.mcp.json')
  for (const k of ['displayName', 'shortDescription', 'longDescription', 'capabilities', 'defaultPrompt', 'brandColor']) assert.ok(plugin.interface[k], k)
  assert.deepEqual(plugin.interface.capabilities, ['Read', 'Write'])

  const server = readJson(join(base, '.mcp.json')).mcpServers[SERVER]
  assert.equal(server.command, process.execPath, 'node 写绝对路径')
  assert.deepEqual(server.args, [join(a.app, 'server', 'assistant', 'mcp.ts')])
  assert.deepEqual(server.env, { WORKBENCH_ROOT: a.root, WORKBENCH_DB: join(a.root, '工作台', '数据', 'workbench.db'), PORT: '4517' })

  const skill = readFileSync(join(base, 'skills', 'workbench', 'SKILL.md'), 'utf8')
  assert.match(skill, /^---\nname: workbench\ndescription: .+\n---\n/)
  assert.ok(!/\{\{/.test(skill), '占位都填上了')
  assert.ok(skill.includes(`"${join(a.app, 'scripts', 'codex-plugin.mjs')}" install`), '技能里给的是重新接一次的完整命令')
  for (const must of ['workbench_capabilities', 'workbench_open', 'open_in_codex', 'yes=false', '确认', '更新进展']) assert.ok(skill.includes(must), must)
  for (const never of ['新手', '记一笔']) assert.ok(!skill.includes(never), `技能里不写“${never}”`)
  assert.ok(existsSync(join(base, 'skills', 'workbench', 'agents', 'openai.yaml')))
})

test('内容没变不重写、版本不变；换了端口版本跟着变（Codex 才会重新缓存）；以后不带参数也记得上次的端口和位置', () => {
  const a = makeApp('stable')
  const first = buildPlugin({ app: a.app, env: {} })
  const again = buildPlugin({ app: a.app, env: {} })
  assert.deepEqual(again.changed, [])
  assert.equal(again.version, first.version)

  const moved = buildPlugin({ app: a.app, env: { WORKBENCH_ROOT: join(tmp, '别处 的库'), WORKBENCH_DB: join(tmp, '库外', 'workbench.db') }, port: 4527 })
  assert.notEqual(moved.version, first.version)
  assert.deepEqual(moved.changed.sort(), [`plugins/${PLUGIN}/.codex-plugin/plugin.json`, `plugins/${PLUGIN}/.mcp.json`])
  const ctx = makeContext({ app: a.app, env: {} })
  assert.deepEqual([ctx.root, ctx.db, ctx.port], [join(tmp, '别处 的库'), join(tmp, '库外', 'workbench.db'), 4527])
  assert.deepEqual(buildPlugin({ app: a.app, env: {} }).changed, [])
})

test('工作台文件夹挪了地方：重新生成时不沿用旧位置（插件目录是跟着一起挪过来的），端口还记得', () => {
  const a = makeApp('before-move')
  buildPlugin({ app: a.app, env: {}, port: 4527 })
  const movedRoot = join(tmp, 'after-move', '搬到 这里')
  cpSync(a.root, movedRoot, { recursive: true })
  const app = join(movedRoot, '工作台', '程序')
  const ctx = makeContext({ app, env: {} })
  assert.deepEqual([ctx.root, ctx.db, ctx.port], [movedRoot, join(movedRoot, '工作台', '数据', 'workbench.db'), 4527])
  const r = buildPlugin({ app, env: {} })
  assert.ok(r.changed.includes(`plugins/${PLUGIN}/.mcp.json`))
  const server = readJson(join(app, OUT_DIR, 'plugins', PLUGIN, '.mcp.json')).mcpServers[SERVER]
  assert.deepEqual(server.args, [join(app, 'server', 'assistant', 'mcp.ts')])
  assert.equal(server.env.WORKBENCH_ROOT, movedRoot)
})

test('Node 太旧、文件夹不是工作台、端口写错：说清楚，不生成', () => {
  const a = makeApp('bad')
  assert.throws(() => buildPlugin({ app: a.app, env: {}, nodeVersion: '20.11.0' }), /Node 版本太旧（现在 20\.11\.0/)
  assert.throws(() => buildPlugin({ app: join(tmp, '不是程序'), env: {} }), /不像工作台的程序/)
  assert.throws(() => buildPlugin({ app: a.app, env: {}, port: 'abc' }), /端口要写 1 到 65535/)
  assert.ok(!existsSync(join(a.app, OUT_DIR)))
  put(join(a.app, 'scripts', 'codex-plugin-skill.md'), '---\nname: workbench\n---\n{{没填的}}\n')
  assert.throws(() => pluginFiles(makeContext({ app: a.app, env: {} })), /还有没填的占位：\{\{没填的\}\}/)
})

test('找 Codex：环境变量指定的最先，桌面版自带的排在 PATH 里的前面；市场清单里的文件夹带空格也读得对', () => {
  const env = { WORKBENCH_CODEX_BIN: '/指定/codex', PATH: '/usr/local/bin' }
  const list = pluginCodexCandidates(env)
  assert.equal(list[0], '/指定/codex')
  const bundled = list.findIndex((p) => /codex-cli[\\/]bin/.test(p))
  const fromPath = list.findIndex((p) => p.includes('local') && !/codex-cli/.test(p))
  assert.ok(bundled > 0 && fromPath > bundled, list.join('\n'))
  assert.equal(marketplaceRoot(`MARKETPLACE     ROOT\nother  /x/y\n${MARKETPLACE}  /Users/林总/我的 知识库/工作台/程序/${OUT_DIR}\n`), `/Users/林总/我的 知识库/工作台/程序/${OUT_DIR}`)
  assert.equal(marketplaceRoot('No plugin marketplaces in scope.'), null)
})

test('一句话装上：生成目录 → 加本地市场 → 装插件；再跑一次是重新接；状态和卸载', { skip: onlyUnix }, async () => {
  const a = makeApp('install')
  const codex = fakeCodex('codex-ok')
  const { o, said } = ctxOf(a, codex)
  const dir = join(a.app, OUT_DIR)

  const before = await pluginStatus(o)
  assert.deepEqual([before.generated, before.installed], [false, false])
  assert.match(before.problems.join('\n'), /还没生成插件目录/)

  const n0 = codex.calls().length
  const r = installPlugin(o)
  assert.equal(r.codex, codex.bin)
  assert.equal(r.replaced, null)
  assert.deepEqual(codex.calls().slice(n0), ['plugin marketplace list', `plugin marketplace add ${dir}`, `plugin add ${PLUGIN}@${MARKETPLACE}`, `plugin list --json --marketplace ${MARKETPLACE}`])
  assert.match(said.join('\n'), /接好了：老板工作台插件 0\.3\.0\+codex\.[\s\S]*关掉重开一次/)

  const st = await pluginStatus(o)
  assert.deepEqual([st.generated, st.fresh, st.node_ok, st.points_here, st.installed, st.enabled, st.problems], [true, true, true, true, true, true, []])

  const n = codex.calls().length
  installPlugin(o) // 再跑一次：先拿掉旧的再加
  assert.deepEqual(codex.calls().slice(n), ['plugin marketplace list', `plugin remove ${PLUGIN}@${MARKETPLACE}`, `plugin marketplace remove ${MARKETPLACE}`, `plugin marketplace add ${dir}`, `plugin add ${PLUGIN}@${MARKETPLACE}`, `plugin list --json --marketplace ${MARKETPLACE}`])

  buildPlugin({ ...o, port: 4527 }) // 端口变了以后，记在别处的还是旧的：status 要说出来
  put(join(dir, 'plugins', PLUGIN, 'skills', 'workbench', 'SKILL.md'), '旧的\n')
  assert.match((await pluginStatus(o)).problems.join('\n'), /插件目录还是旧的：重新运行/)

  assert.deepEqual(uninstallPlugin(o), { removed: true })
  assert.ok(!existsSync(join(codex.state, 'market')) && !existsSync(join(codex.state, 'plugin')))
  assert.ok(existsSync(dir), '插件目录留着，以后再接不用重新生成')
  assert.equal((await pluginStatus(o)).installed, false)
  assert.deepEqual(uninstallPlugin(o), { removed: false })
  assert.match(said.at(-1), /本来就没接/)
})

test('回查只问本地这一个市场：不带 --marketplace 的清单要先同步远程目录，新环境里第一次要一分多钟', { skip: onlyUnix }, () => {
  const a = makeApp('fast')
  const codex = fakeCodex('codex-slow', { slowList: 30 }) // 不带 --marketplace 就睡 30 秒：用到了这个测试会明显变慢
  const t0 = Date.now()
  installPlugin(ctxOf(a, codex).o)
  assert.ok(Date.now() - t0 < 10000, '安装没有去等远程目录')
  assert.ok(!codex.calls().includes('plugin list --json'))
})

test('Codex 里原来接的是另一个工作台：说一声，换成这一个', { skip: onlyUnix }, async () => {
  const a = makeApp('switch-a')
  const b = makeApp('switch-b')
  const codex = fakeCodex('codex-switch')
  installPlugin(ctxOf(a, codex).o)
  const other = await pluginStatus(ctxOf(b, codex).o)
  assert.equal(other.installed, false)
  assert.match(other.problems.join('\n'), /Codex 里接的是另一个工作台/)
  const { o, said } = ctxOf(b, codex)
  const r = installPlugin(o)
  assert.equal(r.replaced, join(a.app, OUT_DIR))
  assert.match(said.join('\n'), /原来接的是另一个工作台/)
  assert.equal(readFileSync(join(codex.state, 'market'), 'utf8').trim(), join(b.app, OUT_DIR))
})

test('没有 Codex、Codex 太旧不认 plugin 命令：插件目录照样生成，告诉老板怎么办', { skip: onlyUnix }, async () => {
  const a = makeApp('nocodex')
  assert.throws(() => installPlugin(ctxOf(a, null).o), /没找到 Codex。装好 Codex 桌面版并登录，再说一次“把工作台接进 Codex”/)
  assert.ok(existsSync(join(a.app, OUT_DIR, 'plugins', PLUGIN, '.mcp.json')))
  const old = fakeCodex('codex-old', { old: true })
  assert.throws(() => installPlugin(ctxOf(a, old).o), /版本太旧，还不能装插件[\s\S]*更新到最新/)
  assert.match((await pluginStatus(ctxOf(a, old).o)).problems.join('\n'), /版本太旧/)
})

test('从命令行跑一遍：WORKBENCH_CODEX_BIN 指向假的 codex，CODEX_HOME 是临时文件夹', { skip: onlyUnix }, () => {
  const a = makeApp('cli')
  for (const f of ['codex-plugin.mjs', 'codex-check.mjs', 'is-main.mjs']) cpSync(join(HERE, f), join(a.app, 'scripts', f))
  const codex = fakeCodex('codex-cli')
  const env = { PATH: `/usr/bin:/bin:${dirname(process.execPath)}`, HOME: join(tmp, 'home'), CODEX_HOME: join(tmp, 'codex-home'), WORKBENCH_CODEX_BIN: codex.bin }
  const run = (...args) => spawnSync(process.execPath, [join(a.app, 'scripts', 'codex-plugin.mjs'), ...args], { env, encoding: 'utf8', cwd: tmp })
  const st0 = run('status')
  assert.equal(st0.status, 1)
  assert.match(st0.stdout, /✗ 插件目录：还没生成/)
  const inst = run('--port', '4527', 'install') // 选项写在命令前面也认
  assert.equal(inst.status, 0, inst.stdout + inst.stderr)
  assert.match(inst.stdout, /接好了/)
  assert.equal(readJson(join(a.app, OUT_DIR, 'plugins', PLUGIN, '.mcp.json')).mcpServers[SERVER].env.PORT, '4527')
  const st = JSON.parse(run('status', '--json').stdout)
  assert.deepEqual([st.installed, st.enabled, st.port, st.running], [true, true, 4527, false])
  assert.equal(run('uninstall').status, 0)
  assert.equal(run('nope').status, 2)
  const bad = run('install', '--port', '99999')
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /没办成：端口要写/)
})
