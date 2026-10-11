// 数据源与导入模块的种子：10 个数据源、最近一周的运行记录、导出表字段对照、导入规则、预置的示例批次。归属：数据源与导入模块。
// 现状（10/27 早上 8 点）：
//   · 失败：小红书笔记数据 —— 平台 10/26 改了导出表的列名（曝光→展现量、阅读→观看量、新增关注→涨粉数，还多了人均观看时长），
//     07:50 导入时字段对不上，同一次导出的粉丝数据也一起没导。字段对照表里放了 Codex 定时任务 07:51 给的建议，等人确认；
//     原件 笔记数据_20261026.csv、粉丝数据_20261026.csv 在导入文件夹里，确认后能在数据源抽屉里“按新规则重新导入”（写内容模块的表，能撤销）。
//   · 超时：飞书日历与妙记 —— 日历照常同步，但 10/26 周会 11:30 散会，到今早 07:30 妙记还没生成。
// 运行记录的规矩：平台每天导 5 张表（店铺日报、商品、流量来源、售后、推广），一天一条，消息写当天的关键数、明细写 5 张表各几行；
// 定时任务前后差一两分钟；晓雯手动导天猫，时间不固定，周末晚一些。Codex 定时任务的时间和内容、大客户、经营模块一致，记录写“几点写好”。
// 预置的记录 origin = 示例、批次 ID 以 batch_sample_ 开头；网页上写“预置”，不说成刚才发生的。
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, ROOT } from '../db.ts'
import { insert, eachDay, addDays, rng, weekdayOf, type SeedModule } from './lib.ts'
import { createRule, RULE_DIR, ruleFileName, type NewRule } from '../modules/data/rules.ts'
import { toCsv } from '../modules/data/csv.ts'

type S = { id: string; name: string; kind: string; feeds: string; method: string; schedule: string; owner: string; status: string; last: string | null; ok: string | null; next: string | null; through: string | null; note?: string; channel?: string; dir?: string }
const FIVE = (ad: string) => `经营：每天 5 张表——店铺日报（成交、订单、访客、退款）、商品、流量来源、售后、${ad}推广`
const SOURCES: S[] = [
  { id: 'src_douyin', name: '抖店 · 经营数据导出', kind: '平台导出', feeds: FIVE('千川'), method: '阿杰每天 07:15 前从抖店后台导出 5 张表，放进 工作台/导入/抖店/；定时任务 07:20 按导入规则读取', schedule: '每天 07:20', owner: '阿杰', status: '正常', last: '2026-10-27T07:20', ok: '2026-10-27T07:20', next: '2026-10-28T07:20', through: '2026-10-26', channel: 'douyin', dir: '工作台/导入/抖店' },
  { id: 'src_tmall', name: '天猫 · 生意参谋导出', kind: '平台导出', feeds: FIVE('万相台'), method: '晓雯每天早上从生意参谋导出 5 张表，这几天在导入页拖进来；新版店铺日报存成规则后，改回放进 工作台/导入/天猫/ 自动导', schedule: '每天 07:30 前（这几天晓雯手动导）', owner: '晓雯', status: '正常', last: '2026-10-27T07:28', ok: '2026-10-27T07:28', next: '2026-10-28T07:30', through: '2026-10-26', note: '生意参谋 10/20 改版：推广改叫“万相台无界”、新老买家改叫“支付新买家数 / 支付老买家数”，旧规则停用了，这几天晓雯手动导。名字没变的列（支付金额、访客数这些）沿用旧规则里确认过的对照，改了名的 4 列点一下头，就能存成新规则', channel: 'tmall', dir: '工作台/导入/天猫' },
  { id: 'src_xhs_shop', name: '小红书店 · 千帆后台导出', kind: '平台导出', feeds: FIVE('聚光'), method: '晓雯每天 07:30 前从千帆后台导出 5 张表，放进 工作台/导入/小红书店/；定时任务 07:35 按导入规则读取', schedule: '每天 07:35', owner: '晓雯', status: '正常', last: '2026-10-27T07:36', ok: '2026-10-27T07:36', next: '2026-10-28T07:35', through: '2026-10-26', channel: 'xhs', dir: '工作台/导入/小红书店' },
  { id: 'src_wechat', name: '视频号小店 · 微信小店后台导出', kind: '平台导出', feeds: FIVE('加热'), method: '阿杰每天 07:40 前从微信小店后台导出 5 张表，放进 工作台/导入/视频号/；定时任务 07:40 按导入规则读取', schedule: '每天 07:40', owner: '阿杰', status: '正常', last: '2026-10-27T07:41', ok: '2026-10-27T07:41', next: '2026-10-28T07:40', through: '2026-10-26', note: '10/22 文件晚到，阿杰 08:35 补跑了一次', channel: 'wechat', dir: '工作台/导入/视频号' },
  { id: 'src_store', name: '门店日报 · 飞书多维表格', kind: '飞书多维表格', feeds: '经营：门店每天的成交、单数、进店人数、会员单数（门店日报）；退款很少，宋姐在「门店退款登记」里一单一行记', method: '宋姐每晚 21:30 左右在飞书多维表格「门店日报」里填，有退款就在「门店退款登记」记一行；22:00 用飞书命令行工具把两张表一起拉下来', schedule: '每天 22:00', owner: '宋姐', status: '正常', last: '2026-10-26T22:00', ok: '2026-10-26T22:00', next: '2026-10-27T22:00', through: '2026-10-26', channel: 'store' },
  { id: 'src_xhs_notes', name: '小红书 · 笔记数据导出', kind: '平台导出', feeds: '内容：每篇笔记的曝光、阅读、点赞、收藏、评论、涨粉（自然 / 投流分开）；粉丝每天的变化', method: '小艾每天 07:45 前从专业号后台导出“笔记数据”“粉丝数据”两张表，放进 工作台/导入/小红书笔记/；定时任务 07:50 按导入规则读取', schedule: '每天 07:50', owner: '小艾', status: '失败', last: '2026-10-27T07:50', ok: '2026-10-26T07:48', next: '2026-10-28T07:50', through: '2026-10-25', note: '平台 10/26 改了笔记数据表的列名：曝光→展现量、阅读→观看量、新增关注→涨粉数，还多了“人均观看时长”；07:50 导入时对不上，同一次导出的粉丝数据也一起没导。Codex 07:51 给了对照建议，等你确认后按新规则重新导入', dir: '工作台/导入/小红书笔记' },
  { id: 'src_lark', name: '飞书日历与妙记', kind: '飞书日历与妙记', feeds: '日程；周会妙记里的要点', method: '飞书命令行工具每 30 分钟同步日历；会议妙记生成后，把要点摘进收件箱', schedule: '日历每 30 分钟；妙记会后 1 小时内', owner: '林总', status: '超时', last: '2026-10-27T07:30', ok: '2026-10-27T07:30', next: '2026-10-27T08:00', through: '2026-10-27', note: '日历正常；10/26 周会 11:30 散会，到今早 07:30 妙记还没生成（可能没开录音转写），这次周会的要点没进来' },
  { id: 'src_kb', name: '知识库文件夹', kind: '知识库文件夹', feeds: '知识库页、客户背景笔记、项目资料', method: '工作台直接读知识库根目录下各个文件夹里的笔记文件，文件一改网页就刷新', schedule: '实时', owner: '林总', status: '正常', last: null, ok: null, next: null, through: null },
  { id: 'src_rss', name: 'RSS · 茶行业资讯、节气和天气', kind: 'RSS', feeds: '内容：选题里的“热点和节气”', method: '订阅 4 个 RSS（茶行业资讯、二十四节气、杭州天气、同类账号周报），每天 06:30 拉取', schedule: '每天 06:30', owner: '小艾', status: '正常', last: '2026-10-27T06:30', ok: '2026-10-27T06:30', next: '2026-10-28T06:30', through: '2026-10-27' },
  { id: 'src_codex', name: 'Codex 定时任务 · 选题、关怀、早报', kind: 'Codex 定时任务', feeds: '今日页：10 个小红书选题、大客户关怀草稿、经营早报和异常提醒；每周二的小红书周复盘', method: 'Codex 定时任务：07:00 出选题（07:03 写好）；07:10 看该关心谁、起草关怀（07:12 写好）；07:55 等平台数据导完写经营早报；每周二 07:30 写周复盘（07:34 写好）。导入对不上时也请它看一遍新表头（今天 07:51 给了笔记数据的对照建议）', schedule: '每天 07:00、07:10、07:55', owner: '林总', status: '正常', last: '2026-10-27T07:55', ok: '2026-10-27T07:55', next: '2026-10-28T07:00', through: '2026-10-27' },
]

type Run = { source: string; start: string; end?: string; status: string; file?: string; date?: string; total?: number; ok?: number; failed?: number; actor: string; message: string; detail?: unknown; channel?: string }

const CH_NAME: Record<string, string> = { douyin: '抖店', tmall: '天猫', xhs: '小红书店', wechat: '视频号小店', store: '门店' }
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const yuanN = (n: number) => Math.round(n).toLocaleString('zh-CN')
const plusMin = (day: string, hm: string, m: number) => {
  const d = new Date(`${day}T${hm}:00`)
  d.setMinutes(d.getMinutes() + m)
  return `${day}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
type Day = { gmv: number; orders: number; visitors: number; refund_amount: number; refund_orders: number }
const dayOf = (date: string, ch: string) => get<Day>('SELECT * FROM channel_daily WHERE date = :d AND channel_id = :c', { d: date, c: ch })
/** 店铺日报一天一行：消息写当天的关键数 */
const keyNums = (d: Day | undefined) => (d ? `成交 ${yuanN(d.gmv)} 元 · ${d.orders} 单 · ${d.refund_orders ? `退款 ${d.refund_orders} 单` : '没有退款'}` : '那天没有数')
const AD_NAME: Record<string, string> = { douyin: '千川', tmall: '万相台', xhs: '聚光', wechat: '加热' }
const cnt = (sql: string, d: string, ch: string) => { try { return get<{ n: number }>(sql, { d, c: ch })?.n ?? 0 } catch { return 0 } }
/** 一天的 5 张表各几行（经营模块的明细表里实际有多少，就写多少）：[表名, 几行, 单位] */
function fiveTables(date: string, ch: string): [string, number, string][] {
  return [
    ['店铺日报', 1, '行'],
    ['商品', cnt('SELECT COUNT(*) AS n FROM channel_products WHERE date = :d AND channel_id = :c', date, ch), '个'],
    ['流量来源', cnt('SELECT COUNT(*) AS n FROM channel_traffic WHERE date = :d AND channel_id = :c', date, ch), '个'],
    ['售后', cnt('SELECT COALESCE(SUM(orders), 0) AS n FROM channel_refunds WHERE date = :d AND channel_id = :c', date, ch), '单'],
    [`${AD_NAME[ch] ?? ''}推广`, cnt('SELECT COUNT(*) AS n FROM channel_ads WHERE date = :d AND channel_id = :c', date, ch), '个计划'],
  ]
}
const rowsOf = (t: [string, number, string][]) => t.reduce((a, [, n]) => a + n, 0)

function platformRuns(): Run[] {
  const out: Run[] = []
  // 定时任务每天差一两分钟；晓雯手动导天猫，周末晚一些（10/24 周六、10/25 周日）
  const days = eachDay('2026-10-21', '2026-10-27')
  const T: Record<string, string[]> = {
    src_douyin: ['07:20', '07:21', '07:20', '07:19', '07:21', '07:20', '07:20'],
    src_tmall: ['07:26', '07:52', '07:24', '09:15', '09:42', '07:31', '07:28'],
    src_xhs_shop: ['07:36', '07:35', '07:36', '07:35', '07:37', '07:36', '07:36'],
    src_wechat: ['07:41', '07:40', '07:40', '07:42', '07:41', '07:40', '07:41'],
  }
  const meta: Record<string, [string, string]> = { src_douyin: ['抖店', 'douyin'], src_tmall: ['天猫', 'tmall'], src_xhs_shop: ['小红书店', 'xhs'], src_wechat: ['视频号', 'wechat'] }
  days.forEach((day, i) => {
    const dataDate = addDays(day, -1)
    const tag = dataDate.replaceAll('-', '')
    for (const [source, [folder, ch]] of Object.entries(meta)) {
      const time = T[source][i]
      const d = dayOf(dataDate, ch)
      const manual = source === 'src_tmall'
      const tables = fiveTables(dataDate, ch)
      const n = rowsOf(tables)
      // 晓雯手动导的是在导入页拖进来的（文件名不带文件夹）；定时任务读导入文件夹
      const file = manual ? `生意参谋_店铺日报_${tag}.csv` : `工作台/导入/${folder}/${folder}_店铺日报_${tag}.csv`
      const base: Run = {
        source, start: `${day}T${time}`, end: plusMin(day, time, 1), status: '成功', file, date: dataDate, total: n, ok: n, failed: 0,
        actor: manual ? '晓雯' : '定时任务', channel: ch, detail: { 表: tables },
        message: manual ? `晓雯手动导 ${md(dataDate)}：${keyNums(d)}` : `${CH_NAME[ch]} ${md(dataDate)}：${keyNums(d)}`,
      }
      if (source === 'src_wechat' && day === '2026-10-22') {
        out.push({ ...base, status: '超时', start: `${day}T07:40`, end: `${day}T08:00`, total: 0, ok: 0, file: undefined, detail: undefined, message: '到 08:00 还没等到文件（约定 07:40 前放进来），这一天先空着，没当 0' })
        out.push({ ...base, start: `${day}T08:35`, end: `${day}T08:36`, actor: '阿杰', message: `文件晚到，阿杰补跑：${keyNums(d)}` })
        continue
      }
      if (source === 'src_tmall' && day === '2026-10-23') {
        // 那天生意参谋的退款到 10 点才更新（平时 7 点左右就更新了）：先导成交、订单、访客，退款上午补
        out.push({ ...base, status: '部分成功', total: n, ok: n - 1, failed: 1, message: `晓雯手动导 ${md(dataDate)}：成交 ${yuanN(d?.gmv ?? 0)} 元 · ${d?.orders ?? 0} 单；那天生意参谋的退款到 10 点才更新，先空着`,
          detail: { 表: tables, 有问题的行: [{ 行: 6, 原因: '退款金额是“-”：那天生意参谋的退款到 10 点才更新（平时 7 点左右就更新了），没当 0，等补导' }] } })
        out.push({ ...base, start: `${day}T10:05`, end: `${day}T10:05`, total: 1, ok: 1, file: `生意参谋_店铺日报_${tag}_补退款.csv`, detail: undefined, message: `晓雯补导 ${md(dataDate)} 的退款：${d?.refund_orders ?? 0} 单 ${yuanN(d?.refund_amount ?? 0)} 元（生意参谋 10 点后更新了）` })
        continue
      }
      out.push(base)
    }
  })
  return out
}

/** 到某天为止发了几篇笔记、其中几篇投过流（导出表里投流的单独一行） */
function notesUpTo(date: string) {
  const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM xhs_notes WHERE substr(published_at, 1, 10) <= :d", { d: date })?.n ?? 0
  const b = get<{ n: number }>("SELECT COUNT(DISTINCT s.note_id) AS n FROM xhs_note_stats s JOIN xhs_notes x ON x.id = s.note_id WHERE s.traffic = '投流' AND substr(x.published_at, 1, 10) <= :d", { d: date })?.n ?? 0
  return { notes: n, rows: n + b }
}

function otherRuns(sample: Record<string, string>): Run[] {
  const out: Run[] = []
  const r = rng(271027)
  // 门店：宋姐晚上填，22:00 拉下来
  for (const day of eachDay('2026-10-20', '2026-10-26')) {
    const d = get<Day>("SELECT * FROM channel_daily WHERE date = :d AND channel_id = 'store'", { d: day })
    const filled = `21:${String(r.int(24, 48)).padStart(2, '0')}`
    const refunds = d?.refund_orders ?? 0
    out.push({ source: 'src_store', start: `${day}T22:00`, end: `${day}T22:01`, status: '成功', date: day, total: 1 + refunds, ok: 1 + refunds, failed: 0, actor: '定时任务', channel: 'store',
      detail: { 表: [['门店日报', 1, '行'], ['门店退款登记', refunds, '单']] },
      message: `门店 ${md(day)}：成交 ${yuanN(d?.gmv ?? 0)} 元 · ${d?.orders ?? 0} 单 · 进店 ${d?.visitors ?? 0} 人（宋姐 ${filled} 填的）${refunds ? ` · 退款登记 ${refunds} 单 ${yuanN(d!.refund_amount)} 元` : ''}` })
  }
  // 小红书笔记数据：每天 07:48 前后，行数 = 到那天为止的笔记篇数 + 投过流的篇数
  const nt = ['07:48', '07:48', '07:49', '07:48', '07:50', '07:48']
  eachDay('2026-10-21', '2026-10-26').forEach((day, i) => {
    const dd = addDays(day, -1)
    const c = notesUpTo(dd)
    out.push({ source: 'src_xhs_notes', start: `${day}T${nt[i]}`, end: plusMin(day, nt[i], 1), status: '成功', file: `工作台/导入/小红书笔记/笔记数据_${dd.replaceAll('-', '')}.csv`, date: dd, total: c.rows + 1, ok: c.rows + 1, failed: 0, actor: '定时任务',
      detail: { 表: [['笔记数据', c.rows, '行'], ['粉丝数据', 1, '行']] },
      message: `笔记数据 ${md(dd)}：${c.notes} 篇的累计（${c.rows} 行，投流的单独一行）；粉丝数 1 行` })
  })
  const c26 = notesUpTo('2026-10-26')
  out.push({
    source: 'src_xhs_notes', start: '2026-10-27T07:50', end: '2026-10-27T07:50', status: '失败', file: '工作台/导入/小红书笔记/笔记数据_20261026.csv', date: '2026-10-26',
    total: c26.rows + 1, ok: 0, failed: c26.rows + 1, actor: '定时任务', message: '笔记数据的字段对不上：找不到“曝光”“阅读”“新增关注”三列，多了 4 列没见过的；同一次的粉丝数据也先没导',
    detail: {
      缺少的列: ['曝光', '阅读', '新增关注'], 多出来的列: ['展现量', '观看量', '涨粉数', '人均观看时长'], 样例行: sample,
      建议: '平台改了笔记数据的列名（粉丝数据的表头没变）。Codex 07:51 给了字段对照建议：在这个数据源的“等你确认”里确认后，点“按新规则重新导入”，笔记数据和粉丝数据一起导进来。',
    },
  })
  // RSS：每天 06:30
  const rss = [[8, 1, 7, 10], [11, 0, 7, 13], [9, 2, 7, 10], [6, 0, 7, 11], [5, 0, 7, 10], [9, 1, 7, 12], [12, 2, 7, 16]]
  eachDay('2026-10-21', '2026-10-27').forEach((day, i) => {
    const [a, b, c, d] = rss[i]
    const n = a + b + c + d
    out.push({ source: 'src_rss', start: `${day}T06:30`, end: `${day}T06:3${i % 2}`, status: '成功', date: day, total: n, ok: n, failed: 0, actor: '定时任务',
      message: `拉到 ${n} 条：茶行业资讯 ${a} · 节气 ${b}${day === '2026-10-23' ? '（霜降）' : ''} · 杭州天气 ${c} · 同类账号 ${d}` })
  })
  // Codex 定时任务（和别的模块、知识库《工具与账号》一致；记录写“几点写好”）：
  //   07:00 出选题，07:03 写好（10/26 那天 5 个，07:02）——小红书模块的后台任务；07:10 起草关怀，07:12 写好——大客户模块“关怀与回访”；
  //   07:55 写经营早报——经营模块；每周二 07:31 写周复盘，07:34 写好——小红书模块；07:51 笔记数据对不上，给对照建议——本模块
  const care: Record<string, string> = { '2026-10-27': '起草了 3 条关怀（澜拓科技 春节前回访、陈默 立冬问候、王建国 好久没见），存进“关怀与回访”，林总自己改、自己发' }
  eachDay('2026-10-21', '2026-10-27').forEach((day) => {
    const topics = day === '2026-10-26' ? 5 : 10
    out.push({ source: 'src_codex', start: `${day}T07:00`, end: `${day}T07:0${day === '2026-10-26' ? 2 : 3}`, status: '成功', date: day, total: topics, ok: topics, failed: 0, actor: 'Codex 定时任务', message: `出了 ${topics} 个小红书选题，写进当天的灵感池` })
    out.push({ source: 'src_codex', start: `${day}T07:10`, end: `${day}T07:12`, status: '成功', date: day, total: care[day] ? 3 : 0, ok: care[day] ? 3 : 0, failed: 0, actor: 'Codex 定时任务',
      message: care[day] ?? '看了未来 30 天的生日、节气和太久没联系的客户：没有要新起草的关怀' })
    out.push({ source: 'src_codex', start: `${day}T07:55`, end: `${day}T07:55`, status: '成功', date: addDays(day, -1), total: 1, ok: 1, failed: 0, actor: 'Codex 定时任务',
      message: day === '2026-10-27' ? `经营早报（${md(addDays(day, -1))} 的数）：5 个渠道，3 处异常要看` : `经营早报（${md(addDays(day, -1))} 的数）已写好` })
    if (weekdayOf(day) === 2) out.push({ source: 'src_codex', start: `${day}T07:31`, end: `${day}T07:34`, status: '成功', date: addDays(day, -1), total: 1, ok: 1, failed: 0, actor: 'Codex 定时任务', message: '小红书第 43 周复盘写好了（2 条经验待定）' })
  })
  out.push({ source: 'src_codex', start: '2026-10-27T07:51', end: '2026-10-27T07:51', status: '成功', date: '2026-10-26', total: 4, ok: 4, failed: 0, actor: 'Codex 定时任务',
    message: '小红书笔记数据对不上：看了一遍新表头，给了 4 列对照建议（展现量→曝光、观看量→阅读、涨粉数→涨粉，人均观看时长先不导），等你确认' })
  // 飞书：日历每天一条汇总（48 次），妙记按会议记
  eachDay('2026-10-21', '2026-10-26').forEach((day) => {
    out.push({ source: 'src_lark', start: `${day}T00:00`, end: `${day}T23:30`, status: '成功', date: day, total: 48, ok: 48, failed: 0, actor: '定时任务', message: '日历每 30 分钟同步一次，这天 48 次都成功', detail: { sub: '日历' } })
  })
  out.push({ source: 'src_lark', start: '2026-10-27T00:00', end: '2026-10-27T07:30', status: '成功', date: '2026-10-27', total: 16, ok: 16, failed: 0, actor: '定时任务', message: '日历今天同步了 16 次（00:00—07:30），都成功', detail: { sub: '日历' } })
  out.push({ source: 'src_lark', start: '2026-10-19T11:12', end: '2026-10-19T11:13', status: '成功', date: '2026-10-19', total: 6, ok: 6, failed: 0, actor: '定时任务', message: '10/19 周会的妙记：会后 40 分钟生成，摘出 6 条要点', detail: { sub: '妙记', meeting: '10/19 周会' } })
  out.push({ source: 'src_lark', start: '2026-10-26T11:30', end: '2026-10-27T07:30', status: '超时', date: '2026-10-26', total: 0, ok: 0, failed: 0, actor: '定时任务', message: '10/26 周会 11:30 散会，到今早 07:30 妙记还没生成（可能没开录音转写），要点没进来', detail: { sub: '妙记', meeting: '10/26 周会' } })
  return out
}

// ———— 小红书笔记数据：10/26 那份导出表（新表头）的原件，放进导入文件夹 ————
type Stat = { note_id: string; traffic: string; impressions: number; reads: number; likes: number; saves: number; comments: number; shares: number; new_followers: number }
type NoteRow = { id: string; title: string; kind: string; published_at: string }
const NOTES_FILE = '工作台/导入/小红书笔记/笔记数据_20261026.csv'
const FANS_FILE = '工作台/导入/小红书笔记/粉丝数据_20261026.csv'
/** xn_41 那篇（10/26 12:10 发的）发出来半天的数 */
const FIRST_DAY = { impressions: 5216, reads: 466, likes: 29, saves: 41, comments: 5, shares: 3, new_followers: 6 }

/** 按发布后的天数推一天：自然流量前几天涨得快、后面慢慢涨；投流第 3 天以后基本不涨（和内容模块生成每天累计的曲线一致） */
function nextDay(s: Stat, age: number, r: ReturnType<typeof rng>): Stat {
  const tau = s.traffic === '投流' ? 1.1 : 2.6
  const g = (d: number) => (s.traffic === '投流' ? 1 - Math.exp(-d / tau) : 1 - Math.exp(-d / tau) + 0.0045 * d)
  const f = g(age + 1) / g(age)
  const k = (v: number) => Math.max(v, Math.round(v * f * r.between(0.985, 1.02)))
  return { ...s, impressions: k(s.impressions), reads: k(s.reads), likes: k(s.likes), saves: k(s.saves), comments: k(s.comments), shares: k(s.shares), new_followers: k(s.new_followers) }
}

function notesExport(): { rows: (string | number)[][]; sample: Record<string, string>; ref: { title: string; before: Stat; after: Stat } | null; gain: number } {
  const notes = all<NoteRow>("SELECT id, title, kind, published_at FROM xhs_notes WHERE substr(published_at, 1, 10) <= '2026-10-26' ORDER BY published_at DESC")
  const stats = all<Stat>("SELECT * FROM xhs_note_stats WHERE stats_date = '2026-10-25'")
  const r = rng(261026)
  const c = (n: number) => n.toLocaleString('en-US')
  const rows: (string | number)[][] = [['笔记标题', '发布时间', '笔记类型', '流量来源', '展现量', '观看量', '点赞', '收藏', '评论', '分享', '涨粉数', '人均观看时长']]
  let ref: { title: string; before: Stat; after: Stat } | null = null
  let sample: Record<string, string> = {}
  let gain = 0 // 10/26 这一天笔记带来的涨粉（累计的差）
  for (const n of notes) {
    const own = stats.filter((s) => s.note_id === n.id).sort((a, b) => Number(b.traffic === '自然') - Number(a.traffic === '自然'))
    const list: Stat[] = own.length ? own.map((s) => nextDay(s, Math.round((new Date('2026-10-25T00:00').getTime() - new Date(`${n.published_at.slice(0, 10)}T00:00`).getTime()) / 864e5) + 1, r))
      : [{ note_id: n.id, traffic: '自然', ...FIRST_DAY }]
    for (const s of list) {
      gain += s.new_followers - (own.find((x) => x.traffic === s.traffic)?.new_followers ?? 0)
      const secs = `${Math.round(r.between(14, 32))}秒`
      const row = [n.title, n.published_at.replace('T', ' '), n.kind, s.traffic === '投流' ? '薯条推广' : '自然推荐', c(s.impressions), c(s.reads), s.likes, s.saves, s.comments, s.shares, s.new_followers, secs]
      rows.push(row)
      if (n.id === 'xn_40' && s.traffic === '自然') {
        ref = { title: n.title, before: own.find((x) => x.traffic === '自然')!, after: s }
        sample = Object.fromEntries(rows[0].map((h, i) => [String(h), String(row[i])]))
      }
    }
  }
  return { rows, sample, ref, gain }
}

/** 同一次导出的“粉丝数据”表（表头没改版）：近 7 天，10/26 那天 = 10/25 + 笔记带来的涨粉 + 主页直接关注的几个 − 取关的几个 */
function followersExport(gain: number): (string | number)[][] | null {
  const prev = all<{ date: string; followers: number; gained: number; lost: number }>("SELECT * FROM xhs_followers_daily WHERE date BETWEEN '2026-10-20' AND '2026-10-25' ORDER BY date")
  const last = prev.at(-1)
  if (!last || last.date !== '2026-10-25') return null
  const r = rng(261027)
  const gained = gain + r.int(2, 5)
  const lost = r.int(2, 5)
  return [['日期', '粉丝总数', '新增关注', '取消关注'], ...prev.map((x) => [x.date, x.followers, x.gained, x.lost]), ['2026-10-26', last.followers + gained - lost, gained, lost]]
}

// 字段对照：[数据源, 文件里的列, 工作台字段, 换算, 样例, 状态, 把握, 理由]
type M = [string, string, string | null, string | null, string | null, string, number | null, string | null]
function mappingRows(ref: ReturnType<typeof notesExport>['ref'], sample: Record<string, string>): M[] {
  const t = ref ? `《${ref.title.split('：')[0]}》` : '同一篇笔记'
  const b = ref?.before
  const a = ref?.after
  const c = (n?: number) => (n ?? 0).toLocaleString('zh-CN')
  return [
    // 小红书笔记数据：平台改了列名，Codex 定时任务 07:51 给了建议，等人确认（理由拿 10/25 前就发了的那篇比，前一天有数）
    ['src_xhs_notes', '笔记标题', 'xhs_notes.title', null, sample.笔记标题 ?? null, '已确认', null, null],
    ['src_xhs_notes', '发布时间', 'xhs_notes.published_at', '“2026-10-25 20:00”换成 2026-10-25T20:00', sample.发布时间 ?? null, '已确认', null, null],
    ['src_xhs_notes', '笔记类型', 'xhs_notes.kind', null, sample.笔记类型 ?? '图文', '已确认', null, null],
    ['src_xhs_notes', '展现量', 'xhs_note_stats.impressions', '去掉千分位逗号', sample.展现量 ?? null, 'AI 建议', 0.95, `就是原来的“曝光”，平台 10/26 改了名：${t}前一天曝光 ${c(b?.impressions)}，这份展现量 ${c(a?.impressions)}，发出第 2 天这么涨是正常的`],
    ['src_xhs_notes', '观看量', 'xhs_note_stats.reads', '去掉千分位逗号', sample.观看量 ?? null, 'AI 建议', 0.9, `就是原来的“阅读”，平台把图文和视频统一叫“观看”：${t}前一天阅读 ${c(b?.reads)}，这份观看量 ${c(a?.reads)}；和展现量的比例约 ${a ? Math.round((a.reads / a.impressions) * 100) : 9}%，和以前的阅读率一致`],
    ['src_xhs_notes', '点赞', 'xhs_note_stats.likes', null, sample.点赞 ?? null, '已确认', null, null],
    ['src_xhs_notes', '收藏', 'xhs_note_stats.saves', null, sample.收藏 ?? null, '已确认', null, null],
    ['src_xhs_notes', '评论', 'xhs_note_stats.comments', null, sample.评论 ?? null, '已确认', null, null],
    ['src_xhs_notes', '分享', 'xhs_note_stats.shares', null, sample.分享 ?? null, '已确认', null, null],
    ['src_xhs_notes', '涨粉数', 'xhs_note_stats.new_followers', null, sample.涨粉数 ?? null, 'AI 建议', 0.86, `就是原来的“新增关注”，只算这篇笔记带来的关注：${t}前一天 ${c(b?.new_followers)}，这份 ${c(a?.new_followers)}，数值范围和以前一致`],
    ['src_xhs_notes', '人均观看时长', null, null, sample.人均观看时长 ?? null, '未匹配', null, '工作台的笔记数据里没有这一项，可以先不导；以后想看，再给小红书数据加一列'],
    ['src_xhs_notes', '流量来源', 'xhs_note_stats.traffic', '含“推广”的记为投流，其余记为自然', sample.流量来源 ?? '自然推荐', '已确认', null, null],
    // 抖店
    ['src_douyin', '成交金额', 'channel_daily.gmv', '去掉“¥”和千分位', '¥8,725.00', '已确认', null, null],
    ['src_douyin', '成交订单数', 'channel_daily.orders', null, '80', '已确认', null, null],
    ['src_douyin', '商品访客数', 'channel_daily.visitors', null, '3,195', '已确认', null, null],
    ['src_douyin', '退款金额', 'channel_daily.refund_amount', null, '¥289.00', '已确认', null, null],
    ['src_douyin', '退款订单数', 'channel_daily.refund_orders', null, '4', '已确认', null, null],
    ['src_douyin', '千川消耗', 'channel_daily.ad_spend', null, '1,363.00', '已确认', null, null],
    ['src_douyin', '千川成交金额', 'channel_daily.ad_gmv', null, '3,998.00', '已确认', null, null],
    ['src_douyin', '新客数', 'channel_daily.new_buyers', null, '54', '已确认', null, null],
    ['src_douyin', '老客数', 'channel_daily.old_buyers', null, '24', '已确认', null, null],
    ['src_douyin', '直播间成交占比', null, null, '41.2%', '忽略', null, '能从流量来源算出来，不单独存'],
    // 门店日报（飞书多维表格，列和知识库《数据口径》一致）
    ['src_store', '日期', 'channel_daily.date', null, '2026/10/26', '已确认', null, null],
    ['src_store', '当天成交', 'channel_daily.gmv', null, '3139', '已确认', null, null],
    ['src_store', '单数', 'channel_daily.orders', null, '16', '已确认', null, null],
    ['src_store', '进店人数', 'channel_daily.visitors', null, '42', '已确认', null, null],
    ['src_store', '会员单数', 'channel_daily.old_buyers', '会员算老客；新客 = 单数 − 会员单数', '13', '已确认', null, null],
  ]
}

// 导入规则（预置）：每种表第一次导的时候对好字段、存下来，以后定时任务按规则导。
// 天猫的旧规则 10/20 生意参谋改版后停用了，新版还没存（演示时：拖天猫的表进来，对一次字段、存成新规则）
type SeedRule = Omit<NewRule, 'target' | 'amount_unit'> & { key: string; target?: NewRule['target'] }
const D = (cols: [string, string | null][], by: string, at: string) => cols.map(([col, field]) => ({ col, field, how: '你选的', by, at }))
const DAILY_REQ = ['date', 'gmv', 'orders', 'visitors', 'refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers'] as NewRule['required']
const RULES: SeedRule[] = [
  {
    key: 'douyin', platform: '抖店', report: '罗盘 · 经营数据（按日）', channel_id: 'douyin', source_id: 'src_douyin', date_format: 'ymd-slash', created_by: '阿杰', created_at: '2026-09-20T10:05',
    last_used_at: '2026-10-27T07:20', use_count: 37, required: DAILY_REQ,
    mapping: D([['日期', 'date'], ['成交金额', 'gmv'], ['成交订单数', 'orders'], ['商品访客数', 'visitors'], ['退款金额', 'refund_amount'], ['退款订单数', 'refund_orders'], ['千川消耗', 'ad_spend'], ['千川成交金额', 'ad_gmv'], ['新客数', 'new_buyers'], ['老客数', 'old_buyers'], ['直播间成交占比', null]], '阿杰', '2026-09-20T10:05'),
    signature: [], note: '“直播间成交占比”不导：工作台从流量来源自己算',
  },
  {
    key: 'xhs', platform: '小红书店', report: '千帆 · 店铺数据', channel_id: 'xhs', source_id: 'src_xhs_shop', date_format: 'ymd-cn', created_by: '晓雯', created_at: '2026-09-20T10:20',
    last_used_at: '2026-10-27T07:36', use_count: 37, required: DAILY_REQ,
    mapping: D([['日期', 'date'], ['支付金额(元)', 'gmv'], ['支付订单数', 'orders'], ['店铺访客数', 'visitors'], ['退款金额(元)', 'refund_amount'], ['退款订单数', 'refund_orders'], ['聚光消耗(元)', 'ad_spend'], ['聚光成交金额(元)', 'ad_gmv'], ['首购人数', 'new_buyers'], ['复购客数', 'old_buyers']], '晓雯', '2026-09-20T10:20'),
    signature: [], note: null,
  },
  {
    key: 'wechat', platform: '视频号小店', report: '微信小店 · 经营数据', channel_id: 'wechat', source_id: 'src_wechat', date_format: 'ymd-dash', created_by: '阿杰', created_at: '2026-09-22T16:40',
    last_used_at: '2026-10-27T07:41', use_count: 36, required: DAILY_REQ,
    mapping: D([['日期', 'date'], ['成交金额（元）', 'gmv'], ['成交订单数', 'orders'], ['访问人数', 'visitors'], ['退款金额（元）', 'refund_amount'], ['退款订单数', 'refund_orders'], ['加热花费（元）', 'ad_spend'], ['加热带来成交（元）', 'ad_gmv'], ['新客户数', 'new_buyers'], ['老客户数', 'old_buyers']], '阿杰', '2026-09-22T16:40'),
    signature: [], note: '退款不是每天都有：没有退款的日子平台写 0，照导',
  },
  {
    key: 'store', platform: '门店', report: '飞书多维表格 · 门店日报', channel_id: 'store', source_id: 'src_store', date_format: 'ymd-slash', created_by: '宋姐', created_at: '2026-09-21T21:50',
    last_used_at: '2026-10-26T22:00', use_count: 36, required: ['date', 'gmv', 'orders', 'visitors', 'old_buyers'],
    mapping: D([['日期', 'date'], ['当天成交', 'gmv'], ['单数', 'orders'], ['进店人数', 'visitors'], ['会员单数', 'old_buyers'], ['填表人', null], ['备注', null]], '宋姐', '2026-09-21T21:50'),
    signature: [], note: '门店没有推广；会员单算老客，新客 = 单数 − 会员单数（知识库《数据口径》）',
  },
  {
    key: 'tmall_old', platform: '天猫', report: '生意参谋 · 店铺日报（10/20 改版前）', channel_id: 'tmall', source_id: 'src_tmall', date_format: 'ymd-dash', created_by: '晓雯', created_at: '2026-09-20T10:12',
    last_used_at: '2026-10-20T07:31', use_count: 30, required: DAILY_REQ, status: '停用',
    mapping: D([['统计日期', 'date'], ['支付金额', 'gmv'], ['支付子订单数', 'orders'], ['访客数', 'visitors'], ['成功退款金额', 'refund_amount'], ['成功退款笔数', 'refund_orders'], ['万相台花费', 'ad_spend'], ['万相台成交金额', 'ad_gmv'], ['新买家数', 'new_buyers'], ['老买家数', 'old_buyers']], '晓雯', '2026-09-20T10:12'),
    signature: [], note: '生意参谋 10/20 改版，推广改叫“万相台无界”、新老买家改叫“支付新买家数 / 支付老买家数”，这条规则对不上了，先停用。新版第一次导入时，名字没变的列沿用这里的对照，改了名的重新点头，存成新规则',
  },
  {
    key: 'notes', platform: '小红书', report: '专业号 · 笔记数据', channel_id: null, source_id: 'src_xhs_notes', target: 'xhs_note_stats', date_format: 'datetime', created_by: '小艾', created_at: '2026-09-23T09:30',
    last_used_at: '2026-10-26T07:48', use_count: 34, required: [],
    mapping: D([['笔记标题', 'xhs_notes.title'], ['发布时间', 'xhs_notes.published_at'], ['笔记类型', 'xhs_notes.kind'], ['曝光', 'xhs_note_stats.impressions'], ['阅读', 'xhs_note_stats.reads'], ['点赞', 'xhs_note_stats.likes'], ['收藏', 'xhs_note_stats.saves'], ['评论', 'xhs_note_stats.comments'], ['分享', 'xhs_note_stats.shares'], ['新增关注', 'xhs_note_stats.new_followers'], ['流量来源', 'xhs_note_stats.traffic']], '小艾', '2026-09-23T09:30'),
    signature: [], note: null,
  },
]

const DECIDER: Record<string, string> = { src_xhs_notes: '小艾', src_douyin: '阿杰', src_tmall: '晓雯', src_store: '宋姐' }
/** 已经对好的列是哪天确认的：和对应导入规则存的那天一致 */
const DECIDED_AT: Record<string, string> = { src_xhs_notes: '2026-09-23T09:30', src_douyin: '2026-09-20T10:05', src_tmall: '2026-09-20T10:12', src_store: '2026-09-21T21:50' }

function seed() {
  // 上次清掉过示例数据、又只重建本模块时：先把回收区里的行放回经营表，免得示例数据丢了
  const trash = all<{ row_key: string; row_json: string }>('SELECT row_key, row_json FROM data_sample_trash')
  for (const t of trash) {
    const [date, ch] = t.row_key.split('|')
    const v = JSON.parse(t.row_json) as Record<string, number>
    run(`INSERT OR IGNORE INTO channel_daily (date, channel_id, ${Object.keys(v).join(', ')}) VALUES (:date, :ch, ${Object.keys(v).map((k) => `:${k}`).join(', ')})`, { date, ch, ...v })
  }
  run('DELETE FROM data_sample_trash')

  SOURCES.forEach((s, i) => insert('data_sources', {
    id: s.id, name: s.name, kind: s.kind, feeds: s.feeds, method: s.method, schedule: s.schedule, owner: s.owner, status: s.status,
    last_run_at: s.last, last_ok_at: s.ok, next_run_at: s.next, data_through: s.through, note: s.note ?? null, sort: i, channel_id: s.channel ?? null, inbox_dir: s.dir ?? null,
  }))
  // “立即同步”去这些文件夹找新文件。预置的导入记录没有放原件；只有小红书笔记 10/26 那两份（新表头、导失败的那次）放了原件
  SOURCES.forEach((s) => { if (s.dir) mkdirSync(join(ROOT, s.dir), { recursive: true }) })
  const throughNotes = get<{ d: string | null }>('SELECT MAX(stats_date) AS d FROM xhs_note_stats')?.d ?? null
  let exp: ReturnType<typeof notesExport> = { rows: [], sample: {}, ref: null, gain: 0 }
  try { exp = notesExport() } catch { /* 没有内容模块：笔记数据这一块只有记录 */ }
  if (exp.rows.length > 1 && throughNotes === '2026-10-25') {
    writeFileSync(join(ROOT, NOTES_FILE), toCsv(exp.rows))
    let fans: (string | number)[][] | null = null
    try { fans = followersExport(exp.gain) } catch { /* 没有粉丝表 */ }
    if (fans) writeFileSync(join(ROOT, FANS_FILE), toCsv(fans))
  } else if (throughNotes && throughNotes > '2026-10-25') console.warn(`  笔记数据已经导到 ${throughNotes}：没重写 ${NOTES_FILE}（先 import-reset 撤销现场那次导入）`)

  const ruleIds: Record<string, string> = {}
  for (const r of RULES) {
    // 固定 ID（rule_douyin 这样）：彩排后 import-reset 重灌，存下来的规则链接还能打开
    const rule = createRule({ ...r, id: `rule_${r.key}`, target: r.target ?? 'channel_daily', amount_unit: '元', origin: '示例', signature: r.mapping.map((m) => m.col) }, { quiet: true })
    ruleIds[r.key] = rule.id
  }
  // 库里没有的规则文件（上次现场存的）删掉，免得文件夹里有、页面上没有
  const keep = new Set(RULES.map((r) => ruleFileName(r.platform, r.report)))
  if (existsSync(RULE_DIR)) for (const f of readdirSync(RULE_DIR)) if (f.endsWith('.json') && !keep.has(f)) rmSync(join(RULE_DIR, f), { force: true })
  const ruleOfSource: Record<string, string | undefined> = { src_douyin: ruleIds.douyin, src_xhs_shop: ruleIds.xhs, src_wechat: ruleIds.wechat, src_store: ruleIds.store, src_xhs_notes: ruleIds.notes }

  // 预置的示例批次：经营表里 9/27—10/26 的数按渠道各记一批（能一键清掉、也能恢复）
  const batchOf: Record<string, string> = {}
  for (const [ch, name] of Object.entries(CH_NAME)) {
    const rows = all<Record<string, number | string>>("SELECT * FROM channel_daily WHERE channel_id = :ch AND date BETWEEN '2026-09-27' AND '2026-10-26' ORDER BY date", { ch })
    if (!rows.length) continue
    const id = `batch_sample_${ch}`
    batchOf[ch] = id
    insert('data_batches', {
      id, origin: '示例', source_id: SOURCES.find((s) => s.channel === ch)?.id ?? null, rule_id: null, run_id: null, channel_id: ch,
      label: `示例数据 · ${name} ${md(String(rows[0].date))}—${md(String(rows.at(-1)!.date))}`,
      file_name: null, target: 'channel_daily', date_from: rows[0].date, date_to: rows.at(-1)!.date, rows: rows.length, status: '有效',
      created_at: '2026-10-10T04:30', created_by: '示例数据', note: 'ABC茶社示例数据（虚构），演示用。清掉后经营页这个渠道没有数，可以在导入记录页放回去',
    })
    for (const r of rows) {
      const { date, channel_id, ...vals } = r
      insert('data_batch_rows', { batch_id: id, tbl: 'channel_daily', row_key: `${date}|${channel_id}`, before_json: null, before_batch: null, after_json: JSON.stringify(vals) })
    }
  }

  const runs = [...platformRuns(), ...otherRuns(exp.sample)].sort((a, b) => a.start.localeCompare(b.start))
  runs.forEach((r, i) => insert('import_runs', {
    id: `run_${String(i + 1).padStart(3, '0')}`, source_id: r.source, started_at: r.start, finished_at: r.end ?? null, status: r.status,
    file_name: r.file ?? null, data_date: r.date ?? null, date_from: r.date ?? null, rows_total: r.total ?? null, rows_ok: r.ok ?? null, rows_failed: r.failed ?? null,
    actor: r.actor, message: r.message, detail: r.detail ? JSON.stringify(r.detail) : null, origin: '示例',
    rule_id: r.status === '超时' ? null : ruleOfSource[r.source] ?? null, batch_id: r.channel && r.status !== '超时' ? batchOf[r.channel] ?? null : null,
  }))
  mappingRows(exp.ref, exp.sample).forEach(([source, field, target, transform, sample, status, confidence, reason], i) => {
    const ai = status === 'AI 建议' || status === '未匹配'
    insert('field_mappings', {
      id: `fm_${String(i + 1).padStart(2, '0')}`, source_id: source, source_field: field, target, transform, sample, status, confidence, reason,
      updated_at: ai ? '2026-10-27T07:51' : DECIDED_AT[source] ?? '2026-09-20T10:00', suggested_by: ai ? 'Codex 定时任务' : null, suggested_at: ai ? '2026-10-27T07:51' : null, suggested_target: ai ? target : null,
      decided_by: ai ? null : DECIDER[source] ?? null, decided_at: ai ? null : DECIDED_AT[source] ?? '2026-09-20T10:00',
    })
  })
}

export const data: SeedModule = {
  name: 'data',
  // --only data 时按这个顺序先清空（data_sample_trash 不在里面：seed() 先把它放回经营表再清）
  tables: ['data_batch_rows', 'data_batches', 'import_drafts', 'import_rules', 'field_mappings', 'import_runs', 'data_sources'],
  seed,
}
