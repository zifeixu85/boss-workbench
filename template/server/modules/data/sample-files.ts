// 只从完整、仍有效且未被改写的预置示例批次生成 9/27—10/26 的平台样例；拒绝真实数据和未知值。
// 每个平台的列名、日期格式、数字写法都不一样（照各家后台导出的样子），开头几行说明里写明“示例数据”。
// 用法（在 工作台/程序/ 下）：node server/modules/data/sample-files.ts [--copy <另一个文件夹>]
// 只读数据库，不改任何数据。归属：数据源与导入模块。
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DB_PATH, ROOT } from '../../db.ts'
import { toCsv } from './csv.ts'
import { rng, eachDay } from '../../seed/lib.ts'

const FROM = '2026-09-27'
const TO = '2026-10-26'
export const SAMPLE_DIR = join(ROOT, '工作台', '示例数据')

type Day = { date: string; channel_id: string; gmv: number; orders: number; visitors: number; refund_amount: number; refund_orders: number; ad_spend: number; ad_gmv: number; new_buyers: number; old_buyers: number }

const NUMBERS = ['gmv', 'orders', 'visitors', 'refund_amount', 'refund_orders', 'ad_spend', 'ad_gmv', 'new_buyers', 'old_buyers'] as const
const COUNTS = new Set<string>(['orders', 'visitors', 'refund_orders', 'new_buyers', 'old_buyers'])
const CHANNEL_IDS = ['douyin', 'tmall', 'xhs', 'wechat', 'store']

/** 先取得并校验整个只读快照；失败时连输出目录都不创建，更不能把真实数贴成“示例”。 */
function presetSnapshot(): Day[] {
  const db = new DatabaseSync(DB_PATH, { readOnly: true })
  try {
    db.exec('BEGIN')
    const rows = db.prepare('SELECT * FROM channel_daily WHERE date BETWEEN ? AND ? ORDER BY date, channel_id').all(FROM, TO) as unknown as Day[]
    const dates = eachDay(FROM, TO)
    const expected = dates.length * CHANNEL_IDS.length
    const keys = new Set(rows.map((r) => `${r.date}|${r.channel_id}`))
    if (rows.length !== expected || CHANNEL_IDS.some((ch) => dates.some((d) => !keys.has(`${d}|${ch}`)))) {
      throw new Error(`预置示例覆盖不完整：需要 ${CHANNEL_IDS.length} 个渠道 × ${dates.length} 天，不能将缺日补 0`)
    }
    const owner = db.prepare(`SELECT b.id, b.origin, b.channel_id, r.after_json
      FROM data_batch_rows r JOIN data_batches b ON b.id = r.batch_id
      WHERE r.tbl = 'channel_daily' AND r.row_key = ? AND b.status = '有效'
      ORDER BY b.rowid DESC LIMIT 1`)
    for (const row of rows) {
      const key = `${row.date}|${row.channel_id}`
      if (NUMBERS.some((k) => typeof row[k] !== 'number' || !Number.isFinite(row[k]) || row[k] < 0 || (COUNTS.has(k) && !Number.isInteger(row[k])))) {
        throw new Error(`${key} 含未知或无效数字，不能生成示例或补成 0`)
      }
      const batch = owner.get(key) as { id: string; origin: string; channel_id: string | null; after_json: string } | undefined
      if (!batch || batch.id !== `batch_sample_${row.channel_id}` || batch.origin !== '示例' || batch.channel_id !== row.channel_id) {
        throw new Error(`${key} 不属于当前有效的预置示例批次，不能把自己的数据导出为示例`)
      }
      const recorded = JSON.parse(batch.after_json) as Partial<Day>
      if (NUMBERS.some((k) => recorded?.[k] !== row[k])) throw new Error(`${key} 与预置示例审计不一致，不能生成示例`)
    }
    db.exec('COMMIT')
    return rows
  } catch (error) {
    throw new Error(`样例生成已停止，未写任何文件：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    db.close()
  }
}
const snapshot = presetSnapshot()
// 辅助文字与示意列不读取实际店名或未经批次审计的流量表。
const SHOP = '示例茶社'
const days = (ch: string, from = FROM, to = TO) => snapshot.filter((r) => r.channel_id === ch && r.date >= from && r.date <= to)
const liveShare = (date: string) => rng(Number(date.replaceAll('-', ''))).between(35, 45).toFixed(1)

const [y, m, d] = [(s: string) => s.slice(0, 4), (s: string) => s.slice(5, 7), (s: string) => s.slice(8, 10)]
const fmt = {
  slash: (s: string) => `${y(s)}/${m(s)}/${d(s)}`,
  compact: (s: string) => `${y(s)}${m(s)}${d(s)}`,
  cn: (s: string) => `${y(s)}年${m(s)}月${d(s)}日`,
  mdcn: (s: string) => `${Number(m(s))}月${Number(d(s))}日`,
}
const money = (n: number) => n.toFixed(2)
const comma = (n: number, dp = 2) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const yen = (n: number) => `¥${comma(n)}`
const pct = (n: number) => `${n.toFixed(2)}%`
const sum = (xs: Day[], k: typeof NUMBERS[number]) => xs.reduce((a, x) => a + x[k], 0)

type File = { name: string; title: string; what: string; rows: (string | number | null)[][] }
const files: File[] = []

// 1. 抖店罗盘：日期 2026/09/27，金额带 ¥ 和千分位，人数带千分位
{
  const xs = days('douyin')
  files.push({
    name: '抖店_罗盘经营数据_20260927-20261026.csv', title: '抖店（罗盘 · 经营数据，按日）',
    what: '日期 2026/09/27；金额带“¥”和千分位；“直播间成交占比”为可复现示意值（不读取流量表，工作台不导此列）。工作台里已经存了这种表的导入规则，拖进去会直接按规则对上。',
    rows: [
      ['抖店罗盘 · 经营 · 核心数据（按日）'], [`店铺：${SHOP}官方旗舰店（示例数据，数字全部虚构）`], [`时间范围：${fmt.slash(FROM)} - ${fmt.slash(TO)}`], ['导出时间：2026/10/27 07:14'], [],
      ['日期', '成交金额', '成交订单数', '商品访客数', '退款金额', '退款订单数', '千川消耗', '千川成交金额', '新客数', '老客数', '直播间成交占比'],
      ...xs.map((r) => [fmt.slash(r.date), yen(r.gmv), r.orders, comma(r.visitors, 0), yen(r.refund_amount), r.refund_orders, comma(r.ad_spend), comma(r.ad_gmv), r.new_buyers, r.old_buyers, `${liveShare(r.date)}%`]),
    ],
  })
}

// 2. 天猫生意参谋（新版）：日期 20260927；最后有一行“合计”。缺推广花费那份是 10/27 一早 06:52 导的，10/26 的退款生意参谋还没更新（写“-”）
function tmallRows(xs: Day[], withSpend: boolean, lateRefund = false) {
  // 浏览量按日期定：同一天在两份表里一样
  const pv = (x: Day) => Math.round(x.visitors * rng(Number(x.date.replaceAll('-', ''))).between(2.4, 2.9))
  const head = ['统计日期', '访客数', '浏览量', '支付买家数', '支付金额', '支付子订单数', '支付转化率', '客单价', '成功退款金额', '成功退款子订单数', ...(withSpend ? ['万相台无界花费'] : []), '万相台无界成交金额', '支付新买家数', '支付老买家数']
  const body = xs.map((x) => {
    const buyers = x.new_buyers + x.old_buyers
    const late = lateRefund && x.date === TO
    return [fmt.compact(x.date), x.visitors, pv(x), buyers, money(x.gmv), x.orders, x.visitors > 0 ? pct((buyers / x.visitors) * 100) : '', buyers > 0 ? money(x.gmv / buyers) : '',
      late ? '-' : money(x.refund_amount), late ? '-' : x.refund_orders, ...(withSpend ? [money(x.ad_spend)] : []), money(x.ad_gmv), x.new_buyers, x.old_buyers]
  })
  const tb = sum(xs, 'new_buyers') + sum(xs, 'old_buyers')
  const total = ['合计', sum(xs, 'visitors'), '', tb, money(sum(xs, 'gmv')), sum(xs, 'orders'), '', '', '', '', ...(withSpend ? [money(sum(xs, 'ad_spend'))] : []), money(sum(xs, 'ad_gmv')), sum(xs, 'new_buyers'), sum(xs, 'old_buyers')]
  return [head, ...body, total]
}
{
  const xs = days('tmall')
  files.push({
    name: '天猫_生意参谋取数_店铺日报_20260927-20261026.csv', title: '天猫（生意参谋 · 取数 · 店铺日报，10/20 改版后的新表头）',
    what: '日期 20260927；“支付金额”“访客数”这些名字没变的列，按停用的旧规则（晓雯 9/20 确认过）直接对上；“万相台无界花费”“万相台无界成交金额”“支付新买家数”“支付老买家数”是改版后的新叫法，工作台没见过，标黄“拿不准”，一共 4 列，可以自己选，也可以让 Codex 看看；最后一行“合计”会跳过。演示时先拖这一份。',
    rows: [['生意参谋 · 取数 · 店铺整体日报'], [`店铺名称：${SHOP}旗舰店（示例数据，数字全部虚构）`], [`统计时间：${FROM} ~ ${TO}`], ['导出时间：2026-10-27 07:26'], [], ...tmallRows(xs, true)],
  })
  const week = days('tmall', '2026-10-20', TO)
  files.push({
    name: '天猫_生意参谋取数_近7天_缺推广花费.csv', title: '天猫（同一种表，但少了“万相台无界花费”这一列）',
    what: '10/20—10/26 共 7 天，06:52 一早导的，导出时漏勾了推广花费；10/26 的退款生意参谋还没更新（写的是“-”）。工作台会停下来提醒：天猫每天都有推广花费，缺了这一列不能当 0；选“这次先不导推广花费”后，预览会说 10/26 的退款没有数、保留工作台里原来的。其余的数和上面那份同一天完全一样。演示时第二个拖。',
    rows: [['生意参谋 · 取数 · 店铺整体日报'], [`店铺名称：${SHOP}旗舰店（示例数据，数字全部虚构）`], ['统计时间：2026-10-20 ~ 2026-10-26'], ['导出时间：2026-10-27 06:52'], [], ...tmallRows(week, false, true)],
  })
}

// 3. 小红书千帆：日期 2026年09月27日；金额表头带“(元)”、千分位
{
  const xs = days('xhs')
  files.push({
    name: '小红书店_千帆店铺数据_20260927-20261026.csv', title: '小红书店（千帆 · 店铺数据）',
    what: '日期 2026年09月27日；金额表头写了“(元)”；推广叫“聚光”。已有导入规则。',
    rows: [
      ['小红书千帆 · 数据 · 店铺概览'], [`店铺：${SHOP}的茶（示例数据，数字全部虚构）`], [`日期：${fmt.cn(FROM)} 至 ${fmt.cn(TO)}`], [],
      ['日期', '支付金额(元)', '支付订单数', '店铺访客数', '退款金额(元)', '退款订单数', '聚光消耗(元)', '聚光成交金额(元)', '首购人数', '复购客数'],
      ...xs.map((r) => [fmt.cn(r.date), comma(r.gmv), r.orders, r.visitors, comma(r.refund_amount), r.refund_orders, comma(r.ad_spend), comma(r.ad_gmv), r.new_buyers, r.old_buyers]),
    ],
  })
}

// 4. 视频号小店（微信小店）：日期 2026-09-27；表头用全角括号写单位
{
  const xs = days('wechat')
  files.push({
    name: '视频号小店_经营数据_20260927-20261026.csv', title: '视频号小店（微信小店 · 经营数据）',
    what: '日期 2026-09-27；推广叫“加热”；表头用全角括号写单位“（元）”。已有导入规则。',
    rows: [
      ['微信小店 · 数据 · 经营数据'], [`小店名称：${SHOP}（示例数据，数字全部虚构）`], [`时间：${FROM} 至 ${TO}`], [],
      ['日期', '成交金额（元）', '成交订单数', '访问人数', '退款金额（元）', '退款订单数', '加热花费（元）', '加热带来成交（元）', '新客户数', '老客户数'],
      ...xs.map((r) => [r.date, money(r.gmv), r.orders, r.visitors, money(r.refund_amount), r.refund_orders, money(r.ad_spend), money(r.ad_gmv), r.new_buyers, r.old_buyers]),
    ],
  })
}

// 5. 门店收银系统：日期 9月27日（没写年份）；“营业额”是打折前、“实收金额”是客人真付的
{
  const xs = days('store')
  const r = rng(1027)
  files.push({
    name: '门店_收银系统日汇总_20260927-20261026.csv', title: '门店（收银系统 · 营业日汇总）',
    what: '假设门店装了收银机、能导出营业日汇总（平常门店的数是宋姐在飞书「门店日报」里填的，见数据源）。日期写成“9月27日”没写年份（工作台按 2026 年算）；“营业额”是打折前的、“实收金额”是客人真付的，两列都像成交额，做成二选一、默认选实收；会员 / 非会员按知识库《数据口径》对成老客 / 新客，口径还没确认，也要你点头。',
    rows: [
      ['茶空间门店 · 收银系统 · 营业日汇总'], [`门店：${SHOP}茶空间（示例数据，数字全部虚构）`], ['营业日期：9月27日—10月26日'], [],
      ['营业日期', '营业额', '优惠金额', '实收金额', '交易笔数', '客流', '会员消费人数', '非会员人数', '退款金额', '退款笔数', '收银员'],
      ...xs.map((x) => {
        const off = Math.round(x.gmv * r.between(0.03, 0.07))
        return [fmt.mdcn(x.date), money(x.gmv + off), money(off), money(x.gmv), x.orders, x.visitors, x.old_buyers, x.new_buyers, money(x.refund_amount), x.refund_orders, r.next() > 0.35 ? '宋姐' : '小林']
      }),
    ],
  })
}

// 6. 飞书多维表格模板：经营数据表的列（团队每天填一行），带 10/26 五个渠道的示例
{
  const who: Record<string, string> = { douyin: '阿杰', tmall: '晓雯', xhs: '晓雯', wechat: '阿杰', store: '宋姐' }
  const name: Record<string, string> = { douyin: '抖店', tmall: '天猫', xhs: '小红书店', wechat: '视频号小店', store: '门店' }
  const rows = snapshot.filter((r) => r.date === TO).sort((a, b) => CHANNEL_IDS.indexOf(a.channel_id) - CHANNEL_IDS.indexOf(b.channel_id))
  files.push({
    name: '飞书多维表格_经营数据表_模板（示例数据）.csv', title: '飞书多维表格模板（经营数据表）',
    what: '在飞书新建多维表格时“导入 CSV”就能得到这张表的列；一行 = 一个渠道一天。带了 10/26 五个渠道的示例行。有“渠道”列，一张表能导几个渠道。',
    rows: [
      ['日期', '渠道', '成交额', '订单数', '访客数', '退款金额', '退款单数', '推广花费', '推广成交额', '新客数', '老客数', '填表人', '备注'],
      ...rows.map((x) => [x.date, name[x.channel_id], money(x.gmv), x.orders, x.visitors, money(x.refund_amount), x.refund_orders, money(x.ad_spend), money(x.ad_gmv), x.new_buyers, x.old_buyers, who[x.channel_id], x.channel_id === 'store' ? '门店没有推广，填 0' : '']),
    ],
  })
}

function readme() {
  return `# 示例数据：平台导出表

> 示例数据：${SHOP}和所有数字都是虚构的，只用于演示。每份表开头几行写了“示例数据”。

这些表只读取工作台数据库里 9/27—10/26 完整且有效的预置示例批次，并逐字段核对审计快照；**经营原始数字和经营页对得上**。店名固定为虚构的“示例茶社”，直播占比是可复现示意值，不读取实际店名或流量表。列名、日期格式、数字写法照各平台后台导出的样子做，故意各不相同，用来演示“拖进来 → 认出是哪家的表 → 对字段 → 预览 → 导入”。

都是 CSV（UTF-8 带 BOM，Excel 双击打开不乱码）。工作台还读不了 .xlsx：平台导出的是 Excel 的话，先“另存为 CSV UTF-8”。

| 文件 | 是什么 | 看点 |
|---|---|---|
${files.map((f) => `| ${f.name} | ${f.title} | ${f.what} |`).join('\n')}

## 演示时怎么用

1. 打开工作台“数据 → 导入”，先拖 **天猫** 那份：认出是生意参谋，名字没变的列按旧规则对上，改了名的 4 列标黄“拿不准”，自己选（或点“让 Codex 看看”）→ 预览 → 导入 → 去天猫页看。
   数字和工作台一样，所以预览会说“一模一样，导进去不会改任何数”：想看“从无到有”，点预览页的“先清掉天猫的示例数据，再看一次”（只清天猫那 30 行，另外 4 个渠道不动），再导入 30 行。
2. 再拖 **缺推广花费** 那份：工作台停下来，说天猫每天都有推广花费，缺了这一列不能当 0。
3. 想看“有规则就直接对上”，拖抖店、小红书店、视频号小店任意一份。门店那份演示“两列都像成交额，二选一”。
4. 最后在“导入记录”里撤销这次导入，再点“放回天猫的示例数据”，经营页回到原来的样子。彩排完在知识库根目录运行 \`node 工作台/程序/server/cli.ts import-reset --yes\`，回到演示前的样子。

重新生成：在 \`工作台/程序/\` 下运行 \`node server/modules/data/sample-files.ts\`（只读数据库）。缺日、未知值、自己的数据或失效示例会在写文件之前停止；请使用独立完整的演示库，不要为生成样例清除真实数据。
`
}

const args = process.argv.slice(2)
const copyTo = args.includes('--copy') ? resolve(args[args.indexOf('--copy') + 1]) : null
mkdirSync(SAMPLE_DIR, { recursive: true })
for (const f of files) writeFileSync(join(SAMPLE_DIR, f.name), toCsv(f.rows))
writeFileSync(join(SAMPLE_DIR, 'README.md'), readme())
console.log(`写好 ${files.length} 份样例表：${SAMPLE_DIR}`)
files.forEach((f) => console.log(`  ${f.name}（${f.rows.length} 行）`))
if (copyTo) {
  mkdirSync(copyTo, { recursive: true })
  for (const f of [...files.map((x) => x.name), 'README.md']) copyFileSync(join(SAMPLE_DIR, f), join(copyTo, f))
  console.log(`已复制到：${copyTo}`)
}
