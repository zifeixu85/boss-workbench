// 导入时用到的“字典”：工作台有哪些字段、各平台常见叫法、各平台导出表的特征、日期和数字怎么认。归属：数据源与导入模块。
// 这里只放确定的知识；对不上、有两种意思的，一律交给页面标“拿不准”，不猜。

/** 工作台字段（写进经营模块的 channel_daily，每渠道每天一行） */
export type FieldKey = 'date' | 'channel' | 'gmv' | 'orders' | 'visitors' | 'refund_amount' | 'refund_orders' | 'ad_spend' | 'ad_gmv' | 'new_buyers' | 'old_buyers'
export type FieldDef = { key: FieldKey; label: string; kind: 'date' | 'text' | 'money' | 'count'; hint: string }

export const FIELDS: FieldDef[] = [
  { key: 'date', label: '日期', kind: 'date', hint: '这一行是哪天的数' },
  { key: 'channel', label: '渠道', kind: 'text', hint: '一张表里有几个渠道时才需要' },
  { key: 'gmv', label: '成交额', kind: 'money', hint: '当天付款的订单金额，不扣退款（元）' },
  { key: 'orders', label: '订单数', kind: 'count', hint: '当天付款的订单' },
  { key: 'visitors', label: '访客数', kind: 'count', hint: '当天进店、看过商品的人；门店是进店人数' },
  { key: 'refund_amount', label: '退款金额', kind: 'money', hint: '当天退掉的钱（元）' },
  { key: 'refund_orders', label: '退款单数', kind: 'count', hint: '当天退款的订单' },
  { key: 'ad_spend', label: '推广花费', kind: 'money', hint: '千川、万相台、聚光、加热当天花的钱（元）' },
  { key: 'ad_gmv', label: '推广成交额', kind: 'money', hint: '平台算在推广头上的成交（元）' },
  { key: 'new_buyers', label: '新客数', kind: 'count', hint: '新买家人数；门店非会员算新客' },
  { key: 'old_buyers', label: '老客数', kind: 'count', hint: '老买家人数；门店会员算老客' },
]
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>
/** 每张表都必须有的 */
export const CORE: FieldKey[] = ['date', 'gmv', 'orders', 'visitors']
/** 数值字段（写进 channel_daily 的列） */
export const NUMERIC: FieldKey[] = ['gmv', 'orders', 'visitors', 'refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers']

export const CHANNELS: Record<string, { name: string; source: string; aliases: string[] }> = {
  douyin: { name: '抖店', source: 'src_douyin', aliases: ['抖店', '抖音', '抖音小店'] },
  tmall: { name: '天猫', source: 'src_tmall', aliases: ['天猫', '淘宝', '天猫旗舰店'] },
  xhs: { name: '小红书店', source: 'src_xhs_shop', aliases: ['小红书店', '小红书', '小红书店铺'] },
  wechat: { name: '视频号小店', source: 'src_wechat', aliases: ['视频号小店', '视频号', '微信小店'] },
  store: { name: '门店', source: 'src_store', aliases: ['门店', '茶空间', '茶空间门店', '线下'] },
}
export function channelByName(name: string): string | null {
  const n = name.trim()
  for (const [id, c] of Object.entries(CHANNELS)) if (id === n || c.aliases.includes(n)) return id
  return null
}

/** 去掉单位括号、空格、货币符号，用来比对叫法 */
export function normHeader(h: string) {
  return h.replace(/^﻿/, '').replace(/[\s　]/g, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[¥￥:：]/g, '').toLowerCase()
}

/** 单位：从表头括号里认（元 / 万元 / %） */
export function unitOf(header: string): '元' | '万元' | '%' | null {
  const m = header.match(/[（(]([^）)]*)[）)]/)
  const u = m?.[1] ?? ''
  if (u.includes('万')) return '万元'
  if (u.includes('%') || u.includes('％')) return '%'
  if (u.includes('元')) return '元'
  return null
}

type Syn = { field: FieldKey; names: string[]; sure: boolean; why?: string; prefer?: boolean }
/** 常见叫法。sure=false 的叫法能对上但有歧义，标“拿不准”并写清为什么 */
const SYNONYMS: Syn[] = [
  { field: 'date', names: ['日期', '统计日期', '数据日期', '营业日期', '时间', '自然日', '日期天', '下单日期'], sure: true },
  { field: 'channel', names: ['渠道', '店铺', '平台', '销售渠道'], sure: true },
  { field: 'gmv', names: ['成交金额', '成交额', '当天成交', 'gmv', '支付gmv', '销售额'], sure: true },
  { field: 'gmv', names: ['支付金额'], sure: false, why: '“支付金额”含不含退款，各平台说法不一样；工作台的成交额是不扣退款的' },
  { field: 'gmv', names: ['实收金额'], sure: false, prefer: true, why: '实收是打完折、客人真付的钱；工作台的成交额按客人付的钱算，多半是这一列' },
  { field: 'gmv', names: ['营业额', '应收金额', '原价金额'], sure: false, why: '营业额一般是打折前的金额，和“实收”差一个优惠；工作台按客人真付的钱算' },
  { field: 'orders', names: ['成交订单数', '支付订单数', '支付子订单数', '订单数', '单数', '成交单数', '交易笔数', '订单量'], sure: true },
  { field: 'orders', names: ['支付买家数', '成交人数', '支付人数', '成交用户数', '支付用户数'], sure: false, why: '这是人数，不是单数；一个人一天买两次只算一个人' },
  { field: 'visitors', names: ['访客数', '商品访客数', '店铺访客数', '进店人数', 'uv', '访问人数', '客流', '进店客流'], sure: true },
  { field: 'refund_amount', names: ['退款金额', '成功退款金额', '售后退款', '退款额', '售后退款金额'], sure: true },
  { field: 'refund_amount', names: ['退款申请金额', '申请退款金额'], sure: false, why: '申请了不一定退成；工作台记的是退成功的钱' },
  { field: 'refund_orders', names: ['退款订单数', '退款单数', '成功退款订单数', '成功退款子订单数', '退款笔数'], sure: true },
  { field: 'ad_spend', names: ['推广花费', '千川消耗', '直通车花费', '万相台花费', '广告消耗', '投流花费', '聚光消耗', '加热花费', '推广消耗', '广告花费'], sure: true },
  { field: 'ad_gmv', names: ['推广成交额', '千川成交金额', '万相台成交金额', '聚光成交金额', '加热带来成交', '加热成交金额', '广告成交', '推广成交', '广告成交金额'], sure: true },
  { field: 'ad_gmv', names: ['直接成交金额', '聚光直接成交'], sure: false, why: '“直接成交”只算点了广告当场下单的，和平台推广报表里的总成交可能不一样' },
  { field: 'new_buyers', names: ['新客数', '新买家数', '新客户数', '新客', '首购人数'], sure: true },
  { field: 'new_buyers', names: ['非会员人数', '散客人数'], sure: false, why: '知识库《数据口径》说门店非会员算新客；别的店不一定' },
  { field: 'old_buyers', names: ['老客数', '老买家数', '老客户数', '复购客数', '会员单数'], sure: true },
  { field: 'old_buyers', names: ['会员消费人数', '会员人数'], sure: false, why: '知识库《数据口径》说门店会员算老客；别的店不一定' },
]

/** 工作台自己会算、或者没有地方放的列：用不上，并写清原因 */
const UNUSED: [string[], string][] = [
  [['转化率', '支付转化率', '成交转化率', '下单转化率'], '工作台自己算（订单数 ÷ 访客数）'],
  [['客单价', '件单价'], '工作台自己算（成交额 ÷ 订单数）'],
  [['退款率', '退款金额占比'], '工作台自己算（退款金额 ÷ 成交额）'],
  [['roi', '投产比', '投入产出比'], '工作台自己算（推广成交额 ÷ 推广花费）'],
  [['浏览量', 'pv', '曝光量', '商品曝光'], '工作台没有这一项'],
  [['加购人数', '加购件数', '收藏人数', '收藏商品数'], '工作台没有这一项'],
  [['直播间成交占比', '短视频成交占比'], '能从流量来源算出来，不单独存'],
  [['优惠金额', '折扣金额'], '工作台没有这一项（成交额已经是打完折的）'],
  [['填表人', '备注', '说明'], '不是数，不导'],
  [['新客占比'], '工作台自己算（新客 ÷ 新老客合计）'],
]

export type Guess = { field: FieldKey | null; sure: boolean; why: string; prefer?: boolean }
/** 按常见叫法猜一列是什么。返回 null = 没见过这个叫法 */
export function guessByName(header: string): Guess | null {
  const n = normHeader(header)
  if (!n) return null
  for (const s of SYNONYMS) if (s.names.includes(n)) return { field: s.field, sure: s.sure, prefer: s.prefer, why: s.why ?? `常见叫法：“${header.trim()}”就是${FIELD[s.field].label}` }
  for (const [names, why] of UNUSED) if (names.includes(n)) return { field: null, sure: true, why }
  return null
}

/** 叫法没见过、但名字里有明显的词：给一个建议，但一律标“拿不准”，等人点头 */
const LOOKS: { field: FieldKey; test: RegExp; also?: RegExp; words: string }[] = [
  { field: 'ad_gmv', test: /(推广|万相台|直通车|千川|聚光|加热|广告|投流|全站|无界)/, also: /(成交|gmv|销售额)/i, words: '推广 + 成交' },
  { field: 'ad_spend', test: /(推广|万相台|直通车|千川|聚光|加热|广告|投流|全站|无界)/, also: /(花费|消耗|消费|费用)/, words: '推广 + 花费' },
  { field: 'new_buyers', test: /新(买家|客|顾客|用户|访客)/, also: /(数|人)/, words: '新 + 买家' },
  { field: 'old_buyers', test: /(老|复购)(买家|客|顾客|用户)/, also: /(数|人)/, words: '老 + 买家' },
  { field: 'refund_amount', test: /退款/, also: /(金额|额)/, words: '退款 + 金额' },
  { field: 'refund_orders', test: /退款/, also: /(单|笔)/, words: '退款 + 单数' },
  { field: 'visitors', test: /(访客|访问人数|进店|客流)/, words: '访客' },
]
export function guessByLook(header: string): Guess | null {
  const n = normHeader(header)
  if (!n) return null
  for (const l of LOOKS) {
    if (!l.test.test(n) || (l.also && !l.also.test(n))) continue
    const hit = [...n.matchAll(new RegExp(l.test.source, 'g'))].map((m) => m[0]).concat(l.also ? [n.match(l.also)?.[0] ?? ''] : []).filter(Boolean)
    return { field: l.field, sure: false, why: `没见过这个叫法；名字里有“${[...new Set(hit)].join('”“')}”，像${FIELD[l.field].label}，确认一下` }
  }
  return null
}

/** 小红书笔记数据（写进内容模块的 xhs_note_stats）：只在数据源抽屉里确认对照时用 */
export const NOTE_TARGETS: { value: string; label: string }[] = [
  { value: 'xhs_notes.title', label: '笔记标题' }, { value: 'xhs_notes.published_at', label: '发布时间' }, { value: 'xhs_notes.kind', label: '笔记类型' },
  { value: 'xhs_note_stats.impressions', label: '曝光' }, { value: 'xhs_note_stats.reads', label: '阅读' }, { value: 'xhs_note_stats.likes', label: '点赞' },
  { value: 'xhs_note_stats.saves', label: '收藏' }, { value: 'xhs_note_stats.comments', label: '评论' }, { value: 'xhs_note_stats.shares', label: '分享' },
  { value: 'xhs_note_stats.new_followers', label: '涨粉' }, { value: 'xhs_note_stats.traffic', label: '流量来源（自然 / 投流）' },
]
export const targetLabel = (t: string | null) => {
  if (!t) return '不导'
  const note = NOTE_TARGETS.find((x) => x.value === t)
  if (note) return note.label
  const k = t.replace(/^channel_daily\./, '') as FieldKey
  return FIELD[k]?.label ?? t
}

/** 各平台导出表的特征：认出“这是哪家的哪张表” */
export type Profile = { id: string; platform: string; report: string; channel: string | null; markers: string[]; hint?: string }
export const PROFILES: Profile[] = [
  { id: 'douyin_compass', platform: '抖店', report: '罗盘 · 经营数据（按日）', channel: 'douyin', markers: ['千川消耗', '千川成交金额', '商品访客数', '直播间成交占比', '成交订单数'] },
  { id: 'tmall_sycm', platform: '天猫', report: '生意参谋 · 店铺日报', channel: 'tmall', markers: ['支付子订单数', '万相台花费', '万相台成交金额', '新买家数', '老买家数', '支付买家数', '支付转化率', '万相台无界花费', '支付新买家数'], hint: '生意参谋' },
  { id: 'xhs_qianfan', platform: '小红书店', report: '千帆 · 店铺数据', channel: 'xhs', markers: ['聚光消耗', '聚光成交金额', '店铺访客数', '复购客数'], hint: '千帆' },
  { id: 'wechat_shop', platform: '视频号小店', report: '微信小店 · 经营数据', channel: 'wechat', markers: ['加热花费', '加热带来成交', '访问人数', '新客户数', '老客户数'] },
  { id: 'store_pos', platform: '门店', report: '收银系统 · 日汇总', channel: 'store', markers: ['营业日期', '营业额', '实收金额', '交易笔数', '客流', '会员消费人数'] },
  { id: 'store_lark', platform: '门店', report: '飞书多维表格 · 门店日报', channel: 'store', markers: ['当天成交', '进店人数', '会员单数', '单数'] },
  { id: 'lark_biz', platform: '飞书多维表格', report: '经营数据表', channel: null, markers: ['渠道', '成交额', '订单数', '访客数', '推广花费', '推广成交额', '填表人'] },
  { id: 'xhs_notes', platform: '小红书', report: '专业号 · 笔记数据', channel: null, markers: ['笔记标题', '展现量', '观看量', '曝光', '阅读', '涨粉数', '新增关注'] },
]

// ———— 日期 ————
export type DateFmt = 'ymd-dash' | 'ymd-slash' | 'ymd-compact' | 'ymd-cn' | 'md-cn' | 'excel-serial' | 'datetime'
export const DATE_FMT_LABEL: Record<DateFmt, string> = {
  'ymd-dash': '2026-10-26', 'ymd-slash': '2026/10/26', 'ymd-compact': '20261026（连写）', 'ymd-cn': '2026年10月26日',
  'md-cn': '10月26日（无年份）', 'excel-serial': 'Excel 日期序号（如 46321）', datetime: '2026-10-26 12:10（带时间）',
}
const p2 = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${p2(m)}-${p2(d)}` : null
}

export function detectDateFmt(v: string): DateFmt | null {
  const s = v.trim()
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return 'ymd-dash'
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return 'ymd-slash'
  if (/^\d{8}$/.test(s)) return 'ymd-compact'
  if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(s)) return 'ymd-cn'
  if (/^\d{1,2}月\d{1,2}日$/.test(s)) return 'md-cn'
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return 'datetime'
  if (/^4\d{4}(\.0+)?$/.test(s)) return 'excel-serial'
  return null
}

/** 把日期写成 2026-10-26。没写年份的按 refYear 算（跨年时往前推一年，保证不超过今天） */
export function parseDate(v: string, fmt: DateFmt, today: string): string | null {
  const s = v.trim()
  let m: RegExpMatchArray | null
  switch (fmt) {
    case 'ymd-dash': case 'ymd-slash': case 'datetime':
      m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
      return m ? valid(+m[1], +m[2], +m[3]) : null
    case 'ymd-compact':
      m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
      return m ? valid(+m[1], +m[2], +m[3]) : null
    case 'ymd-cn':
      m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
      return m ? valid(+m[1], +m[2], +m[3]) : null
    case 'md-cn': {
      m = s.match(/^(\d{1,2})月(\d{1,2})日$/)
      if (!m) return null
      const y = +today.slice(0, 4)
      const d = valid(y, +m[1], +m[2])
      return d && d > today ? valid(y - 1, +m[1], +m[2]) : d
    }
    case 'excel-serial': {
      const n = Math.floor(Number(s))
      if (!Number.isFinite(n)) return null
      const dt = new Date(Date.UTC(1899, 11, 30) + n * 864e5)
      return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    }
  }
}

/** “合计”“总计”这类汇总行：工作台自己会加总，不导 */
export const TOTAL_ROW = /^(合计|总计|汇总|小计|平均|均值|total)/i
export const isTotalRow = (cells: string[]) => cells.slice(0, 2).some((c) => TOTAL_ROW.test(c.trim()))

// ———— 数字 ————
/** 平台表里“没有数”的写法：不当 0 */
export const MISSING = new Set(['', '-', '--', '—', '——', 'null', 'n/a', '/', '暂无'])

/** 把“¥8,725.00”“1.2万”“3.01%”变成数；没有数返回 null；认不出返回 NaN */
export function parseNumber(v: string, unit: '元' | '万元' | null): number | null {
  let s = v.trim().replace(/^﻿/, '')
  if (MISSING.has(s.toLowerCase())) return null
  s = s.replace(/[¥￥,，\s元]/g, '')
  let mult = unit === '万元' ? 10000 : 1
  if (s.endsWith('万')) { mult = 10000; s = s.slice(0, -1) }
  if (s.endsWith('%')) s = s.slice(0, -1)
  if (!/^-?\d+(\.\d+)?$/.test(s)) return Number.NaN
  return Math.round(Number(s) * mult * 100) / 100
}
