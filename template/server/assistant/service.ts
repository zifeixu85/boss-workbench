// AI 助手的对话记录和调度：一次只跑一轮；网页每 1.5 秒取一次进度（跑完以后，Codex 写的东西由实时刷新带到各页面）
import { all, get, run, uid, nowIso } from '../db.ts'
import { BadRequest } from '../services/common.ts'
import { getSettings } from '../services/today.ts'
import { today } from '../services/common.ts'
import { buildPrompt, codexInfo, runAssistant, type PageContext, type Progress, type RunHandle } from './runner.ts'

type Row = { id: string; role: 'user' | 'assistant'; text: string; status: string; error: string | null; steps_json: string | null; page_title: string | null; page_path: string | null; created_at: string; finished_at: string | null }
const shape = (r: Row) => ({ ...r, steps: r.steps_json ? JSON.parse(r.steps_json) : [], steps_json: undefined })

let current: { id: string; handle: RunHandle } | null = null

export async function status(force = false) {
  const { info } = await codexInfo(force)
  const s = get<{ value: string }>("SELECT value FROM settings WHERE key = 'assistant_on'")?.value
  return { ready: info.ready, version: info.version, detail: info.detail, fix: info.fix, on: s !== '0', running: current?.id ?? null }
}

export function messages(limit = 40) {
  const rows = all<Row & { seq?: number }>('SELECT * FROM (SELECT *, rowid AS seq FROM assistant_messages ORDER BY created_at DESC, rowid DESC LIMIT :n) ORDER BY created_at, seq', { n: limit })
  return rows.map(({ seq: _seq, ...r }) => shape(r))
}

/** 新开一段对话：清掉记录（正在跑的先停） */
export function clear() {
  current?.handle.cancel()
  run('DELETE FROM assistant_messages')
  return { cleared: true }
}

export async function ask(input: { text?: unknown; page?: PageContext }) {
  const text = String(input.text ?? '').trim()
  if (!text) throw new BadRequest('要写想让 AI 做什么')
  if (text.length > 4000) throw new BadRequest('一次说得太长了，拆成几次说')
  if (current) throw new BadRequest('上一个问题还在答，等它答完或者先点“停止”')
  const st = await status()
  if (!st.on) throw new BadRequest('AI 助手关着：到“设置 → AI 助手”打开')
  if (!st.ready) throw new BadRequest(`${st.detail}。${st.fix ?? ''}`)
  const history = all<{ role: 'user' | 'assistant'; text: string }>("SELECT role, text FROM assistant_messages WHERE status = 'done' ORDER BY created_at DESC, rowid DESC LIMIT 10").reverse()
  const at = nowIso()
  const page = input.page && typeof input.page === 'object' ? { title: String(input.page.title ?? '').slice(0, 80), path: String(input.page.path ?? '').slice(0, 200), text: String(input.page.text ?? '') } : undefined
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
  const handle = runAssistant(prompt, save)
  current = { id: uidBot, handle }
  handle.done.finally(() => { if (current?.id === uidBot) current = null })
  return { id: uidBot }
}

export function stop() {
  if (!current) return { stopped: false }
  current.handle.cancel()
  return { stopped: true }
}

/** 服务重启时，上次没跑完的标成中断 */
export function markInterrupted() {
  run("UPDATE assistant_messages SET status = 'failed', error = '工作台重启了，这一轮没答完', finished_at = :at WHERE status = 'running'", { at: nowIso() })
}
