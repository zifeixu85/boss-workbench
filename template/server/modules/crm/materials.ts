// 知识库收件箱里的新材料（00-收件箱/*.md）和写回客户文件。归属：大客户模块。
// 读：列出还没整理的材料，猜是哪位客户的（文件名、正文里出现客户名或联系人）。拿不准就不猜。
// 写（第二轮修 #17）：客户文件里几处跟着改——开头的“上次联系 / 下次跟进 / 更新”、“答应过的事”表格加行、“往来记录”末尾加一行；
//      第三轮：“偏好与重要日子”对应那一行后面追加（不删原文）、“还缺：…”后面补一句、“顾虑”加一条；收件箱原件末尾加一行备注；
//      标黄的答应老板定了以后，客户文件“答应过的事”那一行后面追加怎么定的。
//      写之前先把原文件备份到数据库旁边的 备份/知识库/（services/kb.ts 的 backupKbFile），网页上先给看要改哪几处。撤销时按记下的改动逐处退回（不整份覆盖）。
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, ROOT } from '../../db.ts'
import { BadRequest, NotFound } from '../../services/common.ts'
import { backupKbFile, findClientNote, kbPath } from '../../services/kb.ts'
import { preparedFor } from './prepared.ts'
import { identity } from '../../services/identity.ts'

export const INBOX_DIR = '00-收件箱'

export type InboxFile = {
  path: string; title: string; date: string | null; speakers: string | null; recorder: string | null
  client_id: string | null; client_name: string | null; guess_why: string | null
  size: number; updated: string
  extraction: { id: string; status: string; started_at: string } | null
  prepared: boolean // 有没有预先跑好的备用结果（prepared/）
  in_kb: boolean // 客户文件的往来记录里已经引用过这份材料（整理过了）
}

type ClientKey = { id: string; name: string; contact_name: string | null; key_account: number }

function frontmatter(text: string) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const out: Record<string, string> = {}
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim() }
  return out
}

/** 公司名取前两个字（衡言律师事务所 → 衡言），人名、短名用全名 */
const shortName = (name: string) => (name.length > 4 ? name.slice(0, 2) : name)

/** 猜材料是哪位客户的：先看文件名，再看正文。大客户的联系人名字也算；对上两位以上就不猜 */
export function guessClient(fileName: string, text: string, clients = all<ClientKey>('SELECT id, name, contact_name, key_account FROM clients')) {
  const hits = new Map<string, { c: ClientKey; why: string }>()
  for (const c of clients) {
    const keys = [c.name, shortName(c.name)]
    const inName = keys.find((k) => fileName.includes(k))
    const inText = keys.find((k) => text.includes(k))
    const contact = c.key_account && c.contact_name && c.contact_name.length >= 2 && text.includes(c.contact_name) ? c.contact_name : null
    if (inName) hits.set(c.id, { c, why: `文件名里有“${inName}”` })
    else if (inText) hits.set(c.id, { c, why: `正文里提到“${inText}”` })
    else if (contact) hits.set(c.id, { c, why: `正文里有联系人“${contact}”` })
  }
  const byName = [...hits.values()].filter((h) => h.why.startsWith('文件名'))
  const pick = byName.length === 1 ? byName : [...hits.values()]
  if (pick.length !== 1) return { client_id: null, client_name: null, why: pick.length ? `对上了 ${pick.length} 位：${pick.map((h) => h.c.name).join('、')}，要你选` : '材料里没写是谁，说话人不明' }
  return { client_id: pick[0].c.id, client_name: pick[0].c.name, why: pick[0].why }
}

/** 收件箱里的材料（不含 README），按日期从旧到新 */
export function listInbox(): InboxFile[] {
  const dir = join(ROOT, INBOX_DIR)
  if (!existsSync(dir)) return []
  const clients = all<ClientKey>('SELECT id, name, contact_name, key_account FROM clients')
  const runs = all<{ id: string; source_path: string; status: string; started_at: string }>(
    "SELECT id, source_path, status, started_at FROM crm_extractions WHERE source_path IS NOT NULL AND status != '放弃' ORDER BY started_at DESC")
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('.')).map((f) => {
    const path = `${INBOX_DIR}/${f}`
    const abs = join(dir, f)
    const text = readFileSync(abs, 'utf8')
    const fm = frontmatter(text)
    const g = guessClient(f, text.replace(/^---[\s\S]*?---/, ''), clients)
    const run = runs.find((r) => r.source_path === path) ?? null
    const note = g.client_id ? findClientNote({ id: g.client_id, name: g.client_name!, kb_path: get<{ kb_path: string | null }>('SELECT kb_path FROM clients WHERE id = :id', { id: g.client_id })?.kb_path }) : null
    const inKb = note?.path ? readFileSync(join(ROOT, note.path), 'utf8').includes(path) : false
    return {
      path, title: text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f.replace(/\.md$/, ''), date: fm['日期'] ?? (f.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null),
      speakers: fm['说话人'] ?? null, recorder: fm['记录人'] ?? null,
      client_id: g.client_id, client_name: g.client_name, guess_why: g.why,
      size: statSync(abs).size, updated: statSync(abs).mtime.toISOString(),
      extraction: run ? { id: run.id, status: run.status, started_at: run.started_at } : null, in_kb: inKb, prepared: !!preparedFor(path),
    }
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.path.localeCompare(b.path)) // 旧的在前：和演示顺序一致（先衡言 10/23，再澜拓 10/26）
}

/** 客户列表的“有新材料”：收件箱里认得出是谁、还没写进工作台、知识库也还没整理的 */
export function inboxFor() {
  try {
    return listInbox().filter((f) => f.client_id && !f.in_kb && f.extraction?.status !== '已写入')
  } catch { return [] }
}

export function readInbox(path: string) {
  if (!path.startsWith(`${INBOX_DIR}/`)) throw new BadRequest('只能读知识库收件箱里的材料')
  const abs = kbPath(path)
  if (!existsSync(abs)) throw new NotFound(`收件箱里没有这份材料：${path}`)
  return readFileSync(abs, 'utf8')
}


// ───────────── 写回知识库：客户文件（开头几行、答应过的事、偏好与重要日子、顾虑、往来记录） ─────────────

export type HeaderChange = { key: string; old: string | null; new: string }
/** 原地追加：这一行原来是什么、改成什么（只在后面加字，不删原文） */
export type LineEdit = { label: string; old: string; new: string }
/** 新加的一行（加在哪一节） */
export type LineAdd = { label: string; line: string }
export type Pref = { key: string; text: string }
export type ClientKbInput = {
  line: string; date: string; next_follow?: string | null; today: string; rows: string[]
  /** 喜好、生日、重要日子：写进“偏好与重要日子” */
  prefs?: Pref[]
  /** 新听到的顾虑：写进“顾虑” */
  concerns?: string[]
  /** 哪次说的，例如“10/26 电话” */
  said?: string
}
type Plan = {
  path: string; line: string; after: string | null; section: boolean; lines: string[]; at: number
  header: HeaderChange[]; rows: string[]; rowsAt: number | null
  edits: (LineEdit & { i: number })[]; adds: (LineAdd & { at: number })[]
}

const headerValue = (lines: string[], key: string) => {
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  const i = end > 0 ? lines.slice(1, end).findIndex((l) => l.startsWith(`${key}:`)) + 1 : 0
  return i > 0 ? { i, value: lines[i].slice(key.length + 1).trim() } : null
}
/** 一节的范围：标题那一行到下一个“## ”之前 */
function sectionOf(lines: string[], title: RegExp) {
  const start = lines.findIndex((l) => title.test(l.trim()))
  if (start < 0) return null
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end < 0) end = lines.length
  return { start, end }
}
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const rowOf = (cs: string[]) => `| ${cs.join(' | ')} |`
const noParen = (s: string) => s.replace(/[（）()]/g, ' ').replace(/\s+/g, ' ').trim()

/** 偏好与重要日子：表格（澜拓、衡言这种）对应那一行追加；列表（许国平这种）对应那一条追加；都没有就加一行 */
function planPrefs(lines: string[], x: ClientKbInput) {
  const edits: (LineEdit & { i: number })[] = []
  const adds: (LineAdd & { at: number })[] = []
  const prefs = x.prefs ?? []
  if (!prefs.length) return { edits, adds, missing: false }
  const sec = sectionOf(lines, /^##\s*偏好与重要日子/)
  if (!sec) return { edits, adds, missing: true }
  const said = x.said ?? md(x.date)
  const src = `${x.date} ${said.replace(/^\d+\/\d+\s*/, '')}（工作台提取，${identity().owner} ${md(x.today)} 确认）`
  const cur = new Map<number, string>()
  const value = (i: number) => cur.get(i) ?? lines[i]
  let lastRow = -1
  for (let i = sec.start + 1; i < sec.end; i++) if (/^\|/.test(lines[i].trim())) lastRow = i
  const table = lastRow > sec.start
  for (const p of prefs) {
    if (table) {
      const i = lines.findIndex((l, j) => j > sec.start && j < sec.end && /^\|/.test(l.trim()) && cells(l)[0] === p.key)
      if (i >= 0) {
        const cs = cells(value(i))
        cs[1] = `${cs[1]}；${said} 补：${p.text}`
        cs[2] = !cs[2] || cs[2] === '—' ? src : `${cs[2]}；${src}`
        cur.set(i, rowOf(cs))
      } else adds.push({ label: `偏好与重要日子 · 加一行“${p.key}”`, line: rowOf([p.key, p.text, src]), at: lastRow + 1 })
    } else {
      const i = lines.findIndex((l, j) => j > sec.start && j < sec.end && new RegExp(`^-\\s*${p.key}[：:]`).test(l.trim()))
      if (i >= 0) cur.set(i, `${value(i).replace(/[。\s]+$/, '')}；${said} 补：${p.text}。`)
      else {
        let at = sec.end
        while (at > sec.start + 1 && !lines[at - 1].trim()) at--
        adds.push({ label: `偏好与重要日子 · 加一条“${p.key}”`, line: `- ${p.key}：${p.text}（${src}）`, at })
      }
    }
  }
  for (const [i, v] of cur) edits.push({ label: `偏好与重要日子 · ${cells(lines[i])[0] && table ? cells(lines[i])[0] : lines[i].replace(/^-\s*/, '').split(/[：:]/)[0]}`, old: lines[i], new: v, i })
  // “还缺：周明远个人的口味、生日；…”后面补一句
  const next = sectionOf(lines, /^##\s*当前判断与下一步/)
  if (next) {
    const i = lines.findIndex((l, j) => j > next.start && j < next.end && /^-\s*还缺[：:]/.test(l.trim()))
    const filled = i >= 0 ? prefs.map((p) => p.key).filter((k, j, a) => a.indexOf(k) === j && lines[i].includes(k)) : []
    if (filled.length) edits.push({ label: '当前判断与下一步 · 还缺', old: lines[i], new: `${lines[i].replace(/\s+$/, '')}（${md(x.today)} 补：${filled.join('、')}已记进“偏好与重要日子”）`, i })
  }
  return { edits, adds, missing: false }
}

/** 新听到的顾虑：加在“## 顾虑”最后一条后面（和已有的说的是一件事就不加） */
function planConcerns(lines: string[], x: ClientKbInput) {
  const out: (LineAdd & { at: number })[] = []
  const sec = sectionOf(lines, /^##\s*顾虑/)
  if (!sec || !x.concerns?.length) return out
  let at = sec.end
  while (at > sec.start + 1 && !lines[at - 1].trim()) at--
  const have = lines.slice(sec.start, sec.end).join('')
  for (const c of x.concerns) {
    const t = c.replace(/[。；;\s]+$/, '')
    if (!t || have.includes(t.slice(0, 8))) continue
    out.push({ label: '顾虑 · 加一条', line: `- ${t}（${x.said ?? md(x.date)}；工作台提取，${identity().owner} ${md(x.today)} 确认）。`, at })
  }
  return out
}

/** 算出要改哪几处：开头三行（只改真变了的）；“答应过的事”表格最后一行后面加新答应；偏好、顾虑；“往来记录”最后一条后面加一行 */
function plan(clientId: string, x: ClientKbInput): Plan {
  const c = get<{ id: string; name: string; kb_path: string | null }>('SELECT id, name, kb_path FROM clients WHERE id = :id', { id: clientId })
  if (!c) throw new NotFound('找不到这位客户')
  const note = findClientNote(c)
  if (!note.path) throw new BadRequest(`${c.name}在知识库里没有客户文件，这次只写工作台`)
  const text = readFileSync(kbPath(note.path), 'utf8')
  const lines = text.split('\n')
  // 开头几行
  const header: HeaderChange[] = []
  const last = headerValue(lines, '上次联系')
  if (last && (!/^\d{4}-\d{2}-\d{2}$/.test(last.value) || last.value < x.date)) header.push({ key: '上次联系', old: last.value, new: x.date })
  const next = headerValue(lines, '下次跟进')
  if (next && x.next_follow && next.value !== x.next_follow) header.push({ key: '下次跟进', old: next.value, new: x.next_follow })
  const upd = headerValue(lines, '更新')
  if (upd && upd.value !== x.today) header.push({ key: '更新', old: upd.value, new: x.today })
  // 答应过的事：表格最后一行后面
  let rowsAt: number | null = null
  const ps = sectionOf(lines, /^##\s*答应过的事\s*$/)
  if (ps && x.rows.length) {
    let lastRow = -1
    for (let i = ps.start + 1; i < ps.end; i++) if (/^\|/.test(lines[i].trim())) lastRow = i
    if (lastRow > ps.start) rowsAt = lastRow + 1
  }
  const prefs = planPrefs(lines, x)
  const adds = [...prefs.adds, ...planConcerns(lines, x)]
  // 往来记录
  const head = lines.findIndex((l) => /^##\s*往来记录\s*$/.test(l.trim()))
  const base = { path: note.path, line: x.line, lines, header, rows: rowsAt === null ? [] : x.rows, rowsAt, edits: prefs.edits, adds }
  if (head >= 0) {
    let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l))
    if (end < 0) end = lines.length
    let lastLine = end - 1
    while (lastLine > head && !lines[lastLine].trim()) lastLine--
    return { ...base, after: lastLine > head ? lines[lastLine] : lines[head], section: true, at: lastLine + 1 }
  }
  const src = lines.findIndex((l) => /^##\s*来源/.test(l.trim()))
  return { ...base, after: null, section: false, at: src >= 0 ? src : lines.length }
}

const publicEdits = (p: Plan) => p.edits.map(({ label, old, new: n }) => ({ label, old, new: n }))
const publicAdds = (p: Plan) => p.adds.map(({ label, line }) => ({ label, line }))

export function kbPreview(clientId: string, x: ClientKbInput) {
  const p = plan(clientId, x)
  return { path: p.path, line: p.line, after: p.after, new_section: !p.section, header: p.header, rows: p.rows, edits: publicEdits(p), adds: publicAdds(p) }
}

function backupOf(rel: string, stamp: string) {
  const backup = backupKbFile(rel, stamp)
  if (!backup) throw new NotFound(`知识库里没有这个文件：${rel}`)
  return backup
}

/** 写进客户文件。先备份原文件（备份/知识库/日期时间-文件名），返回改了哪几处和备份位置 */
export function kbAppend(clientId: string, x: ClientKbInput, stamp: string) {
  if (!x.line.trim() || x.line.includes('\n')) throw new BadRequest('往来记录只能追加一行')
  const p = plan(clientId, { ...x, line: x.line.trim() })
  const backup = backupOf(p.path, stamp)
  // 先原地追加（行号不变），再从后往前插新行，前面的行号不受影响
  let lines = p.lines.map((l, i) => p.edits.find((e) => e.i === i)?.new ?? l)
  const inserts: { at: number; add: string[] }[] = [{ at: p.at, add: p.section ? [p.line] : ['## 往来记录', '', p.line, ''] }]
  if (p.rowsAt !== null && p.rows.length) inserts.push({ at: p.rowsAt, add: p.rows })
  for (const a of p.adds) inserts.push({ at: a.at, add: [a.line] })
  for (const ins of inserts.sort((a, b) => b.at - a.at)) lines = [...lines.slice(0, ins.at), ...ins.add, ...lines.slice(ins.at)]
  for (const h of p.header) {
    const hv = headerValue(lines, h.key)
    if (hv) lines = lines.map((l, i) => (i === hv.i ? `${h.key}: ${h.new}` : l))
  }
  writeFileSync(kbPath(p.path), lines.join('\n'), 'utf8')
  return { path: p.path, line: p.line, backup, header: p.header, rows: p.rows, new_section: !p.section, edits: publicEdits(p), adds: publicAdds(p) }
}

/** 撤销：把加进去的行删掉（只删第一处一模一样的），原地追加的改回原样，开头几行还是写进去的值就改回原来的。老板之后自己改过的地方不动 */
export function kbRevert(rel: string, w: { line: string; header: HeaderChange[]; rows: string[]; new_section?: boolean; edits?: LineEdit[]; adds?: LineAdd[] }) {
  const abs = kbPath(rel)
  if (!existsSync(abs)) return { ok: false, why: '文件不在了' }
  let lines = readFileSync(abs, 'utf8').split('\n')
  // 写入后老板又在工作台定了例外 / 规则该改，那一行后面多了“（工作台：张总 … ）”：去掉这句再比（第四轮修：crm-reset 后衡言多一行）
  const drop = (t: string) => {
    let i = lines.indexOf(t)
    if (i < 0) i = lines.findIndex((l) => l.includes('（工作台：') && l.replace(DECISION_RE, '') === t)
    if (i >= 0) lines = [...lines.slice(0, i), ...lines.slice(i + 1)]
    return i >= 0
  }
  const removed = [w.line, ...w.rows, ...(w.adds ?? []).map((a) => a.line)].map(drop).filter(Boolean).length
  for (const e of w.edits ?? []) { const i = lines.indexOf(e.new); if (i >= 0) lines = lines.map((l, j) => (j === i ? e.old : l)) }
  for (const h of w.header) {
    const hv = headerValue(lines, h.key)
    if (hv && hv.value === h.new && h.old !== null) lines = lines.map((l, i) => (i === hv.i ? `${h.key}: ${h.old}` : l))
  }
  writeFileSync(abs, lines.join('\n'), 'utf8')
  return { ok: true, removed }
}

// ───────────── 收件箱原件末尾的备注（照 00-收件箱 的规矩：原样保存，要补充就在末尾加“备注：……（谁、哪天）”） ─────────────

export const INBOX_MARK = '（工作台）'

export function inboxNote(path: string, text: string) {
  const abs = kbPath(path)
  if (!path.startsWith(`${INBOX_DIR}/`) || !existsSync(abs)) return null
  const body = readFileSync(abs, 'utf8')
  const line = `备注：${text}${INBOX_MARK}`
  const suffix = `${body.endsWith('\n') ? '' : '\n'}\n${line}\n`
  writeFileSync(abs, body + suffix, 'utf8')
  return { path, line, suffix }
}

/** 撤销备注：文件末尾还是加的那段就切掉；被改过就只删那一行 */
export function inboxNoteRevert(n: { path: string; line: string; suffix: string }) {
  const abs = kbPath(n.path)
  if (!existsSync(abs)) return false
  const body = readFileSync(abs, 'utf8')
  if (body.endsWith(n.suffix)) { writeFileSync(abs, body.slice(0, -n.suffix.length), 'utf8'); return true }
  const lines = body.split('\n')
  const i = lines.indexOf(n.line)
  if (i < 0) return false
  writeFileSync(abs, [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n'), 'utf8')
  return true
}

/** 演示复原：收件箱里工作台加的备注都删掉 */
export function inboxNotesRemoveAll() {
  const dir = join(ROOT, INBOX_DIR)
  if (!existsSync(dir)) return 0
  let n = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const abs = join(dir, f)
    const body = readFileSync(abs, 'utf8')
    if (!body.includes(INBOX_MARK)) continue
    const kept = body.split('\n').filter((l) => !(l.startsWith('备注：') && l.endsWith(INBOX_MARK)))
    writeFileSync(abs, `${kept.join('\n').replace(/\n{3,}$/, '\n').replace(/\n+$/, '')}\n`, 'utf8')
    n++
  }
  return n
}

// ───────────── 标黄的答应老板定了：客户文件“答应过的事”那一行后面追加怎么定的 ─────────────

// 称呼按设置写（“张总”），认的时候不管是谁的称呼：改过称呼以后也能撤销
const DECISION_RE = /（工作台：[^\s（）]{1,20} \d+\/\d+ (?:定为例外|说规则该改)[^）]*）/g

/** 在客户文件“答应过的事”表格里找这件事那一行，最后一格后面追加“（工作台：张总 10/27 定为例外：…）”。找不到就不改 */
export function kbDecisionNote(clientId: string, promise: string, decision: '例外' | '改规则', note: string, today: string, stamp: string) {
  const c = get<{ id: string; name: string; kb_path: string | null }>('SELECT id, name, kb_path FROM clients WHERE id = :id', { id: clientId })
  if (!c) return null
  const kb = findClientNote(c)
  if (!kb.path) return null
  const lines = readFileSync(kbPath(kb.path), 'utf8').split('\n')
  const sec = sectionOf(lines, /^##\s*答应过的事\s*$/)
  if (!sec) return null
  const key = promise.replace(/[\s，。；、“”（）()：:,.;]/g, '').slice(0, 10)
  const i = lines.findIndex((l, j) => j > sec.start && j < sec.end && /^\|/.test(l.trim()) && l.replace(/[\s，。；、“”（）()：:,.;]/g, '').includes(key))
  if (i < 0) return null
  const cs = cells(lines[i])
  const what = decision === '例外' ? `定为例外：${noParen(note)}` : `说规则该改：${noParen(note)}，见待确认的发现`
  cs[cs.length - 1] = `${cs[cs.length - 1]}（工作台：${identity().owner} ${md(today)} ${what}）`
  const backup = backupOf(kb.path, stamp)
  const next = rowOf(cs)
  writeFileSync(kbPath(kb.path), lines.map((l, j) => (j === i ? next : l)).join('\n'), 'utf8')
  return { path: kb.path, old: lines[i], new: next, backup }
}

/** 演示复原：客户文件里工作台追加的“定为例外 / 规则该改”都去掉 */
export function kbDecisionNotesRemoveAll() {
  const paths = all<{ id: string; name: string; kb_path: string | null }>('SELECT id, name, kb_path FROM clients WHERE key_account = 1')
    .map((c) => findClientNote(c).path).filter((p): p is string => !!p)
  let n = 0
  for (const rel of [...new Set(paths)]) {
    const abs = kbPath(rel)
    const body = readFileSync(abs, 'utf8')
    if (!DECISION_RE.test(body)) continue
    DECISION_RE.lastIndex = 0
    writeFileSync(abs, body.replace(DECISION_RE, ''), 'utf8')
    n++
  }
  DECISION_RE.lastIndex = 0
  return n
}

// ───────────── “规则该改了”：在 90-持续生长/待确认的发现.md 加一节（照 90-持续生长/README.md 的发现卡） ─────────────

export const FINDINGS_FILE = '90-持续生长/待确认的发现.md'
/** 工作台加的发现卡末尾的标记：写的时候带老板的称呼，认的时候不管称呼 */
const findingMark = () => `工作台“答应过的事”里${identity().owner}点了“规则该改了”`
const FINDING_MARK_RE = /工作台“答应过的事”里\S{0,20}点了“规则该改了”/
const RULE_FILE_REL = '../05-方法与判断/企业茶礼报价与接单/判断规则.md'

export type FindingInput = { client: string; promise: string; said: string; source: string | null; conflict: string; note: string; today: string }

function findingSection(x: FindingInput, n: number) {
  const rule = x.conflict.match(/规则\s*\d+/)?.[0]?.replace(/\s+/, ' ') ?? '判断规则'
  const ruleText = x.conflict.match(/规则\s*\d+\s*[｜|][^。；]*/)?.[0]?.trim() ?? null
  const why = x.conflict.replace(/规则\s*\d+\s*[｜|][^。；]*[。；]?/, '').replace(/[。\s]+$/, '').trim()
  const short = x.promise.length > 18 ? `${x.promise.slice(0, 18)}…` : x.promise
  const owner = identity().owner
  return [
    `## 发现 ${n}｜${x.client}“${short}”和${rule}${/\d$/.test(rule) ? ' ' : ''}对不上，${owner}说规则该改`,
    `- 看到的：${x.said}，${owner}答应${x.client}：${x.promise}。${why ? `${why}。` : ''}`,
    `- 原来的做法：[判断规则](${RULE_FILE_REL}) ${ruleText ?? rule}。`,
    `- 可能的规律或建议：${owner}说“${x.note.replace(/[。\s]+$/, '')}”。可以考虑把这种情况写成规则的例外条件。（工作台记下的，待确认）`,
    `- 想问你：${rule}${/\d$/.test(rule) ? ' ' : ''}要不要改、怎么改？改之前这一单按“例外”算。`,
    `- 证据强度：1 次（这一单），是事实不是推测${x.source ? `；原件 ${x.source}` : ''}。`,
    // 知识库的发现卡格式：“采纳后写到”放在状态前面，这一行里不出现“状态：”（2026-10-13 补）
    `- 采纳后写到：[判断规则](${RULE_FILE_REL}) 的${rule}加一条例外条件，或按${owner}的说法改写这一条；不采纳就照原规则，这一单按例外记。`,
    '- 状态：待确认',
    `- 提出：${x.today}，${findingMark()}`,
    '',
  ]
}

/** 要加的那一节（先给老板看） */
export function findingPreview(x: FindingInput) {
  const abs = kbPath(FINDINGS_FILE)
  const text = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
  const n = Math.max(0, ...[...text.matchAll(/^##\s*发现\s*(\d+)/gm)].map((m) => Number(m[1]))) + 1
  return { path: FINDINGS_FILE, lines: findingSection(x, n), n, exists: !!text }
}

/** 加在“## 来源”前面；写之前备份 */
export function findingAppend(x: FindingInput, stamp: string) {
  const abs = kbPath(FINDINGS_FILE)
  if (!existsSync(abs)) throw new BadRequest(`知识库里没有 ${FINDINGS_FILE}，先让知识库 Skill 建好`)
  const pv = findingPreview(x)
  const backup = backupOf(FINDINGS_FILE, stamp)
  const lines = readFileSync(abs, 'utf8').split('\n')
  const src = lines.findIndex((l) => /^##\s*来源/.test(l.trim()))
  const at = src >= 0 ? src : lines.length
  writeFileSync(abs, [...lines.slice(0, at), ...pv.lines, ...lines.slice(at)].join('\n'), 'utf8')
  return { path: FINDINGS_FILE, title: pv.lines[0].replace(/^##\s*/, ''), lines: pv.lines, backup }
}

/** 撤销 / 演示复原：删掉工作台加的那一节（按标题找，到下一个“## ”为止） */
export function findingRemove(title: string) {
  const abs = kbPath(FINDINGS_FILE)
  if (!existsSync(abs)) return false
  const lines = readFileSync(abs, 'utf8').split('\n')
  const at = lines.findIndex((l) => l.replace(/^##\s*/, '') === title)
  if (at < 0) return false
  let end = lines.findIndex((l, i) => i > at && /^##\s/.test(l))
  if (end < 0) end = lines.length
  writeFileSync(abs, [...lines.slice(0, at), ...lines.slice(end)].join('\n'), 'utf8')
  return true
}

/** 撤销一次提取写入：写入后老板在工作台对这件事点了“规则该改了”，那一节跟着删（按标题里的客户和答应的事找） */
export function findingRemoveFor(client: string, promise: string) {
  const abs = kbPath(FINDINGS_FILE)
  if (!existsSync(abs)) return 0
  const short = promise.length > 18 ? `${promise.slice(0, 18)}…` : promise
  const titles = readFileSync(abs, 'utf8').split('\n\n## ').filter((sec) => FINDING_MARK_RE.test(sec) && sec.split('\n')[0].includes(`${client}“${short}”`))
    .map((sec) => sec.split('\n')[0].replace(/^##\s*/, ''))
  return titles.filter(findingRemove).length
}

/** 演示复原：工作台加的“规则该改了”几节都删掉 */
export function findingRemoveAllFromWorkbench() {
  const abs = kbPath(FINDINGS_FILE)
  if (!existsSync(abs)) return 0
  const titles = readFileSync(abs, 'utf8').split('\n\n## ').filter((sec) => FINDING_MARK_RE.test(sec)).map((sec) => sec.split('\n')[0].replace(/^##\s*/, ''))
  return titles.filter(findingRemove).length
}
