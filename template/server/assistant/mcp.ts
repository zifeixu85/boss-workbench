import { isMain } from '../../scripts/is-main.mjs'
// AI 助手用的工作台工具（MCP，stdio）。工作台页面里的 AI 助手调本机 Codex 时挂上它（见 runner.ts）；
// 老板自己在 Codex 里也可以挂：codex mcp add workbench -- node 工作台/程序/server/assistant/mcp.ts
//
// 只开放白名单里的工作台命令：读的、普通写的（待办、日程、项目、收件箱、客户跟进），和知识库的只读查找。
// 写入一律走命令行 server/cli.ts（和网页同一套业务规则、记进“最近改动”），不直接写数据库；
// 导入、撤销、改设置、备份、提醒设置这些不开放。报价、合同、收款、承诺、改阶段要先在对话里问老板（规矩写在 runner.ts 的提示词里）。
// 协议：JSON-RPC 2.0，一行一条（MCP stdio）。只实现 initialize、tools/list、tools/call、ping。
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { APP_DIR } from '../db.ts'
import { kbTree, readKb } from '../services/kb.ts'

export const READ_COMMANDS = ['today', 'todos', 'events', 'projects', 'clients', 'client', 'receivables', 'modules', 'materials', 'care', 'biz', 'xhs', 'sources', 'biz-report', 'biz-anomalies', 'reminders'] as const
export const WRITE_COMMANDS = ['todo-add', 'todo-set', 'event-add', 'project-add', 'project-set', 'milestone-add', 'inbox', 'inbox-done', 'log', 'client-add', 'client-set', 'follow', 'stage', 'promise-add', 'promise-done', 'care-add', 'care-set', 'xhs-topics-add'] as const

/** 工具清单。名字就是 Codex 里看到的 mcp__workbench__<名字> */
export const TOOLS = [
  {
    name: 'workbench_help',
    description: '工作台命令的完整用法（每个命令的参数、例子）。第一次用 workbench_read / workbench_write 前先看一遍。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'workbench_read',
    description: `读工作台：${READ_COMMANDS.join('、')}。args 是命令后面的参数（字符串数组），例如 command="client", args=["澜拓科技"]。返回 JSON。`,
    inputSchema: { type: 'object', properties: { command: { type: 'string', enum: [...READ_COMMANDS] }, args: { type: 'array', items: { type: 'string' } } }, required: ['command'], additionalProperties: false },
  },
  {
    name: 'workbench_write',
    description: `写工作台（和网页同一套规则，记进“最近改动”，操作人是 Codex）：${WRITE_COMMANDS.join('、')}。args 例：command="todo-add", args=["给衡言出效果图","--due","2026-10-28","--owner","小艾"]。改阶段（stage）要带 --reason。`,
    inputSchema: { type: 'object', properties: { command: { type: 'string', enum: [...WRITE_COMMANDS] }, args: { type: 'array', items: { type: 'string' } } }, required: ['command'], additionalProperties: false },
  },
  {
    name: 'workbench_apply',
    description: '一张清单一次写入（进内容先拆再问后用）：plan 的格式见 workbench_help 里的 apply。yes=false 是预演，什么都不写；老板确认后 yes=true 再写，中间哪步不行整张都不写。',
    inputSchema: { type: 'object', properties: { plan: { type: 'object' }, yes: { type: 'boolean' } }, required: ['plan'], additionalProperties: false },
  },
  {
    name: 'kb_list',
    description: '列知识库的文件夹和文件（只读）。folder 不写 = 顶层；写了就只列这个文件夹下面的。',
    inputSchema: { type: 'object', properties: { folder: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'kb_read',
    description: '读知识库里的一份 Markdown（只读），path 是相对知识库根目录的路径，例如 "02-关于我/基本情况.md"。先读 AGENTS.md 看地图。',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
  },
  {
    name: 'kb_search',
    description: '在知识库里按关键词找（文件名和正文，只读），最多 12 条，带命中的那一行。',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
] as const
export const TOOL_NAMES = TOOLS.map((t) => t.name)

type Node = { name: string; path: string; type: 'file' | 'dir'; children?: Node[] }
const CLI = join(APP_DIR, 'server', 'cli.ts')

/** 跑一条工作台命令（不经过 shell，参数原样传），最多 60 秒 */
export function runCli(argv: string[], ms = 60000): Promise<{ ok: boolean; text: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [CLI, ...argv], { cwd: APP_DIR, shell: false, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => { child.kill(); done({ ok: false, text: '这条命令超过 60 秒没跑完，已停止' }) }, ms)
    child.stdout.on('data', (b) => { out = (out + b).slice(-60000) })
    child.stderr.on('data', (b) => { err = (err + b).slice(-8000) })
    child.on('close', (code) => { clearTimeout(timer); done({ ok: code === 0, text: code === 0 ? out.trim() : (err.trim() || out.trim() || `命令没办成（退出码 ${code}）`) }) })
    child.on('error', (e) => { clearTimeout(timer); done({ ok: false, text: `命令没能启动：${e.message}` }) })
  })
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : [])
const flatFiles = (nodes: Node[]): Node[] => nodes.flatMap((n) => (n.type === 'file' ? [n] : flatFiles(n.children ?? [])))

function kbList(folder?: string) {
  const tree = kbTree() as Node[]
  if (!folder) return tree.map((n) => ({ name: n.name, path: n.path, type: n.type }))
  const find = (nodes: Node[]): Node | undefined => nodes.map((n) => (n.path === folder ? n : n.children ? find(n.children) : undefined)).find(Boolean)
  const hit = find(tree)
  if (!hit) throw new Error(`知识库里没有这个文件夹：${folder}`)
  return (hit.children ?? []).map((n) => ({ name: n.name, path: n.path, type: n.type }))
}

function kbSearch(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) throw new Error('要写找什么')
  const hits: { path: string; line: string }[] = []
  for (const f of flatFiles(kbTree() as Node[])) {
    if (hits.length >= 12) break
    if (f.path.startsWith('工作台/')) continue
    if (f.path.toLowerCase().includes(q)) { hits.push({ path: f.path, line: '（文件名）' }); continue }
    let body = ''
    try { body = readKb(f.path).body } catch { continue }
    const line = body.split('\n').find((l) => l.toLowerCase().includes(q))
    if (line) hits.push({ path: f.path, line: line.trim().slice(0, 200) })
  }
  return hits
}

/** 调一个工具，返回给 Codex 的文字；出错抛异常（变成 isError） */
export async function callTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'workbench_help': return (await runCli(['--help'])).text
    case 'workbench_read': {
      const cmd = String(input.command ?? '')
      if (!(READ_COMMANDS as readonly string[]).includes(cmd)) throw new Error(`不能用这个命令读：${cmd}`)
      const r = await runCli([cmd, ...strings(input.args), '--json'])
      if (!r.ok) throw new Error(r.text)
      return r.text
    }
    case 'workbench_write': {
      const cmd = String(input.command ?? '')
      if (!(WRITE_COMMANDS as readonly string[]).includes(cmd)) throw new Error(`这个命令不开放给 AI 助手：${cmd}`)
      const args = strings(input.args)
      if (args.some((a) => a === '--yes')) throw new Error('写入命令不能带 --yes')
      const r = await runCli([cmd, ...args, '--json'])
      if (!r.ok) throw new Error(r.text)
      return r.text
    }
    case 'workbench_apply': {
      const dir = mkdtempSync(join(tmpdir(), 'wb-apply-'))
      try {
        const file = join(dir, 'plan.json')
        writeFileSync(file, JSON.stringify(input.plan ?? {}), 'utf8')
        const r = await runCli(['apply', file, ...(input.yes === true ? ['--yes'] : []), '--json'])
        if (!r.ok) throw new Error(r.text)
        return r.text
      } finally { rmSync(dir, { recursive: true, force: true }) }
    }
    case 'kb_list': return JSON.stringify(kbList(input.folder ? String(input.folder) : undefined))
    case 'kb_read': {
      const f = readKb(String(input.path ?? ''))
      return f.body.length > 40000 ? `${f.body.slice(0, 40000)}\n…（太长，后面省略了）` : f.body
    }
    case 'kb_search': return JSON.stringify(kbSearch(String(input.query ?? '')))
    default: throw new Error(`没有这个工具：${name}`)
  }
}

type Msg = { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Record<string, unknown> }

/** 处理一条消息，返回要回的消息（通知没有回复） */
export async function handle(msg: Msg): Promise<object | null> {
  const reply = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result })
  if (msg.id === undefined || msg.id === null) return null // 通知（notifications/initialized 之类）
  switch (msg.method) {
    case 'initialize': {
      const pkg = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as { version?: string }
      return reply({
        protocolVersion: String(msg.params?.protocolVersion ?? '2025-06-18'),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'workbench', version: pkg.version ?? '0' },
        instructions: '老板工作台：先 workbench_help 看命令；知识库先 kb_read AGENTS.md 看地图。写入和网页同一套规则。',
      })
    }
    case 'ping': return reply({})
    case 'tools/list': return reply({ tools: TOOLS })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      try {
        const text = await callTool(name, (msg.params?.arguments ?? {}) as Record<string, unknown>)
        return reply({ content: [{ type: 'text', text }] })
      } catch (e) {
        return reply({ content: [{ type: 'text', text: `没办成：${(e as Error).message}` }], isError: true })
      }
    }
    default: return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `不支持：${msg.method}` } }
  }
}

// 直接运行：作为 stdio 服务
if (isMain(import.meta.url)) {
  const rl = createInterface({ input: process.stdin })
  const pending = new Set<Promise<void>>()
  rl.on('line', (line) => {
    if (!line.trim()) return
    let msg: Msg
    try { msg = JSON.parse(line) } catch { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: '看不懂这条消息' } })}\n`); return }
    const p = handle(msg).then((out) => { if (out) process.stdout.write(`${JSON.stringify(out)}\n`) })
    pending.add(p)
    p.finally(() => pending.delete(p))
  })
  // 对方关了输入：等手上的命令跑完再退出
  rl.on('close', () => { Promise.allSettled([...pending]).then(() => process.exit(0)) })
}
