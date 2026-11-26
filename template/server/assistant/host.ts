// 页面 AI 助手的“常驻对话”引擎（2026-11-26 A梦 定：和他在 Codex 里开一个对话是同一个东西）：
// 起一个 codex app-server（一行一条 JSON-RPC），用他自己的 ~/.codex 和登录，工作目录是知识库根目录，
// 所以他的插件、技能、全局规矩、知识库的 AGENTS.md、助理的角色文件都照常生效；不加沙箱、不关功能，权限照他自己 Codex 的设置。
// 他的 Codex 要问“是否允许”（跑命令、改文件……）时，这里把请求挂起来，网页上弹出“允许 / 不允许”，他点了再答给 Codex。
// 版本兜底：没测过的版本（协议可能对不上）不用这个引擎，由 service.ts 降级成一次性模式并说明。
import { spawn, type ChildProcess } from 'node:child_process'

/** 实测过的命令行版本（前两段）：0.166（命令行版）、0.171（ChatGPT 应用自带的 alpha）。环境变量 WORKBENCH_CODEX_ANY_VERSION=1 放行别的版本 */
export const TESTED_VERSIONS = ['0.166', '0.171']
export const versionTested = (v: string, env: NodeJS.ProcessEnv = process.env) => env.WORKBENCH_CODEX_ANY_VERSION === '1' || TESTED_VERSIONS.some((t) => v === t || v.startsWith(`${t}.`))

export type Approval = { key: string; kind: '跑命令' | '改文件' | '要权限'; text: string; reason: string }
export type Step = { tool: string; label: string; state: 'running' | 'ok' | 'failed'; detail?: string }
export type TurnProgress = { text?: string; steps?: Step[]; approvals?: Approval[]; status?: 'done' | 'failed' | 'cancelled'; error?: string }
export class HostError extends Error {}

type Pending = { res: (v: any) => void; rej: (e: Error) => void; timer: NodeJS.Timeout }
type Turn = { threadId: string; turnId: string | null; text: string; agents: Map<string, string>; steps: Map<string, Step>; onProgress: (p: TurnProgress) => void; finish: (p: TurnProgress) => void }
type Held = { key: string; rpcId: number | string; method: string; params: any; approval: Approval; threadId: string }

const APPROVALS = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'execCommandApproval', 'applyPatchApproval'])
const short = (s: unknown, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t }

/** 条目 → 网页上的一个小步骤（跑命令、改文件、调工具、联网、生图……） */
export function stepOf(item: any): Step | null {
  const type = String(item?.type ?? '')
  if (type === 'agentMessage' || type === 'userMessage' || type === 'reasoning') return null
  const st = (s: unknown) => (s === 'failed' || s === 'declined' ? 'failed' : s === 'inProgress' || s === undefined || s === null ? 'running' : 'ok') as Step['state']
  if (type === 'commandExecution') return { tool: 'shell', label: `跑命令：${short(item.command, 60)}`, state: st(item.status), detail: short(item.command, 400) }
  if (type === 'fileChange') return { tool: 'files', label: `改文件：${(item.changes ?? []).map((c: any) => String(c.path ?? '').split('/').pop()).filter(Boolean).slice(0, 3).join('、') || '…'}`, state: st(item.status) }
  if (type === 'mcpToolCall') return { tool: `${item.server}.${item.tool}`, label: `${item.server === 'boss-workbench' || /workbench/.test(String(item.server)) ? '工作台' : item.server} · ${item.tool}`, state: st(item.status) }
  if (type === 'webSearch') return { tool: 'web', label: `联网搜：${short(item.query, 40)}`, state: 'ok' }
  if (/image/i.test(type)) return { tool: 'image', label: '生成图片', state: st(item.status) }
  return { tool: type, label: type, state: st(item.status) }
}

/** 一个审批请求 → 网页上要他点的那一条 */
export function approvalOf(key: string, method: string, p: any): Approval {
  if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
    const cmd = Array.isArray(p.command) ? p.command.join(' ') : p.command
    return { key, kind: '跑命令', text: short(cmd, 300) || '（没写是什么命令）', reason: short(p.reason, 200) }
  }
  if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') {
    const files = p.fileChanges ? Object.keys(p.fileChanges) : []
    return { key, kind: '改文件', text: files.length ? files.map((f) => f.split('/').pop()).join('、') : short(p.grantRoot ?? '要改文件'), reason: short(p.reason, 200) }
  }
  return { key, kind: '要权限', text: short(JSON.stringify(p.permissions ?? {}), 200), reason: short(p.reason, 200) }
}

/** 他点的 → 答给 Codex 的（新旧两种审批的写法不一样） */
export function decisionFor(method: string, choice: 'allow' | 'allow-session' | 'deny', params: any): unknown {
  if (method === 'execCommandApproval' || method === 'applyPatchApproval') return { decision: choice === 'allow' ? 'approved' : choice === 'allow-session' ? 'approved_for_session' : 'denied' }
  if (method === 'item/permissions/requestApproval') return choice === 'deny' ? { permissions: {} } : { permissions: params.permissions ?? {}, scope: choice === 'allow-session' ? 'session' : 'turn' }
  return { decision: choice === 'allow' ? 'accept' : choice === 'allow-session' ? 'acceptForSession' : 'decline' }
}

export class CodexHost {
  private child: ChildProcess | null = null
  private buf = ''
  private nextId = 0
  private pending = new Map<number, Pending>()
  private loaded = new Set<string>()
  private turns = new Map<string, Turn>()
  private held = new Map<string, Held>()
  private booting: Promise<void> | null = null
  version = ''

  private o: { bin: string; cwd: string; instructions: string; env?: NodeJS.ProcessEnv; args?: string[]; timeoutMs?: number }
  constructor(o: { bin: string; cwd: string; instructions: string; env?: NodeJS.ProcessEnv; args?: string[]; timeoutMs?: number }) { this.o = o }

  private send(m: unknown) { this.child?.stdin?.write(`${JSON.stringify(m)}\n`) }
  request(method: string, params: unknown, ms = 60000): Promise<any> {
    if (!this.child) return Promise.reject(new HostError('常驻对话没开着'))
    const id = ++this.nextId
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new HostError(`Codex ${Math.round(ms / 1000)} 秒没回 ${method}`)) }, ms)
      this.pending.set(id, { res, rej, timer })
      this.send({ id, method, params })
    })
  }

  /** 起进程、握手、看版本；起过就不再起。没测过的版本抛 HostError（service 降级） */
  ensure(): Promise<void> {
    if (this.child) return this.booting ?? Promise.resolve()
    const child = spawn(this.o.bin, [...(this.o.args ?? []), 'app-server'], { cwd: this.o.cwd, env: this.o.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (c: string) => { this.buf += c; let at: number; while ((at = this.buf.indexOf('\n')) >= 0) { const line = this.buf.slice(0, at); this.buf = this.buf.slice(at + 1); if (line.trim()) this.onLine(line) } })
    child.stderr!.on('data', () => {})
    child.stdin!.on('error', () => {})
    child.on('exit', () => this.down('Codex 的常驻对话退出了'))
    child.on('error', (e) => this.down(`Codex 起不来：${e.message}`))
    this.booting = (async () => {
      const init = await this.request('initialize', { clientInfo: { name: 'boss-workbench', title: '老板工作台', version: '1.0.0' }, capabilities: { experimentalApi: true } }, 30000)
      this.version = /\/(\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(String(init?.userAgent ?? ''))?.[1] ?? ''
      if (!versionTested(this.version)) { this.close(); throw new HostError(`这版 Codex（${this.version || '读不到版本'}）还没测过常驻对话`) }
      this.send({ method: 'initialized' })
    })()
    this.booting.catch(() => this.close())
    return this.booting
  }

  private down(why: string) {
    if (!this.child) return
    this.child = null
    this.booting = null
    this.loaded.clear()
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.rej(new HostError(why)) }
    this.pending.clear()
    for (const t of this.turns.values()) t.finish({ status: 'failed', error: `${why}，这一轮没答完` })
    this.turns.clear()
    this.held.clear()
  }

  close() { const c = this.child; this.down('关掉了'); try { c?.kill() } catch { /* 已经退出 */ } }

  private onLine(line: string) {
    let m: any
    try { m = JSON.parse(line) } catch { return }
    if (m.id !== undefined && !m.method) {
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id); clearTimeout(p.timer)
      if (m.error) p.rej(new HostError(String(m.error.message ?? JSON.stringify(m.error)))); else p.res(m.result)
      return
    }
    if (m.method && m.id !== undefined) return this.onRequest(m)
    if (m.method) this.onNotice(m.method, m.params ?? {})
  }

  /** Codex 来问的：审批挂起来等网页答；别的（让人填表、问问题）这里答不了，明说，不让这一轮卡住 */
  private onRequest(m: any) {
    const p = m.params ?? {}
    if (APPROVALS.has(m.method)) {
      const threadId = String(p.threadId ?? p.conversationId ?? '')
      const key = `${threadId}:${m.id}`
      const approval = approvalOf(key, m.method, p)
      this.held.set(key, { key, rpcId: m.id, method: m.method, params: p, approval, threadId })
      this.turns.get(threadId)?.onProgress({ approvals: this.approvals(threadId) })
      return
    }
    if (m.method === 'mcpServer/elicitation/request') return this.send({ id: m.id, result: { action: 'decline' } })
    this.send({ id: m.id, error: { code: -32601, message: '工作台网页里的对话答不了这一类请求，请到 Codex 里接着做' } })
  }

  approvals(threadId: string): Approval[] { return [...this.held.values()].filter((h) => h.threadId === threadId).map((h) => h.approval) }

  /** 网页上点了允许 / 不允许 */
  answer(key: string, choice: 'allow' | 'allow-session' | 'deny') {
    const h = this.held.get(key)
    if (!h) return false
    this.held.delete(key)
    this.send({ id: h.rpcId, result: decisionFor(h.method, choice, h.params) })
    this.turns.get(h.threadId)?.onProgress({ approvals: this.approvals(h.threadId) })
    return true
  }

  private onNotice(method: string, p: any) {
    const t = p.threadId ? this.turns.get(String(p.threadId)) : undefined
    if (method === 'serverRequest/resolved') { for (const [k, h] of this.held) if (h.rpcId === p.requestId) this.held.delete(k); if (t) t.onProgress({ approvals: this.approvals(t.threadId) }); return }
    if (!t) return
    if (method === 'turn/started') { t.turnId = String(p.turn?.id ?? t.turnId ?? ''); return }
    if (method === 'item/agentMessage/delta') {
      const id = String(p.itemId ?? '')
      t.agents.set(id, (t.agents.get(id) ?? '') + String(p.delta ?? ''))
      return t.onProgress({ text: [...t.agents.values()].filter(Boolean).join('\n\n') })
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = p.item ?? {}
      if (item.type === 'agentMessage' && method === 'item/completed' && typeof item.text === 'string') { t.agents.set(String(item.id), item.text); return t.onProgress({ text: [...t.agents.values()].filter(Boolean).join('\n\n') }) }
      const s = stepOf(item)
      if (!s) return
      t.steps.set(String(item.id), method === 'item/completed' && s.state === 'running' ? { ...s, state: 'ok' } : s)
      return t.onProgress({ steps: [...t.steps.values()] })
    }
    if (method === 'turn/completed') {
      const st = String(p.turn?.status ?? '')
      const err = p.turn?.error?.message ?? p.turn?.error ?? ''
      t.finish(st === 'completed' ? { status: 'done' } : st === 'interrupted' ? { status: 'cancelled' } : { status: 'failed', error: short(err || 'Codex 没答完', 300) })
    }
  }

  /** 开一轮：没有对话就新开（在他的 Codex 历史里），有就接着（工作台重启过的先接上） */
  async startTurn(threadId: string | null, text: string, onProgress: (p: TurnProgress) => void): Promise<{ threadId: string; done: Promise<TurnProgress>; cancel: () => void }> {
    await this.ensure()
    let id = threadId
    if (id && !this.loaded.has(id)) {
      try { await this.request('thread/resume', { threadId: id, cwd: this.o.cwd, excludeTurns: true }); this.loaded.add(id) } catch { id = null }
    }
    if (!id) {
      const r = await this.request('thread/start', { cwd: this.o.cwd, developerInstructions: this.o.instructions })
      id = String(r?.thread?.id ?? '')
      if (!id) throw new HostError('Codex 没给对话编号')
      this.loaded.add(id)
    }
    if (this.turns.has(id)) throw new HostError('这个对话上一轮还没答完')
    const tid = id
    let finish!: (p: TurnProgress) => void
    const done = new Promise<TurnProgress>((res) => { finish = res })
    let timer: NodeJS.Timeout | null = null
    const turn: Turn = { threadId: tid, turnId: null, text: '', agents: new Map(), steps: new Map(), onProgress, finish: (p) => { if (timer) clearTimeout(timer); this.turns.delete(tid); for (const [k, h] of this.held) if (h.threadId === tid) this.held.delete(k); onProgress({ ...p, approvals: [] }); finish(p) } }
    this.turns.set(tid, turn)
    timer = setTimeout(() => { void this.interrupt(tid); turn.finish({ status: 'failed', error: '超过 15 分钟没答完，已停止' }) }, this.o.timeoutMs ?? 15 * 60000)
    try {
      const r = await this.request('turn/start', { threadId: tid, input: [{ type: 'text', text }] })
      turn.turnId = String(r?.turn?.id ?? turn.turnId ?? '')
    } catch (e) { turn.finish({ status: 'failed', error: (e as Error).message }); throw e }
    return { threadId: tid, done, cancel: () => { void this.interrupt(tid) } }
  }

  async interrupt(threadId: string) {
    const t = this.turns.get(threadId)
    if (!t?.turnId) return
    try { await this.request('turn/interrupt', { threadId, turnId: t.turnId }, 10000) } catch { /* 停不下就等它自己结束 */ }
  }
}
