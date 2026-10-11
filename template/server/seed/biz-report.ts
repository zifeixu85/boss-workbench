// 种子用：按某一天的数据写一份“经营早报”和每条异常的建议。数字全部从日数据现算，原因、推广前后对比、库存往后推都复用异常抽屉的同一套算法
// （modules/biz/evidence.ts、ads.ts），所以早报、抽屉、推广计划表说的是同一组数。
// 归属：经营模块。只给 seed/biz-extra.ts 用；真正每天的早报由 Codex 定时任务写好，用命令 biz-report-set 写回。
import { all, get } from '../db.ts'
import { addDays } from './lib.ts'
import { channels, refundCause, type Alert } from '../modules/biz/service.ts'
import { DEFAULT_CONFIG } from '../modules/biz/config.ts'
import { evidenceFor, roiReasons, shiftText, stockOutlook } from '../modules/biz/evidence.ts'
import { ruleWindows, span } from '../modules/biz/period.ts'
import type { AnomalyItem } from '../modules/biz/anomaly.ts'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const cn = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`
const wk = (d: string) => WEEK[new Date(`${d}T00:00:00`).getDay()]
const n0 = (n: number) => Math.round(n).toLocaleString('zh-CN')
const r1 = (n: number) => Math.round(n * 10) / 10
const pct = (a: number, b: number) => (b ? r1(((a - b) / b) * 100) : null)
const dir = (x: number | null) => (x === null ? '没法比' : x > 0 ? `多 ${x}%` : x < 0 ? `少 ${-x}%` : '持平')
const signed = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}%`)
const f1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(1))

/** 知识库链接：网页上显示成能点的小标签，命令行里是 Markdown 链接 */
const KB = { 售后: '[售后与补偿](05-方法与判断/售后与补偿.md)', 出价: '[推广出价与上新](05-方法与判断/推广出价与上新.md)', 待确认: '[待确认的发现](90-持续生长/待确认的发现.md)' }

type Day = { channel_id: string; gmv: number; orders: number; refund_amount: number; ad_spend: number; ad_gmv: number }
const dayRows = (d: string) => new Map(all<Day>('SELECT channel_id, gmv, orders, refund_amount, ad_spend, ad_gmv FROM channel_daily WHERE date = :d', { d }).map((r) => [r.channel_id, r]))
const sum = (m: Map<string, Day>, k: keyof Omit<Day, 'channel_id'>) => [...m.values()].reduce((a, r) => a + r[k], 0)
const NAMES = () => new Map(channels().map((c) => [c.id, c.name]))

/** 把规则报出来的异常补成抽屉用的形状，好复用 evidence.ts 找原因 */
const asItem = (a: Alert): AnomalyItem => ({
  ...a, channel_name: NAMES().get(a.channel_id ?? '') ?? null, status: '待处理', owner: null, note: null, suggestions: [], suggested_by: null, suggested_at: null,
  first_seen: a.since, updated_at: null, updated_by: null, active: true, quiet: false,
})

/** 抖店云仓便携装：库存表只有 10/26 收工的数（算法同异常抽屉 stockOutlook） */
export function stockFacts(to: string) {
  const o = stockOutlook('wh_dy', 'sku_yinzhen', to)!
  const main = get<{ stock: number }>("SELECT stock FROM inventory WHERE warehouse_id = 'wh_main' AND sku_id = 'sku_yinzhen'")?.stock ?? 0
  const days = o.inv.days_left ?? 0
  return {
    ...o, main, days,
    title: `抖店「白毫银针便携装」只够卖 ${days} 天`, detail: `抖店云仓还剩 ${o.inv.stock} 件，近 7 天每天卖约 ${o.inv.avg_daily.toFixed(1)} 件，没有在途的货`,
  }
}

export function stockSuggestions(to: string) {
  const f = stockFacts(to)
  return [
    `今天就在抖店后台约下一批便携装入仓：云仓要提前 5 天约，今天约最早 ${md(f.earliest)} 到。按一天约 ${Math.round(f.inv.avg_daily)} 件，至少约 ${f.need} 盒（够卖两周）。`,
    f.out_from ? `到货前大约有 ${f.gap} 天会断货（${md(f.out_from)}—${md(f.out_to!)}）：直播间先少推便携装，主推桂花乌龙和玫瑰白茶；或者先从杭州总仓发（总仓还有 ${f.main} 件，慢 1—2 天，详情页的发货时间要改）。`
      : `总仓还有 ${f.main} 件，万一云仓断了可以先从总仓发。`,
    '以后便携装云仓的库存少于 7 天的量，就提醒阿杰约入仓。要不要定成规矩，请林总拍板。',
  ]
}

/** 小红书店 10/23 那批到某一天为止的售后情况（发出几件、几位反馈坏了、退了几单多少钱、补发、没处理） */
export function batchFacts(d: string) {
  const t = get<{ n: number; refunded: number; amount: number; resent: number; pending: number }>(`SELECT COUNT(*) AS n,
      SUM(CASE WHEN status IN ('已退款','退款中') THEN 1 ELSE 0 END) AS refunded, ROUND(SUM(CASE WHEN status IN ('已退款','退款中') THEN amount ELSE 0 END), 2) AS amount,
      SUM(CASE WHEN status = '已补发' THEN 1 ELSE 0 END) AS resent, SUM(CASE WHEN status = '待处理' THEN 1 ELSE 0 END) AS pending
    FROM biz_aftersales WHERE channel_id = 'xhs' AND batch = '10/23 发货' AND substr(applied_at,1,10) <= :d`, { d })!
  const ship = get<{ action: string }>("SELECT action FROM biz_ops_log WHERE channel_id = 'xhs' AND kind = '发货' AND action LIKE '%件%' ORDER BY at DESC LIMIT 1")
  return { ...t, shipped: Number(ship?.action.match(/(\d+)\s*件/)?.[1] ?? 0) }
}

function refundSuggestions(a: Alert, d: string) {
  if (a.channel_id !== 'xhs') return ['看一下近 3 天退款的原因和商品。单量小的渠道一单就会把退款率拉高，连着看 3 天再下结论。']
  const t = batchFacts(d)
  const parts = [`退款 ${t.refunded} 单`, t.resent ? `补发 ${t.resent} 单` : '', t.pending ? `还没处理 ${t.pending} 单` : ''].filter(Boolean).join('、')
  return [
    `碎了的单按“运输破损”先退款或补发，回复里道个歉，说清已经换回气泡柱包装。${t.pending ? `还没处理的 ${t.pending} 单今天先回。` : ''}零售小件碎了客服可以直接处理，不用等林总（${KB.售后}）。`,
    t.shipped ? `10/23 那批发出 ${t.shipped} 件，已经有 ${t.n} 位买家说到手坏了（${parts}）；剩下 ${t.shipped - t.n} 位，客服主动问一句到货情况，碎了的直接补发。` : '10/23 那批发出的公道杯，客服主动问一句到货情况，碎了的直接补发。',
    '公道杯恢复“气泡柱 + 纸箱”再发，打包后拍张照留底；气泡柱、纸箱这类包材少于 3 天的量就提醒老何。',
    `“玻璃件必须加气泡柱，包材用完先停发”要不要写进售后做法，等林总点头后记到${KB.待确认}。`,
  ]
}

function roiSuggestions(a: Alert, d: string) {
  const name = NAMES().get(a.channel_id ?? '') ?? ''
  const { shifts, windows: w, conv, share } = roiReasons(a.channel_id!, name, d)
  const c = shifts[0]
  if (!c || c.now.per_day <= c.base.per_day * 1.3) return ['看一下哪个推广计划花得多了，先给它设每天花费上限。']
  const cap = Math.ceil((c.base.per_day * 1.5) / 100) * 100
  return [
    `${shiftText(c, w)}。要不要把出价调回去，请林总或晓雯定（工作台只出建议，不动平台后台；出价的做法见${KB.出价}）。`,
    `如果调高是为了双 11 预售抢流量，先给这个计划设每天花费上限（比如 ${n0(cap)} 元），别让它一天烧掉 ${n0(c.now.per_day)} 元。`,
    share.before !== null && share.now !== null && conv.before !== null && conv.now !== null
      ? `推广带来的访客占比从 ${r1(share.before)}% 升到 ${r1(share.now)}%，${name}的转化率从 ${r1(conv.before)}% 降到 ${r1(conv.now)}%：买来的人不怎么下单，顺手看一下预售页（寿眉饼、白牡丹）的价格和评价。`
      : '顺手看一下预售页的价格和评价。',
  ]
}

export function suggestionsFor(a: Alert, d: string): string[] {
  if (a.kind === '退款') return refundSuggestions(a, d)
  if (a.kind === '推广') return roiSuggestions(a, d)
  if (a.kind === '库存') return stockSuggestions(d)
  return ['先看是不是节假日、周末错开了；连着两天都低，再查流量和商品。']
}

/** 每条异常一句话的原因、一句话要做的事（早报每段开头那句、汇总页早报卡片用） */
function causeShort(a: Alert, d: string, names: Map<string, string>) {
  const ch = names.get(a.channel_id ?? '') ?? ''
  if (a.kind === '退款') {
    const c = refundCause(a.channel_id!, ruleWindows(d).now)
    return c?.sku ? `${ch}退款多是${c.batch ? ` ${c.batch.replace(' 发货', '')} 发的` : ''}${c.sku}“${c.reason}”` : `${ch}的退款没有集中在一个原因`
  }
  if (a.kind === '推广') {
    const s = roiReasons(a.channel_id!, ch, d).shifts[0]
    return s?.bid_change ? `${ch}是「${s.campaign}」出价从 ${s.bid_change.from.toFixed(2)} 调到 ${s.bid_change.to.toFixed(2)}` : s ? `${ch}是「${s.campaign}」花得多了` : `${ch}推广没找到明显的原因`
  }
  return `${ch}多半是和节日那几天比`
}
const ACTION: Record<string, (ch: string) => string> = {
  退款: (ch) => `回完${ch}的售后单、问一遍同批买家`, 推广: (ch) => `${ch}出价调不调请林总定`, 成交: (ch) => `${ch}连着看两天`,
}

/** 规则没报、但昨天单日已经越线的：写一句“先盯着”（规则看连续 3 天，单日会跳） */
function watchLines(d: string, alerts: Alert[], cur: Map<string, Day>, names: Map<string, string>) {
  const out: string[] = []
  for (const [id, r] of cur) {
    const ch = names.get(id) ?? id
    if (r.ad_spend > 0 && r.ad_gmv / r.ad_spend < DEFAULT_CONFIG.roi_min && !alerts.some((a) => a.channel_id === id && a.kind === '推广')) {
      out.push(`先盯着：${ch}昨天单日推广 ROI 掉到 ${f1(r.ad_gmv / r.ad_spend)}，低于 ${DEFAULT_CONFIG.roi_min}；规则看近 3 天合起来（${span(ruleWindows(d).now)} 是 ${f1(threeDayRoi(id, d))}），还没到异常，明天再看。`)
    }
  }
  return out
}
function threeDayRoi(ch: string, d: string) {
  const w = ruleWindows(d).now
  const r = get<{ s: number; g: number }>('SELECT SUM(ad_spend) AS s, SUM(ad_gmv) AS g FROM channel_daily WHERE channel_id = :c AND date BETWEEN :f AND :t', { c: ch, f: w.f, t: w.t })
  return r && r.s ? r.g / r.s : null
}

/** 一份早报：昨天怎么样 → 哪里不对劲 → 可能的原因 → 建议。每段第一行是一句完整的话（汇总页的卡片只放这一句）。
 *  last = 演示日前一天（这一份带库存：库存表只有“现在”的数） */
export function reportBody(d: string, alerts: Alert[], last: boolean) {
  const names = NAMES()
  const cur = dayRows(d)
  const prev = dayRows(addDays(d, -1))
  const lw = dayRows(addDays(d, -7))
  const g = sum(cur, 'gmv')
  const o = sum(cur, 'orders')
  const vsPrev = pct(g, sum(prev, 'gmv'))
  const vsWk = pct(g, sum(lw, 'gmv'))
  const list = [...cur.values()].sort((a, b) => b.gmv - a.gmv).map((r) => ({ name: names.get(r.channel_id) ?? r.channel_id, gmv: r.gmv, wk: pct(r.gmv, lw.get(r.channel_id)?.gmv ?? 0) }))
  const up = [...list].filter((x) => x.wk !== null).sort((a, b) => (b.wk ?? 0) - (a.wk ?? 0))
  const stock = last ? stockFacts(d) : null
  const issues = [...alerts.map((a) => `${names.get(a.channel_id ?? '') ?? ''}${a.short ?? a.kind}`), ...(stock ? ['抖店便携装快卖断了'] : [])]
  const watch = watchLines(d, alerts, cur, names)
  const spend = sum(cur, 'ad_spend')
  const lines: string[] = []
  lines.push(`合计成交 ${n0(g)} 元，比上${wk(d)}${dir(vsWk)}；${issues.length ? `${issues.length} 件事要处理：${issues.join('、')}。` : watch.length ? '没有异常，有 1 处先盯着。' : '没有要处理的异常。'}`)

  lines.push('', '## 昨天怎么样')
  lines.push(`5 个渠道合计成交 ${n0(g)} 元，比前一天${dir(vsPrev)}，比上${wk(d)}${dir(vsWk)}。`)
  lines.push(`- 订单 ${o} 单，客单价 ${n0(g / o)} 元；退款率 ${r1((sum(cur, 'refund_amount') / g) * 100)}%，推广花了 ${n0(spend)} 元，ROI ${f1(sum(cur, 'ad_gmv') / spend)}。`)
  lines.push(`- ${list.map((x) => `${x.name} ${n0(x.gmv)} 元（${signed(x.wk)}）`).join('，')}。括号里是比上周同一天。`)
  if (up.length >= 2) lines.push(`- 比上周同一天涨得最多的是${up[0].name}（${signed(up[0].wk)}），${(up.at(-1)?.wk ?? 0) < 0 ? `少得最多的是${up.at(-1)!.name}（${signed(up.at(-1)!.wk)}）` : '各渠道都没比上周少'}。`)
  if (wk(d) === '周一' && (vsPrev ?? 0) < 0) lines.push('- 周一比周日低是平常的：周末门店和小红书店本来就高，所以主要看“比上周同一天”。')

  lines.push('', '## 哪里不对劲')
  if (issues.length) lines.push(`${issues.length} 件事：${issues.join('、')}。`)
  else lines.push(watch.length ? '没有异常；有一处单日越线，先盯着。' : '没有要处理的：退款率、推广 ROI、库存都在平常范围，各渠道成交也没有比上周同一天少三成以上。')
  alerts.forEach((a, i) => lines.push(`${i + 1}. **${a.title}**：${a.detail}。`))
  if (stock) lines.push(`${alerts.length + 1}. **${stock.title}**：${stock.detail}。`)
  for (const w of watch) lines.push(`- ${w}`)

  if (alerts.length || stock) {
    lines.push('', '## 可能的原因')
    lines.push(`${[...alerts.map((a) => causeShort(a, d, names)), ...(stock ? ['抖店是便携装下一批还没约入仓'] : [])].join('；')}。`)
    for (const a of alerts) {
      const ev = evidenceFor(asItem(a), d, DEFAULT_CONFIG)
      lines.push('', `**${names.get(a.channel_id ?? '') ?? ''}${a.kind}**`)
      if (!ev.reasons.length) lines.push('- 数据里没找到明显的原因，先连着看两天。')
      ev.reasons.slice(0, 3).forEach((r) => lines.push(`- ${r.title}。${r.text}`.replace(/。$/, '。').trim()))
    }
    if (stock) {
      const op = get<{ at: string; who: string; action: string }>("SELECT at, who, action FROM biz_ops_log WHERE channel_id = 'douyin' AND kind = '库存' ORDER BY at DESC LIMIT 1")
      lines.push('', '**抖店库存**', `- 云仓入仓要提前 5 天约。${op ? `${md(op.at)} ${op.who}记过：“${op.action}”，` : ''}之后没有便携装的入仓预约。`)
    }
    lines.push('', '## 建议')
    const acts = [...(stock ? ['今天约便携装入仓'] : []), ...alerts.map((a) => (ACTION[a.kind] ?? ((ch: string) => `${ch}再看两天`))(names.get(a.channel_id ?? '') ?? ''))]
    lines.push(`先做：${acts.join('；')}。`)
    let k = 1
    if (stock) for (const s of stockSuggestions(d).slice(0, 2)) lines.push(`${k++}. 抖店：${s}`)
    for (const a of alerts) for (const s of suggestionsFor(a, d).slice(0, last ? 2 : 1)) lines.push(`${k++}. ${names.get(a.channel_id ?? '') ?? ''}：${s}`)
  }
  lines.push('', `> 这份早报由 Codex 定时任务 ${md(addDays(d, 1))} 07:55 读工作台数据写好。数字以工作台为准；涉及价格、出价、发货方式的建议，要林总拍板。`)
  return { title: `${cn(d)} 经营早报`, body: lines.join('\n').replace(/\n{3,}/g, '\n\n') }
}
