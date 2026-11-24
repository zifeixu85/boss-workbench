// Codex 插件两个入口工具背后的命令（server/cli.ts 把 capabilities 和 open 转到这里，2026-11-12）。
// 每次都是新进程，所以刚装的模块、刚改的菜单、刚打开的模块开关都算得进去；MCP（./mcp.ts）只是转一道。
//   capabilities [--json]                 现在有哪些页面、能打开哪些对象、能读什么、能写什么
//   open <页面>                           页面 key、名字或地址，例：open projects、open 待办
//   open <对象种类> <编号或名字>           例：open project 春节茶礼、open client 锦川
//        [--no-start] [--full] [--json]   --no-start 不拉起工作台，只给地址；--full 要带导航的完整页面
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_DIR } from '../db.ts'
import { SERVER_MODULES } from '../modules.gen.ts'
import { MODULES } from '../../shared/modules.ts'
import * as modules from '../services/modules.ts'
import { getSettings } from '../services/today.ts'
import { moduleHooks } from '../module-hooks.ts'
import { getProject, listProjects } from '../services/projects.ts'
import { findClient } from '../services/clients.ts'
import { getEvent, getTodo } from '../services/schedule.ts'
import { readKb } from '../services/kb.ts'
import { editMode, editModeText } from '../services/edit-mode.ts'
import { OpenError, allTargets, buildCapabilities, resolveOpen, type CapabilityInput, type Lookup, type NavLike } from './capabilities.ts'
import { ensureRunning, recordedPort, wantedPort } from './launch.ts'

export const ASSISTANT_HELP = `接进 Codex（Codex 插件的入口工具用的就是这两条）
  capabilities                       现在有哪些页面、能打开哪些对象、能读什么、能写什么（装了新模块自动带上）
  open <页面>                        给出侧边栏地址（带 ?embed=1，不显示导航）；工作台没在运行会先拉起来。例：open projects
  open <对象种类> <编号或名字>         打开某个对象：project 项目、client 客户、todo 待办、event 日程、kb 知识库文件。例：open project 春节茶礼
                                     --no-start 只给地址不拉起；--full 给带导航的完整页面`

export const isAssistantCommand = (argv: string[]) => argv[0] === 'capabilities' || argv[0] === 'open'

/** 菜单：直接读网页那份 src/app/nav.ts（纯数据，Node 能读）。路径是算出来的，服务端类型检查不跟进网页代码 */
async function loadNav(): Promise<NavLike[]> {
  const file = join(APP_DIR, 'src', 'app', 'nav.ts')
  try {
    const mod = (await import(pathToFileURL(file).href)) as { NAV?: NavLike[] }
    if (!Array.isArray(mod.NAV)) throw new Error('里面没有 NAV')
    return mod.NAV
  } catch (err) { throw new Error(`读不了菜单（${file}）：${(err as Error).message}`) }
}

/** 现在的情况：菜单、装进来的模块、哪些模块开着。“知识库”那一页跟设置里的名字走 */
export async function currentInput(): Promise<CapabilityInput & { owner: string; business: string }> {
  const s = getSettings()
  // 模块接管的核心入口（运行时菜单项的 replaces）不列：和网页菜单一致
  const on = new Set(modules.enabled())
  const taken = new Set(moduleHooks().filter((h) => on.has(h.module) && h.hooks.nav).flatMap((h) => { try { return h.hooks.nav!().map((n) => n.replaces) } catch { return [] } }).filter(Boolean))
  const nav = (await loadNav()).filter((n) => !taken.has(n.key)).map((n) => (n.key === 'kb' ? { ...n, label: s.kb } : n))
  return {
    nav, modules: SERVER_MODULES, enabled: modules.enabled(), owner: s.owner, business: s.business,
    moduleNames: Object.fromEntries(MODULES.map((m) => [m.id, m.name])),
  }
}

/** 找项目：id 或全名；对不上再按简称找（“春节茶礼”认得出“春节企业茶礼预售”）。对上几个就列出来，不挑第一个 */
function findProject(q: string): { id: string; name: string } {
  try { return getProject(q).project } catch { /* 不是 id 也不是全名：按简称找 */ }
  const want = [...q.replace(/\s+/g, '')]
  const inOrder = (name: string) => { let at = 0; for (const ch of name) if (ch === want[at]) at++; return at === want.length }
  const all = listProjects() as { id: string; name: string }[]
  const hits = want.length < 2 ? [] : all.filter((p) => p.name.includes(q)).length ? all.filter((p) => p.name.includes(q)) : all.filter((p) => inOrder(p.name))
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) throw new OpenError(`“${q}”对上了 ${hits.length} 个项目：${hits.map((p) => p.name).join('、')}。先问老板是哪一个，再写全名或 id`)
  throw new OpenError(`找不到项目“${q}”。现在有：${all.map((p) => p.name).join('、') || '（还没有项目）'}`)
}

/** 核心对象先核对存在：项目、客户认名字，待办、日程认 id，知识库文件认路径 */
const lookup: Lookup = (kind, id) => {
  switch (kind) {
    case 'project': { const p = findProject(id); return { id: p.id, title: p.name } }
    case 'client': { const c = findClient(id) as { id: string; name: string }; return { id: c.id, title: c.name } }
    case 'todo': { const t = getTodo(id) as { id: string; title: string }; return { id: t.id, title: t.title } }
    case 'event': { const e = getEvent(id) as { id: string; title: string }; return { id: e.id, title: e.title } }
    case 'kb': { const f = readKb(id); return { id: f.path, title: (f.path.split('/').pop() ?? f.path).replace(/\.md$/, '') } }
    default: return { id, title: id }
  }
}

function capabilitiesText(c: ReturnType<typeof buildCapabilities>, who: { owner: string; business: string }): string {
  const cmd = (xs: typeof c.read) => xs.map((x) => `  - ${x.command}：${x.what}${x.ask_first ? '【先问老板】' : ''}`).join('\n')
  return [`${who.business}（${who.owner}的工作台）现在有：`,
    '\n页面', c.pages.map((p) => `  - ${p.trail}（${p.key}）`).join('\n'),
    '\n能打开的对象', c.objects.map((o) => `  - ${o.kind}：${o.title}（id 写${o.id}）`).join('\n'),
    '\n能读', cmd(c.read), '\n能写', cmd(c.write), `\n${c.apply}`,
    c.off.length ? `\n收起来的模块（页面和命令没列）：${c.off.join('、')}` : ''].filter(Boolean).join('\n')
}

export async function runAssistantCli(argv: string[]): Promise<number> {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { json: { type: 'boolean' }, 'no-start': { type: 'boolean' }, full: { type: 'boolean' }, kind: { type: 'string' }, id: { type: 'string' } },
  })
  // 位置参数按空白再拆一遍：整句放在一个引号里（"project 春节茶礼"）也认得出种类
  const [cmd, ...words] = positionals
  const [a1, ...rest] = words.join(' ').split(/\s+/).filter(Boolean)
  const out = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
  const input = await currentInput()
  if (cmd === 'capabilities') {
    const c = buildCapabilities(input)
    const port = recordedPort() ?? wantedPort()
    const mode = editMode()
    out({ workbench: input.business, owner: input.owner, url: `http://127.0.0.1:${port}`, edit_mode: mode, edit_rule: editModeText(mode), ...c },
      `${capabilitiesText(c, input)}\n\n现在：${editModeText(mode)}`)
    return 0
  }
  // open：两个词 = 对象（种类 + 编号或名字，名字里有空格也行）；一个词 = 页面
  const kinds = allTargets(input).objects.map((x) => x.kind)
  const kind = o.kind ?? (a1 && rest.length && kinds.includes(a1) ? a1 : undefined)
  const args = kind ? { target: { kind, id: o.id ?? (o.kind ? [a1, ...rest].filter(Boolean).join(' ') : rest.join(' ')) } } : { page: [a1, ...rest].filter(Boolean).join(' ') }
  let opened
  try { opened = resolveOpen(args, input, lookup) } catch (err) {
    if (err instanceof OpenError) throw err
    throw new Error(`${(err as Error).message}。先用 workbench_read（或对应的查看命令）查到编号再打开`)
  }
  const path = o.full ? opened.path.replace(/([?&])embed=1&?/, '$1').replace(/[?&]$/, '') : opened.path
  let base = `http://127.0.0.1:${recordedPort() ?? wantedPort()}`
  let running: 'yes' | 'started' | 'not-checked' = 'not-checked'
  // WORKBENCH_NO_START=1：和 --no-start 一样，只给地址（自动测试用，免得测试时真的起一个服务）
  if (!o['no-start'] && process.env.WORKBENCH_NO_START !== '1') { const r = await ensureRunning(); base = r.url; running = r.started ? 'started' : 'yes' }
  const url = `${base}${path}`
  const hint = [
    '在 Codex 里：按 open.args 调 open_in_codex，在右侧面板打开；没有这个工具就把地址给老板。',
    running === 'started' ? '工作台刚才没在运行，已经在后台拉起来了。' : '',
    opened.verified ? '' : '这一类对象没法事先核对编号在不在，打开是空的就先查一下编号。',
  ].filter(Boolean).join('')
  out({ kind: opened.kind, ...(opened.key ? { key: opened.key } : {}), ...(opened.id ? { id: opened.id } : {}), title: opened.title, trail: opened.trail,
    url, path, running, open: { tool: 'open_in_codex', args: { target: { type: 'browser', url }, placement: 'right' } }, hint },
  `${opened.trail}${opened.kind === 'page' ? '' : `：${opened.title}`}\n${url}${running === 'started' ? '\n（工作台刚才没在运行，已经在后台拉起来了）' : ''}`)
  return 0
}
