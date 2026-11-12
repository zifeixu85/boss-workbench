// 停业撞日子：店里停业（装修、搬家、放假）的那几天，约在店里见面、品鉴、留包间的事落进去就标黄。归属：大客户模块。
// 停业区间不写死、也不认项目名：在所有项目的里程碑里找“停业 / 暂停营业 / 闭店 / 歇业”（“通知…停业”这种不算）作停业第一天，
// 同一个项目里“恢复营业 / 复业 / 重新开业”的前一天是最后一天；里程碑里没有，再看标题带“停业”这类字的日程。
// 一个都没有就是 null，所有撞日子的核对都跳过。只核对，不改任何东西。
import { all } from '../../db.ts'
import { addDays, today } from '../../services/common.ts'

export type Closure = { from: string; to: string; label: string; source: string | null }
export type Clash = { what: string; date: string; kind: '答应的事' | '重要日子' | '日程' | '下次跟进'; why: string; also: string[] }

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
/** 说的是在店里办的事（见面、品鉴、喝茶、留包间） */
export const AT_STORE = /门店|到店|来店|店里|品鉴|包间|喝茶|喝喝茶|茶空间/
/** 说的就是停业这件事本身（通知停业、停业期间送到办公室），不算撞 */
const ABOUT_CLOSURE = /停业|装修|改造|复业|重新开/
const SHUT = /停业|暂停营业|闭店|歇业/
/** 说停业这件事、但那天不停业的：“通知会员停业时间”“停业前最后一场品茶会” */
const SHUT_NOTICE = /通知|告诉|提醒|公告|停业前|停业后|闭店前/
const REOPEN = /恢复营业|复业|重新开业|重新开门/

/** 从项目里程碑、日程里认出停业区间；优先还没结束的那次，都结束了用最近的一次 */
export function storeClosure(t = today()): Closure | null {
  const found: Closure[] = []
  const ms = all<{ project_id: string; name: string; kb_path: string | null; date: string; title: string }>(
    'SELECT m.project_id, p.name, p.kb_path, m.date, m.title FROM project_milestones m JOIN projects p ON p.id = m.project_id ORDER BY m.date')
  for (const pid of [...new Set(ms.map((m) => m.project_id))]) {
    const mine = ms.filter((m) => m.project_id === pid)
    const start = mine.find((m) => SHUT.test(m.title) && !SHUT_NOTICE.test(m.title))
    if (!start) continue
    const reopen = mine.find((m) => REOPEN.test(m.title) && m.date > start.date)
    const ev = reopen ? null : all<{ title: string; end: string | null }>("SELECT title, end FROM events WHERE project_id = :id AND (title LIKE '%停业%' OR title LIKE '%闭店%' OR title LIKE '%歇业%') ORDER BY start", { id: pid })
      .find((e) => !SHUT_NOTICE.test(e.title))
    const to = reopen ? addDays(reopen.date, -1) : ev?.end ? addDays(ev.end.slice(0, 10), ev.end.length > 10 ? 0 : -1) : null
    if (!to) continue
    found.push({ from: start.date, to, label: `${start.name}停业（${md(start.date)}—${md(to)}）`, source: start.kb_path })
  }
  if (!found.length) {
    const evs = all<{ title: string; start: string; end: string | null; name: string | null; kb_path: string | null }>(
      "SELECT e.title, e.start, e.end, p.name, p.kb_path FROM events e LEFT JOIN projects p ON p.id = e.project_id WHERE e.title LIKE '%停业%' OR e.title LIKE '%闭店%' OR e.title LIKE '%歇业%' ORDER BY e.start")
    for (const e of evs.filter((x) => !SHUT_NOTICE.test(x.title))) {
      const from = e.start.slice(0, 10)
      const to = e.end ? addDays(e.end.slice(0, 10), e.end.length > 10 ? 0 : -1) : addDays(from, 9)
      found.push({ from, to, label: `${e.name ?? ''}停业（${md(from)}—${md(to)}）`, source: e.kb_path })
    }
  }
  if (!found.length) return null
  return found.filter((c) => c.to >= t).sort((a, b) => a.from.localeCompare(b.from))[0] ?? found.sort((a, b) => b.to.localeCompare(a.to))[0]
}

const inside = (c: Closure, date: string | null | undefined) => !!date && date.slice(0, 10) >= c.from && date.slice(0, 10) <= c.to
const atStore = (text: string | null | undefined) => !!text && AT_STORE.test(text) && !ABOUT_CLOSURE.test(text)

/** 一位客户（或全部客户）撞上停业的事：答应的事、重要日子、日程、下次跟进要做的事 */
export function clashes(clientId?: string, c: Closure | null = storeClosure()): Map<string, Clash[]> {
  const out = new Map<string, Clash[]>()
  if (!c) return out
  const add = (cid: string, x: Clash) => out.set(cid, [...(out.get(cid) ?? []), x])
  const where = clientId ? 'AND client_id = :cid' : ''
  const why = '那天店里不开'
  for (const p of all<{ client_id: string; text: string; due: string | null }>(`SELECT client_id, text, due FROM client_promises WHERE status = '待兑现' ${where}`, { cid: clientId ?? '' })) {
    if (inside(c, p.due) && atStore(p.text)) add(p.client_id, { kind: '答应的事', what: p.text, date: p.due!, why, also: [] })
  }
  for (const d of all<{ client_id: string; label: string; date: string }>(`SELECT client_id, label, date FROM client_dates WHERE 1 = 1 ${where}`, { cid: clientId ?? '' })) {
    if (inside(c, d.date) && atStore(d.label)) add(d.client_id, { kind: '重要日子', what: d.label, date: d.date, why, also: [] })
  }
  for (const e of all<{ client_id: string; title: string; start: string; kind: string; location: string | null }>(`SELECT client_id, title, start, kind, location FROM events WHERE client_id IS NOT NULL ${where}`, { cid: clientId ?? '' })) {
    if (inside(c, e.start) && (e.kind === '品鉴' || atStore(`${e.title}${e.location ?? ''}`)) && !ABOUT_CLOSURE.test(e.title)) add(e.client_id, { kind: '日程', what: e.title, date: e.start.slice(0, 10), why, also: [] })
  }
  for (const k of all<{ id: string; next_follow: string | null; next_step: string | null }>(`SELECT id, next_follow, next_step FROM clients WHERE next_follow IS NOT NULL ${clientId ? 'AND id = :cid' : ''}`, { cid: clientId ?? '' })) {
    if (inside(c, k.next_follow) && atStore(k.next_step)) add(k.id, { kind: '下次跟进', what: k.next_step!, date: k.next_follow!, why, also: [] })
  }
  // 同一件事在答应、日子、日程里各记了一次：按日期合成一条，写清在哪几处
  for (const [cid, xs] of out) {
    const byDate = new Map<string, Clash>()
    for (const x of xs) {
      const cur = byDate.get(x.date)
      byDate.set(x.date, cur ? { ...cur, also: cur.kind === x.kind || cur.also.includes(x.kind) ? cur.also : [...cur.also, x.kind] } : x)
    }
    out.set(cid, [...byDate.values()])
  }
  return out
}

/** 材料里说“下周 / 这周 / 某天来店里、留包间”，换成日子范围（按材料的日期算） */
export function storeVisitRange(text: string, materialDate: string): { from: string; to: string; quote: string } | null {
  const line = text.split(/\n|[。！？]/).find((l) => atStore(l) && /下周|这周|本周|周[一二三四五六日天]|\d{1,2}\s*[号日]|明天|后天/.test(l))
  if (!line) return null
  const dow = (new Date(`${materialDate}T00:00:00`).getDay() + 6) % 7 // 周一 = 0
  const monday = addDays(materialDate, -dow)
  const quote = line.trim().replace(/^>\s*/, '').slice(0, 60)
  if (/下周/.test(line)) return { from: addDays(monday, 7), to: addDays(monday, 13), quote }
  if (/这周|本周/.test(line)) return { from: materialDate, to: addDays(monday, 6), quote }
  if (/明天/.test(line)) return { from: addDays(materialDate, 1), to: addDays(materialDate, 1), quote }
  if (/后天/.test(line)) return { from: addDays(materialDate, 2), to: addDays(materialDate, 2), quote }
  const m = line.match(/(\d{1,2})\s*[号日]/)
  if (m) {
    const day = Number(m[1])
    const sameMonth = `${materialDate.slice(0, 8)}${String(day).padStart(2, '0')}`
    const d = sameMonth >= materialDate ? sameMonth : addDays(`${materialDate.slice(0, 8)}01`, 31).slice(0, 8) + String(day).padStart(2, '0')
    return { from: d, to: d, quote }
  }
  return null
}

export const overlaps = (c: Closure, from: string, to: string) => from <= c.to && to >= c.from
