// 开机自启（登录后自动开工作台，页面关着也能按时提醒）。由 install.mjs 调用：
//
//   node scripts/install.mjs --autostart on  [--name 短名]   打开（马上在后台启动一个，以后每次登录自动开）
//   node scripts/install.mjs --autostart off                 关掉（后台服务也一起停）
//   node scripts/install.mjs --autostart status              现在是开是关、在不在运行、日志在哪
//
// Mac：写 ~/Library/LaunchAgents/com.boss-workbench.<短名>.plist，用 launchctl bootstrap / bootout（gui/<用户号>）加载、卸下。
//      KeepAlive 只在出错退出时重启（端口被占时工作台正常退出，不会反复重启）。日志在 <程序>/日志/。
// Windows：程序文件夹里生成 启动工作台.bat（UTF-8，第二行 chcp 65001）和 启动工作台.vbs（UTF-16，隐藏窗口运行 bat），
//      用 schtasks /XML 建任务计划“老板工作台”（当前用户登录时运行 vbs；用电池也启动、不限运行时长）；
//      建不了（有的电脑要管理员）就在“启动”文件夹放快捷方式。
// 课程包的装环境工具“清空课程环境”认的就是这几样：Label 以 com.boss-workbench. 开头的 plist、任务“老板工作台”、
// 启动文件夹里指向“启动工作台”的快捷方式。
//
// 测试：HOME 指到临时文件夹、PATH 里放一个假的 launchctl，就不会碰这台电脑真的登录项（见 scripts/autostart.test.mjs）。
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import os from 'node:os'

export const TASK = '老板工作台'
export const LABEL_PREFIX = 'com.boss-workbench.'
export const LOG_DIR = '日志'

const realRun = (cmd, args, extra = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...extra })
  return { status: r.status ?? (r.error ? -1 : 0), out: `${r.stdout ?? ''}`.trim(), err: `${r.stderr ?? ''}${r.error ? r.error.message : ''}`.trim() }
}

/** 补齐默认值。测试时传 platform、home、run 等换掉 */
export function makeContext(o) {
  const env = o.env ?? process.env
  return {
    platform: process.platform, home: os.homedir(), uid: typeof process.getuid === 'function' ? process.getuid() : 0,
    node: process.execPath, run: realRun, startDetached: null, isRunning: null, say: console.log,
    ...o, env,
  }
}

/** 同步等一会儿（launchctl 重试用） */
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 短名：--name 给的；没给就用知识库文件夹名里的英文字母和数字；再没有用 wb-<端口> */
export function shortName(ctx) {
  if (ctx.name) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(ctx.name)) throw new Error(`--name 只能用英文字母、数字和连字符（现在是“${ctx.name}”）`)
    return ctx.name.toLowerCase()
  }
  const ascii = basename(ctx.root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
  return ascii.length >= 2 ? ascii : `wb-${ctx.port}`
}

const logPaths = (ctx) => ({ dir: join(ctx.app, LOG_DIR), out: join(ctx.app, LOG_DIR, '服务.log'), err: join(ctx.app, LOG_DIR, '服务-错误.log') })

/** 工作台在不在运行：问一下本机这个端口 */
async function workbenchUp(ctx) {
  if (ctx.isRunning) return ctx.isRunning()
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 1500)
    const res = await fetch(`http://127.0.0.1:${ctx.port}/api/settings`, { signal: ctl.signal })
    clearTimeout(t)
    return res.ok
  } catch { return false }
}

// ───────────── Mac ─────────────

const agentsDir = (ctx) => join(ctx.home, 'Library', 'LaunchAgents')

export function plistXml(ctx, label) {
  const logs = logPaths(ctx)
  const env = { PORT: String(ctx.port), PATH: ctx.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin' }
  // 程序放在知识库外面时（知识库在云盘里），开机自启也要带上这两个，和安装、命令行用的一样
  if (ctx.env.WORKBENCH_ROOT) env.WORKBENCH_ROOT = ctx.env.WORKBENCH_ROOT
  if (ctx.env.WORKBENCH_DB) env.WORKBENCH_DB = ctx.env.WORKBENCH_DB
  const kv = Object.entries(env).map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- 老板工作台：登录后自动启动（由 scripts/install.mjs --autostart on 生成；关掉用 --autostart off） -->
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(ctx.node)}</string><string>server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(ctx.app)}</string>
  <key>EnvironmentVariables</key><dict>
${kv}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(logs.out)}</string>
  <key>StandardErrorPath</key><string>${xml(logs.err)}</string>
</dict></plist>
`
}

const plistValue = (text, key) => text.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') ?? null

/** 这个程序文件夹的登录项：Label 以 com.boss-workbench. 开头、WorkingDirectory 是本程序 */
export function findMacAgents(ctx) {
  const dir = agentsDir(ctx)
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.plist')) continue
    let text = ''
    try { text = readFileSync(join(dir, f), 'utf8') } catch { continue }
    const label = plistValue(text, 'Label')
    if (!label?.startsWith(LABEL_PREFIX)) continue
    if (plistValue(text, 'WorkingDirectory') !== ctx.app) continue
    out.push({ file: join(dir, f), label })
  }
  return out
}

/** launchctl print gui/<uid>/<label>：登记了没有、在不在跑、进程号 */
function macState(ctx, label) {
  const r = ctx.run('launchctl', ['print', `gui/${ctx.uid}/${label}`])
  if (r.status !== 0) return { loaded: false, running: false, pid: null }
  const pid = r.out.match(/\bpid = (\d+)/)?.[1] ?? null
  return { loaded: true, running: /\bstate = running\b/.test(r.out) || !!pid, pid }
}

async function macOn(ctx) {
  const label = LABEL_PREFIX + shortName(ctx)
  const dir = agentsDir(ctx)
  const file = join(dir, `${label}.plist`)
  mkdirSync(dir, { recursive: true })
  mkdirSync(logPaths(ctx).dir, { recursive: true })
  // 以前用别的短名登记过同一个程序：先卸下、挪走，免得开机开两个
  for (const old of findMacAgents(ctx).filter((a) => a.label !== label)) {
    ctx.run('launchctl', ['bootout', `gui/${ctx.uid}/${old.label}`])
    rmSync(old.file, { force: true })
    ctx.say(`  已去掉旧的登录项 ${old.label}`)
  }
  writeFileSync(file, plistXml(ctx, label), { mode: 0o644 })
  const before = macState(ctx, label)
  if (!before.loaded && await workbenchUp(ctx)) {
    ctx.say(`✓ 已写好开机自启：${file}`)
    ctx.say(`  现在已经有一个工作台开着（端口 ${ctx.port}），这次先不在后台再开一个；下次登录电脑会自动启动。`)
    ctx.say('  想现在就换成后台服务：关掉现在开着的工作台（关掉“启动工作台”那个窗口），再运行一次 --autostart on。')
    return 0
  }
  if (before.loaded) ctx.run('launchctl', ['bootout', `gui/${ctx.uid}/${label}`])
  // bootout 是慢慢卸的，紧接着 bootstrap 常报“Bootstrap failed: 5”：隔半秒再试，最多 4 次
  let r = ctx.run('launchctl', ['bootstrap', `gui/${ctx.uid}`, file])
  for (let i = 0; i < 3 && r.status !== 0 && before.loaded; i++) {
    pause(600)
    r = ctx.run('launchctl', ['bootstrap', `gui/${ctx.uid}`, file])
  }
  if (r.status !== 0) {
    ctx.say(`✗ 开机自启没装上：launchctl 说“${r.err || r.out || `退出码 ${r.status}`}”`)
    ctx.say(`  配置文件已经写在 ${file}，下次登录也会生效；也可以重启电脑后再运行 --autostart status 看看。`)
    return 1
  }
  ctx.say(`✓ 开机自启已打开：${label}`)
  ctx.say(`  现在已经在后台启动，以后每次登录电脑自动开。网页：http://127.0.0.1:${ctx.port}`)
  ctx.say(`  日志：${logPaths(ctx).out}`)
  ctx.say('  第一次可能弹“node 想访问‘文稿’（或桌面、iCloud 云盘）里的文件”，点“好”。')
  return 0
}

function macOff(ctx) {
  const agents = findMacAgents(ctx)
  if (ctx.name) {
    const file = join(agentsDir(ctx), `${LABEL_PREFIX}${shortName(ctx)}.plist`)
    if (existsSync(file) && !agents.some((a) => a.file === file)) agents.push({ file, label: LABEL_PREFIX + shortName(ctx) })
  }
  if (!agents.length) { ctx.say('开机自启本来就没开（这个程序没有登记登录项）。'); return 0 }
  for (const a of agents) {
    ctx.run('launchctl', ['bootout', `gui/${ctx.uid}/${a.label}`]) // 没加载时会报错，不要紧
    rmSync(a.file, { force: true })
    ctx.say(`✓ 已关掉开机自启：${a.label}（后台服务也停了，下次登录不会再自动开）`)
  }
  ctx.say('  要用工作台时双击“启动工作台”，或运行 node server/index.ts；想再打开开机自启：--autostart on')
  return 0
}

async function macStatus(ctx) {
  const agents = findMacAgents(ctx)
  const up = await workbenchUp(ctx)
  const logs = logPaths(ctx)
  if (!agents.length) {
    ctx.say('开机自启：关着（这个程序没有登记登录项）')
  } else {
    for (const a of agents) {
      const st = macState(ctx, a.label)
      ctx.say(`开机自启：开着（Mac 登录项 ${a.label}）`)
      ctx.say(`  配置文件：${a.file}`)
      ctx.say(`  后台服务：${st.running ? `在运行${st.pid ? `（进程号 ${st.pid}）` : ''}` : st.loaded ? '登记了，但现在没在运行（看错误日志）' : '还没加载（下次登录自动开，或运行 --autostart on）'}`)
    }
  }
  ctx.say(`网页 http://127.0.0.1:${ctx.port}：${up ? '能打开' : '打不开（工作台没在运行）'}`)
  ctx.say(`日志：${logs.out}${existsSync(logs.out) ? '' : '（还没有）'}；出错的在 ${logs.err}`)
  ctx.say(agents.length ? '关掉：node scripts/install.mjs --autostart off，或双击工作台文件夹里的“关掉开机自启”' : '打开：node scripts/install.mjs --autostart on --name <英文短名>')
  return 0
}

// ───────────── Windows ─────────────

export const winFiles = (ctx) => ({ bat: join(ctx.app, '启动工作台.bat'), vbs: join(ctx.app, '启动工作台.vbs') })
const startupLnk = (ctx) => join(ctx.env.APPDATA || join(ctx.home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', `${TASK}.lnk`)
const winQuote = (s) => s.replace(/"/g, '')

/** 启动工作台.bat：UTF-8 不带 BOM，第二行 chcp 65001（路径里有中文时 cmd 才读得对），CRLF 换行 */
export function batText(ctx) {
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    'rem 老板工作台：开机自启用。由 scripts\\install.mjs --autostart on 生成，改了重新运行一次 --autostart on',
    `cd /d "${winQuote(ctx.app)}"`,
    `if not exist ${LOG_DIR} mkdir ${LOG_DIR}`,
    `set PORT=${ctx.port}`,
    ...(ctx.env.WORKBENCH_ROOT ? [`set "WORKBENCH_ROOT=${winQuote(ctx.env.WORKBENCH_ROOT)}"`] : []),
    ...(ctx.env.WORKBENCH_DB ? [`set "WORKBENCH_DB=${winQuote(ctx.env.WORKBENCH_DB)}"`] : []),
    `"${winQuote(ctx.node)}" server\\index.ts >> ${LOG_DIR}\\服务.log 2>&1`,
  ]
  return `${lines.join('\r\n')}\r\n`
}
/** 启动工作台.vbs：隐藏窗口运行 bat，不等它结束 */
export const vbsText = (ctx) => `' 老板工作台：开机自启用，隐藏窗口运行 启动工作台.bat\r\nCreateObject("WScript.Shell").Run """${winQuote(winFiles(ctx).bat)}""", 0, False\r\n`
/** 任务计划的 XML：登录时运行 vbs。不用 schtasks /SC ONLOGON 的默认设置，因为它“用电池时不启动、切到电池就停、
 *  运行超过 72 小时就结束”，笔记本上会开不起来；这里都关掉，同一时间只跑一个 */
export function taskXml(ctx) {
  const user = ctx.env.USERNAME ? (ctx.env.USERDOMAIN ? `${ctx.env.USERDOMAIN}\\${ctx.env.USERNAME}` : ctx.env.USERNAME) : ''
  const uid = user ? `<UserId>${xml(user)}</UserId>` : ''
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>老板工作台：登录后在后台启动（scripts\\install.mjs --autostart on 建的；关掉用 --autostart off）</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled>${uid}</LogonTrigger></Triggers>
  <Principals><Principal id="Author">${uid}<LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author"><Exec><Command>wscript.exe</Command><Arguments>&quot;${xml(winQuote(winFiles(ctx).vbs))}&quot;</Arguments><WorkingDirectory>${xml(winQuote(ctx.app))}</WorkingDirectory></Exec></Actions>
</Task>
`
}
/** schtasks 的参数：按上面的 XML 建“老板工作台” */
export const schtasksArgs = (xmlFile) => ['/Create', '/TN', TASK, '/XML', xmlFile, '/F']

const LNK_PS = String.raw`$s = New-Object -ComObject WScript.Shell
$l = $s.CreateShortcut($env:WB_LNK)
$l.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$l.Arguments = '"' + $env:WB_VBS + '"'
$l.WorkingDirectory = $env:WB_DIR
$l.Description = '老板工作台（开机自启）'
$l.Save()`
const encodePs = (script) => Buffer.from(script, 'utf16le').toString('base64')
const winPs = (ctx) => `${ctx.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`

function winState(ctx) {
  const task = ctx.run('schtasks', ['/Query', '/TN', TASK]).status === 0
  const lnk = existsSync(startupLnk(ctx))
  return { task, lnk }
}

/** 找监听这个端口的进程号（netstat -ano） */
function winPid(ctx) {
  const r = ctx.run('netstat', ['-ano', '-p', 'TCP'])
  for (const line of r.out.split(/\r?\n/)) {
    const m = line.trim().split(/\s+/)
    if (m.length >= 5 && m[1] === `127.0.0.1:${ctx.port}` && /LISTEN/i.test(m[3])) return m[4]
  }
  return null
}

async function winOn(ctx) {
  const f = winFiles(ctx)
  mkdirSync(logPaths(ctx).dir, { recursive: true })
  writeFileSync(f.bat, batText(ctx), 'utf8')
  writeFileSync(f.vbs, `\ufeff${vbsText(ctx)}`, 'utf16le')
  // XML 要存成 UTF-16（开头 encoding="UTF-16"），建完就删
  const xmlFile = join(logPaths(ctx).dir, '老板工作台-任务计划.xml')
  writeFileSync(xmlFile, `\ufeff${taskXml(ctx).replace(/\n/g, '\r\n')}`, 'utf16le')
  const r = ctx.run('schtasks', schtasksArgs(xmlFile))
  rmSync(xmlFile, { force: true })
  let how = ''
  if (r.status === 0) how = `任务计划“${TASK}”（登录时运行）`
  else {
    // 有的电脑建“登录时运行”的任务要管理员：退回“启动”文件夹里的快捷方式（装环境工具也认这个）
    const lnk = startupLnk(ctx)
    mkdirSync(dirname(lnk), { recursive: true })
    const p = ctx.run(winPs(ctx), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(LNK_PS)], { env: { ...ctx.env, WB_LNK: lnk, WB_VBS: f.vbs, WB_DIR: ctx.app } })
    if (p.status !== 0) {
      ctx.say(`✗ 开机自启没装上：任务计划说“${r.err || r.out}”，启动文件夹快捷方式也没建成（${p.err || p.out}）`)
      ctx.say(`  可以手动做：按 Win + R 输入 shell:startup，把 ${f.vbs} 的快捷方式放进去。`)
      return 1
    }
    how = `“启动”文件夹里的快捷方式 ${lnk}（任务计划建不了：${(r.err || r.out).split(/\r?\n/)[0]}）`
  }
  if (await workbenchUp(ctx)) {
    ctx.say(`✓ 开机自启已打开：${how}`)
    ctx.say(`  现在已经有一个工作台开着（端口 ${ctx.port}），这次不再开；下次登录自动在后台开（没有黑窗口）。`)
  } else {
    if (ctx.startDetached) ctx.startDetached('wscript.exe', [f.vbs])
    else spawn('wscript.exe', [f.vbs], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    ctx.say(`✓ 开机自启已打开：${how}`)
    ctx.say(`  现在已经在后台启动（没有黑窗口），以后每次登录自动开。网页：http://127.0.0.1:${ctx.port}`)
  }
  ctx.say(`  日志：${logPaths(ctx).out}`)
  return 0
}

async function winOff(ctx) {
  const st = winState(ctx)
  const f = winFiles(ctx)
  if (st.task) ctx.run('schtasks', ['/Delete', '/TN', TASK, '/F'])
  if (st.lnk) rmSync(startupLnk(ctx), { force: true })
  for (const p of [f.bat, f.vbs]) rmSync(p, { force: true })
  let stopped = ''
  if (await workbenchUp(ctx)) {
    const pid = winPid(ctx)
    if (pid && ctx.run('taskkill', ['/PID', pid, '/F']).status === 0) stopped = `，后台服务也停了（进程号 ${pid}）`
    else stopped = '。后台服务还开着：在任务管理器里结束“Node.js JavaScript Runtime”，或者重启电脑'
  }
  ctx.say(st.task || st.lnk ? `✓ 已关掉开机自启${stopped}；下次登录不会再自动开。` : `开机自启本来就没开${stopped}。`)
  return 0
}

async function winStatus(ctx) {
  const st = winState(ctx)
  const up = await workbenchUp(ctx)
  const logs = logPaths(ctx)
  ctx.say(st.task ? `开机自启：开着（任务计划“${TASK}”，登录时运行）` : st.lnk ? `开机自启：开着（“启动”文件夹里的快捷方式 ${startupLnk(ctx)}）` : '开机自启：关着')
  ctx.say(`网页 http://127.0.0.1:${ctx.port}：${up ? '能打开（后台服务在运行）' : '打不开（工作台没在运行）'}`)
  ctx.say(`日志：${logs.out}${existsSync(logs.out) ? '' : '（还没有）'}`)
  ctx.say(st.task || st.lnk ? '关掉：node scripts\\install.mjs --autostart off，或双击工作台文件夹里的“关掉开机自启”' : '打开：node scripts\\install.mjs --autostart on')
  return 0
}

// ───────────── 双击关掉 ─────────────

/** 工作台文件夹（程序的上一层）里放一个“关掉开机自启”，老板双击就能关 */
function writeOffShortcut(ctx) {
  const dir = dirname(ctx.app)
  const prog = basename(ctx.app)
  if (ctx.platform === 'darwin') {
    const file = join(dir, '关掉开机自启.command')
    writeFileSync(file, `#!/bin/bash
# 双击：关掉老板工作台的开机自启（后台服务也一起停）。想再打开：在“${prog}”文件夹里运行 node scripts/install.mjs --autostart on
cd "$(dirname "$0")"
NODE="$(command -v node || echo "${ctx.node}")"
"$NODE" "${prog}/scripts/install.mjs" --autostart off
read -n 1 -s -r -p "按任意键关闭"
`)
    chmodSync(file, 0o755)
    return file
  }
  if (ctx.platform === 'win32') {
    const file = join(dir, '关掉开机自启.bat')
    writeFileSync(file, ['@echo off', 'chcp 65001 >nul', 'rem 双击：关掉老板工作台的开机自启（后台服务也一起停）', 'cd /d "%~dp0"', `"${winQuote(ctx.node)}" "${prog}\\scripts\\install.mjs" --autostart off`, 'pause', ''].join('\r\n'))
    return file
  }
  return null
}

/** 入口：action 是 on / off / status。返回退出码 */
export async function autostart(action, o) {
  const ctx = makeContext(o)
  if (!['on', 'off', 'status'].includes(action)) { ctx.say('写 --autostart on、--autostart off 或 --autostart status'); return 1 }
  const mac = ctx.platform === 'darwin'
  const win = ctx.platform === 'win32'
  if (!mac && !win) { ctx.say('这台电脑不是 Mac 也不是 Windows，开机自启要自己配（比如 systemd 的用户服务）。'); return action === 'status' ? 0 : 1 }
  if (action === 'status') return mac ? macStatus(ctx) : winStatus(ctx)
  if (action === 'off') return mac ? macOff(ctx) : winOff(ctx)
  const code = mac ? await macOn(ctx) : await winOn(ctx)
  if (code === 0) {
    const f = writeOffShortcut(ctx)
    if (f) ctx.say(`  以后想关：双击 ${f}，或运行 node scripts/install.mjs --autostart off`)
  }
  return code
}
