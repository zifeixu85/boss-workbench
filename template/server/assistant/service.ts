// 页面里的 AI 助手（默认关，设置里能打开）的对话记录和调度：一次只跑一轮；网页每 1.5 秒取一次进度（跑完以后，Codex 写的东西由实时刷新带到各页面）
// 两种方式（设置 assistant_engine）：simple 一问一答（每问一次跑一次 codex exec，隔离）；codex 常驻对话（host.ts：和他在 Codex 里开对话一样，
// 用他自己的插件、技能、规矩，权限照他 Codex 的设置，要问“是否允许”时网页上弹出来）。常驻对话起不来、版本没测过，降级成一问一答并说明。
import { all, get, run, uid, nowIso } from '../db.ts'
import { BadRequest } from '../services/common.ts'
import { getSettings } from '../services/today.ts'
import { today } from '../services/common.ts'
import { buildPrompt, codexInfo, runAssistant, type PageContext, type Progress, type RunHandle } from './runner.ts'
import { CodexHost, HostError, type Approval } from './host.ts'
import { APP_DIR, DB_PATH, ROOT } from '../db.ts'
import { describePage } from './page-context.ts'

type Row = { id: string; role: 'user' | 'assistant'; text: string; status: string; error: string | null; steps_json: string | null; page_title: string | null; page_path: string | null; created_at: string; finished_at: string | null }
const shape = (r: Row) => ({ ...r, steps: r.steps_json ? JSON.parse(r.steps_json) : [], steps_json: undefined })

let current: { id: string; handle: RunHandle; threadId?: string } | null = null
let host: CodexHost | null = null
/** 常驻对话这一轮在等他点的审批（只在内存里：工作台重启了，Codex 那边这一轮也就断了） */
let waiting: Approval[] = []
const engineOf = () => (get<{ value: string }>("SELECT value FROM settings WHERE key = 'assistant_engine'")?.value === 'codex' ? 'codex' : 'simple')
const threadKey = 'assistant_thread'
const savedThread = () => get<{ value: string }>('SELECT value FROM settings WHERE key = :k', { k: threadKey })?.value || null
const saveThread = (id: string | null) => id ? run('INSERT INTO settings (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v', { k: threadKey, v: id }) : run('DELETE FROM settings WHERE key = :k', { k: threadKey })
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
  return { ready: info.ready, version: info.version, detail: info.detail, fix: info.fix, on: s === '1', running: current?.id ?? null, engine: engineOf() }
}

export function messages(limit = 40) {
  const rows = all<Row & { seq?: number }>('SELECT * FROM (SELECT *, rowid AS seq FROM assistant_messages ORDER BY created_at DESC, rowid DESC LIMIT :n) ORDER BY created_at, seq', { n: limit })
  // 常驻对话这一轮在等他点的“是否允许”，挂在正在答的那一条上
  return rows.map(({ seq: _seq, ...r }) => ({ ...shape(r), ...(current?.id === r.id && waiting.length ? { approvals: waiting } : {}) }))
}

/** 新开一段对话：清掉记录（正在跑的先停） */
export function clear() {
  if (starting) starting.cancelled = true
  current?.handle.cancel()
  run('DELETE FROM assistant_messages')
  saveThread(null) // 常驻对话：下一句开一个新的 Codex 对话（旧的留在他的 Codex 历史里）
  return { cleared: true }
}

export async function ask(input: { text?: unknown; page?: PageContext }) {
  const text = String(input.text ?? '').trim()
  if (!text) throw new BadRequest('要写想让 AI 做什么')
  if (text.length > 4000) throw new BadRequest('一次说得太长了，拆成几次说')
  if (current || starting) throw new BadRequest('上一个问题还在答，等它答完或者先点“停止”')
  const attempt = { cancelled: false }
  starting = attempt
  try {
  const st = await status()
  if (attempt.cancelled) throw new BadRequest('这一轮已停止')
  if (!st.on) throw new BadRequest('AI 助手关着：到“设置 → AI 助手”打开')
  if (!st.ready) throw new BadRequest(`${st.detail}。${st.fix ?? ''}`)
  const history = all<{ role: 'user' | 'assistant'; text: string }>("SELECT role, text FROM assistant_messages WHERE status = 'done' ORDER BY created_at DESC, rowid DESC LIMIT 10").reverse()
  const at = nowIso()
  const pg = input.page as (PageContext & { selection?: unknown }) | undefined
  const page = pg && typeof pg === 'object' ? { title: String(pg.title ?? '').slice(0, 80), path: String(pg.path ?? '').slice(0, 200), text: String(pg.text ?? ''), selection: String(pg.selection ?? '').slice(0, 2000) } : undefined
  const uidUser = uid('am'), uidBot = uid('am')
  run('INSERT INTO assistant_messages (id, role, text, status, page_title, page_path, created_at, finished_at) VALUES (:id, \'user\', :text, \'done\', :t, :p, :at, :at)', { id: uidUser, text, t: page?.title ?? null, p: page?.path ?? null, at })
  run('INSERT INTO assistant_messages (id, role, text, status, created_at) VALUES (:id, \'assistant\', \'\', \'running\', :at)', { id: uidBot, at: nowIso() })
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
  }
  if (engineOf() === 'codex') {
    const viaHost = await startOnHost(uidBot, text, page, st.version, save).catch((e: Error) => e)
    if (!(viaHost instanceof Error)) return { id: uidBot }
    // 常驻对话起不来（版本没测过、协议对不上、进程退了）：降级成一问一答，说一句原因，不报错
    save({ steps: [{ tool: 'fallback', label: `常驻对话没起来，先用一问一答：${viaHost.message}`, state: 'failed' }] })
  }
  const handle = runAssistant(prompt, save)
  current = { id: uidBot, handle }
  handle.done.finally(() => { if (current?.id === uidBot) current = null })
  return { id: uidBot }
  } finally { if (starting === attempt) starting = null }
}

/** 常驻对话开一轮：每句前面带上他在看的页面（哪一页、打开的对象、选中的文字），对话记在他自己的 Codex 历史里 */
async function startOnHost(uidBot: string, text: string, page: (PageContext & { selection?: string }) | undefined, _version: string | null, save: (p: Progress) => void) {
  const { info } = await codexInfo()
  if (!info.bin) throw new HostError('没找到 Codex 的命令')
  if (!host) host = new CodexHost({ bin: info.bin, cwd: ROOT, instructions: instructions() })
  const h = host
  let steps: Progress['steps'] = []
  const turn = await h.startTurn(savedThread(), `${describePage(page)}\n\n${text}`, (p) => {
    if (p.approvals) waiting = p.approvals
    if (p.steps) steps = p.steps
    save({ ...(p.text !== undefined ? { text: p.text } : {}), ...(p.steps ? { steps } : {}), ...(p.status ? { status: p.status } : {}), ...(p.error !== undefined ? { error: p.error } : {}) })
  })
  saveThread(turn.threadId)
  const handle: RunHandle = { cancel: turn.cancel, done: turn.done.then(() => undefined) }
  current = { id: uidBot, handle, threadId: turn.threadId }
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
