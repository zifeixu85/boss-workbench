// 页面里的 AI 助手（默认关，设置里能打开）的对话和调度：一次只跑一轮；网页每 1.5 秒取一次进度（跑完以后，Codex 写的东西由实时刷新带到各页面）
// 两种方式（设置 assistant_engine）：simple 一问一答（每问一次跑一次 codex exec，隔离）；codex 常驻对话（host.ts：和他在 Codex 里开对话一样，
// 用他自己的插件、技能、规矩，权限照他 Codex 的设置，要问“是否允许”时网页上弹出来）。常驻对话起不来、版本没测过，降级成一问一答并说明。
// 2026-11-26 照 A梦 自用工作台的对话框改：能开好几个对话（assistant_threads），在历史里切换、改名；常驻对话的每个对话对应他 Codex 里的一个对话。
import { all, get, run, uid, nowIso } from '../db.ts'
import { BadRequest, NotFound } from '../services/common.ts'
import { getSettings } from '../services/today.ts'
import { today } from '../services/common.ts'
import { buildPrompt, codexInfo, runAssistant, type PageContext, type Progress, type RunHandle } from './runner.ts'
import { CodexHost, HostError, type Approval } from './host.ts'
import { APP_DIR, DB_PATH, ROOT } from '../db.ts'
import { describePage, openObject } from './page-context.ts'

type Row = { id: string; thread_id: string | null; role: 'user' | 'assistant'; text: string; status: string; error: string | null; steps_json: string | null; page_title: string | null; page_path: string | null; page_selection: string | null; created_at: string; finished_at: string | null }
type ThreadRow = { id: string; title: string; codex_thread_id: string | null; archived: number; created_at: string; updated_at: string }
const shape = (r: Row) => ({ ...r, steps: r.steps_json ? JSON.parse(r.steps_json) : [], steps_json: undefined })

let current: { id: string; thread: string; handle: RunHandle } | null = null
let host: CodexHost | null = null
/** 常驻对话这一轮在等他点的审批（只在内存里：工作台重启了，Codex 那边这一轮也就断了） */
let waiting: Approval[] = []
const engineOf = () => (get<{ value: string }>("SELECT value FROM settings WHERE key = 'assistant_engine'")?.value === 'codex' ? 'codex' : 'simple')
/** 给常驻对话的话：它在哪个工作台里（一台电脑上可能有好几个工作台，Codex 里也可能接着别的工作台的工具），用哪条命令读写这一个 */
const instructions = () => [
  '你在老板工作台网页右边的对话栏里被调用，和他在 Codex 里开对话是同一回事：照他的规矩、技能、插件做事。',
  '每条消息前面带着他当时在看的工作台页面（哪一页、打开的是哪个对象、选中的文字），“这个”“这里”指的就是它。',
  `这个工作台：程序在 ${APP_DIR}，数据库 ${DB_PATH}，知识库 ${ROOT}。读写这个工作台里的东西，在程序文件夹里用 WORKBENCH_ROOT="${ROOT}" WORKBENCH_DB="${DB_PATH}" node server/cli.ts <命令>（先 capabilities 看有哪些命令），或者用指向这个程序的工作台插件；名字不同、指向别的工作台的工具不是这一个，不要拿来读写。写完网页会自己刷新。`,
  '用中文，先说结论。',
].join('\n')

let starting: { cancelled: boolean } | null = null

export async function status(force = false) {
  const { info } = await codexInfo(force)
  const s = get<{ value: string }>("SELECT value FROM settings WHERE key = 'assistant_on'")?.value
  // 默认关（2026-11-12）：日常用法是在 Codex 里说、工作台开在右侧面板（Codex 插件）；页面里的对话栏要用再到设置里打开
  return { ready: info.ready, version: info.version, detail: info.detail, fix: info.fix, on: s === '1', running: current?.id ?? null, running_thread: current?.thread ?? null, engine: engineOf() }
}

// ───────────────────────────── 对话（历史）

/** 历史里的对话：标题、最后一句、在不在答；按最后动的时间从新到旧 */
export function threads(o: { archived?: boolean } = {}) {
  const rows = all<ThreadRow>('SELECT * FROM assistant_threads WHERE archived = :a ORDER BY updated_at DESC LIMIT 200', { a: o.archived ? 1 : 0 })
  return rows.map((t) => {
    const last = get<{ text: string }>("SELECT text FROM assistant_messages WHERE thread_id = :id AND text <> '' ORDER BY created_at DESC, rowid DESC LIMIT 1", { id: t.id })
    return { id: t.id, title: t.title, archived: !!t.archived, created_at: t.created_at, updated_at: t.updated_at, last: (last?.text ?? '').replace(/\s+/g, ' ').slice(0, 80), running: current?.thread === t.id, codex: !!t.codex_thread_id }
  })
}

const threadRow = (id: string) => get<ThreadRow>('SELECT * FROM assistant_threads WHERE id = :id', { id })

/** 新开一个对话（还没说话前不进历史：第一句发出去才建） */
function createThread(firstText: string) {
  const id = uid('at')
  const at = nowIso()
  const title = firstText.replace(/\s+/g, ' ').trim().slice(0, 24) || '新对话'
  run('INSERT INTO assistant_threads (id, title, created_at, updated_at) VALUES (:id, :title, :at, :at)', { id, title, at })
  return id
}

/** 改名、归档、找回 */
export function updateThread(id: string, input: { title?: unknown; archived?: unknown }) {
  if (!threadRow(id)) throw new NotFound('没有这个对话')
  if (input.title !== undefined) {
    const title = String(input.title).replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!title) throw new BadRequest('对话名不能是空的')
    run('UPDATE assistant_threads SET title = :title WHERE id = :id', { id, title })
  }
  if (input.archived !== undefined) {
    if (input.archived && current?.thread === id) throw new BadRequest('这个对话还在答，等它答完再归档')
    run('UPDATE assistant_threads SET archived = :a WHERE id = :id', { id, a: input.archived ? 1 : 0 })
  }
  return threads().find((t) => t.id === id) ?? threads({ archived: true }).find((t) => t.id === id)
}

/** 一个对话里的消息（没给对话：最近的那个对话）；在等他点的“是否允许”挂在正在答的那一条上 */
export function messages(threadId?: string | null, limit = 80) {
  const id = threadId === undefined ? get<{ id: string }>('SELECT id FROM assistant_threads WHERE archived = 0 ORDER BY updated_at DESC LIMIT 1')?.id ?? null : threadId
  if (!id) return []
  const rows = all<Row & { seq?: number }>('SELECT * FROM (SELECT *, rowid AS seq FROM assistant_messages WHERE thread_id = :t ORDER BY created_at DESC, rowid DESC LIMIT :n) ORDER BY created_at, seq', { t: id, n: limit })
  return rows.map(({ seq: _seq, ...r }) => ({ ...shape(r), ...(current?.id === r.id && waiting.length ? { approvals: waiting } : {}) }))
}

/** 老接口：清掉记录 = 正在跑的先停；之后的一句开新对话（旧对话留在历史里） */
export function clear() {
  if (starting) starting.cancelled = true
  current?.handle.cancel()
  return { cleared: true }
}

// ───────────────────────────── 说一句

export async function ask(input: { text?: unknown; page?: PageContext; thread?: unknown }) {
  const text = String(input.text ?? '').trim()
  if (!text) throw new BadRequest('要写想让 AI 做什么')
  if (text.length > 4000) throw new BadRequest('一次说得太长了，拆成几次说')
  if (current || starting) throw new BadRequest('上一个问题还在答，等它答完或者先点“停止”')
  const asked = input.thread ? String(input.thread) : null
  if (asked && !threadRow(asked)) throw new NotFound('这个对话不在了，开一个新对话再说')
  const attempt = { cancelled: false }
  starting = attempt
  try {
  const st = await status()
  if (attempt.cancelled) throw new BadRequest('这一轮已停止')
  if (!st.on) throw new BadRequest('AI 助手关着：到“设置 → AI 助手”打开')
  if (!st.ready) throw new BadRequest(`${st.detail}。${st.fix ?? ''}`)
  const thread = asked ?? createThread(text)
  const history = all<{ role: 'user' | 'assistant'; text: string }>("SELECT role, text FROM assistant_messages WHERE thread_id = :t AND status = 'done' ORDER BY created_at DESC, rowid DESC LIMIT 10", { t: thread }).reverse()
  const at = nowIso()
  const pg = input.page as (PageContext & { selection?: unknown }) | undefined
  const page = pg && typeof pg === 'object' ? { title: String(pg.title ?? '').slice(0, 80), path: String(pg.path ?? '').slice(0, 200), text: String(pg.text ?? ''), selection: String(pg.selection ?? '').slice(0, 2000) } : undefined
  const uidUser = uid('am'), uidBot = uid('am')
  // 本页胶囊显示的是“打开的对象”（认得出就用对象名，认不出用页面标题）
  const shown = page?.path ? (openObject(page.path).replace(/（.*$/, '').replace(/^“我关注的”对象 · /, '') || page.title) : null
  run('INSERT INTO assistant_messages (id, thread_id, role, text, status, page_title, page_path, page_selection, created_at, finished_at) VALUES (:id, :t, \'user\', :text, \'done\', :pt, :pp, :ps, :at, :at)',
    { id: uidUser, t: thread, text, pt: shown, pp: page?.path ?? null, ps: page?.selection || null, at })
  run('INSERT INTO assistant_messages (id, thread_id, role, text, status, created_at) VALUES (:id, :t, \'assistant\', \'\', \'running\', :at)', { id: uidBot, t: thread, at: nowIso() })
  run('UPDATE assistant_threads SET updated_at = :at, archived = 0 WHERE id = :id', { id: thread, at })
  const s = getSettings()
  const prompt = buildPrompt({ text, page, history, today: today(), owner: s.owner, business: s.business, modules: s.modules })
  const save = (p: Progress) => {
    const fields: string[] = []
    const params: Record<string, string | null> = { id: uidBot }
    if (p.text !== undefined) { fields.push('text = :text'); params.text = p.text }
    if (p.steps) { fields.push('steps_json = :steps'); params.steps = JSON.stringify(p.steps) }
    if (p.status) { fields.push('status = :status', 'finished_at = :fin'); params.status = p.status; params.fin = nowIso() }
    if (p.error !== undefined) { fields.push('error = :error'); params.error = p.error }
    if (fields.length) run(`UPDATE assistant_messages SET ${fields.join(', ')} WHERE id = :id`, params)
    if (p.status) run('UPDATE assistant_threads SET updated_at = :at WHERE id = :id', { id: thread, at: nowIso() })
  }
  if (engineOf() === 'codex') {
    const viaHost = await startOnHost(thread, uidBot, text, page, save).catch((e: Error) => e)
    if (!(viaHost instanceof Error)) return { id: uidBot, thread }
    // 常驻对话起不来（版本没测过、协议对不上、进程退了）：降级成一问一答，说一句原因，不报错
    save({ steps: [{ tool: 'fallback', label: `常驻对话没起来，先用一问一答：${viaHost.message}`, state: 'failed' }] })
  }
  const handle = runAssistant(prompt, save)
  current = { id: uidBot, thread, handle }
  handle.done.finally(() => { if (current?.id === uidBot) current = null })
  return { id: uidBot, thread }
  } finally { if (starting === attempt) starting = null }
}

/** 常驻对话开一轮：每句前面带上他在看的页面（哪一页、打开的对象、选中的文字），对话记在他自己的 Codex 历史里（一个工作台对话对应一个 Codex 对话） */
async function startOnHost(thread: string, uidBot: string, text: string, page: (PageContext & { selection?: string }) | undefined, save: (p: Progress) => void) {
  const { info } = await codexInfo()
  if (!info.bin) throw new HostError('没找到 Codex 的命令')
  if (!host) host = new CodexHost({ bin: info.bin, cwd: ROOT, instructions: instructions() })
  const h = host
  let steps: Progress['steps'] = []
  const turn = await h.startTurn(threadRow(thread)?.codex_thread_id ?? null, `${describePage(page)}\n\n${text}`, (p) => {
    if (p.approvals) waiting = p.approvals
    if (p.steps) steps = p.steps
    save({ ...(p.text !== undefined ? { text: p.text } : {}), ...(p.steps ? { steps } : {}), ...(p.status ? { status: p.status } : {}), ...(p.error !== undefined ? { error: p.error } : {}) })
  })
  run('UPDATE assistant_threads SET codex_thread_id = :c WHERE id = :id', { id: thread, c: turn.threadId })
  const handle: RunHandle = { cancel: turn.cancel, done: turn.done.then(() => undefined) }
  current = { id: uidBot, thread, handle }
  turn.done.finally(() => { waiting = []; if (current?.id === uidBot) current = null })
}

/** 网页上点了“允许 / 这次对话都允许 / 不允许” */
export function approve(input: { key?: unknown; choice?: unknown }) {
  const key = String(input.key ?? '')
  const choice = input.choice === 'allow' || input.choice === 'allow-session' || input.choice === 'deny' ? input.choice : null
  if (!choice) throw new BadRequest('choice 只能是 allow、allow-session、deny')
  if (!host?.answer(key, choice)) throw new BadRequest('这一条已经答过了，或者这一轮已经结束')
  waiting = waiting.filter((a) => a.key !== key)
  return { answered: true }
}

export function stop() {
  if (starting) { starting.cancelled = true; return { stopped: true } }
  if (!current) return { stopped: false }
  current.handle.cancel()
  return { stopped: true }
}

/** 服务重启时，上次没跑完的标成中断 */
export function markInterrupted() {
  run("UPDATE assistant_messages SET status = 'failed', error = '工作台重启了，这一轮没答完', finished_at = :at WHERE status = 'running'", { at: nowIso() })
}
