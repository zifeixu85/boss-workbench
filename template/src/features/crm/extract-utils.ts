// 新材料提取：把 Codex 的结果变成可以改的表单、再变成写入的内容。归属：大客户模块
// 第二轮：待办默认只勾“我们要做、有日子、和已有待办不重复”的，最多 3 条；和已记的答应重复的不勾；
//         标黄的答应可以当场定“例外 / 规则该改了”；商机金额要不要改，默认不改，由老板勾。
// 第四轮（数据评审 #15）：“之前记着、还没做的”改成勾选，确认写入时一起关（撤销时一起恢复）；
//         去联系对方的关怀草稿（回访、问候、重新联系），这份材料就是对方来聊过了，默认勾“不做了”；答应的事、待办默认不勾。
import { md } from '@/lib/format'
import type { ClientPromise, Extraction } from './types'

export type PromiseDraft = {
  on: boolean; text: string; due: string | null; who: string; to_whom: string; conflict: string; rule: string; by: string[]; quote: string; dup: string | null
  decision: '例外' | '改规则' | null; decision_note: string
}
export type TodoDraft = { on: boolean; title: string; due: string | null; why: string | null }
export type TraitDraft = { on: boolean; kind: '口味' | '包装' | '送礼对象' | '禁忌' | '顾虑' | '习惯'; text: string; why: string | null }
export type DateDraft = { on: boolean; date: string; label: string; kind: '生日' | '纪念日' | '节日' | '公司节点'; who: string }
export type DealDraft = { on: boolean; id: string; title: string; old: number | null; estimated: boolean; amount: string; basis: string }
/** 之前记着的事：勾上的确认写入时关掉；why 是默认勾上的理由 */
export type CloseDraft = { kind: '答应的事' | '待办' | '关怀草稿'; id: string; text: string; date: string | null; on: boolean; why: string | null }
export type Draft = {
  client_id: string; date: string; channel: string; with_whom: string; summary: string
  their_status: string; signals: string; concerns: string
  promises: PromiseDraft[]; todos: TodoDraft[]; next_follow: string | null; next_step: string
  traits: TraitDraft[]; dates: DateDraft[]; deal: DealDraft | null; kb_append: boolean
  close: CloseDraft[]
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const joinList = (xs: string[]) => xs.map((x) => x.trim().replace(/[。；;.]+$/, '')).filter(Boolean).join('；')
const day = (s: string | null | undefined) => (s && DAY.test(s) ? s : null)
const plain = (s: string) => s.replace(/[\s，。；、“”‘’（）()：:,.;!！?？…—-]/g, '')

/** 两句话像不像（按相邻两个字算重合度）：用来发现“这件事之前已经记过” */
export function similar(a: string, b: string) {
  const grams = (s: string) => { const x = plain(s).replace(/\d/g, ''); return new Set(Array.from({ length: Math.max(0, x.length - 1) }, (_, i) => x.slice(i, i + 2))) }
  const A = grams(a), B = grams(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const g of A) if (B.has(g)) n++
  return n / Math.min(A.size, B.size)
}

/** 两条喜好说的是不是一件事：同一类，短句（12 个字以内）重合 0.4 就算，长句要 0.6 */
export function sameTrait(a: { kind: string; text: string }, b: { kind: string; text: string }) {
  if (a.kind !== b.kind) return false
  const short = plain(a.text).length <= 12 && plain(b.text).length <= 12
  return similar(a.text, b.text) >= (short ? 0.4 : 0.6)
}

export function findDup(text: string, due: string | null, open: ClientPromise[]) {
  return open.find((p) => similar(text, p.text) >= 0.45 && (!due || !p.due || p.due === due)) ?? null
}

const TRAIT_KINDS = ['口味', '包装', '送礼对象', '禁忌', '顾虑', '习惯'] as const

/** 去联系对方的那种关怀（回访、问候、重新联系、好久没见）：对方这次已经来聊过了，这条就过时了。生日、节气、道歉、通知不算 */
const CONTACT_CARE = /回访|问候|重新联系|好久没|联系一下/
const NOT_CONTACT = /生日|立冬|春节快乐|道歉|停业|品茶会/

function closeDefaults(x: Extraction, date: string, channel: string): CloseDraft[] {
  const said = `${md(date)} ${channel}`
  return [
    ...x.open_promises.map((p) => ({ kind: '答应的事' as const, id: p.id, text: p.text, date: p.due, on: false, why: null })),
    ...x.open_todos.map((t) => ({ kind: '待办' as const, id: t.id, text: t.title, date: t.due, on: false, why: null })),
    ...x.open_care.map((c) => {
      const stale = CONTACT_CARE.test(c.occasion) && !NOT_CONTACT.test(c.occasion) && (!c.date || c.date >= date)
      return { kind: '关怀草稿' as const, id: c.id, text: `${c.occasion}：${c.message ?? ''}`, date: c.date, on: stale, why: stale ? `对方 ${said}已经聊过了，这条去联系的草稿过时了` : null }
    }),
  ]
}

/** 生日写成每年重复的 --MM-DD */
function birthday(s: string) {
  const m = s.match(/(\d{1,2})[-/月](\d{1,2})/)
  if (s.startsWith('--')) return s
  if (DAY.test(s)) return `--${s.slice(5)}`
  return m ? `--${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

/** owner：设置里的称呼，Codex 没写谁答应的就算老板本人 */
export function initialDraft(x: Extraction, owner = '老板'): Draft {
  const r = x.result!
  const contact = x.client?.contact_name ?? ''
  const promises: PromiseDraft[] = x.promises.map((p) => {
    const due = day(p.due)
    const dup = findDup(p.text, due, x.open_promises)
    return {
      on: !dup, text: p.text, due, who: p.who || owner, to_whom: p.to_whom || contact, conflict: p.conflict, rule: p.rule, by: p.conflict_by ?? [], quote: p.quote,
      dup: dup ? `${dup.text}${dup.due ? `（${md(dup.due)} 前）` : ''}` : null, decision: null, decision_note: '',
    }
  })
  const traits: TraitDraft[] = []
  const dates: DateDraft[] = []
  for (const f of r.facts) {
    if ((TRAIT_KINDS as readonly string[]).includes(f.kind)) {
      // 和这位客户已经记着的说的是一件事（同一类、字面重合），默认不勾（和服务端 tidy.ts 的 sameTrait 同一个尺子）
      const known = x.traits.find((k) => sameTrait(k, f))
      const why = f.kind === '顾虑' ? '顾虑写在上面“顾虑”里，默认不重复' : known ? `已经记着“${known.text}”，默认不重复` : null
      traits.push({ on: !why, kind: f.kind as TraitDraft['kind'], text: f.text, why })
    }
    else if (f.kind === '生日') { const d = birthday(f.date || f.text); if (d) dates.push({ on: true, date: d, label: `${f.who || contact}生日`, kind: '生日', who: f.who || contact }) }
    else if (f.kind === '重要日子' && day(f.date)) dates.push({ on: true, date: f.date, label: f.text.replace(/[。；;.]+$/, '').slice(0, 40), kind: '公司节点', who: f.who })
  }
  const nf = day(r.next_follow.date) ?? x.client?.next_follow ?? null
  const step = (r.next_steps.find((s) => day(s.due) === nf)?.text || r.next_follow.why || r.next_steps[0]?.text || '').replace(/[。；]+$/, '').slice(0, 200)
  // 待办：有日子、不是“下次跟进”那件、和已开着的待办 / 答应的事不重复的才默认勾，最多 3 条
  let picked = 0
  const todos: TodoDraft[] = r.next_steps.map((s) => {
    const due = day(s.due)
    const openDup = x.open_todos.find((t) => plain(t.title) === plain(s.text) || similar(t.title, s.text) >= 0.6)
    const promiseDup = promises.find((p) => p.on && similar(p.text, s.text) >= 0.6)
    const followDup = !!(nf && due === nf && similar(s.text, step) >= 0.5)
    const why = openDup ? `已经有待办“${openDup.title}”` : followDup ? '就是下次跟进那天要做的，自动跟进待办会建' : promiseDup ? '和答应的事是一件，答应的事会提醒' : !due ? '没说哪天' : null
    const on = !why && picked < 3
    if (on) picked++
    return { on, title: s.text.slice(0, 120), due, why }
  })
  // 商机：这位客户在谈的（估的优先）；Codex 读出了份数和单价就算一个新金额，默认不改
  const deal = x.deals.find((d) => d.estimated) ?? x.deals[0] ?? null
  const hint = x.deal_hint
  const date = day(r.date) ?? x.started_at.slice(0, 10)
  const channel = ['微信', '电话', '面谈', '到店', '邮件', '其他'].includes(r.channel) ? r.channel : '其他'
  return {
    client_id: x.client_guess_id ?? '', date, channel,
    with_whom: r.with_whom.replace(/（.*?）/g, ''), summary: r.summary, their_status: r.their_status, signals: joinList(r.signals), concerns: joinList(r.concerns),
    promises, todos, next_follow: nf, next_step: step, traits, dates,
    deal: deal ? {
      on: false, id: deal.id, title: deal.title, old: deal.amount, estimated: !!deal.estimated,
      amount: hint ? String(hint.amount) : deal.amount != null ? String(deal.amount) : '',
      basis: hint ? `${md(date)} ${channel}：约 ${hint.qty} 份，每份 ${hint.unit_price}${/以内|上限/.test(hint.why) ? ' 以内' : ''}` : `${md(date)} ${channel}谈过`,
    } : null,
    kb_append: !!x.client?.kb_path || !!x.client,
    close: closeDefaults(x, date, channel),
  }
}

/** 标黄那条写进去时的说法：规则 + 为什么对不上 */
export const conflictText = (p: Pick<PromiseDraft, 'rule' | 'conflict'>) => [p.rule, p.conflict].map((s) => s.trim().replace(/[。；;]+$/, '')).filter(Boolean).join('。')

/** 老板改好的表单 → 写入接口要的内容（没写谁答应的，服务端按设置里的称呼补） */
export function payloadOf(d: Draft) {
  const amount = d.deal ? Number(d.deal.amount) : NaN
  return {
    client_id: d.client_id, date: d.date, channel: d.channel, with_whom: d.with_whom || null, summary: d.summary,
    their_status: d.their_status || null, signals: d.signals || null, concerns: d.concerns || null,
    promises: d.promises.filter((p) => p.on && p.text.trim()).map((p) => ({
      text: p.text.trim(), due: p.due, who: p.who || undefined, to_whom: p.to_whom || null, conflict: p.conflict ? conflictText(p) : null,
      decision: p.conflict ? p.decision : null, decision_note: p.conflict && p.decision ? p.decision_note : null,
    })),
    todos: d.todos.filter((t) => t.on && t.title.trim()).map((t) => ({ title: t.title.trim(), due: t.due })),
    next_follow: d.next_follow, next_step: d.next_step || null,
    traits: d.traits.filter((t) => t.on && t.text.trim()).map((t) => ({ kind: t.kind, text: t.text.trim() })),
    dates: d.dates.filter((x) => x.on).map((x) => ({ date: x.date, label: x.label, kind: x.kind, who: x.who || null })),
    deal: d.deal?.on && amount > 0 ? { id: d.deal.id, amount, basis: d.deal.basis || null } : null,
    kb_append: d.kb_append,
    close_promises: d.close.filter((c) => c.on && c.kind === '答应的事').map((c) => c.id),
    close_todos: d.close.filter((c) => c.on && c.kind === '待办').map((c) => c.id),
    skip_care: d.close.filter((c) => c.on && c.kind === '关怀草稿').map((c) => c.id),
  }
}
