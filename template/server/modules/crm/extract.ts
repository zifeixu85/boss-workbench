import { readKbTextFile as readFileSync, canReadKbPath } from '../../services/kb.ts'
// 新材料提取：从知识库收件箱选一份（或粘贴），交给本机 Codex 提取“你答应的、对方的状态、顾虑、怎么定（谁拍板、哪天定）、下一步”。归属：大客户模块。
// 真接 Codex（codex exec，工作目录是知识库根目录、只读、不读用户配置、按 JSON 格式回答），150 秒没做完就停，如实说。
// Codex 回来后，工作台再按《判断规则》核对一遍价格（rules.ts）；和规则对不上的标黄，等老板定。
// 写入、撤销在 extract-write.ts；预先跑好的备用结果在 prepared.ts。
// 第二轮：提示词瘦身（客户档案只给要用的几节、规则和价格只给表格），超时放宽到 150 秒；显示前规整文字（tidy.ts）；
//         结果里带上这位客户在谈的商机（金额要不要改由老板定）和还没发的关怀草稿（新材料让它过时了，可以顺手“不做”）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { all, get, run, uid, nowIso, logChange, ROOT } from '../../db.ts'
import { now } from '../../clock.ts'
import { type Actor, NotFound, today } from '../../services/common.ts'
import { findClient } from '../../services/clients.ts'
import { findClientNote } from '../../services/kb.ts'
import { assistantOf, identity } from '../../services/identity.ts'
import { runCodex, findCodex } from './codex.ts'
import { guessClient, readInbox } from './materials.ts'
import { checkClosure, checkPromises, checkVisit, precheck, PRICE_FILE, RULE_FILE, type Conflict } from './rules.ts'
import { storeClosure } from './closure.ts'
import { extractStart } from './schema.ts'
import { tidy } from './tidy.ts'
import { preparedFor } from './prepared.ts'

/** 提取最多等多久：默认 150 秒（实测 28—71 秒，网络慢时留余量）。环境变量 CRM_CODEX_TIMEOUT_MS 可改 */
export const EXTRACT_TIMEOUT_MS = Number(process.env.CRM_CODEX_TIMEOUT_MS || 150_000)

const s = { type: 'string' } as const
const obj = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props })
const arr = (items: unknown) => ({ type: 'array', items })

/** Codex 要按这个格式回答（--output-schema） */
export const SCHEMA = obj({
  client: obj({ name: s, sure: { type: 'boolean' }, why: s }),
  date: s,
  channel: { type: 'string', enum: ['微信', '电话', '面谈', '到店', '邮件', '其他'] },
  with_whom: s,
  summary: s,
  my_promises: arr(obj({ who: s, to_whom: s, text: s, due: s, quote: s, conflict: s, rule: s })),
  their_status: s,
  not_decided: { type: 'boolean' },
  concerns: arr(s),
  signals: arr(s),
  next_steps: arr(obj({ text: s, due: s })),
  next_follow: obj({ date: s, why: s }),
  facts: arr(obj({ kind: { type: 'string', enum: ['口味', '包装', '送礼对象', '禁忌', '顾虑', '习惯', '生日', '重要日子'] }, text: s, date: s, who: s })),
  conflicts: arr(obj({ about: s, rule: s, rule_file: s, why: s, suggestion: s })),
  deal_size: obj({ qty: s, unit_price: s, why: s }),
  unsure: arr(s),
})

const str = z.string().catch('')
export const resultShape = z.object({
  client: z.object({ name: str, sure: z.boolean().catch(false), why: str }).catch({ name: '', sure: false, why: '' }),
  date: str, channel: str, with_whom: str, summary: str,
  my_promises: z.array(z.object({ who: str, to_whom: str, text: str, due: str, quote: str, conflict: str, rule: str })).catch([]),
  their_status: str, not_decided: z.boolean().catch(false),
  concerns: z.array(z.string()).catch([]), signals: z.array(z.string()).catch([]),
  next_steps: z.array(z.object({ text: str, due: str })).catch([]),
  next_follow: z.object({ date: str, why: str }).catch({ date: '', why: '' }),
  facts: z.array(z.object({ kind: str, text: str, date: str, who: str })).catch([]),
  conflicts: z.array(z.object({ about: str, rule: str, rule_file: str, why: str, suggestion: str })).catch([]),
  deal_size: z.object({ qty: str, unit_price: str, why: str }).catch({ qty: '', unit_price: '', why: '' }),
  unsure: z.array(z.string()).catch([]),
})
export type CodexExtract = z.infer<typeof resultShape>

const readKb = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) ? readFileSync(abs, 'utf8') : '' }
const strip = (md: string) => md.replace(/^---[\s\S]*?---\n/, '').replace(/^>.*\n/gm, '').trim()
/** 只留要用的几节（按“## 标题”切），去掉来源、关怀建议这些提取用不上的 */
function sections(md: string, keep: (title: string) => boolean) {
  return strip(md).split(/\n(?=## )/).filter((sec) => !sec.startsWith('## ') || keep(sec.split('\n')[0])).join('\n').trim()
}

export function buildPrompt(material: string, sourceLabel: string, clientId: string | null) {
  const t = today()
  let who = ''
  if (clientId) {
    const c = get<{ id: string; name: string; kb_path: string | null; contact_name: string | null }>('SELECT id, name, kb_path, contact_name FROM clients WHERE id = :id', { id: clientId })
    const note = c ? findClientNote(c) : null
    who = `## 这份材料看着是 ${c?.name ?? ''} 的（联系人 ${c?.contact_name ?? '未知'}）`
    if (note?.path) who += `\n档案（${note.path}，节选）：\n${sections(readKb(note.path), (h) => !/来源|关怀建议/.test(h)).slice(0, 3200)}`
  } else {
    const clients = all<{ name: string; contact_name: string | null }>("SELECT name, contact_name FROM clients WHERE kind = '客户' ORDER BY key_account DESC, name")
    who = `## 工作台里的客户（名称｜联系人）——材料里没写是谁，对得上才填，对不上就说不知道\n${clients.map((c) => `${c.name}｜${c.contact_name ?? ''}`).join('\n')}`
  }
  const rules = sections(readKb(RULE_FILE), (h) => !/来源|还没成规则/.test(h)).slice(0, 2200)
  const shut = storeClosure()
  const price = sections(readKb(PRICE_FILE), (h) => /四款礼盒|下单规矩/.test(h)).slice(0, 1800)
  const me = identity()
  return `${assistantOf(me)}。从下面这份新材料里，提取客户跟进要记的东西。今天是 ${t}。
当前目录是${me.owner}的知识库（只读，不要改任何文件）。要用的档案、规则、价格下面都附上了，不用再去读别的文件，直接回答。

规矩：
1. 只写材料里有的。不知道的写空字符串，不编。
2. 日期字段（date、due、next_follow.date、facts 的 date）写 YYYY-MM-DD，年份按今天推（材料里的“28 号”就是 ${t.slice(0, 8)}28）；每年重复的生日写 --MM-DD。
   其他文字里的日期写成“10月28日”“1月10日”这样，不写 2026-10-28；数字和中文之间空一格（“约 80 份”“每份 300 以内”）。
3. “我先考虑一下”“再看看”“可能”不算成交，也不算对方答应。照实写进 their_status，not_decided 填 true。
4. my_promises 只写${me.owner}（或我们这边的人）亲口答应对方的事：谁答应、答应谁、答应什么、哪天前；text 里不要再写日期（日期放 due）；quote 抄原话。对方的要求不算我们答应。
5. ${me.owner}答应的价格、交期、赠品，和下面《判断规则》对不上的，在那条 promise 的 conflict 写为什么对不上、rule 写规则编号和一句话；同时写进 conflicts。规则标“待确认”的也照样对照，但要说它是待确认的。
6. 说话人或客户对不上号的，client.sure 填 false，why 写为什么，name 留空，不要硬猜。
7. facts 只记以后关怀、做方案用得上的：口味、包装、送礼对象、禁忌、顾虑、习惯、生日、重要日子（年会、开会定的日子）。不记手机号、住址。
8. next_steps 只写我们这边下一步要做、有日子的事（2—3 条），不要把答应的事再抄一遍；next_follow 写建议哪天再联系、为什么。${shut ? `
   门店 ${shut.from} 到 ${shut.to} 停业装修（${shut.source ?? '06-项目/门店改造.md'}）：约在门店见面、品鉴、喝茶、留包间的日子落在这几天的，写进 conflicts（rule 写“门店改造停业”），不要约在这几天。` : ''}
9. deal_size：对方这次说的份数和每份价格（或上限），只写数字；没说写空字符串；why 一句话说依据。
10. 用中文，短句，像${me.owner}自己记的笔记。只回 JSON。

## 新材料（${sourceLabel}）
${material.slice(0, 8000)}

${who}

## 判断规则（${RULE_FILE}）
${rules}

## 礼盒和价格（${PRICE_FILE}）
${price}
`
}

export type Row = {
  id: string; source_kind: string; source_path: string | null; raw_text: string; client_id: string | null; status: string; engine: string | null; model: string | null
  result: string | null; error: string | null; started_at: string; finished_at: string | null; written_at: string | null; written: string | null
  kb_path: string | null; kb_line: string | null; kb_backup: string | null; kb_written_at: string | null
}

/** 服务重启时还在“提取中”的（进程已经没了），如实标出错 */
function markStale() {
  const cut = new Date(now().getTime() - EXTRACT_TIMEOUT_MS - 60_000).toISOString()
  run("UPDATE crm_extractions SET status = '出错', error = '提取到一半服务重启了，再试一次', finished_at = :at WHERE status = '提取中' AND started_at < :cut", { at: nowIso(), cut })
}

const running = new Set<string>()
const pending = new Map<string, Promise<void>>()
/** 提取进行到哪一步（从 Codex 的运行日志里认出来的，见 codex.ts）：第几秒、做什么。做完就清掉 */
const steps = new Map<string, { s: number; text: string }[]>()

/** 等某次提取做完（命令行用：网页是轮询） */
export const extractionDone = (id: string) => pending.get(id) ?? Promise.resolve()

export function codexStatus() {
  const bin = findCodex()
  return { available: !!bin, timeout_s: Math.round(EXTRACT_TIMEOUT_MS / 1000) }
}

/** 开始提取：先存一条“提取中”，后台跑 Codex，网页每隔一会儿来问结果 */
export function startExtraction(input: unknown, actor: Actor) {
  const data = extractStart.parse(input)
  markStale()
  let raw: string
  let path: string | null = null
  if (data.source_path) { path = data.source_path; raw = readInbox(path) } else raw = data.text!
  const guess = data.client_id ? { client_id: findClient(data.client_id).id } : guessClient(path?.split('/').pop() ?? '', raw.replace(/^---[\s\S]*?---/, ''))
  const id = uid('ex')
  run(`INSERT INTO crm_extractions (id, source_kind, source_path, raw_text, client_id, status, engine, started_at)
       VALUES (:id, :kind, :path, :raw, :cid, '提取中', 'Codex', :at)`, { id, kind: path ? '知识库收件箱' : '粘贴', path, raw, cid: guess.client_id, at: nowIso() })
  logChange(actor, 'extraction', id, '开始', `让 Codex 提取${path ? path.split('/').pop() : '一段粘贴的文字'}`)
  const prompt = buildPrompt(raw, path ?? `${identity().owner}粘贴的文字`, guess.client_id)
  running.add(id)
  const t0 = Date.now()
  steps.set(id, [{ s: 0, text: `工作台把材料、${guess.client_id ? '这位客户的档案' : '客户名单（材料里没写是谁）'}、判断规则和礼盒价格交给 Codex` }])
  const onProgress = (text: string) => steps.set(id, [...(steps.get(id) ?? []), { s: Math.round((Date.now() - t0) / 1000), text }])
  const job = runCodex({ prompt, schema: SCHEMA, cwd: ROOT, timeoutMs: EXTRACT_TIMEOUT_MS, onProgress }).then((r) => {
    running.delete(id)
    steps.delete(id)
    if (r.status === '完成') {
      const parsed = resultShape.safeParse(r.json)
      if (!parsed.success) {
        run("UPDATE crm_extractions SET status = '出错', error = :e, model = :m, finished_at = :at WHERE id = :id", { e: 'Codex 回的格式不对，再试一次', m: r.model, at: nowIso(), id })
        return
      }
      run("UPDATE crm_extractions SET status = '待确认', result = :res, model = :m, finished_at = :at, error = NULL WHERE id = :id", { res: JSON.stringify(parsed.data), m: r.model, at: nowIso(), id })
      logChange('Codex', 'extraction', id, '完成', `Codex 提取完了，用时 ${Math.round(r.ms / 1000)} 秒，等${identity().owner}确认`)
    } else {
      run('UPDATE crm_extractions SET status = :s, error = :e, model = :m, finished_at = :at WHERE id = :id', { s: r.status, e: r.error, m: r.model, at: nowIso(), id })
    }
  }).catch((err: Error) => {
    running.delete(id)
    steps.delete(id)
    run("UPDATE crm_extractions SET status = '出错', error = :e, finished_at = :at WHERE id = :id", { e: err.message, at: nowIso(), id })
  }).finally(() => pending.delete(id))
  pending.set(id, job)
  return getExtraction(id)
}

/** Codex 用不了或超时：换成预先跑好的那一份（如实标“预先跑的，不是现场生成”） */
export function startPrepared(input: unknown, actor: Actor) {
  const data = z.object({ source_path: z.string().min(1, '选一份收件箱里的材料') }).parse(input)
  const p = preparedFor(data.source_path)
  if (!p) throw new NotFound('这份材料没有预先跑好的结果')
  const parsed = resultShape.parse(p.result)
  const raw = readInbox(data.source_path)
  const guess = guessClient(data.source_path.split('/').pop() ?? '', raw.replace(/^---[\s\S]*?---/, ''))
  const id = uid('ex')
  const at = nowIso()
  run(`INSERT INTO crm_extractions (id, source_kind, source_path, raw_text, client_id, status, engine, model, result, started_at, finished_at)
       VALUES (:id, '知识库收件箱', :path, :raw, :cid, '待确认', :engine, :model, :res, :at, :at)`, {
    id, path: data.source_path, raw, cid: guess.client_id, engine: `预先跑好的 · ${p.ran_at_label}`, model: p.model, res: JSON.stringify(parsed), at,
  })
  logChange(actor, 'extraction', id, '开始', `用${p.ran_at_label}预先用 Codex 跑过的提取结果（不是现场生成）：${data.source_path.split('/').pop()}`)
  return getExtraction(id)
}

/** 显示用：Codex 写的文字规整一下（原文照存不动） */
function tidyResult(r: CodexExtract): CodexExtract {
  const y = today().slice(0, 4)
  const t = (x: string) => tidy(x, y)
  return {
    ...r, summary: t(r.summary), their_status: t(r.their_status), with_whom: r.with_whom,
    my_promises: r.my_promises.map((p) => ({ ...p, text: t(p.text), conflict: t(p.conflict), rule: t(p.rule) })),
    concerns: r.concerns.map(t), signals: r.signals.map(t), next_steps: r.next_steps.map((x) => ({ ...x, text: t(x.text) })),
    next_follow: { ...r.next_follow, why: t(r.next_follow.why) }, facts: r.facts.map((f) => ({ ...f, text: t(f.text) })),
    conflicts: r.conflicts.map((c) => ({ ...c, about: t(c.about), rule: t(c.rule), why: t(c.why), suggestion: t(c.suggestion) })),
    deal_size: { ...r.deal_size, why: t(r.deal_size.why) }, unsure: r.unsure.map(t),
  }
}

const num = (s: string) => { const m = s.replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null }

/** 一次提取的全部：原文、Codex 结果、工作台核对出的冲突、这位客户之前记着的事、在谈的商机、写回知识库的预览 */
export function getExtraction(id: string) {
  markStale()
  const r = get<Row>('SELECT * FROM crm_extractions WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这次提取')
  const raw = r.result ? resultShape.parse(JSON.parse(r.result)) : null
  const result = raw ? tidyResult(raw) : null
  const clients = all<{ id: string; name: string; contact_name: string | null }>('SELECT id, name, contact_name FROM clients')
  const matched = result && !r.client_id && result.client.sure ? clients.find((c) => c.name === result.client.name) ?? null : null
  const clientId = r.client_id ?? matched?.id ?? null
  const client = clientId ? get<{ id: string; name: string; contact_name: string | null; next_follow: string | null; next_step: string | null; stage: string; kb_path: string | null }>('SELECT * FROM clients WHERE id = :id', { id: clientId }) ?? null : null
  const isNew = clientId ? !get("SELECT 1 FROM orders WHERE client_id = :id AND status = '已完成' AND amount > 0", { id: clientId }) : true
  const local = result ? checkPromises(result.my_promises, r.raw_text, isNew) : []
  // 第三轮（README 线索 5）：答应的事落在门店停业那几天、又是在门店办的，也标黄；材料里对方说“下周来门店”撞上停业也标
  const shut = storeClosure()
  const closed = result ? checkClosure(result.my_promises, shut) : []
  const materialDate = (result && /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : null) ?? r.source_path?.split('/').pop()?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null
  const visit = checkVisit(r.raw_text, materialDate, shut)
  const promises = (result?.my_promises ?? []).map((p, i) => {
    const mine = local[i] ?? closed[i]
    const by = [p.conflict ? 'Codex' : null, mine ? '工作台核对' : null].filter(Boolean) as string[]
    return { ...p, conflict: p.conflict || mine?.why || '', rule: p.rule || mine?.rule || '', conflict_by: by }
  })
  const conflicts: Conflict[] = (result?.conflicts ?? []).map((c) => ({ ...c, by: ['Codex'] }))
  for (const m of [...local, ...closed, visit]) {
    if (!m) continue
    const store = /停业/.test(m.rule)
    const same = conflicts.find((c) => (store ? /停业|装修|门店/.test(`${c.rule}${c.why}${c.about}`) : /规则\s*2|单价不降/.test(`${c.rule}${c.why}`)))
    if (same) same.by = [...new Set([...same.by, '工作台核对'])]
    else conflicts.push(m)
  }
  const openPromises = clientId ? all("SELECT * FROM client_promises WHERE client_id = :id AND status = '待兑现' ORDER BY COALESCE(due,'9999')", { id: clientId }) : []
  const openTodos = clientId ? all("SELECT id, title, due, status FROM todos WHERE client_id = :id AND status IN ('待办','进行中','等别人') ORDER BY COALESCE(due,'9999') LIMIT 8", { id: clientId }) : []
  const openCare = clientId ? all("SELECT id, occasion, date, message, author, status FROM client_care WHERE client_id = :id AND status IN ('建议','已安排') ORDER BY COALESCE(date,'9999')", { id: clientId }) : []
  const deals = clientId ? all<{ id: string; title: string; stage: string; amount: number | null; estimated: number; basis: string | null }>(
    "SELECT id, title, stage, amount, estimated, basis FROM deals WHERE client_id = :id AND stage NOT IN ('已签约','没成') ORDER BY amount DESC", { id: clientId }) : []
  const traits = clientId ? all<{ kind: string; text: string }>('SELECT kind, text FROM client_traits WHERE client_id = :id', { id: clientId }) : []
  const qty = result ? num(result.deal_size.qty) : null
  const price = result ? num(result.deal_size.unit_price) : null
  const written = r.written ? JSON.parse(r.written) : null
  return {
    ...r, result, promises, conflicts, client, client_guess_id: clientId, is_new_client: isNew,
    open_promises: openPromises, open_todos: openTodos, open_care: openCare, deals, traits,
    hints: r.status === '提取中' || r.status === '待确认' ? precheck(r.raw_text) : [],
    closure: shut,
    deal_hint: qty && price ? { qty, unit_price: price, amount: Math.round((qty * price) / 100) / 100, why: result!.deal_size.why } : null,
    prepared: (() => { const p = r.source_path && !(r.engine ?? '').startsWith('预先') ? preparedFor(r.source_path) : null; return p ? { label: p.ran_at_label, seconds: p.seconds, model: p.model } : null })(),
    elapsed_s: Math.max(0, Math.round(((r.finished_at ? new Date(r.finished_at).getTime() : now().getTime()) - new Date(r.started_at).getTime()) / 1000)),
    running: running.has(r.id), timeout_s: Math.round(EXTRACT_TIMEOUT_MS / 1000), progress: steps.get(r.id) ?? [],
    written,
  }
}

export function listExtractions(limit = 12) {
  markStale()
  return all(`SELECT e.id, e.source_kind, e.source_path, e.client_id, c.name AS client_name, e.status, e.engine, e.model, e.error, e.started_at, e.finished_at, e.written_at, e.kb_path
    FROM crm_extractions e LEFT JOIN clients c ON c.id = e.client_id ORDER BY e.started_at DESC LIMIT :n`, { n: limit })
}
