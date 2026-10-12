// 工作台自己按知识库的判断规则核对一遍（不用 AI）：答应的单价比礼盒标价低 → 和“规则 2｜单价不降”对不上。归属：大客户模块。
// Codex 提取时也会自己对照规则；这里是第二道，结果标“工作台核对”，两边都看出来的合在一起。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'
import { identity, ownerRe } from '../../services/identity.ts'
import { AT_STORE, overlaps, storeVisitRange, type Closure } from './closure.ts'

export const PRICE_FILE = '03-生意/产品与服务/企业茶礼礼盒.md'
export const RULE_FILE = '05-方法与判断/企业茶礼报价与接单/判断规则.md'

export type Conflict = { about: string; rule: string; rule_file: string; why: string; suggestion: string; by: string[] }

/** “茶礼”“礼盒”是统称，不拿来认是哪一款 */
const GENERIC = new Set(['茶礼', '礼盒', '礼包'])

/** 从礼盒价格表读每款的标价（“198—238”这种区间取低的那头）；“木盒”“双罐”这类简称也认 */
export function catalog(): { name: string; price: number; alias: string[] }[] {
  const abs = join(ROOT, PRICE_FILE)
  if (!existsSync(abs)) return []
  const rows = readFileSync(abs, 'utf8').split('\n').filter((l) => /^\|\s*[^|-][^|]*\|/.test(l) && !/款式|---/.test(l))
  const out: { name: string; price: number; alias: string[] }[] = []
  for (const r of rows) {
    const cells = r.split('|').map((c) => c.trim()).filter(Boolean)
    const price = cells.map((c) => c.match(/^(\d{2,4})(?:\s*[—–-]\s*\d{2,4})?$/)).find(Boolean)
    if (!price || !cells[0]) continue
    const name = cells[0]
    const short = name.slice(-2)
    out.push({ name, price: Number(price[1]), alias: [name, ...(GENERIC.has(short) ? [] : [short])] })
  }
  return out
}

/** 找出一句话里的单价（“做到 260”“每份 260”“260 一份”）；“80 份”这种份数不算 */
export function pricesIn(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/(?:做到|单价|每份|一份|降到|报价?|按)\s*(\d{2,4})\s*(?:元|块)?/g)) out.add(Number(m[1]))
  for (const m of text.matchAll(/(\d{2,4})\s*(?:元|块)\s*(?:一份|每份|\/\s*份)?/g)) out.add(Number(m[1]))
  for (const m of text.matchAll(/(\d{2,4})\s*(?:一份|每份|\/\s*份)/g)) out.add(Number(m[1]))
  return [...out].filter((n) => n >= 30 && n <= 2000)
}

/** 新客户（还没成交过）答应的单价低于提到的礼盒标价 → 规则 2 冲突 */
export function checkPromises(promises: { text: string; quote?: string }[], material: string, isNewClient: boolean): (Conflict | null)[] {
  const items = catalog()
  const mentioned = items.filter((it) => it.alias.some((a) => material.includes(a)))
  return promises.map((p) => {
    if (!isNewClient) return null
    const text = `${p.text} ${p.quote ?? ''}`
    const prices = pricesIn(text)
    if (!prices.length) return null
    const own = items.filter((it) => it.alias.some((a) => text.includes(a)))
    const ref = (own.length ? own : mentioned).sort((a, b) => a.price - b.price)[0]
    if (!ref) return null
    const low = Math.min(...prices)
    if (low >= ref.price) return null
    return {
      about: p.text,
      rule: '规则 2｜新客户只比单价：单价不降，改送包装或印 logo（待确认）',
      rule_file: RULE_FILE,
      why: `${ref.name}标价 ${ref.price} 元，这里答应 ${low} 元，每份低了 ${ref.price - low} 元。对方是新客户、在比价。`,
      suggestion: `按规则 2：单价不降，改成送升级包装或免费印 logo。要是这次就想降，算“例外”，请${identity().owner}定。`,
      by: ['工作台核对'],
    }
  })
}

const mdOf = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 答应的事落在门店停业那几天、又是在门店办的（品鉴、喝茶、留包间）→ 标黄（第三轮修 README 线索 5） */
export function checkClosure(promises: { text: string; due?: string; quote?: string }[], c: Closure | null): (Conflict | null)[] {
  return promises.map((p) => {
    if (!c || !p.due || !/^\d{4}-\d{2}-\d{2}$/.test(p.due) || p.due < c.from || p.due > c.to) return null
    if (!AT_STORE.test(`${p.text} ${p.quote ?? ''}`) || /停业|装修|改造/.test(p.text)) return null
    return {
      about: p.text, rule: `${c.label}`, rule_file: c.source ?? '',
      why: `${mdOf(p.due)} 门店在停业装修，那天没法在门店接待。`,
      suggestion: `换到复业以后，或者改去对方那里、送样品上门。请${identity().owner}定。`, by: ['工作台核对'],
    }
  })
}

/** 材料里对方说“下周来门店、留包间”，下周又正好停业 → 标黄（不管谁答应没答应） */
export function checkVisit(material: string, materialDate: string | null, c: Closure | null): Conflict | null {
  if (!c || !materialDate) return null
  const r = storeVisitRange(material.replace(/^---[\s\S]*?---/, ''), materialDate)
  if (!r || !overlaps(c, r.from, r.to)) return null
  return {
    about: `对方说要来门店：“${r.quote}”`, rule: c.label, rule_file: c.source ?? '',
    why: `按材料日期算是 ${mdOf(r.from)}—${mdOf(r.to)}，和门店停业（${mdOf(c.from)}—${mdOf(c.to)}）撞上了。`,
    suggestion: '回话时先说门店停业的事，约到复业以后，或者把茶送过去。', by: ['工作台核对'],
  }
}

export type Hint = { line: string; tags: string[] }

/** 等 Codex 的时候先给你看：材料里要核对的几句（价格、日子、“考虑一下”、来门店、账期合同、喜好生日），工作台自己按字面挑的，不用 AI。
 *  第四轮：“之前”“目前”不算日子；“门店微信收到语音”不算来门店；对方提的账期、框架协议单独标出来（不算我们答应） */
export function precheck(material: string): Hint[] {
  const body = material.replace(/^---[\s\S]*?---/, '').replace(/```\w*/g, '')
  const out: Hint[] = []
  // 老板自己说的：聊天里按设置的称呼（“张总：”“张总说”）或“我：”；标签写成“张总答应”
  const me = identity().owner
  const mine = new RegExp(`${ownerRe()}\\s*(说|答应|[：:])`)
  const promised = `${me}答应`
  for (const raw of body.split('\n')) {
    const line = raw.replace(/^[-*>\s]+/, '').trim()
    if (!line || line.startsWith('#')) continue
    const tags: string[] = []
    const bare = line.replace(/^\d{1,2}:\d{2}\s*/, '') // 聊天前面的“14:02”不算日子
    if (pricesIn(bare).length || /\d{2,4}\s*(份|一份)/.test(bare)) tags.push('价格、份数')
    if (/生日/.test(bare)) tags.push('生日')
    else if (/\d{1,2}\s*[号日](?!常)|\d{1,2}\s*月\s*\d{0,2}|下周|下个月|月底|月中|年会/.test(bare)) tags.push('日子')
    if (/考虑|再看|可能|商量|跟合伙人说|开会定|等.{0,10}给/.test(bare)) tags.push('还没定')
    // 老板自己说的（“张总：”“张总说”“我：”），不是别人跟老板说话
    if ((mine.test(line) || /^我\s*[：:]/.test(bare)) && /不加钱|做到|给您|给他|我给|可以|会带|答应|寄到|发您/.test(bare)) tags.push(promised)
    if (/账期|框架协议|合同|发票|定金/.test(bare)) tags.push('账期、合同')
    if (/喝.{0,4}(岩茶|白茶|花草|肉桂|水仙)|留了一罐|喜欢|不要那种/.test(bare) && !tags.includes(promised)) tags.push('喜好')
    if (/过来|来店|到店|来门店|来坐|来喝|喝喝茶|留.{0,4}包间/.test(bare) && AT_STORE.test(bare.replace(/门店微信/g, ''))) tags.push('来门店')
    // 纪要第一行“10 月 26 日上午 10:30，谁打过来的”只是记哪天，不算要核对的
    if (tags.length === 1 && tags[0] === '日子' && /打过来|打来|来电|说了.{0,4}分钟/.test(bare)) continue
    if (tags.length) out.push({ line: line.slice(0, 90), tags: [...new Set(tags)] })
  }
  return out.slice(0, 10)
}
