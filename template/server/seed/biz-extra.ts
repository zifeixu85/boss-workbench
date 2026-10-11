// 经营模块第二批种子（012_biz_reports.sql 的表）：日报设置、经营早报、异常的处理状态、小红书店售后明细、抖店云仓入仓预约。
// 归属：经营模块。由 biz.ts 的 seed() 在写完日数据后调用；所有数字都从刚写进去的日数据现算，和页面、命令行对得上。
// 这里的“经营早报”和“建议”是预置的示例：在故事里，它们由 Codex 定时任务每天 07:55 读工作台数据写好（见 数据源 src_codex），
// 页面上写明“由 Codex 定时任务 几点写”，不说成现场生成。不依赖“今天”：日期都写死在演示日 2026-10-27 前后，重建种子结果不变。
// 门店每小时客流（biz_store_hourly）不再写：门店日报只记当天成交、单数、进店人数、会员单数，不分时段（知识库 10-渠道与经营/数据口径.md）。
import { all } from '../db.ts'
import { insert, rng, eachDay, addDays, iso } from './lib.ts'
import { anomalies, channels, type Alert } from '../modules/biz/service.ts'
import { firstSeen } from '../modules/biz/anomaly.ts'
import { DEFAULT_CONFIG } from '../modules/biz/config.ts'
import { reportBody, stockFacts, stockSuggestions, suggestionsFor } from './biz-report.ts'

const R = rng(20261028)
const TO = '2026-10-26'
const WRITE_AT = '07:55'

// ---------- 日报设置：10/20 建库时按配方的默认值定的 ----------
function seedConfig() {
  const c = DEFAULT_CONFIG
  insert('biz_report_config', {
    id: 1, metrics: JSON.stringify(c.metrics), compare: JSON.stringify(c.compare), refund_mult: c.refund_mult, refund_min: c.refund_min,
    roi_min: c.roi_min, roi_drop: c.roi_drop, stock_days: c.stock_days, gmv_drop: c.gmv_drop, length: c.length, write_at: WRITE_AT,
    updated_at: iso('2026-10-20T21:40'), updated_by: '林总',
  })
}

/** 某天规则报出来的异常（库存只在最后一天报：库存表只有“现在”的数） */
const alertsOn = (d: string): Alert[] => anomalies(d, DEFAULT_CONFIG, { all: true }).filter((a) => a.kind !== '库存')

// ---------- 经营早报：10/20—10/26 每天一份，第二天 07:55 写好 ----------
function seedReports() {
  for (const d of eachDay('2026-10-20', TO)) {
    const { title, body } = reportBody(d, alertsOn(d), d === TO)
    const at = `${addDays(d, 1)}T${WRITE_AT}`
    insert('biz_reports', { id: `rpt_${d.replaceAll('-', '')}`, date: d, written_at: at, author: 'Codex 定时任务', method: '定时任务', title, body, created_at: iso(at) })
  }
}

// ---------- 异常的处理状态 ----------
type State = { id: string; d: string; first: string; status: string; owner: string | null; note: string | null; by: string; at: string; suggest?: boolean }

// first 留空：按日数据往回跑一遍规则，找第一次报出来的那天
const ACTIVE: State[] = [
  { id: 'refund_xhs', d: TO, first: '', status: '处理中', owner: '晓雯', by: '晓雯', at: '2026-10-26T18:40', suggest: true,
    note: '10/26 晓雯：碎了的小周、小陈在按“运输破损”退款或补发；气泡柱 10/24 到了，之后发的公道杯都加了。10/23 那批还没反馈的买家还没问。' },
  { id: 'roi_tmall', d: TO, first: '', status: '待处理', owner: null, note: null, by: 'Codex 定时任务', at: `2026-10-27T${WRITE_AT}`, suggest: true },
]

const HISTORY: State[] = [
  { id: 'gmv_douyin', d: '2026-10-08', first: '2026-10-08', status: '已处理', owner: '阿杰', by: '阿杰', at: '2026-10-08T10:20', note: '国庆后第一天，拿来比的“上周同一天”是 10/1，本来就高。和国庆前的工作日比是正常的。' },
  { id: 'gmv_tmall', d: '2026-10-08', first: '2026-10-08', status: '已处理', owner: '晓雯', by: '晓雯', at: '2026-10-08T10:35', note: '同上，节后回落，不用处理。' },
  { id: 'gmv_store', d: '2026-10-08', first: '2026-10-08', status: '已处理', owner: '宋姐', by: '宋姐', at: '2026-10-08T11:05', note: '国庆游客多，节后回到平常。门店周末和工作日本来差得大。' },
  { id: 'gmv_douyin', d: '2026-10-09', first: '2026-10-09', status: '已处理', owner: '阿杰', by: '阿杰', at: '2026-10-09T09:50', note: '还是在和国庆那周比，正常。' },
  { id: 'gmv_store', d: '2026-10-09', first: '2026-10-09', status: '已处理', owner: '宋姐', by: '宋姐', at: '2026-10-09T10:10', note: '同 10/8。' },
  { id: 'gmv_store', d: '2026-10-12', first: '2026-10-12', status: '已处理', owner: '宋姐', by: '林总', at: '2026-10-12T21:30', note: '10/5 是国庆，比不了。林总：节后两周这类提醒看一眼就行。' },
  { id: 'refund_wechat', d: '2026-10-14', first: '2026-10-14', status: '已处理', owner: '阿杰', by: '阿杰', at: '2026-10-14T16:20', note: '视频号一天十几单，退一单退款率就跳到 6%—8%。三单都是“不想要了”和“其他”，没有共同原因。' },
  { id: 'gmv_wechat', d: '2026-10-14', first: '2026-10-14', status: '已处理', owner: '阿杰', by: '阿杰', at: '2026-10-14T16:25', note: '10/14 直播停了一场（阿杰请假），第二天恢复。' },
  { id: 'refund_store', d: '2026-10-15', first: '2026-10-15', status: '已处理', owner: '宋姐', by: '宋姐', at: '2026-10-15T20:10', note: '三天各退了一单茶叶，都是买重了；门店单量小，一单就把退款率拉过 6%。' },
]

function seedAnomalies() {
  const at = `2026-10-27T${WRITE_AT}`
  const today = anomalies(TO, DEFAULT_CONFIG, { all: true }) // 库存这条只在最后一天报
  for (const s of ACTIVE) {
    const a = today.find((x) => x.id === s.id)
    if (!a) throw new Error(`种子：规则在 ${s.d} 没报出 ${s.id}，检查日数据`)
    insert('biz_anomalies', {
      id: s.id, kind: a.kind, channel_id: a.channel_id, first_seen: s.first || firstSeen(s.id, '2026-10-20', TO) || TO, title: a.title, detail: a.detail, status: s.status, owner: s.owner, note: s.note,
      suggestions: JSON.stringify(suggestionsFor(a, TO)), suggested_by: 'Codex 定时任务', suggested_at: at, updated_at: iso(s.at), updated_by: s.by,
    })
  }
  // 库存告急：只算到 10/26 的库存表；规则在演示日才报，种子里按同一个算法现算
  const stock = stockFacts(TO)
  insert('biz_anomalies', {
    id: 'stock_wh_dy_sku_yinzhen', kind: '库存', channel_id: 'douyin', first_seen: TO, title: stock.title, detail: stock.detail, status: '待处理', owner: null, note: null,
    suggestions: JSON.stringify(stockSuggestions(TO)), suggested_by: 'Codex 定时任务', suggested_at: at, updated_at: iso(at), updated_by: 'Codex 定时任务',
  })
  for (const s of HISTORY) {
    const a = alertsOn(s.d).find((x) => x.id === s.id)
    if (!a) continue
    insert('biz_anomalies', {
      id: `${s.id}@${s.d}`, kind: a.kind, channel_id: a.channel_id, first_seen: s.first, title: a.title, detail: a.detail, status: s.status, owner: s.owner, note: s.note,
      suggestions: null, suggested_by: null, suggested_at: null, updated_at: iso(s.at), updated_by: s.by,
    })
  }
}

// ---------- 小红书店售后明细：每一笔退款一张单子；10/23 那批公道杯另有补发和还没处理的 ----------
// 买家留言照平台售后表的样子手写：按“原因 + 商品类别”分组，同一句最多出现两次；客服小周、小陈轮着处理（知识库 03-生意/团队与伙伴.md）。
const NOTES: Record<string, string[]> = {
  不想要了: ['拍重了，多买了一份', '家里还有没喝完的，先不要了', '买错规格了，想要罐装的', '下单后看到直播间有赠品，想重新拍', '送人的，对方说已经有了',
    '冲动下单了，不好意思', '想换个口味再买', '离门店近，改去店里买', '家里人也买了一份，重了', '活动价没用上，退了重拍'],
  口味不喜欢: ['花香太重，喝不惯', '比想象的淡，泡了三次都没什么味', '有点涩，家里老人不爱喝', '桂花味太冲了', '和上次买的那罐味道不一样', '喝着有烟火味，不太习惯', '太甜了，不是想要的那种'],
  物流太慢: ['等了 5 天还没到', '物流三天没动', '赶着送人，等不及了，在别处买了', '显示派送中两天了还没送到', '中转站卡住了，不想等了'],
  '运输破损|杯': ['杯身裂了一条缝，倒水会漏', '到手碎成好几块，纸箱也压扁了', '杯嘴磕掉一小块', '盒子一晃全是玻璃渣', '外箱没有一点防撞，杯子碎了', '杯口一圈裂纹，不敢用了',
    '拆开杯把断了', '收拾碎片扎了手，拍了照片', '送人的，打开就是碎的，很尴尬', '杯身有道贯穿的裂', '包装里只有一层纸，杯子撞碎了', '外箱一角瘪了，里面杯子裂了'],
  '运输破损|杯+茶': ['杯子碎了，连同一起买的玫瑰白茶整单退', '碎了心情不好，茶也一起退了吧', '杯子碎了，玫瑰白茶也不要了，整单退'],
  '运输破损|管': ['玻璃管碎了一支，茶叶撒了一盒子', '有两支玻璃管裂了'],
  '运输破损|瓷': ['盖碗的盖子磕了个口', '碗沿碎了一块'],
  少件漏发: ['少了一袋', '赠品没收到', '买了两罐只到了一罐'],
  '质量问题|茶': ['封口没封好，茶有点受潮', '袋子里碎渣很多', '茶饼边上有一块发白'],
  '质量问题|具': ['盖碗内壁有个黑点', '杯底有气泡，看着不像正品'],
  其他: ['地址填错了', '想换个规格', '重复付款了', '帮朋友拍的，朋友不要了'],
}
const XHS_DISC = 0.94 // 小红书店的折后价（和 biz.ts 一致）
const pick = <T,>(xs: T[]) => xs[Math.floor(R.next() * xs.length)]
const orderNo = (d: string) => `P78${d.slice(5, 7)}${d.slice(8, 10)}${String(R.int(10000000, 99999999))}`
const clock = (d: string, h0 = 9, h1 = 22) => `${d}T${String(R.int(h0, h1)).padStart(2, '0')}:${String(R.int(0, 59)).padStart(2, '0')}`

/** 同一组里按顺序轮着用：先每句用一次，再用第二次；一句最多两次 */
function noteMaker() {
  const used = new Map<string, number>()
  return (key: string) => {
    const list = NOTES[key] ?? NOTES[key.split('|')[0]] ?? NOTES.其他
    const n = list.find((x) => (used.get(x) ?? 0) < 1) ?? list.find((x) => (used.get(x) ?? 0) < 2) ?? pick(list)
    used.set(n, (used.get(n) ?? 0) + 1)
    return n
  }
}

/** 买家留言按什么分组：碎了的看是玻璃杯、玻璃管还是瓷器；质量问题看是茶还是茶具 */
function noteKey(reason: string, sku: string | null, cat: string | undefined) {
  if (reason === '运输破损') return sku === 'sku_yinzhen' ? '运输破损|管' : sku === 'sku_gaiwan' ? '运输破损|瓷' : '运输破损|杯'
  if (reason === '质量问题') return cat === '茶具' ? '质量问题|具' : '质量问题|茶'
  return reason
}

function seedAftersales() {
  const sku = new Map(all<{ id: string; category: string; price: number }>('SELECT id, category, price FROM skus').map((r) => [r.id, r]))
  const rows = all<{ date: string; reason: string; sku_id: string | null; orders: number; amount: number; batch: string | null }>(
    "SELECT date, reason, sku_id, orders, amount, batch FROM channel_refunds WHERE channel_id = 'xhs' ORDER BY date, id")
  const note = noteMaker()
  let n = 0
  const add = (r: { applied_at: string; sku_id: string | null; amount: number; reason: string; batch: string | null; status: string; note: string; qty?: number }) => {
    n++
    insert('biz_aftersales', { id: `as_${String(n).padStart(3, '0')}`, channel_id: 'xhs', order_no: orderNo(r.applied_at.slice(0, 10)), applied_at: r.applied_at, sku_id: r.sku_id, qty: r.qty ?? 1,
      amount: Math.round(r.amount * 100) / 100, reason: r.reason, batch: r.batch, status: r.status, handler: n % 3 === 0 ? '小陈' : '小周', buyer_note: r.note })
  }
  const cup = Math.round(59 * XHS_DISC * 100) / 100
  const tea = Math.round(79 * XHS_DISC * 100) / 100
  for (const r of rows) {
    const late = r.date === TO
    const status = (k: number) => (late && k >= r.orders - 2 ? '退款中' : '已退款')
    if (r.batch) {
      // 10/23 那批公道杯：有几位连同一起买的玫瑰白茶整单退了（金额和 biz.ts 写进退款表的一致）
      const withTea = Math.round((r.amount - r.orders * cup) / tea)
      for (let k = 0; k < r.orders; k++) {
        const both = k < withTea
        add({ applied_at: clock(r.date), sku_id: 'sku_gongdao', amount: both ? cup + tea : cup, reason: r.reason, batch: r.batch, status: status(k), note: note(both ? '运输破损|杯+茶' : '运输破损|杯') })
      }
      continue
    }
    // 其他退款：一组拆成一单一单，金额按单数分，最后一单补齐，合计和退款原因表一致；商品就是退款表里记的那款
    const each = r.amount / r.orders
    let rest = r.amount
    const s = r.sku_id ? sku.get(r.sku_id) : undefined
    for (let k = 0; k < r.orders; k++) {
      const amt = k === r.orders - 1 ? rest : Math.round(each * R.between(0.85, 1.15) * 100) / 100
      rest -= amt
      const full = s ? s.price * XHS_DISC : 0
      add({ applied_at: clock(r.date), sku_id: r.sku_id, qty: full && amt > full * 1.05 ? 2 : 1, amount: amt, reason: r.reason, batch: null, status: status(k), note: note(noteKey(r.reason, r.sku_id, s?.category)) })
    }
  }
  // 10/23 那批：有一位选了补发（不退钱），还有两单 10/26 晚上才申请，平台的退款表里还没有
  add({ applied_at: '2026-10-25T20:14', sku_id: 'sku_gongdao', amount: 0, reason: '运输破损', batch: '10/23 发货', status: '已补发', note: '杯子裂了，补发一个就行，不用退' })
  add({ applied_at: '2026-10-26T21:08', sku_id: 'sku_gongdao', amount: cup, reason: '运输破损', batch: '10/23 发货', status: '待处理', note: '今天才拆，杯底裂了' })
  add({ applied_at: '2026-10-26T22:41', sku_id: 'sku_gongdao', amount: cup, reason: '运输破损', batch: '10/23 发货', status: '待处理', note: '纸箱压扁了，杯子碎了，能补发吗' })
}

// ---------- 抖店云仓入仓预约：要提前 5 天约。便携装 10/15 那批之后没约 ----------
function seedInbound() {
  const rows: [string, number, string, string, '已入仓' | '已预约', string, string | null][] = [
    ['sku_yinzhen', 400, '2026-09-25', '2026-09-30', '已入仓', '阿杰', '国庆备货'],
    ['sku_guihua', 300, '2026-10-04', '2026-10-09', '已入仓', '阿杰', null],
    ['sku_yinzhen', 500, '2026-10-10', '2026-10-15', '已入仓', '阿杰', null],
    ['sku_meigui', 200, '2026-10-13', '2026-10-18', '已入仓', '阿杰', null],
    ['sku_mudan', 60, '2026-10-17', '2026-10-22', '已入仓', '阿杰', null],
  ]
  // 库存表里有“在途”的，就是已经约好、还没到的
  for (const x of all<{ sku_id: string; in_transit: number }>("SELECT sku_id, in_transit FROM inventory WHERE warehouse_id = 'wh_dy' AND in_transit > 0")) {
    rows.push([x.sku_id, x.in_transit, '2026-10-24', '2026-10-29', '已预约', '阿杰', null])
  }
  rows.forEach(([sku, qty, booked, arrive, status, who, note], i) => insert('biz_inbound', {
    id: `ib_${i + 1}`, warehouse_id: 'wh_dy', sku_id: sku, qty, booked_at: booked, arrive_date: arrive, status, who, note,
  }))
}

export function seedBizExtra() {
  if (!channels().length) return
  seedConfig()
  seedAftersales() // 先写售后单：早报和建议里要用“这批有几位买家反馈了”
  seedReports()
  seedAnomalies()
  seedInbound()
}

/** --only biz 重建时要先清空的 012 表（放在 003 的表前面删，因为它们引用渠道、商品、仓库）。biz_store_hourly 不再写，重建时也清空 */
export const BIZ_EXTRA_TABLES = ['biz_inbound', 'biz_store_hourly', 'biz_aftersales', 'biz_anomalies', 'biz_report_config', 'biz_reports']
