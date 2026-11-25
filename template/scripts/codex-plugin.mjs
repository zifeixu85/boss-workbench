#!/usr/bin/env node
// 把工作台接进 Codex（2026-11-12）：生成一个本地 Codex 插件，装进这台电脑的 Codex。
// 老板说“把工作台接进 Codex”，就在程序文件夹里运行：
//
//   node scripts/codex-plugin.mjs install [--port 4517]   生成插件目录 → 加本地插件市场 → 装插件（重复运行 = 重新接一次）
//   node scripts/codex-plugin.mjs uninstall               从 Codex 里拿掉（工作台和数据不动，插件目录留着）
//   node scripts/codex-plugin.mjs status [--json]         接上没有、指向哪个工作台、工作台在不在运行
//   node scripts/codex-plugin.mjs build [--port 4517]     只生成插件目录，不动 Codex（搭建时 install.mjs 会调）
//
// 插件目录在 程序/Codex插件/（它就是一个本地插件市场）：
//   .agents/plugins/marketplace.json                      市场清单（名字 boss-workbench，指向下面这个插件）
//   plugins/boss-workbench/.codex-plugin/plugin.json      插件清单（显示名、示例提示、版本）
//   plugins/boss-workbench/.mcp.json                      工作台工具：用这台电脑的 node 跑 程序/server/assistant/mcp.ts（绝对路径）
//   plugins/boss-workbench/skills/workbench/SKILL.md      一个短技能：什么时候用、先调哪个工具、更新进展先给老板核对
// 插件只是外壳：页面清单、能读能写的命令、地址都由工作台当场给（workbench_capabilities / workbench_open），
// 所以工作台装了新模块不用重装插件。换了电脑上的 Node、挪了工作台文件夹、改了端口，才要重新 install。
//
// 只动 Codex 自己的配置（经 codex plugin 命令，位置由 CODEX_HOME 决定，默认 ~/.codex），不直接改它的配置文件。
// 测试：WORKBENCH_CODEX_BIN 指向一个假的 codex、CODEX_HOME 指到临时文件夹，就不会碰真的 Codex（见 codex-plugin.test.mjs）。
// 普通 JS：老版本 Node 也能跑起来，告诉你该升级什么。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codexCandidates, rememberCodex } from './codex-check.mjs'
import { isMain } from './is-main.mjs'

export const MARKETPLACE = 'boss-workbench'
export const PLUGIN = 'boss-workbench'
export const SERVER = 'boss-workbench'
export const OUT_DIR = 'Codex插件'
const SELECTOR = `${PLUGIN}@${MARKETPLACE}`
const NEED = { major: 22, minor: 18 } // 工作台直接运行 .ts，要这个版本以上的 Node
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'

const real = (p) => { try { return realpathSync(p) } catch { return p } }

export class PluginError extends Error {}
const fail = (msg) => { throw new PluginError(msg) }

/** 上次生成插件时记下的知识库位置、数据库位置、端口（程序/Codex插件/…/.mcp.json）。重新接的时候不用再带环境变量。
 *  只在程序文件夹没挪过时才沿用：挪了以后（插件目录跟着一起挪），记下的还是旧位置，不能再用，只留端口 */
function recorded(app) {
  try {
    const server = JSON.parse(readFileSync(join(app, OUT_DIR, 'plugins', PLUGIN, '.mcp.json'), 'utf8')).mcpServers?.[SERVER] ?? {}
    const env = server.env ?? {}
    const same = real(server.args?.[0] ?? '') === real(join(app, 'server', 'assistant', 'mcp.ts'))
    return same ? { root: env.WORKBENCH_ROOT, db: env.WORKBENCH_DB, port: env.PORT } : { port: env.PORT }
  } catch { return {} }
}

/** 补齐默认值。测试时传 app、env、node、run 换掉。
 *  知识库根目录和数据库位置和 server/db.ts、install.mjs 同一套：参数 → 环境变量 → 上次记下的 → 程序往上两层 */
export function makeContext(o = {}) {
  const env = o.env ?? process.env
  const app = resolve(o.app ?? APP)
  const prev = recorded(app)
  const root = resolve(o.root ?? env.WORKBENCH_ROOT ?? prev.root ?? join(app, '..', '..'))
  const db = o.db ?? env.WORKBENCH_DB ?? prev.db ?? join(root, '工作台', '数据', 'workbench.db')
  const rawPort = o.port ?? env.PORT ?? prev.port ?? 4517
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`端口要写 1 到 65535 之间的数字（现在是“${rawPort}”）`)
  return { node: process.execPath, nodeVersion: process.versions.node, say: console.log, run: realRun, ...o, app, root, db, port, env }
}

const realRun = (bin, args, env) => {
  // Windows 上 .cmd / .bat 要经过 cmd 才能跑：参数自己加引号（路径里常有空格和中文）
  const viaShell = isWin && /\.(cmd|bat)$/i.test(bin)
  const quote = (a) => `"${String(a).replace(/"/g, '')}"`
  const r = viaShell
    ? spawnSync(`${quote(bin)} ${args.map(quote).join(' ')}`, { shell: true, encoding: 'utf8', env, windowsHide: true, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawnSync(bin, args, { shell: false, encoding: 'utf8', env, windowsHide: true, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}`.trim(), err: `${r.stderr ?? ''}${r.error ? r.error.message : ''}`.trim() }
}

// ───────────────────────────── 生成插件目录

const json = (v) => `${JSON.stringify(v, null, 2)}\n`
const quoteArg = (p) => `"${p}"`

/** 插件里的每个文件（相对插件目录的路径 → 内容）。版本号带内容指纹：内容没变版本不变，变了 Codex 才会重新缓存 */
export function pluginFiles(ctx) {
  const pkg = JSON.parse(readFileSync(join(ctx.app, 'package.json'), 'utf8'))
  // 技能里给的两条命令写全路径：在哪个文件夹里都能跑；知识库位置和端口不用再带（上次记下了）
  const script = join(ctx.app, 'scripts', 'codex-plugin.mjs')
  const command = (verb) => `${quoteArg(ctx.node)} ${quoteArg(script)} ${verb}`
  const skill = readFileSync(join(ctx.app, 'scripts', 'codex-plugin-skill.md'), 'utf8')
    .replaceAll('{{CHECK}}', command('status')).replaceAll('{{INSTALL}}', command('install'))
  const left = skill.match(/\{\{[^}]+\}\}/)
  if (left) fail(`技能模板里还有没填的占位：${left[0]}`)
  const base = `plugins/${PLUGIN}`
  const files = {
    '.agents/plugins/marketplace.json': json({
      name: MARKETPLACE,
      interface: { displayName: '老板工作台' },
      plugins: [{ name: PLUGIN, source: { source: 'local', path: `./plugins/${PLUGIN}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
    }),
    [`${base}/.mcp.json`]: json({
      mcpServers: {
        [SERVER]: {
          command: ctx.node,
          args: [join(ctx.app, 'server', 'assistant', 'mcp.ts')],
          env: { WORKBENCH_ROOT: ctx.root, WORKBENCH_DB: ctx.db, PORT: String(ctx.port) },
          // 工具只有几个，常驻可见，不用先搜索
          omit_tools_from: ['deferred'],
        },
      },
    }),
    [`${base}/skills/workbench/SKILL.md`]: skill,
    [`${base}/skills/workbench/agents/openai.yaml`]: [
      'interface:', '  display_name: "老板工作台"', '  short_description: "先看工作台现在有什么，再读、打开页面或更新进展"',
      '  default_prompt: "看看工作台今天我先做哪件事，并在右侧打开今日页。"', '',
    ].join('\n'),
  }
  const stamp = createHash('sha256').update(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}\n${v}`).join('\n')).digest('hex').slice(0, 10)
  const version = `${pkg.version ?? '0.0.0'}+codex.${stamp}`
  files[`${base}/.codex-plugin/plugin.json`] = json({
    name: PLUGIN,
    version,
    description: '老板工作台的 Codex 入口：连接这台电脑上的工作台，先看现在有什么、再读写，在右侧面板打开页面；更新进展先拆成清单给老板核对，确认后再写。',
    author: { name: '老板工作台' },
    keywords: ['workbench', 'todos', 'projects', 'clients', 'mcp'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: '老板工作台',
      shortDescription: '在 Codex 里看工作台、更新进展，页面开在右侧',
      longDescription: '连接这台电脑上的老板工作台（只监听本机）。两个入口工具：workbench_capabilities 看现在有哪些页面、能读什么、能写什么；workbench_open 给出页面地址，用 Codex 右侧面板打开，工作台没在运行会先拉起来。页面和命令由工作台自己登记，装了新模块不用更新插件。更新进展时先把你说的话拆成清单给你核对，你确认后才写进工作台；报价、合同、收款、承诺、改阶段先问你。不发消息、不发布、不付款、不删东西。',
      developerName: '老板工作台',
      category: 'Productivity',
      capabilities: ['Read', 'Write'],
      defaultPrompt: ['今天我先做哪件事？', '打开项目页，看看哪个有风险', '更新进展：刚和客户聊完，帮我拆一下'],
      brandColor: '#2E6B55',
    },
  })
  return { files, version }
}

/** 把插件目录写到 程序/Codex插件/；返回目录、版本、改了哪几个文件（内容没变的不重写） */
export const buildPlugin = (o = {}) => build(makeContext(o))
function build(ctx) {
  const [maj, min] = String(ctx.nodeVersion).split('.').map(Number)
  if (maj < NEED.major || (maj === NEED.major && min < NEED.minor)) fail(`Node 版本太旧（现在 ${ctx.nodeVersion}，工作台要 ${NEED.major}.${NEED.minor} 以上）：先升级 Node，再接进 Codex`)
  if (!existsSync(join(ctx.app, 'server', 'assistant', 'mcp.ts'))) fail(`这个文件夹不像工作台的程序（没有 server/assistant/mcp.ts）：${ctx.app}`)
  const { files, version } = pluginFiles(ctx)
  const dir = join(ctx.app, OUT_DIR)
  const changed = []
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, rel)
    if (existsSync(file) && readFileSync(file, 'utf8') === text) continue
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
    changed.push(rel)
  }
  return { dir, version, changed }
}

// ───────────────────────────── 找能装插件的 Codex

function runnable(p) {
  try { accessSync(p, isWin ? constants.F_OK : constants.X_OK); return existsSync(p) } catch { return false }
}

/** 可能的 Codex，按装插件时的先后：环境变量指定的 → 桌面版自带的（老板用的就是它）→ PATH 里的（可能是很久以前装的旧命令行版） */
export function pluginCodexCandidates(env) {
  const all = codexCandidates(env)
  const bundled = (p) => /codex-cli[\\/]bin[\\/]/i.test(p)
  const first = env.WORKBENCH_CODEX_BIN ? [env.WORKBENCH_CODEX_BIN] : []
  return [...new Set([...first, ...all.filter(bundled), ...all])]
}

/** 找一个认 plugin 命令的 Codex。老版本没有 plugin 命令，跳过往下找 */
export function findPluginCodex(ctx) {
  const tried = []
  for (const bin of [...new Set((ctx.candidates ?? pluginCodexCandidates(ctx.env)).filter(runnable).map(real))]) {
    const r = ctx.run(bin, ['plugin', 'marketplace', 'list'], ctx.env)
    if (r.ok) { if (ctx.remember !== null) rememberCodex(bin, ctx.remember); return { bin, tried, marketplaces: r.out } }
    tried.push(bin)
  }
  return { bin: null, tried, marketplaces: '' }
}

const noCodex = (found) => (found.tried.length
  ? `这台电脑上的 Codex 版本太旧，还不能装插件（试过：${found.tried.join('、')}）。把 Codex 桌面版更新到最新，再说一次“把工作台接进 Codex”`
  : '工作台没认出这台电脑上的 Codex 在哪（找过 Codex 桌面版和 codex 命令）。装好 Codex 桌面版并登录，再说一次“把工作台接进 Codex”')

/** 市场清单里 boss-workbench 那一行指向哪个文件夹（没加过返回 null）。codex 的输出是“名字 + 根目录”一行一条 */
export function marketplaceRoot(listing) {
  for (const line of String(listing).split('\n')) {
    const m = line.trim().match(/^(\S+)\s+(.+)$/)
    if (m && m[1] === MARKETPLACE) return m[2].trim()
  }
  return null
}

/** 插件装没装、开没开。只查本地这一个市场：不带 --marketplace 时 Codex 会先同步远程插件目录，
 *  新环境里第一次要一分多钟（2026-11-12 实测 71 秒）。查不出来（老版本不认这个参数、输出读不懂）时 known 为 false */
function pluginState(ctx, bin) {
  for (const args of [['plugin', 'list', '--json', '--marketplace', MARKETPLACE], ['plugin', 'list', '--json']]) {
    const r = ctx.run(bin, args, ctx.env)
    if (!r.ok) continue
    try {
      const hit = (JSON.parse(r.out).installed ?? []).find((p) => p.pluginId === SELECTOR || (p.name === PLUGIN && p.marketplaceName === MARKETPLACE))
      return { known: true, installed: !!hit && hit.installed !== false, enabled: !!hit && hit.enabled !== false, version: hit?.version ?? null }
    } catch { /* 换下一种查法 */ }
  }
  return { known: false, installed: false, enabled: false, version: null }
}

// ───────────────────────────── 装、卸、看

export function installPlugin(o = {}) {
  const ctx = makeContext(o)
  const built = build(ctx)
  ctx.say(`插件目录：${built.dir}${built.changed.length ? `（更新了 ${built.changed.length} 个文件）` : '（已经是最新的）'}`)
  const found = findPluginCodex(ctx)
  if (!found.bin) fail(noCodex(found))
  const before = marketplaceRoot(found.marketplaces)
  if (before && real(before) !== real(built.dir)) ctx.say(`Codex 里原来接的是另一个工作台（${before}），这次换成这一个。`)
  // 重新接一次：先拿掉旧的再加（没装过时这两步会失败，不要紧）
  if (before) {
    ctx.run(found.bin, ['plugin', 'remove', SELECTOR], ctx.env)
    ctx.run(found.bin, ['plugin', 'marketplace', 'remove', MARKETPLACE], ctx.env)
  }
  const add = ctx.run(found.bin, ['plugin', 'marketplace', 'add', built.dir], ctx.env)
  if (!add.ok) fail(`没能把插件目录加进 Codex：${add.err || add.out}`)
  const inst = ctx.run(found.bin, ['plugin', 'add', SELECTOR], ctx.env)
  if (!inst.ok) fail(`没能装上插件：${inst.err || inst.out}`)
  // 回查一遍；清单查不出来（known 为 false）不算失败：上面两步 Codex 都说成功了
  const state = pluginState(ctx, found.bin)
  if (state.known && !state.installed) fail('装完以后在 Codex 的插件清单里没看到“老板工作台”。运行 node scripts/codex-plugin.mjs status 看看；不行就把 Codex 更新到最新再试')
  ctx.say(`接好了：老板工作台插件 ${built.version}（用的 Codex：${found.bin}）。`)
  ctx.say('把 Codex 桌面版关掉重开一次，新开一个对话，说一句“今天我先做哪件事？”试试；工作台会开在右边。')
  return { ...built, codex: found.bin, replaced: before && real(before) !== real(built.dir) ? before : null }
}

export function uninstallPlugin(o = {}) {
  const ctx = makeContext(o)
  const found = findPluginCodex(ctx)
  if (!found.bin) fail(noCodex(found))
  const had = !!marketplaceRoot(found.marketplaces) || pluginState(ctx, found.bin).installed
  ctx.run(found.bin, ['plugin', 'remove', SELECTOR], ctx.env)
  ctx.run(found.bin, ['plugin', 'marketplace', 'remove', MARKETPLACE], ctx.env)
  const left = !!marketplaceRoot(ctx.run(found.bin, ['plugin', 'marketplace', 'list'], ctx.env).out)
  if (left) fail('没能从 Codex 里拿掉老板工作台插件。打开 Codex 的插件设置手动移除，或者把 Codex 更新到最新再试')
  ctx.say(had ? '已经从 Codex 里拿掉老板工作台插件。工作台和数据都没动；重开 Codex 后生效。以后再接：node scripts/codex-plugin.mjs install' : 'Codex 里本来就没接老板工作台插件，没有要拿掉的。')
  return { removed: had }
}

async function workbenchUp(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/api/settings`, { signal: AbortSignal.timeout(1500) }); return r.ok } catch { return false }
}

export async function pluginStatus(o = {}) {
  const ctx = makeContext(o)
  const dir = join(ctx.app, OUT_DIR)
  const mcpFile = join(dir, 'plugins', PLUGIN, '.mcp.json')
  const out = { dir, generated: existsSync(mcpFile), fresh: false, node_ok: null, codex: null, marketplace: null, points_here: false, installed: false, enabled: false, port: ctx.port, running: false, problems: [] }
  if (out.generated) {
    try {
      const want = pluginFiles(ctx).files
      out.fresh = Object.entries(want).every(([rel, text]) => existsSync(join(dir, rel)) && readFileSync(join(dir, rel), 'utf8') === text)
      const server = JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers?.[SERVER] ?? {}
      out.node_ok = runnable(server.command ?? '')
      out.port = Number(server.env?.PORT ?? ctx.port)
      if (!out.node_ok) out.problems.push(`插件里记的 Node 不在了（${server.command}）：重新运行 node scripts/codex-plugin.mjs install`)
      else if (!out.fresh) out.problems.push('工作台更新过，或者文件夹、端口变了，插件目录还是旧的：重新运行 node scripts/codex-plugin.mjs install')
    } catch (err) { out.problems.push(`插件目录读不出来（${err.message}）：重新运行 node scripts/codex-plugin.mjs install`) }
  } else out.problems.push('还没生成插件目录：运行 node scripts/codex-plugin.mjs install')
  const found = findPluginCodex(ctx)
  out.codex = found.bin
  if (!found.bin) out.problems.push(noCodex(found))
  else {
    out.marketplace = marketplaceRoot(found.marketplaces)
    out.points_here = !!out.marketplace && real(out.marketplace) === real(dir)
    const state = pluginState(ctx, found.bin)
    out.installed = state.installed && out.points_here
    out.enabled = out.installed && state.enabled
    if (out.marketplace && !out.points_here) out.problems.push(`Codex 里接的是另一个工作台（${out.marketplace}）：要换成这一个，运行 node scripts/codex-plugin.mjs install`)
    else if (!out.marketplace || (state.known && !state.installed)) out.problems.push('还没接进 Codex：运行 node scripts/codex-plugin.mjs install')
    else if (!state.known) out.problems.push('没能从 Codex 查到插件清单（Codex 可能要更新）：重新运行 node scripts/codex-plugin.mjs install 试试')
    else if (!state.enabled) out.problems.push('插件装着但被关掉了：在 Codex 的插件设置里打开“老板工作台”')
    else if (out.fresh && state.version && state.version !== pluginFiles(ctx).version) out.problems.push(`Codex 里装的还是旧的一版（${state.version}）：重新运行 node scripts/codex-plugin.mjs install`)
  }
  out.running = await workbenchUp(out.port)
  return out
}

function statusText(s) {
  const yes = (b) => (b ? '✓' : '✗')
  return [
    `${yes(s.generated && s.fresh)} 插件目录：${s.generated ? `${s.dir}${s.fresh ? '' : '（旧的）'}` : '还没生成'}`,
    `${yes(!!s.codex)} Codex：${s.codex ?? '没找到能装插件的 Codex'}`,
    `${yes(s.installed && s.enabled)} 接进 Codex：${s.installed ? (s.enabled ? '接好了' : '装着但关掉了') : s.marketplace && !s.points_here ? `接的是另一个工作台（${s.marketplace}）` : '还没接'}`,
    `${s.running ? '✓' : '·'} 工作台：${s.running ? `在运行（http://127.0.0.1:${s.port}）` : `现在没在运行（端口 ${s.port}）；在 Codex 里要打开页面时会自己拉起来`}`,
    ...s.problems.map((p) => `  怎么办：${p}`),
  ].join('\n')
}

async function main(argv) {
  const val = (k) => { const i = argv.indexOf(k); const eq = argv.find((a) => a.startsWith(`${k}=`)); return eq ? eq.slice(k.length + 1) : i >= 0 ? argv[i + 1] : undefined }
  // 命令 = 第一个不是选项、也不是 --port 后面那个数的词（--port 4527 install 也认）
  const cmd = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--port')
  const o = val('--port') !== undefined ? { port: val('--port') } : {}
  switch (cmd) {
    case 'install': installPlugin(o); return 0
    case 'uninstall': uninstallPlugin(o); return 0
    case 'build': {
      const r = buildPlugin(o)
      console.log(`插件目录：${r.dir}（${r.version}）${r.changed.length ? `，更新了 ${r.changed.length} 个文件` : '，已经是最新的'}。还没装进 Codex：运行 node scripts/codex-plugin.mjs install`)
      return 0
    }
    case 'status': {
      const s = await pluginStatus(o)
      console.log(argv.includes('--json') ? JSON.stringify(s, null, 2) : statusText(s))
      return s.installed && s.enabled && !s.problems.length ? 0 : 1
    }
    default:
      console.log('用法：node scripts/codex-plugin.mjs install [--port 4517] | uninstall | status [--json] | build\n老板说“把工作台接进 Codex”就运行 install；装好后重开 Codex、新开一个对话。')
      return cmd ? 2 : 0
  }
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch((err) => {
    console.error(`没办成：${err.message}`)
    process.exitCode = 1
  })
}
