// 关怀与回访：未来 30 天的生日、纪念日、节日（立冬）和太久没联系的人，每人一条建议（送什么、怎么说）。归属：大客户模块。
// 建议从哪来要写清楚：存着的草稿写明谁写的（知识库草稿 / Codex 定时任务 / Codex 现场写 / 老板自己）；
// 没有草稿的，工作台按口味和日子套模板拼一条，标“模板 · 工作台按口味和日子套的，没用 AI”。话都只是草稿，老板自己改、自己发。
// 第二轮：作者分 5 类（author_kind），网页按类型给图标，不再从文字里猜（“没用 AI”里也有“AI”）；
//         同一个人的生日、纪念日排在普通关怀安排前面（提取出生日后，关怀页先显示生日）；“另外”去重。
// 第三轮：类型用 4—6 个字的中性标签（tag）；依据拆成几小块、各带出处（basis_items）；约好的回访日子已经过了的，写“已过 X 天”（overdue），
//         和客户列表、今日页对得上；企业客户的生日模板用“您”。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, ROOT } from '../../db.ts'
import { today, addDays, daysBetween } from '../../services/common.ts'
import { nextOccurrence, quietDays } from './service.ts'
import { authorKind, TEMPLATE_AUTHOR, type AuthorKind } from './authors.ts'
import { identity } from '../../services/identity.ts'

export const CARE_FILE = '05-方法与判断/大客户关怀.md'


/** 老板的关怀规矩：从知识库《大客户关怀》读“<称呼>的几条”或“我的几条”（原话）和“别这样做”，老板改了知识库这里跟着变（第二轮修 #14） */
export function careRules() {
  const abs = join(ROOT, CARE_FILE)
  if (!existsSync(abs)) return { file: CARE_FILE, found: false as const, confirm: null, rules: [] as string[], donts: [] as string[] }
  const text = readFileSync(abs, 'utf8')
  const confirm = text.match(/^确认:\s*(\S+)/m)?.[1] ?? null
  const section = (title: RegExp) => {
    const lines = text.split('\n')
    const at = lines.findIndex((l) => title.test(l))
    if (at < 0) return [] as string[]
    const out: string[] = []
    for (const l of lines.slice(at + 1)) {
      if (/^##\s/.test(l)) break
      const m = l.match(/^-\s+(.+)$/)
      if (m) out.push(m[1].trim())
    }
    return out
  }
  // 原话带引号：取引号里的那段原话
  const quote = (x: string) => (x.match(/^“(.+?)”/)?.[1] ?? x).replace(/[。！]$/, '')
  const rules = section(/^##\s*\S{1,12}的几条/).map(quote)
  const donts = section(/^##\s*别这样做/).map((x) => x.replace(/（见.*?）/g, '').replace(/[。]$/, ''))
  return { file: CARE_FILE, found: true as const, confirm, rules, donts }
}

/** 节日：只放和茶、送礼有关的。立冬是节气，春节是企业茶礼最大的节点 */
export const FESTIVALS = [
  { date: '2026-11-07', name: '立冬', who: '门店老茶客', hint: '天冷了，喝点暖的：岩茶、熟一点的白茶' },
  { date: '2027-02-06', name: '春节', who: '企业老客户', hint: '11/15 开始预售，老客户先通知（06-项目/春节企业茶礼预售.md）' },
] as const

type C = {
  id: string; name: string; label: string | null; kind: string; stage: string; segment: string | null; key_account: number
  contact_name: string | null; contact_title: string | null; salutation: string | null; last_contact: string | null; next_follow: string | null
  last_order: string | null
}
type Care = { id: string; client_id: string; occasion: string; date: string | null; gift: string | null; message: string | null; status: string; note: string | null; author: string | null; sent_at: string | null; created_at: string }
type Trait = { client_id: string; kind: string; text: string; source: string | null }
type KeyDate = { client_id: string; date: string; label: string; kind: string; who: string | null; note: string | null }

export type CareItem = {
  key: string; client_id: string; client_name: string; label: string | null; segment: string | null; key_account: number; call: string
  kind: '关怀安排' | '生日' | '纪念日' | '立冬' | '久未联系'; date: string | null; days_left: number | null
  reason: string; also: string[]; basis: string[]
  care_id: string | null; occasion: string; gift: string | null; message: string | null; status: string; author: string; sent_at: string | null
  generated: boolean; note: string | null; days_silent: number | null; kinds: CareItem['kind'][]; author_kind: AuthorKind
  /** 卡片上的类型：4—6 个字 */
  tag: string
  /** 依据：口味 / 送礼对象 / 习惯 / 禁忌，各带出处 */
  basis_items: { kind: string; text: string; source: string | null }[]
  /** 约好的联系日子已经过了：原定哪天、过了几天 */
  overdue: { from: string; days: number } | null
}

/** 卡片上的类型标签：4—6 个字（第三轮修产品评审 #11） */
function tagOf(kind: CareItem['kind'], occasion: string) {
  if (kind === '生日') return '生日'
  if (kind === '纪念日') return '纪念日'
  if (kind === '立冬') return '立冬问候'
  if (kind === '久未联系') return '好久没联系'
  const rules: [RegExp, string][] = [[/停业|装修/, '停业通知'], [/道歉/, '当面道歉'], [/品茶会/, '品茶会邀请'], [/生日/, '生日'], [/立冬/, '立冬问候'], [/回访/, '回访'], [/好久没/, '好久没见'], [/重新联系/, '重新联系'], [/问候/, '问候']]
  return rules.find(([re]) => re.test(occasion))?.[1] ?? occasion.slice(0, 6)
}

const call = (c: C) => c.salutation || c.contact_name || c.name
const PRIORITY: Record<CareItem['kind'], number> = { 生日: 0, 纪念日: 1, 关怀安排: 2, 立冬: 3, 久未联系: 4 }

/** 按口味挑送什么（自家的茶，不送贵的）：先看提到的具体茶（谁先提到送谁），只说了“岩茶”“白茶”的再按大类挑 */
const GIFTS: [RegExp, string, string][] = [
  [/肉桂/, '一罐肉桂', '岩茶'], [/水仙/, '一罐焙火足一点的水仙', '岩茶'], [/大红袍/, '一罐大红袍', '岩茶'],
  [/白牡丹/, '一罐白牡丹', '白茶'], [/寿眉/, '一饼寿眉', '白茶'], [/银针/, '一盒白毫银针便携装', '白茶'],
  [/花草|玫瑰|桂花/, '一盒桂花乌龙', '花草茶'],
]
const BROAD: [RegExp, string, string][] = [[/岩茶/, '一罐肉桂', '岩茶'], [/白茶/, '一饼寿眉', '白茶']]
function giftFor(traits: Trait[]) {
  const taste = traits.filter((t) => t.kind === '口味').map((t) => t.text).join(' ')
  const first = (list: [RegExp, string, string][]) => list.map(([re, gift, tea]) => ({ at: taste.search(re), gift, tea })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at)[0]
  const hit = first(GIFTS) ?? first(BROAD)
  return hit ? { gift: `${hit.gift} + 手写卡`, item: hit.gift, tea: hit.tea } : { gift: '自家的茶一罐 + 手写卡', item: '一罐茶', tea: '' }
}

/** 工作台按模板拼的草稿（没用 AI） */
function template(kind: CareItem['kind'], c: C, traits: Trait[], extra: { label?: string; silent?: number | null }) {
  const g = giftFor(traits)
  const n = call(c)
  const shop = c.segment === '门店老茶客'
  const you = shop ? '你' : '您' // 企业客户用“您”，和知识库、Codex 写的一致
  switch (kind) {
    case '生日':
      return { occasion: extra.label ?? '生日', gift: g.gift, message: `${n}生日快乐！给${you}留了${g.item}，写了张卡，哪天方便我让人送过去。` }
    case '纪念日':
      return { occasion: extra.label ?? '纪念日', gift: g.gift, message: `${n}，今天是${extra.label ?? '个好日子'}，谢谢一直以来的照顾。` }
    case '立冬':
      return {
        occasion: '立冬问候', gift: g.tea ? g.gift : null,
        message: g.tea === '岩茶' ? `${n}，今天立冬，天冷下来了，岩茶喝着暖。给你留了${g.item}，哪天方便我让人送过去。`
          : g.tea === '白茶' ? `${n}，立冬了，白茶煮着喝正好。给你留了一饼寿眉，哪天方便我让人送过去。`
            : `${n}，今天立冬，天冷了，多喝点热茶，注意保暖。`,
      }
    default:
      return shop
        ? { occasion: '好久没见', gift: null, message: `${n}，好久没见你来喝茶了，最近还好吗？到了几款新茶，有空来坐坐，提前跟我说给你留位置。` }
        : { occasion: '好久没联系，问候一声', gift: '新包装的图', message: `${n}好，好久没联系，问候一声！今年春节的礼盒换了新包装，先发您看看，有需要随时跟我说。` }
  }
}

/** 未来 days 天要关心的人。每人一条：存着的关怀安排优先，其次生日、纪念日、立冬、太久没联系 */
export function careList(days = 30, t = today()) {
  const end = addDays(t, days)
  const clients = all<C>(`SELECT c.*, (SELECT MAX(date) FROM orders o WHERE o.client_id = c.id AND o.status = '已完成' AND o.date <= :t AND o.amount > 0) AS last_order
    FROM clients c WHERE c.kind = '客户' AND c.stage NOT IN ('暂停','流失')`, { t })
  const cares = all<Care>('SELECT * FROM client_care ORDER BY created_at DESC') // 同一天有几条草稿，用最新的那条
  const traits = all<Trait>('SELECT client_id, kind, text, source FROM client_traits')
  const dates = all<KeyDate>("SELECT * FROM client_dates WHERE kind IN ('生日','纪念日')")
  const items: CareItem[] = []
  const winter = FESTIVALS[0]

  for (const c of clients) {
    const tr = traits.filter((x) => x.client_id === c.id)
    const silent = c.last_contact ? daysBetween(c.last_contact, t) : null
    const reasons: { kind: CareItem['kind']; date: string | null; text: string; care?: Care; label?: string }[] = []
    const seen = new Set<string>()
    for (const x of cares.filter((y) => y.client_id === c.id && y.date && y.date <= end && (y.date >= t || ['建议', '已安排'].includes(y.status)) && (y.date >= addDays(t, -7)))) {
      if (seen.has(x.date!)) continue
      seen.add(x.date!)
      reasons.push({ kind: '关怀安排', date: x.date, text: x.occasion, care: x })
    }
    for (const d of dates.filter((y) => y.client_id === c.id)) {
      const next = nextOccurrence(d.date, t)
      if (next >= t && next <= end) reasons.push({ kind: d.kind as '生日' | '纪念日', date: next, text: d.label, label: d.label })
    }
    const recent = c.last_order && daysBetween(c.last_order, t) <= 120
    if (c.segment === '门店老茶客' && (c.key_account || recent) && winter.date >= t && winter.date <= end) {
      reasons.push({ kind: '立冬', date: winter.date, text: `立冬（${winter.hint}）` })
    }
    if (silent !== null && silent > quietDays(c.key_account === 1) && c.segment !== '零售') {
      reasons.push({ kind: '久未联系', date: null, text: `${silent} 天没联系了（上次 ${Number(c.last_contact!.slice(5, 7))}月${Number(c.last_contact!.slice(8, 10))}日）` })
    }
    if (!reasons.length) continue
    // 已发出、不做的草稿排到最后：同一个人还有别的事要做，就先显示要做的
    const rank = (r: (typeof reasons)[number]) => PRIORITY[r.kind] + (r.care && !['建议', '已安排'].includes(r.care.status) ? 10 : 0)
    reasons.sort((a, b) => rank(a) - rank(b) || String(a.date ?? '9').localeCompare(String(b.date ?? '9')))
    const top = reasons[0]
    // 同一个日子已经有存着的草稿，就用存着的（生日那天 Codex 写过一版，就显示那一版）
    const stored = top.care ?? cares.find((x) => x.client_id === c.id && x.date === top.date && x.date !== null)
    // “另外”：别的日子、别的事，一件只说一次（第二轮修：原来同一个生日会写两遍）
    const also = [...new Map(reasons.slice(1)
      .filter((r) => !(r.date && r.date === top.date) && !(r.care && !['建议', '已安排'].includes(r.care.status)))
      .map((r) => {
        const label = r.kind === '久未联系' ? r.text : `${r.text.replace(/（.*）$/, '')}${r.care ? '（存着草稿）' : ''}${r.date ? ` ${Number(r.date.slice(5, 7))}月${Number(r.date.slice(8, 10))}日` : ''}`
        return [`${r.text.replace(/（.*）$/, '')}|${r.date ?? ''}`, label] as const
      })).values()]
    const ORDER = ['口味', '禁忌', '送礼对象', '习惯']
    const picked = tr.filter((x) => ORDER.includes(x.kind)).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).slice(0, 3)
    const basis = picked.map((x) => `${x.kind}：${x.text}${x.source ? `（${x.source}）` : ''}`)
    const tpl = stored ? null : template(top.kind, c, tr, { label: top.label, silent })
    const occasion = stored?.occasion ?? tpl!.occasion
    // 约好的联系日子过了、这条又是去联系的：写“已过 X 天”（青砚原定 10/20 联系，草稿建议 10/28 发）
    const contact = /联系|回访|问候|好久/.test(occasion) || top.kind === '久未联系'
    const overdue = contact && c.next_follow && c.next_follow < t ? { from: c.next_follow, days: daysBetween(c.next_follow, t) } : null
    items.push({
      key: stored?.id ?? `${c.id}-${top.kind}-${top.date ?? 'x'}`,
      client_id: c.id, client_name: c.name, label: c.label, segment: c.segment, key_account: c.key_account, call: call(c),
      kind: top.kind, date: top.date, days_left: top.date ? daysBetween(t, top.date) : null,
      reason: top.text, also,
      basis, basis_items: picked.map((x) => ({ kind: x.kind, text: x.text, source: x.source })), tag: tagOf(top.kind, occasion), overdue,
      care_id: stored?.id ?? null,
      occasion, gift: stored ? stored.gift : tpl!.gift, message: stored ? stored.message : tpl!.message,
      status: stored?.status ?? '建议', author: stored ? stored.author ?? identity().owner : TEMPLATE_AUTHOR,
      sent_at: stored?.sent_at ?? null, generated: !stored, note: stored?.note ?? null, days_silent: silent, kinds: reasons.map((r) => r.kind),
      author_kind: stored ? authorKind(stored.author) : '模板',
    })
  }
  return items.sort((a, b) => {
    if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1
    const ad = a.date ?? addDays(t, days + 1)
    const bd = b.date ?? addDays(t, days + 1)
    return ad.localeCompare(bd) || PRIORITY[a.kind] - PRIORITY[b.kind]
  })
}

/** 春节要提前问的老客户：今年春节或中秋买过茶礼的企业客户，春节买过礼盒送人的老茶客 */
export function springList(t = today()) {
  const spring = FESTIVALS[1]
  const rows = all<{ id: string; name: string; label: string | null; segment: string | null; key_account: number; stage: string; last_contact: string | null; next_follow: string | null; next_step: string | null
    item: string; qty: number; unit: string; amount: number; date: string; occasion: string }>(`
    SELECT c.id, c.name, c.label, c.segment, c.key_account, c.stage, c.last_contact, c.next_follow, c.next_step, o.item, o.qty, o.unit, o.amount, o.date, o.occasion
    FROM orders o JOIN clients c ON c.id = o.client_id
    WHERE o.status = '已完成' AND o.amount > 0 AND o.date >= '2026-01-01' AND c.stage NOT IN ('暂停','流失')
      AND ((c.segment = '企业茶礼' AND o.occasion IN ('春节','中秋')) OR (c.segment = '门店老茶客' AND o.occasion = '春节'))
    ORDER BY o.date`)
  const deals = all<{ client_id: string; title: string; stage: string; amount: number | null; estimated: number }>("SELECT client_id, title, stage, amount, estimated FROM deals WHERE stage NOT IN ('没成') AND title LIKE '%春节%' AND (expected_close IS NULL OR expected_close >= '2026-10-01')")
  const byClient = new Map<string, typeof rows>()
  for (const r of rows) byClient.set(r.id, [...(byClient.get(r.id) ?? []), r])
  const list = [...byClient.values()].map((xs) => {
    const c = xs[0]
    const deal = deals.find((d) => d.client_id === c.id)
    return {
      client_id: c.id, name: c.name, label: c.label, segment: c.segment, key_account: c.key_account, stage: c.stage,
      last_contact: c.last_contact, next_follow: c.next_follow, next_step: c.next_step,
      bought: xs.map((x) => ({ occasion: x.occasion, date: x.date, item: x.item, qty: x.qty, unit: x.unit, amount: x.amount })),
      deal: deal ? { title: deal.title, stage: deal.stage, amount: deal.amount, estimated: deal.estimated } : null,
    }
  }).sort((a, b) => b.key_account - a.key_account || b.bought.reduce((s, x) => s + x.amount, 0) - a.bought.reduce((s, x) => s + x.amount, 0))
  return { date: spring.date, days_left: daysBetween(t, spring.date), presale: '2026-11-15', hint: spring.hint, clients: list }
}
