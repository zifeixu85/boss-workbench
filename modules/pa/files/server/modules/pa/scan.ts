// 只读扫描本机的对话记录和图片目录，把元信息存进工作台数据库（表 pa_sessions、pa_outputs）。
// 记录文件只读不改；对话正文不存、不上传。文件的大小和修改时间没变就不再读（pa_files）。
// 位置可以用环境变量换（测试、换机器时用）：PA_CODEX_HOME（默认跟 Codex 一样：CODEX_HOME，没设就是 ~/.codex）、PA_CLAUDE_HOME（默认 ~/.claude）、PA_IMAGE_DIRS（多个用系统的路径分隔符隔开）。
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { DatabaseSync } from 'node:sqlite'
import { all, get, run, tx } from '../../db.ts'
import { codexIndexLine, codexParser } from './codex.ts'
import { claudeParser } from './claude.ts'
import { fileKind } from './text.ts'
import type { SessionMeta, Tool } from './types.ts'
import type { CodexLimits } from './usage-calc.ts'
import { clearSessionCache } from './store.ts'

export const codexHome = () => process.env.PA_CODEX_HOME || process.env.CODEX_HOME || join(homedir(), '.codex')
export const claudeHome = () => process.env.PA_CLAUDE_HOME || join(homedir(), '.claude')
/** Claude 桌面版的会话信息（每个对话一个小 json：标题、最后看过的时间、最后活动时间、归档、这一轮的状态） */
export const claudeAppDir = () => process.env.PA_CLAUDE_APP_DIR || join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions')
export const imageDirs = () => (process.env.PA_IMAGE_DIRS ? process.env.PA_IMAGE_DIRS.split(delimiter).filter(Boolean) : [join(codexHome(), 'generated_images')])
/** 只读最近这么多天动过的记录文件（更早的不读；已经读进来的留着） */
export const SCAN_DAYS = Number(process.env.PA_SCAN_DAYS) || 45

const LINE_CAP = 4_200_000

/** 一行一行读大文件：不把整个文件读进内存；超长的行只留开头一小段（够取时间），其余丢掉 */
export function eachLine(file: string, onLine: (line: string) => void) {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.allocUnsafe(1 << 20)
    const dec = new StringDecoder('utf8')
    let cur = ''
    let over = false
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null)
      if (n <= 0) break
      let chunk = dec.write(buf.subarray(0, n))
      for (;;) {
        const i = chunk.indexOf('\n')
        if (i < 0) break
        if (!over) cur += chunk.slice(0, i)
        onLine(cur)
        cur = ''
        over = false
        chunk = chunk.slice(i + 1)
      }
      if (!over) {
        cur += chunk
        if (cur.length > LINE_CAP) { cur = cur.slice(0, 400); over = true }
      }
    }
    if (cur) onLine(cur)
  } finally { closeSync(fd) }
}

function walk(dir: string, keep: (name: string) => boolean, depth: number, out: string[] = []): string[] {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (depth > 0) walk(p, keep, depth - 1, out) } else if (e.isFile() && keep(e.name)) out.push(p)
  }
  return out
}

/** 要看的记录文件：Codex 的 sessions/年/月/日/rollout-*.jsonl；Claude Code 的 projects/<项目>/<对话>.jsonl（子任务在更深一层，不看） */
export function sessionFiles(): { tool: Tool; file: string }[] {
  return [
    ...walk(join(codexHome(), 'sessions'), (n) => n.endsWith('.jsonl'), 4).map((file) => ({ tool: 'codex' as const, file })),
    ...walk(join(claudeHome(), 'projects'), (n) => n.endsWith('.jsonl'), 1).map((file) => ({ tool: 'claude' as const, file })),
  ]
}

/** Codex 归档了的对话（archived_sessions，新版是压缩的 .jsonl.zst）：只取用量，不进对话列表（归档的本来就不在进展里） */
export function archivedFiles(): string[] {
  return walk(join(codexHome(), 'archived_sessions'), (n) => /\.jsonl(\.zst)?$/i.test(n), 0)
}

function parseArchived(file: string): SessionMeta | null {
  const p = codexParser()
  if (/\.zst$/i.test(file)) {
    const text = zstdDecompressSync(readFileSync(file)).toString('utf8')
    let at = 0
    for (;;) { const i = text.indexOf('\n', at); const line = text.slice(at, i < 0 ? undefined : i); if (line.length <= LINE_CAP) p.line(line); if (i < 0) break; at = i + 1 }
  } else eachLine(file, (l) => p.line(l))
  return p.done()
}

function saveArchived(file: string, st: { mtimeMs: number; size: number }, m: SessionMeta | null) {
  tx(() => {
    run('INSERT INTO pa_files (file, mtime, size, session_id) VALUES (:file, :mtime, :size, NULL) ON CONFLICT(file) DO UPDATE SET mtime = :mtime, size = :size', { file, mtime: st.mtimeMs, size: st.size })
    if (m) saveUsage(file, m)
  })
}

export function parseFile(tool: Tool, file: string): SessionMeta | null {
  const p = tool === 'codex' ? codexParser() : claudeParser()
  eachLine(file, (l) => p.line(l))
  return p.done()
}

/** 用量按记录文件名记（去掉 .zst）：归档挪走、压缩后还是同一个名字 */
export const usageSrc = (file: string) => basename(file).replace(/\.zst$/i, '')

function saveUsage(file: string, m: SessionMeta) {
  const src = usageSrc(file)
  const id = `${m.tool}:${m.sid}`
  run('DELETE FROM pa_usage WHERE src = :src', { src })
  for (const [day, t] of Object.entries(m.usage ?? {})) {
    run('INSERT INTO pa_usage (src, day, session_id, tool, cwd, fresh, cached, output) VALUES (:src, :day, :id, :tool, :cwd, :fresh, :cached, :output)',
      { src, day, id, tool: m.tool, cwd: m.cwd, fresh: Math.round(t.fresh), cached: Math.round(t.cached), output: Math.round(t.output) })
  }
  if (m.limits) saveLimits(m.limits)
}

/** Codex 额度：只留时间最新的一条 */
function saveLimits(l: CodexLimits) {
  const old = codexLimits()
  if (old && old.at >= l.at) return
  run("INSERT INTO pa_state (key, value) VALUES ('codex_limits', :v) ON CONFLICT(key) DO UPDATE SET value = :v", { v: JSON.stringify(l) })
}
export function codexLimits(): CodexLimits | null {
  try { return JSON.parse(get<{ value: string }>("SELECT value FROM pa_state WHERE key = 'codex_limits'")?.value ?? 'null') as CodexLimits | null } catch { return null }
}

const outId = (key: string) => `o_${createHash('sha1').update(key).digest('hex').slice(0, 16)}`

function save(file: string, st: { mtimeMs: number; size: number }, m: SessionMeta | null) {
  const id = m ? `${m.tool}:${m.sid}` : null
  tx(() => {
    run('INSERT INTO pa_files (file, mtime, size, session_id) VALUES (:file, :mtime, :size, :sid) ON CONFLICT(file) DO UPDATE SET mtime = :mtime, size = :size, session_id = :sid', { file, mtime: st.mtimeMs, size: st.size, sid: id })
    if (!m || !id) return
    saveUsage(file, m)
    // 同一个对话编号有两份记录文件时（接着聊会另起一份），留最后活动时间更晚的那份
    const old = get<{ file: string; last_at: string }>('SELECT file, last_at FROM pa_sessions WHERE id = :id', { id })
    if (old && old.file !== file && old.last_at > m.lastAt) return
    run(`INSERT INTO pa_sessions (id, tool, sid, file, cwd, title, title_from, first, origin, kind, started_at, last_at, last_role, turn_open, asks, aborted, turns)
         VALUES (:id, :tool, :sid, :file, :cwd, :title, :title_from, :first, :origin, :kind, :started_at, :last_at, :last_role, :turn_open, :asks, :aborted, :turns)
         ON CONFLICT(id) DO UPDATE SET file = :file, cwd = :cwd, title = CASE WHEN :title <> '' THEN :title ELSE title END, title_from = CASE WHEN :title <> '' THEN :title_from ELSE title_from END,
           first = :first, origin = :origin, kind = :kind, started_at = :started_at, last_at = :last_at, last_role = :last_role, turn_open = :turn_open, asks = :asks, aborted = :aborted, turns = :turns`,
    { id, tool: m.tool, sid: m.sid, file, cwd: m.cwd, title: m.title, title_from: m.titleFrom, first: m.first, origin: m.origin, kind: m.kind, started_at: m.startedAt, last_at: m.lastAt, last_role: m.lastRole,
      turn_open: m.turnOpen ? 1 : 0, asks: m.asks ? 1 : 0, aborted: m.aborted ? 1 : 0, turns: m.turns })
    run("DELETE FROM pa_outputs WHERE session_id = :id AND source = '对话'", { id })
    // 同一个文件在一次对话里写了好几回：算一条，动作取第一次的（新建过就算新建），时间取最后一次
    const byPath = new Map<string, { action: string; at: string }>()
    for (const w of m.writes) { const o = byPath.get(w.path); byPath.set(w.path, { action: o?.action === '新建' ? '新建' : o ? o.action : w.action, at: w.at > (o?.at ?? '') ? w.at : o!.at }) }
    for (const [path, w] of byPath) {
      run('INSERT OR REPLACE INTO pa_outputs (id, session_id, path, kind, action, source, tool, at) VALUES (:oid, :id, :path, :kind, :action, :source, :tool, :at)',
        { oid: outId(`${id}|${path}`), id, path, kind: fileKind(path), action: w.action, source: '对话', tool: m.tool, at: w.at })
    }
  })
}

/** Codex 的对话标题在 session_index.jsonl 里（一行一个：编号、标题）；文件没变就不重读 */
function applyCodexTitles() {
  const file = join(codexHome(), 'session_index.jsonl')
  let st
  try { st = statSync(file) } catch { return }
  const stamp = `${st.mtimeMs}:${st.size}`
  const done = get<{ value: string }>("SELECT value FROM pa_state WHERE key = 'codex_index'")?.value
  const untitled = get<{ n: number }>("SELECT COUNT(*) AS n FROM pa_sessions WHERE tool = 'codex' AND title_from <> '索引'")?.n ?? 0
  if (done === stamp && !untitled) return
  const titles = new Map<string, string>()
  eachLine(file, (l) => { const t = codexIndexLine(l); if (t) titles.set(t.id, t.title) })
  tx(() => {
    for (const s of all<{ id: string; sid: string }>("SELECT id, sid FROM pa_sessions WHERE tool = 'codex'")) {
      const t = titles.get(s.sid)
      if (t) run("UPDATE pa_sessions SET title = :t, title_from = '索引' WHERE id = :id", { t: t.slice(0, 120), id: s.id })
    }
    run("INSERT INTO pa_state (key, value) VALUES ('codex_index', :v) ON CONFLICT(key) DO UPDATE SET value = :v", { v: stamp })
  })
}

/** Codex 桌面版自己记的看没看、归档没有：在 ~/.codex/state_5.sqlite 的 threads、thread_read_receipts 两张表里。
 *  只读打开，只取这两个标记；不是公开接口，表变了就当不知道（seen 留空，状态退回推断） */
export function codexReadState(ids: string[]): Map<string, { seen: boolean | null; archived: boolean }> {
  const out = new Map<string, { seen: boolean | null; archived: boolean }>()
  const file = join(codexHome(), 'state_5.sqlite')
  if (!ids.length || !existsSync(file)) return out
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const q = db.prepare(`SELECT t.id AS id, t.archived AS archived, r.thread_id AS rid, r.first_unread_turn AS unread
      FROM threads t LEFT JOIN thread_read_receipts r ON r.thread_id = t.id WHERE t.id = ?`)
    for (const id of ids) {
      const r = q.get(id) as { archived: number; rid: string | null; unread: string | null } | undefined
      if (r) out.set(id, { seen: r.rid ? r.unread === null : null, archived: !!r.archived })
    }
  } finally { db.close() }
  return out
}

function applyCodexState() {
  const rows = all<{ id: string; sid: string; origin: string }>("SELECT id, sid, origin FROM pa_sessions WHERE tool = 'codex'")
  // 只有桌面版的已读记录有意义（命令行一次性调用的，没人在 Codex 里看，记录一律是“没看”）
  const desk = rows.filter((r) => /desktop/i.test(r.origin))
  const state = codexReadState(desk.map((r) => r.sid))
  tx(() => {
    for (const r of desk) {
      const st = state.get(r.sid)
      run('UPDATE pa_sessions SET seen = :seen, archived = :archived WHERE id = :id', { id: r.id, seen: st?.seen === undefined || st.seen === null ? null : st.seen ? 1 : 0, archived: st?.archived ? 1 : 0 })
    }
  })
}

type ClaudeApp = { sessionId?: string; cliSessionId?: string; title?: string; lastFocusedAt?: number; lastActivityAt?: number; isArchived?: boolean; postTurnSummary?: { status_category?: string } }

/** Claude 桌面版的会话信息：只取标题、看没看（最后看过的时间不早于最后活动时间）、归档、是不是“在等你处理”。
 *  status_detail、needs_action 这些带内容的字段不取。不是公开接口，读不了就当不知道 */
export function claudeAppState(): Map<string, { appSid: string; title: string; seen: boolean | null; archived: boolean; waiting: boolean | null }> {
  const out = new Map<string, { appSid: string; title: string; seen: boolean | null; archived: boolean; waiting: boolean | null }>()
  for (const file of walk(claudeAppDir(), (n) => n.endsWith('.json'), 2)) {
    let d: ClaudeApp
    try { d = JSON.parse(readFileSync(file, 'utf8')) as ClaudeApp } catch { continue }
    if (!d.cliSessionId) continue
    const cat = d.postTurnSummary?.status_category
    const prev = out.get(d.cliSessionId)
    const next = {
      appSid: /^local_[0-9a-f-]{8,}$/i.test(d.sessionId ?? '') ? d.sessionId! : '',
      title: (d.title ?? '').slice(0, 120),
      seen: d.lastFocusedAt && d.lastActivityAt ? d.lastFocusedAt >= d.lastActivityAt : null,
      archived: !!d.isArchived,
      waiting: cat ? cat === 'blocked' : null,
    }
    // 同一个对话在桌面版里可能有两份（换过文件夹），留最后活动的那份
    if (!prev || (d.lastActivityAt ?? 0) > 0) out.set(d.cliSessionId, prev && !next.title ? { ...next, title: prev.title } : next)
  }
  return out
}

function applyClaudeApp() {
  const state = claudeAppState()
  if (!state.size) return
  tx(() => {
    for (const r of all<{ id: string; sid: string }>("SELECT id, sid FROM pa_sessions WHERE tool = 'claude'")) {
      const st = state.get(r.sid)
      if (!st) continue
      run(`UPDATE pa_sessions SET seen = :seen, archived = :archived, app_waiting = :waiting, kind = '对话', app_sid = :app_sid,
             title = CASE WHEN :title <> '' THEN :title ELSE title END, title_from = CASE WHEN :title <> '' THEN '桌面版' ELSE title_from END WHERE id = :id`,
      { id: r.id, seen: st.seen === null ? null : st.seen ? 1 : 0, archived: st.archived ? 1 : 0, waiting: st.waiting === null ? null : st.waiting ? 1 : 0, title: st.title, app_sid: st.appSid || null })
    }
  })
}

/** 图片目录：<目录>/<对话编号>/<图片>。目录名对得上某个对话就挂到它上面 */
function scanImages() {
  const seen = new Set<string>()
  for (const dir of imageDirs()) {
    for (const file of walk(dir, (n) => fileKind(n) === '图片', 3)) {
      const id = outId(`img|${file}`)
      seen.add(id)
      if (get('SELECT 1 FROM pa_outputs WHERE id = :id', { id })) continue
      let at = ''
      try { at = statSync(file).mtime.toISOString() } catch { continue }
      const parent = basename(join(file, '..'))
      const sid = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(parent) ? `codex:${parent}` : null
      run("INSERT INTO pa_outputs (id, session_id, path, kind, action, source, tool, at) VALUES (:id, :sid, :path, '图片', '生成', '图片目录', :tool, :at)", { id, sid, path: file, tool: sid ? 'codex' : '', at })
    }
  }
  // 图片被用户删了、挪了：从清单里去掉（只是清单，图片本身工作台不碰）
  for (const r of all<{ id: string }>("SELECT id FROM pa_outputs WHERE source = '图片目录'")) if (!seen.has(r.id)) run('DELETE FROM pa_outputs WHERE id = :id', { id: r.id })
}

export type ScanResult = { files: number; read: number; left: number; sessions: number; ms: number; errors: string[] }
let running: Promise<ScanResult> | null = null

/** 扫一遍。budgetMs：最多花这么久，没读完的下次接着读（left > 0）；读每个文件之间让出一下，网页不会卡住 */
export async function scan(opts: { budgetMs?: number; force?: boolean } = {}): Promise<ScanResult> {
  if (running) return running
  running = (async () => {
    const t0 = Date.now()
    const errors: string[] = []
    const since = Date.now() - SCAN_DAYS * 864e5
    const todo: { tool: Tool; file: string; st: { mtimeMs: number; size: number } }[] = []
    let files = 0
    for (const f of sessionFiles()) {
      let st
      try { st = statSync(f.file) } catch { continue }
      if (st.mtimeMs < since) continue
      files++
      const old = opts.force ? undefined : get<{ mtime: number; size: number }>('SELECT mtime, size FROM pa_files WHERE file = :f', { f: f.file })
      if (!old || old.mtime !== st.mtimeMs || old.size !== st.size) todo.push({ ...f, st: { mtimeMs: st.mtimeMs, size: st.size } })
    }
    // 归档了的 Codex 对话：只取用量（近 SCAN_DAYS 天归档的）
    const archived: { file: string; st: { mtimeMs: number; size: number } }[] = []
    for (const file of archivedFiles()) {
      let st
      try { st = statSync(file) } catch { continue }
      if (st.mtimeMs < since) continue
      const old = opts.force ? undefined : get<{ mtime: number; size: number }>('SELECT mtime, size FROM pa_files WHERE file = :f', { f: file })
      if (!old || old.mtime !== st.mtimeMs || old.size !== st.size) archived.push({ file, st: { mtimeMs: st.mtimeMs, size: st.size } })
    }
    // 最近动过的先读
    todo.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
    let read = 0
    for (const f of todo) {
      if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break
      try { save(f.file, f.st, parseFile(f.tool, f.file)) } catch (err) { errors.push(`${basename(f.file)}：${(err as Error).message}`) }
      read++
      await new Promise((r) => setImmediate(r))
    }
    for (const f of archived) {
      if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break
      try { saveArchived(f.file, f.st, parseArchived(f.file)) } catch (err) { errors.push(`${basename(f.file)}：${(err as Error).message}`) }
      read++
      await new Promise((r) => setImmediate(r))
    }
    try { applyCodexTitles() } catch (err) { errors.push(`Codex 标题：${(err as Error).message}`) }
    try { applyCodexState() } catch (err) { errors.push(`Codex 已读记录：${(err as Error).message}`) }
    try { applyClaudeApp() } catch (err) { errors.push(`Claude 桌面版会话信息：${(err as Error).message}`) }
    try { scanImages() } catch (err) { errors.push(`图片目录：${(err as Error).message}`) }
    const now = new Date().toISOString()
    run("INSERT INTO pa_state (key, value) VALUES ('scanned_at', :v) ON CONFLICT(key) DO UPDATE SET value = :v", { v: now })
    clearSessionCache()
    return { files: files + archived.length, read, left: todo.length + archived.length - read, sessions: get<{ n: number }>('SELECT COUNT(*) AS n FROM pa_sessions')?.n ?? 0, ms: Date.now() - t0, errors }
  })()
  try { return await running } finally { running = null }
}

export const scannedAt = () => get<{ value: string }>("SELECT value FROM pa_state WHERE key = 'scanned_at'")?.value ?? null

/** 页面打开时不等扫描（2026-11-26：先出页面）：离上次扫超过 1 分钟就在后台扫一遍，返回“正在扫”，页面过一会儿再取一次 */
export function scanSoon(maxAgeMs = 60_000): boolean {
  if (running) return true
  const at = scannedAt()
  if (at && Date.now() - Date.parse(at) < maxAgeMs) return false
  setImmediate(() => { void scan({ budgetMs: 3000 }).catch(() => {}) })
  return true
}

/** 页面打开时：离上次扫超过 1 分钟就再扫一遍（最多花 3 秒，剩下的下次接着） */
export async function scanIfStale(maxAgeMs = 60_000): Promise<ScanResult | null> {
  const at = scannedAt()
  if (at && Date.now() - Date.parse(at) < maxAgeMs) return null
  return scan({ budgetMs: 3000 })
}

/** 本机有没有这两个工具的记录目录（页面上照实说） */
export function sources() {
  return [
    { tool: 'codex', name: 'Codex', dir: join(codexHome(), 'sessions'), found: existsSync(join(codexHome(), 'sessions')) },
    { tool: 'claude', name: 'Claude Code', dir: join(claudeHome(), 'projects'), found: existsSync(join(claudeHome(), 'projects')) },
  ]
}
