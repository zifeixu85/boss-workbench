// 经营模块的种子：9/27—10/26 每天 × 5 个渠道。固定种子的伪随机数生成，重跑结果完全一样。归属：经营模块。
//
// 规律：周末偏高；国庆 10/1—10/7 偏高（门店游客多，涨得最猛）；天猫 10/20 起双 11 预售；10/19 起降温，热茶好卖一点。
// 故意埋的 3 个异常（演示时让 AI 找出来，原因都能在数据里对上）：
//   1. 小红书店退款率 10/24 起从约 3% 升到约 11%：10/20 那篇公道杯笔记带火了玻璃公道杯，10/22 气泡柱用完，
//      10/23 那批公道杯用普通纸箱发出，到货磕坏 → 退款原因“运输破损”。
//   2. 天猫推广 ROI 从约 3.3 掉到约 1.6：10/22 下午「秋冬白茶」计划出价从 1.20 调到了 3.60（操作记录里有）。
//   3. 抖店“白毫银针便携装”在抖店云仓的库存只够卖 2 天：云仓入仓要提前 5 天预约，下一批还没约。
// 口径（和页面、早报一致）：
//   - channel_ads.bid 是平台里“设置的出价”（运营记录里改的那个数）；每次点击实际花费 = 花费 ÷ 点击，一般是出价的七八成，不会比出价高。
//   - 退款按“原因 + 商品”记，商品按退款金额从这个渠道卖的货里对一个说得通的（口味问题只对茶，碎了只对玻璃和瓷器）。
//   - 门店：大客户档案里在门店下的单（许国平、方雅琴……，crm 的 orders 表）叠加进当天门店的数，保证门店当天卖的不少于这些单；
//     包间费（288 元一次）不是商品，不算进门店成交。
import { all, get } from '../db.ts'
import { insert, rng, eachDay, weekdayOf, round, iso, type SeedModule } from './lib.ts'
import { seedBizExtra, BIZ_EXTRA_TABLES } from './biz-extra.ts'

const FROM = '2026-09-27'
const TO = '2026-10-26'
const R = rng(20261027)

const WAREHOUSES = [
  ['wh_dy', '抖店云仓', '平台仓，发货快；入仓要提前 5 天预约。只放抖店的几个爆款'],
  ['wh_main', '杭州总仓', '天猫、小红书店、视频号小店从这里发；老何管'],
  ['wh_store', '门店', '茶空间的货架和小仓'],
] as const

type Ch = { id: string; name: string; kind: '线上' | '门店'; owner: string; wh: string; base: number; weekend: number; disc: number; aov: number; conv: number; refund: number; newShare: number; traffic: [string, number][]; mix: [string, number][]; ads: [string, number, number, number][] }
// ads: [计划名, 每天花费, ROI, 出价]
const CHANNELS: Ch[] = [
  {
    id: 'douyin', name: '抖店', kind: '线上', owner: '阿杰', wh: 'wh_dy', base: 8200, weekend: 1.2, disc: 0.12, aov: 112, conv: 2.6, refund: 4.5, newShare: 0.68,
    traffic: [['直播', 0.44], ['短视频', 0.31], ['商城', 0.15], ['搜索', 0.1]],
    mix: [['sku_yinzhen', 0.5], ['sku_guihua', 0.13], ['sku_meigui', 0.1], ['sku_mudan', 0.08], ['sku_lvxing', 0.06], ['sku_gongdao', 0.04], ['sku_shoumei', 0.04], ['sku_dhp', 0.03], ['sku_gaiwan', 0.02]],
    ads: [['千川 · 便携装爆款', 840, 3.0, 0.9], ['千川 · 直播间引流', 560, 2.75, 1.1]],
  },
  {
    id: 'tmall', name: '天猫', kind: '线上', owner: '晓雯', wh: 'wh_main', base: 6000, weekend: 1.15, disc: 0.08, aov: 178, conv: 3.4, refund: 2.6, newShare: 0.52,
    traffic: [['搜索', 0.4], ['推荐', 0.24], ['推广', 0.26], ['会员', 0.1]],
    mix: [['sku_mudan', 0.18], ['sku_dhp', 0.14], ['sku_rougui', 0.13], ['sku_shoumei', 0.13], ['sku_yinzhen', 0.12], ['sku_shuixian', 0.08], ['sku_gaiwan', 0.07], ['sku_lvxing', 0.07], ['sku_meigui', 0.03], ['sku_guihua', 0.03], ['sku_gongdao', 0.02]],
    ads: [['秋冬白茶', 400, 3.4, 1.2], ['岩茶常规', 300, 3.2, 0.9], ['店铺拉新', 200, 3.0, 0.8]],
  },
  {
    id: 'xhs', name: '小红书店', kind: '线上', owner: '晓雯', wh: 'wh_main', base: 3600, weekend: 1.2, disc: 0.06, aov: 158, conv: 2.4, refund: 3.0, newShare: 0.63,
    traffic: [['笔记', 0.55], ['直播', 0.08], ['搜索', 0.22], ['店铺', 0.15]],
    mix: [['sku_meigui', 0.18], ['sku_yinzhen', 0.17], ['sku_guihua', 0.14], ['sku_mudan', 0.12], ['sku_gaiwan', 0.11], ['sku_gongdao', 0.1], ['sku_lvxing', 0.1], ['sku_shoumei', 0.04], ['sku_dhp', 0.04]],
    ads: [['聚光 · 笔记加热', 350, 2.6, 0.7]],
  },
  {
    id: 'wechat', name: '视频号小店', kind: '线上', owner: '阿杰', wh: 'wh_main', base: 2400, weekend: 1.25, disc: 0.05, aov: 165, conv: 3.6, refund: 2.2, newShare: 0.34,
    traffic: [['直播', 0.42], ['短视频', 0.22], ['私域', 0.36]],
    mix: [['sku_rougui', 0.2], ['sku_dhp', 0.16], ['sku_shoumei', 0.16], ['sku_mudan', 0.13], ['sku_yinzhen', 0.13], ['sku_shuixian', 0.1], ['sku_lvxing', 0.06], ['sku_gaiwan', 0.06]],
    ads: [['直播加热', 220, 2.9, 0.6]],
  },
  {
    id: 'store', name: '门店', kind: '门店', owner: '宋姐', wh: 'wh_store', base: 2600, weekend: 1.6, disc: 0.03, aov: 205, conv: 38, refund: 0.6, newShare: 0.22,
    traffic: [['路过进店', 0.34], ['会员复购', 0.41], ['朋友介绍', 0.14], ['线上引流', 0.11]],
    mix: [['sku_rougui', 0.2], ['sku_shoumei', 0.15], ['sku_shuixian', 0.13], ['sku_mudan', 0.12], ['sku_dhp', 0.1], ['sku_yinzhen', 0.08], ['sku_gaiwan', 0.07], ['sku_lvxing', 0.06], ['sku_gongdao', 0.04], ['sku_meigui', 0.03], ['sku_guihua', 0.02]],
    ads: [],
  },
]

// [ID, 名称, 类别, 规格, 价格, 状态, 上线日, 备注]
const SKUS: [string, string, string, string, number, string, string | null, string | null][] = [
  ['sku_yinzhen', '白毫银针便携装', '白茶', '10 袋 · 玻璃管', 128, '在售', null, '抖店爆款'],
  ['sku_shoumei', '寿眉饼 357g', '白茶', '357g 饼', 268, '在售', null, null],
  ['sku_mudan', '白牡丹罐装 100g', '白茶', '100g 罐装', 168, '在售', null, null],
  ['sku_dhp', '大红袍罐装 100g', '岩茶', '100g 罐装', 198, '在售', null, null],
  ['sku_rougui', '肉桂 100g', '岩茶', '100g 罐装', 238, '在售', null, '老茶客最爱'],
  ['sku_shuixian', '水仙 100g', '岩茶', '100g 罐装', 168, '在售', null, null],
  ['sku_guihua', '桂花乌龙', '花草茶', '12 袋', 69, '在售', null, '新客入门款'],
  ['sku_meigui', '玫瑰白茶', '花草茶', '12 袋', 79, '在售', null, null],
  ['sku_gongdao', '玻璃公道杯', '茶具', '300ml', 59, '在售', null, '易碎，运输要加气泡柱'],
  ['sku_gaiwan', '白瓷盖碗', '茶具', '150ml', 89, '在售', null, null],
  ['sku_lvxing', '便携旅行茶具套装', '茶具', '一壶两杯', 199, '在售', null, null],
  ['sku_weilu', '围炉白茶', '白茶', '200g 饼', 158, '待上线', '2026-11-05', '11/5 四平台同步上线；上线前不对外说名字'],
]
const PRICE = new Map(SKUS.map((s) => [s[0], s[4]]))

const HOLIDAY: Record<string, number> = { '10-01': 1.5, '10-02': 1.55, '10-03': 1.45, '10-04': 1.38, '10-05': 1.32, '10-06': 1.22, '10-07': 1.12 }
const PRE: Record<string, number> = { '09-28': 1.06, '09-29': 1.1, '09-30': 1.18 }

function factor(date: string, ch: Ch) {
  const md = date.slice(5)
  const hol = HOLIDAY[md]
  let f = hol ?? PRE[md] ?? 1
  if (ch.id === 'store' && hol) f = 1 + (hol - 1) * 1.9 // 国庆游客多
  const dow = weekdayOf(date)
  if (!hol && (dow === 0 || dow === 6)) f *= ch.weekend
  if (ch.id === 'tmall' && date >= '2026-10-20') f *= 1.12 // 双 11 预售
  if (date >= '2026-10-19') f *= 1.04 // 降温
  return f
}

/** 小红书店的公道杯：10/20 笔记带火，10/24 起热度回落 */
const XHS_GONGDAO: Record<string, number> = { '2026-10-20': 21, '2026-10-21': 27, '2026-10-22': 30, '2026-10-23': 25, '2026-10-24': 15, '2026-10-25': 12, '2026-10-26': 10 }
/** 小红书店 10/23 那批公道杯磕坏的退款：[日期, 件数] */
const BROKEN: Record<string, number> = { '2026-10-24': 5, '2026-10-25': 5, '2026-10-26': 4 }

const REASONS: [string, number][] = [['不想要了', 0.32], ['口味不喜欢', 0.2], ['物流太慢', 0.14], ['运输破损', 0.1], ['少件漏发', 0.08], ['质量问题', 0.06], ['其他', 0.1]]

/** 随机取整：2.3 有 30% 的机会变成 3，量小的渠道（门店）每天的件数才会有起伏 */
function sround(x: number) {
  if (x <= 0) return 0
  const f = Math.floor(x)
  return f + (R.next() < x - f ? 1 : 0)
}

function pickReason() {
  let r = R.next()
  for (const [reason, w] of REASONS) { if ((r -= w) <= 0) return reason }
  return '其他'
}

function split(total: number, shares: [string, number][]) {
  const raw = shares.map(([k, s]) => [k, total * s * R.jitter(0.12)] as [string, number])
  const sum = raw.reduce((a, [, v]) => a + v, 0)
  const out = raw.map(([k, v]) => [k, Math.round((v / sum) * total)] as [string, number])
  const diff = total - out.reduce((a, [, v]) => a + v, 0)
  out[0][1] += diff
  return out
}

const SKU_CAT = new Map(SKUS.map((s) => [s[0], s[2]]))
/** 退款对哪个商品：只在“说得通”的商品里挑（口味只对茶；碎了只对玻璃、瓷器和玻璃管装的便携装），再按金额找最接近的（整单退 = 件数 × 折后价，少一点算部分退款）。
 *  不用随机数，免得打乱其他数据 */
function refundSku(ch: Ch, reason: string, amount: number) {
  const ok = (sku: string) => {
    const cat = SKU_CAT.get(sku)
    if (reason === '口味不喜欢') return cat !== '茶具'
    if (reason === '运输破损') return cat === '茶具' || sku === 'sku_yinzhen'
    return true
  }
  let best = { sku: '', gap: Infinity }
  for (const [sku] of ch.mix.filter(([k]) => ok(k))) {
    for (const qty of [1, 2]) {
      const full = PRICE.get(sku)! * (1 - ch.disc) * qty
      const gap = amount <= full ? full - amount : (amount - full) * 3 // 退得比付的还多说不通
      if (gap < best.gap) best = { sku, gap }
    }
  }
  return best.sku
}

/** 大客户档案里这一天在门店下的单（crm 种子先写）：对上商品的才算；包间费不是商品，不算进门店成交 */
let STORE_ORDERS: Map<string, { sku: string; qty: number; amount: number }[]> | null = null
function storeOrders(date: string) {
  if (!STORE_ORDERS) {
    STORE_ORDERS = new Map()
    const names = SKUS.map(([id, name]) => [id, name] as const)
    let rows: { date: string; item: string; qty: number; amount: number }[] = []
    try {
      rows = all<{ date: string; item: string; qty: number; amount: number }>("SELECT date, item, qty, amount FROM orders WHERE channel = '门店' AND status = '已完成' AND date BETWEEN :f AND :t ORDER BY date, id", { f: FROM, t: TO })
    } catch { rows = [] } // 没有客户模块：门店只用日报的数
    for (const r of rows) {
      const sku = names.find(([, n]) => r.item.startsWith(n))?.[0]
      if (!sku) continue
      STORE_ORDERS.set(r.date, [...(STORE_ORDERS.get(r.date) ?? []), { sku, qty: r.qty, amount: r.amount }])
    }
  }
  return STORE_ORDERS.get(date) ?? []
}

function seedDay(date: string, ch: Ch) {
  const target = ch.base * factor(date, ch) * R.jitter(0.08)
  // 商品：先按占比拆成交额，再换成件数（取整），最后用件数 × 折后价回算，保证三处数字对得上
  let gmv = 0
  const sold = new Map<string, { units: number; gmv: number }>()
  for (const [sku, share] of ch.mix) {
    const price = PRICE.get(sku)!
    const unitPrice = price * (1 - ch.disc)
    let n = sround((target * share * R.jitter(0.22)) / unitPrice)
    if (ch.id === 'xhs' && sku === 'sku_gongdao' && XHS_GONGDAO[date]) n = XHS_GONGDAO[date] + R.int(-1, 1)
    if (!n) continue
    const g = Math.round(n * unitPrice)
    sold.set(sku, { units: n, gmv: g })
    gmv += g
  }
  const orders = Math.max(1, Math.round((gmv / ch.aov) * R.jitter(0.05)))
  let visitors = Math.round((orders / (ch.conv / 100)) * R.jitter(0.06))
  if (ch.id === 'tmall' && date >= '2026-10-22') visitors = Math.round(visitors * 1.18) // 出价调高后买来的流量多，但不转化

  // 退款：按原因拆；小红书店 10/24 起多出一批“运输破损 · 玻璃公道杯”
  // 一单一单地抽：退款单数 ≈ 订单数 × 退款率，每单退一部分或整单
  let refundAmount = 0
  let refundOrders = 0
  const byReason = new Map<string, { n: number; amt: number }>()
  const count = sround(orders * (ch.refund / 100 / 0.7) * R.jitter(0.25))
  for (let k = 0; k < count; k++) {
    const reason = pickReason()
    const amt = Math.round(ch.aov * R.between(0.45, 1))
    const key = `${reason}|${refundSku(ch, reason, amt)}`
    const cur = byReason.get(key) ?? { n: 0, amt: 0 }
    byReason.set(key, { n: cur.n + 1, amt: cur.amt + amt })
  }
  for (const [key, { n, amt }] of byReason) {
    const [reason, sku] = key.split('|')
    insert('channel_refunds', { date, channel_id: ch.id, reason, sku_id: sku || null, orders: n, amount: amt, batch: null })
    refundAmount += amt
    refundOrders += n
  }
  if (ch.id === 'xhs' && BROKEN[date]) {
    const n = BROKEN[date]
    const withTea = Math.round(n * 0.3) // 有的顾客连同一起买的玫瑰白茶整单退
    const amt = round((n * 59 + withTea * 79) * (1 - ch.disc), 2)
    insert('channel_refunds', { date, channel_id: ch.id, reason: '运输破损', sku_id: 'sku_gongdao', orders: n, amount: amt, batch: '10/23 发货' })
    refundAmount += amt
    refundOrders += n
  }

  // 推广
  let adSpend = 0
  let adGmv = 0
  for (const [campaign, spend0, roi0, bid0] of ch.ads) {
    const weekend = weekdayOf(date) === 0 || weekdayOf(date) === 6
    let spend = spend0 * (weekend ? 1.15 : 1) * R.jitter(0.1)
    let roi = roi0 * R.jitter(0.12)
    // 出价是设置的值；每次点击实际花费约是出价的 78%（竞价按第二名的价扣），每天上下浮动一点
    let bid = bid0
    let cpc = bid0 * 0.78 * R.jitter(0.04)
    if (ch.id === 'tmall' && campaign === '秋冬白茶' && date >= '2026-10-22') {
      bid = 3.6
      cpc = (date === '2026-10-22' ? 2.1 : 3.6 * 0.8) * R.jitter(0.02) // 22 日 15:20 才调：上午按 1.20、下午按 3.60，当天平均下来约 2.1
      spend = (date === '2026-10-22' ? 900 : 1350) * R.jitter(0.06) // 22 日下午才调，当天只烧了半天
      roi = (date === '2026-10-22' ? 1.6 : 1.0) * R.jitter(0.08)
    }
    const g = Math.round(spend * roi)
    insert('channel_ads', { date, channel_id: ch.id, campaign, spend: Math.round(spend), clicks: Math.round(spend / cpc), gmv: g, bid: round(bid, 2) })
    adSpend += Math.round(spend)
    adGmv += g
  }
  adGmv = Math.min(adGmv, Math.round(gmv * 0.85))

  const buyers = Math.round(orders * 0.97)
  const newBuyers = Math.round(buyers * Math.min(0.95, ch.newShare * R.jitter(0.06)))
  // 门店：大客户档案里在门店下的单叠加上去（都是老茶客、会员单）。上面的随机数照旧抽，其他日子的数不变
  const extra = ch.id === 'store' ? storeOrders(date) : []
  for (const o of extra) {
    const cur = sold.get(o.sku) ?? { units: 0, gmv: 0 }
    sold.set(o.sku, { units: cur.units + o.qty, gmv: cur.gmv + o.amount })
  }
  for (const [sku, x] of sold) insert('channel_products', { date, channel_id: ch.id, sku_id: sku, units: x.units, gmv: x.gmv })
  const extraGmv = extra.reduce((a, o) => a + o.amount, 0)
  insert('channel_daily', {
    date, channel_id: ch.id, gmv: gmv + extraGmv, orders: orders + extra.length, visitors: visitors + extra.length, refund_amount: refundAmount, refund_orders: refundOrders,
    ad_spend: adSpend, ad_gmv: adGmv, new_buyers: newBuyers, old_buyers: buyers - newBuyers + extra.length,
  })

  // 流量来源
  let shares = ch.traffic
  if (ch.id === 'tmall' && date >= '2026-10-22') shares = [['搜索', 0.34], ['推荐', 0.2], ['推广', 0.38], ['会员', 0.08]]
  if (ch.id === 'xhs' && XHS_GONGDAO[date] && date <= '2026-10-23') shares = [['笔记', 0.66], ['直播', 0.05], ['搜索', 0.17], ['店铺', 0.12]]
  if (ch.id === 'store' && HOLIDAY[date.slice(5)]) shares = [['路过进店', 0.55], ['会员复购', 0.26], ['朋友介绍', 0.11], ['线上引流', 0.08]]
  for (const [source, v] of split(visitors, shares)) insert('channel_traffic', { date, channel_id: ch.id, source, visitors: v })
}

/** 库存：可售天数 = 库存 / 近 7 天日均销量。抖店云仓的便携装只留了 2 天的量 */
function seedInventory(avg7: Map<string, number>) {
  const days: Record<string, [number, number]> = { wh_dy: [16, 34], wh_main: [22, 55], wh_store: [9, 24] }
  for (const [wh] of WAREHOUSES) {
    for (const [sku] of SKUS) {
      const a = avg7.get(`${wh}|${sku}`) ?? 0
      if (sku === 'sku_weilu') {
        if (wh !== 'wh_dy') insert('inventory', { sku_id: sku, warehouse_id: wh, stock: wh === 'wh_main' ? 1200 : 60, in_transit: 0, safety_days: 7, updated_at: iso('2026-10-27T07:00') })
        continue
      }
      if (!a) continue
      let stock = Math.round(a * R.between(days[wh][0], days[wh][1]))
      let inTransit = R.next() < 0.25 ? Math.round(a * 10) : 0
      if (wh === 'wh_dy' && sku === 'sku_yinzhen') { stock = Math.round(a * 2.05); inTransit = 0 }
      if (wh === 'wh_main' && sku === 'sku_gongdao') { stock = Math.round(a * 6.5); inTransit = 120 } // 补的新货在路上，这回带气泡柱
      insert('inventory', { sku_id: sku, warehouse_id: wh, stock, in_transit: inTransit, safety_days: wh === 'wh_dy' ? 5 : 7, updated_at: iso('2026-10-27T07:00') })
    }
  }
}

const OPS: [string, string | null, string, string, string, string?][] = [
  ['2026-09-30T10:00', 'douyin', '阿杰', '活动', '国庆活动上线：便携装第二件半价（10/1—10/7）'],
  ['2026-10-01T09:00', 'store', '宋姐', '活动', '国庆茶空间延长营业到 21:00'],
  ['2026-10-08T14:00', null, '晓雯', '价格', '国庆活动结束，各平台价格恢复'],
  ['2026-10-12T11:00', null, '老何', '库存', '肉桂秋茶到货 60 斤，入杭州总仓'],
  ['2026-10-15T16:00', 'douyin', '阿杰', '库存', '抖店云仓补货：白毫银针便携装 500 盒入仓'],
  ['2026-10-20T12:10', 'xhs', '小艾', '活动', '笔记「玻璃公道杯怎么选不烫手」发布，挂了公道杯链接'],
  ['2026-10-20T20:00', 'tmall', '晓雯', '活动', '双 11 预售报名：寿眉饼、白牡丹'],
  ['2026-10-21T15:00', 'douyin', '阿杰', '库存', '云仓入仓要提前 5 天预约；便携装下一批还没约'],
  ['2026-10-22T09:40', null, '老何', '发货', '气泡柱用完了，新的要周六上午才到；玻璃公道杯先用普通纸箱发'],
  ['2026-10-22T15:20', 'tmall', '晓雯', '出价', '「秋冬白茶」计划出价 1.20 → 3.60'],
  ['2026-10-23T17:30', 'xhs', '老何', '发货', '小红书店发出玻璃公道杯 46 件（普通纸箱）'],
  ['2026-10-24T10:00', 'douyin', '阿杰', '活动', '直播间上了桂花乌龙试喝福袋'],
  ['2026-10-26T09:50', 'xhs', '小周', '其他', '客服：这两天好几单公道杯碎了，先按“运输破损”退款'],
  // 下面这条加在末尾，保持前面 op_1—op_13 的编号不变
  ['2026-10-24T11:00', null, '老何', '发货', '气泡柱到货，玻璃公道杯恢复加气泡柱发货'],
  ['2026-10-15T17:00', 'store', '宋姐', '其他', '门店改造设计稿定了：11/3 起停业施工约 10 天，11/13 恢复营业；10/31 前通知会员'],
  ['2026-10-25T16:30', 'store', '宋姐', '活动', '周日品茶会，来了 8 位老会员；告诉大家 10/31 是停业前最后一场'],
]

function seed() {
  STORE_ORDERS = null
  WAREHOUSES.forEach(([id, name, note]) => insert('warehouses', { id, name, note }))
  CHANNELS.forEach((c, i) => insert('channels', { id: c.id, name: c.name, kind: c.kind, owner: c.owner, warehouse_id: c.wh, sort: i, note: null }))
  SKUS.forEach(([id, name, category, spec, price, status, launch, note], i) => insert('skus', { id, name, category, spec, price, status, launch_date: launch, note, sort: i }))
  for (const date of eachDay(FROM, TO)) for (const ch of CHANNELS) seedDay(date, ch)

  // 近 7 天（10/20—10/26）各仓库各 SKU 的日均销量
  const avg7 = new Map<string, number>()
  for (const ch of CHANNELS) {
    for (const [sku] of ch.mix) {
      const key = `${ch.wh}|${sku}`
      avg7.set(key, (avg7.get(key) ?? 0) + sumUnits(ch.id, sku) / 7)
    }
  }
  seedInventory(avg7)
  OPS.forEach(([at, channel, who, kind, action, note], i) => insert('biz_ops_log', { id: `op_${i + 1}`, at, channel_id: channel, who, kind, action, note: note ?? null }))
  seedBizExtra() // 012 的表：日报设置、经营早报、异常处理状态、售后明细、门店时段客流、云仓入仓预约（biz-extra.ts）
}

function sumUnits(channel: string, sku: string) {
  return get<{ n: number }>("SELECT COALESCE(SUM(units),0) AS n FROM channel_products WHERE channel_id = :c AND sku_id = :s AND date BETWEEN '2026-10-20' AND '2026-10-26'", { c: channel, s: sku })?.n ?? 0
}

export const biz: SeedModule = {
  name: 'biz',
  tables: [...BIZ_EXTRA_TABLES, 'biz_ops_log', 'inventory', 'channel_ads', 'channel_refunds', 'channel_products', 'channel_traffic', 'channel_daily', 'skus', 'channels', 'warehouses'],
  seed,
}
