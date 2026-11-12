// 工作台自己按知识库的判断规则核对一遍（不用 AI）：答应的单价比标价表里的价低 → 标黄，等老板定。归属：大客户模块。
// Codex 提取时也会自己对照规则；这里是第二道，结果标“工作台核对”，两边都看出来的合在一起。
// 规则和标价表在哪，按知识库 05-方法与判断 的“方法选择表”找（services/kb-methods.ts），不写死示例库的文件名；
// 找不到就跳过这道核对，不报错。
import { identity, ownerRe } from '../../services/identity.ts'
import { methodFiles, readMethod } from '../../services/kb-methods.ts'
import { AT_STORE, overlaps, storeVisitRange, type Closure } from './closure.ts'

export type Conflict = { about: string; rule: string; rule_file: string; why: string; suggestion: string; by: string[] }

/** 统称（“礼盒”“套餐”），不拿来认是哪一款 */
const GENERIC = new Set(['茶礼', '礼盒', '礼包', '套餐', '套装', '服务', '课程', '产品', '方案', '会员'])

/** 从标价表读每款的标价（“198—238”这种区间取低的那头）；名字的后两个字（“木盒”“双罐”）也认。
 *  按表格读：第一行是表头，第二行是分隔线，后面每行第一格是名字、第一个像价钱的格子是标价。没有标价表就是空的 */
export function catalog(file = methodFiles().price): { name: string; price: number; alias: string[] }[] {
  const text = readMethod(file).replace(/\r\n/g, '\n')
  if (!text) return []
  const out: { name: string; price: number; alias: string[] }[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l.startsWith('|') || /^\|?\s*:?-{3,}/.test(l)) continue
    if (/^\|?\s*:?-{3,}/.test(lines[i + 1]?.trim() ?? '')) continue // 表头
    const cells = l.split('|').map((c) => c.trim()).filter(Boolean)
    const price = cells.slice(1).map((c) => c.match(/^(\d{2,5})(?:\s*[—–-]\s*\d{2,5})?\s*(?:元)?$/)).find(Boolean)
    if (!price || !cells[0]) continue
    const name = cells[0].replace(/\*\*/g, '')
    const short = name.slice(-2)
    out.push({ name, price: Number(price[1]), alias: [name, ...(GENERIC.has(short) || short === name ? [] : [short])] })
  }
  return out
}

/** 判断规则里讲“价格不让”的那条（标题或总表里带单价、降价、让价、折扣的）；找不到是 null */
export function priceRule(file = methodFiles().rules): { id: string; text: string; pending: boolean } | null {
  const text = readMethod(file)
  if (!text) return null
  const PRICE = /单价|降价|让价|不降|折扣|打折|便宜|底价|标价/
  for (const l of text.split('\n')) {
    const h = l.match(/^#{2,3}\s*(规则\s*\d+)\s*[｜|]\s*(.+)$/)
    const row = l.trim().startsWith('|') ? l.split('|').map((c) => c.trim()).filter(Boolean) : null
    const id = h?.[1] ?? (row && /^规则\s*\d+$/.test(row[0]) ? row[0] : null)
    const say = h?.[2] ?? row?.[1] ?? ''
    if (!id || !PRICE.test(say)) continue
    const at = text.indexOf(l)
    const body = text.slice(at, at + 600).split(/\n#{2,3}\s/)[0]
    const pending = (row && /待确认/.test(row[2] ?? '')) || /状态[：:]\s*待确认/.test(body)
    return { id: id.replace(/\s+/, ' '), text: say.trim(), pending: !!pending }
  }
  return null
}

/** 找出一句话里的单价（“做到 260”“每份 260”“260 一份”）；“80 份”这种份数不算 */
export function pricesIn(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/(?:做到|单价|每份|一份|降到|报价?|按)\s*(\d{2,4})\s*(?:元|块)?/g)) out.add(Number(m[1]))
  for (const m of text.matchAll(/(\d{2,4})\s*(?:元|块)\s*(?:一份|每份|\/\s*份)?/g)) out.add(Number(m[1]))
  for (const m of text.matchAll(/(\d{2,4})\s*(?:一份|每份|\/\s*份)/g)) out.add(Number(m[1]))
  return [...out].filter((n) => n >= 30 && n <= 2000)
}

/** 新客户（还没成交过）答应的单价低于提到的那款的标价 → 标黄。
 *  知识库里没有标价表就不核对（返回全空）；判断规则里有讲“价格不让”的那条，就写明是哪条 */
export function checkPromises(promises: { text: string; quote?: string }[], material: string, isNewClient: boolean): (Conflict | null)[] {
  const files = methodFiles()
  const items = catalog(files.price)
  if (!items.length) return promises.map(() => null)
  const rule = priceRule(files.rules)
  const mentioned = items.filter((it) => it.alias.some((a) => material.includes(a)))
  const owner = identity().owner
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
      rule: rule ? `${rule.id}｜${rule.text}${rule.pending ? '（待确认）' : ''}` : '比标价低',
      rule_file: rule ? files.rules ?? '' : files.price ?? '',
      why: `${ref.name}标价 ${ref.price} 元，这里答应 ${low} 元，每份低了 ${ref.price - low} 元。对方还没在这里买过东西。`,
      suggestion: rule ? `先按${rule.id}${/\d$/.test(rule.id) ? ' ' : ''}办。要是这次就想降，算“例外”，请${owner}定。` : `标价表里是 ${ref.price} 元。要是这次就想降，算“例外”，请${owner}定。`,
      by: ['工作台核对'],
    }
  })
}

/** 两条冲突说的是不是同一件“价格比标价低”的事（Codex 和工作台各看出一次，合成一条） */
export function samePriceConflict(c: { rule: string; why: string }, ours: { rule: string }) {
  const id = ours.rule.match(/^规则\s*\d+/)?.[0]
  const re = id ? new RegExp(`${id.replace(/\s+/, '\\s*')}|单价|标价|降价`) : /单价|标价|降价/
  return re.test(`${c.rule}${c.why}`)
}

const mdOf = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 答应的事落在停业那几天、又是在店里办的（品鉴、喝茶、留包间）→ 标黄。停业区间从项目里程碑和日程算（closure.ts），没有就不核对 */
export function checkClosure(promises: { text: string; due?: string; quote?: string }[], c: Closure | null): (Conflict | null)[] {
  return promises.map((p) => {
    if (!c || !p.due || !/^\d{4}-\d{2}-\d{2}$/.test(p.due) || p.due < c.from || p.due > c.to) return null
    if (!AT_STORE.test(`${p.text} ${p.quote ?? ''}`) || /停业|装修|改造/.test(p.text)) return null
    return {
      about: p.text, rule: `${c.label}`, rule_file: c.source ?? '',
      why: `${mdOf(p.due)} 在停业（${c.label}），那天没法在店里接待。`,
      suggestion: `换到复业以后，或者改去对方那里、送样品上门。请${identity().owner}定。`, by: ['工作台核对'],
    }
  })
}

/** 材料里对方说“下周来店里、留包间”，下周又正好停业 → 标黄（不管谁答应没答应） */
export function checkVisit(material: string, materialDate: string | null, c: Closure | null): Conflict | null {
  if (!c || !materialDate) return null
  const r = storeVisitRange(material.replace(/^---[\s\S]*?---/, ''), materialDate)
  if (!r || !overlaps(c, r.from, r.to)) return null
  return {
    about: `对方说要来店里：“${r.quote}”`, rule: c.label, rule_file: c.source ?? '',
    why: `按材料日期算是 ${mdOf(r.from)}—${mdOf(r.to)}，和${c.label}撞上了。`,
    suggestion: '回话时先说停业的事，约到复业以后，或者把东西送过去。', by: ['工作台核对'],
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
