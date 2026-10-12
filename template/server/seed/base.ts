// 公共部分的种子：设置、项目和里程碑、日程（10/20—11/10）、待办、应收、收支、收件箱、最近改动。归属：公共（底座）。
// 客户 ID 来自 crm-data.ts（c_lantuo 澜拓科技、c_hengyan 衡言律师事务所……），所以要在 crm 之后跑。
import { insert, iso, DEMO_TODAY, type SeedModule } from './lib.ts'

const SETTINGS = { owner: '林总', business: 'ABC茶社', xhs_name: 'ABC茶社', nav_mode: 'complex', theme: 'jade', mobile_nav: 'tabs', demo_today: DEMO_TODAY }

type P = { id: string; name: string; kb: string; stage: string; owner: string; goal: string; next: string; waiting?: string; due: string; risk?: string; budget?: number; updated: string; created: string; miles: [date: string, title: string, status: string, note?: string][] }
const PROJECTS: P[] = [
  {
    id: 'p_spring', name: '春节企业茶礼预售', kb: '06-项目/春节企业茶礼预售.md', stage: '筹备', owner: '林总；线上部分阿杰', created: '2026-09-28', updated: '2026-10-26T19:00',
    goal: '2027 年春节（2 月 6 日）前做到 30 家企业，全部按时、完好送达。今年不加新款，三档礼盒只换红色系包装。',
    next: '10/30 定下包装方案（等鸿印包装的报价）', waiting: '鸿印包装刘经理的春节礼盒报价', due: '2027-01-25',
    risk: '包装报价还没回，10/30 定方案可能要往后推',
    miles: [
      ['2026-10-25', '决定：三档礼盒沿用，只换包装', '完成', '去年加新款，打样拖了两周'],
      ['2026-10-30', '定下春节礼盒包装方案', '进行中', '等鸿印包装报价'],
      ['2026-11-10', '样品和报价单做好', '未开始'],
      ['2026-11-15', '开始预售，老客户先通知', '未开始', '老客户：澜拓、青砚、锦川、云帆、北辰；在谈：衡言、兰亭、康屿'],
      ['2027-01-25', '全部送达', '未开始'],
    ],
  },
  {
    id: 'p_xinpin', name: '秋冬新品“围炉白茶”上市', kb: '06-项目/秋冬新品围炉白茶上市.md', stage: '进行中', owner: '晓雯；内容小艾', created: '2026-09-15', updated: '2026-10-26T18:40',
    goal: '11/5 在抖店、天猫、小红书店、视频号小店四个平台同步上线，做成秋冬主推。上线前不对外说名字。',
    next: '10/30 前详情页和小红书预热笔记定稿；视频号小店提前到 10/30 提交审核', due: '2026-11-05',
    risk: '视频号小店上架审核慢，怕赶不上四平台同步',
    miles: [
      ['2026-10-25', '产品图拍完', '完成', '阿光拍的，10/28 交精修'],
      ['2026-10-30', '详情页和小红书预热笔记定稿', '进行中'],
      ['2026-10-30', '视频号小店提前提交审核', '未开始', '审核慢，比其他平台早两天'],
      ['2026-11-01', '四个平台提交上架审核', '未开始'],
      ['2026-11-05', '四个平台同步上线', '未开始'],
    ],
  },
  {
    id: 'p_store', name: '门店改造', kb: '06-项目/门店改造.md', stage: '进行中', owner: '店长宋姐', created: '2026-09-20', updated: '2026-10-24T17:00', budget: 6,
    goal: '11 月底前改造完，预算 6 万；改完可以接待企业客户品鉴。',
    next: '10/31 前通知会员停业时间，定补偿办法（复业后到店送一泡新茶）', due: '2026-11-30',
    miles: [
      ['2026-10-15', '设计稿定稿', '完成'],
      ['2026-10-31', '通知会员停业时间', '未开始', '宋姐负责；老茶客林总自己打电话'],
      ['2026-11-03', '开始施工，停业约 10 天', '未开始'],
      ['2026-11-13', '恢复营业', '未开始', '按停业 10 天算'],
      ['2026-11-30', '完工', '未开始'],
    ],
  },
]

// [标题, 开始, 结束(可空), 类型, 地点, 客户, 项目, 来源, 备注]
type E = [string, string, string | null, string, string | null, string | null, string | null, string, string?]
const EVENTS: E[] = [
  ['财税沙龙（罗佳带去的）', '2026-10-11T14:00', '2026-10-11T17:00', '会面', '钱塘江边的共享会议室', 'c_lanting', null, '手动', '认识了兰亭会计所的冯琳'],
  ['周会（运营、内容、门店）', '2026-10-12T09:30', '2026-10-12T10:30', '内部', '门店二楼', null, null, '飞书日历'],
  ['杭州茶博会（逛展、发名片）', '2026-10-17', null, '会面', '杭州国际博览中心', null, null, '手动', '认识了康屿郑凯、汇远马骏、浩瑞卢可'],
  ['周会（运营、内容、门店）', '2026-10-19T09:30', '2026-10-19T10:30', '内部', '门店二楼', null, null, '飞书日历'],
  ['和梁晨通电话：11 月加量', '2026-10-20T10:00', '2026-10-20T10:30', '会面', '电话', 'c_nanyu', null, '手动'],
  ['汇远物流马骏电话：工会福利', '2026-10-20T15:00', '2026-10-20T15:30', '会面', '电话', 'c_huiyuan', null, '手动'],
  ['锦川补货到仓，老何验货', '2026-10-21T14:00', '2026-10-21T15:00', '内部', '杭州总仓', 'c_jinchuan', null, '手动'],
  ['鸿印包装送春节礼盒样品', '2026-10-22T10:00', '2026-10-22T11:30', '会面', '公司', 'c_hongyin', 'p_spring', '飞书日历'],
  ['禾木瑜伽苏曼电话', '2026-10-24T16:00', '2026-10-24T16:30', '会面', '电话', 'c_hemu', null, '手动'],
  ['新品产品图拍摄（阿光）', '2026-10-25T09:00', '2026-10-25T12:00', '内部', '门店', 'c_aguang', 'p_xinpin', '飞书日历'],
  ['周末品茶会「秋天的第一泡白茶」', '2026-10-25T14:00', '2026-10-25T16:00', '品鉴', '门店', null, null, '飞书日历', '来了 14 位，方雅琴、李萱都在'],
  ['周会（运营、内容、门店）', '2026-10-26T09:30', '2026-10-26T10:30', '内部', '门店二楼', null, null, '飞书日历'],
  ['新品详情页初稿过一遍（晓雯、小艾）', '2026-10-26T15:00', '2026-10-26T16:00', '内部', '公司', null, 'p_xinpin', '飞书日历'],
  // 今天 10/27
  ['和小艾过今天的笔记和新品预热', '2026-10-27T10:00', '2026-10-27T10:30', '内部', '公司', null, 'p_xinpin', '飞书日历'],
  ['衡言效果图：和小艾、老何定两款升级包装', '2026-10-27T11:00', '2026-10-27T12:00', '内部', '公司', 'c_hengyan', null, '手动', '明天（10/28）要发给陈静'],
  ['致远财税罗佳：问中秋款', '2026-10-27T14:30', '2026-10-27T14:45', '会面', '电话', 'c_zhiyuan', null, '手动'],
  ['鸿印包装刘经理电话：春节礼盒报价', '2026-10-27T16:00', '2026-10-27T16:30', '会面', '电话', 'c_hongyin', 'p_spring', '手动', '报价不回，10/30 定不了方案'],
  ['抖店晚场直播（阿杰）', '2026-10-27T19:30', '2026-10-27T21:30', '内部', '直播间', null, null, '飞书日历'],
  // 之后两周
  ['去锦川置业：送补发 6 盒、当面道歉', '2026-10-28T10:00', '2026-10-28T11:30', '送货', '锦川置业 · 滨江', 'c_jinchuan', null, '手动', '城配快运小马的车；外箱加护角'],
  ['三木工作室团建茶礼送到', '2026-10-28T14:00', '2026-10-28T14:30', '送货', '三木设计工作室', 'c_sanmu', null, '手动'],
  ['给康屿郑凯打电话', '2026-10-29T10:00', '2026-10-29T10:20', '会面', '电话', 'c_kangyu', null, '手动'],
  ['栖木资本方案沟通（线上）', '2026-10-29T14:00', '2026-10-29T15:00', '会面', '腾讯会议', 'c_qimu', null, '手动'],
  ['春节礼盒包装方案定稿会', '2026-10-30T10:00', '2026-10-30T11:30', '内部', '公司', null, 'p_spring', '飞书日历'],
  ['新品详情页和预热笔记定稿', '2026-10-30T16:00', '2026-10-30T17:00', '内部', '公司', null, 'p_xinpin', '飞书日历'],
  ['南屿酒店 10 月货款到期（1.6 万）', '2026-10-31', null, '内部', null, 'c_nanyu', null, '手动'],
  ['停业前最后一场周末品茶会', '2026-10-31T14:00', '2026-10-31T16:00', '品鉴', '门店', null, 'p_store', '飞书日历'],
  ['四个平台提交上架审核', '2026-11-01', null, '内部', null, null, 'p_xinpin', '手动'],
  ['周会（运营、内容、门店）', '2026-11-02T09:30', '2026-11-02T10:30', '内部', '门店二楼', null, null, '飞书日历'],
  ['门店改造施工（停业约 10 天）', '2026-11-03', '2026-11-13', '内部', '门店', null, 'p_store', '手动', '11/3—11/12 停业，11/13 恢复营业'],
  ['禾木瑜伽苏曼到门店品鉴', '2026-11-03T14:00', '2026-11-03T15:30', '品鉴', '门店', 'c_hemu', null, '手动', '准备 3 款花草茶'],
  ['春节礼盒打样', '2026-11-04T10:00', '2026-11-04T12:00', '内部', '杭州总仓', null, 'p_spring', '手动'],
  ['新品四平台同步上线', '2026-11-05', null, '内部', null, null, 'p_xinpin', '飞书日历'],
  ['抖店上新直播', '2026-11-05T20:00', '2026-11-05T22:00', '内部', '直播间', null, 'p_xinpin', '飞书日历'],
  ['准备澜拓春节礼盒方案（11/3 联系周明远前）', '2026-11-02T14:00', '2026-11-02T15:30', '内部', '公司', 'c_lantuo', 'p_spring', '手动'],
  ['体检', '2026-11-07T08:00', '2026-11-07T10:00', '个人', null, null, null, '手动'],
  ['周会（运营、内容、门店）', '2026-11-09T09:30', '2026-11-09T10:30', '内部', '门店二楼', null, null, '飞书日历'],
  ['春节样品和报价单做好', '2026-11-10', null, '内部', null, null, 'p_spring', '手动'],
]

// [标题, 状态, 优先级, 截止, 客户, 项目, 备注, 完成日, 建立日]
type T = [string, string, string, string | null, string | null, string | null, string | null, string | null, string]
const TODOS: T[] = [
  ['给衡言出两款升级包装效果图（明天要发）', '进行中', '紧急', '2026-10-27', 'c_hengyan', null, '小艾出图，林总定稿；陈静嫌包装普通，一款木盒、一款素色纸盒', null, '2026-10-16'],
  ['问致远财税罗佳：中秋款 0.54 万什么时候付', '待办', '重要', '2026-10-27', 'c_zhiyuan', null, '约定 10/15，已过 12 天', null, '2026-10-16'],
  ['联系青砚吴老师，问今年春节怎么安排', '待办', '重要', '2026-10-20', 'c_qingyan', 'p_spring', '8 个多月没联系；带上花草茶礼新包装的图', null, '2026-10-13'],
  ['去锦川送补发 6 盒、当面道歉', '待办', '重要', '2026-10-28', 'c_jinchuan', null, '城配快运 10/28 上午的车；带一罐白牡丹和道歉卡', null, '2026-10-21'],
  ['回赵悦小红书私信：6 份同事小礼', '待办', '普通', '2026-10-28', 'c_zhaoyue', null, '推经典双罐或便携装礼盒', null, '2026-10-26'],
  ['给王建国打个电话（两个月没来）', '待办', '普通', '2026-10-28', 'c_wangjg', null, null, null, '2026-10-24'],
  ['问康屿郑凯：报价单看了没，要多少份', '待办', '重要', '2026-10-29', 'c_kangyu', null, '推经典双罐 180，不超 200 的合规线', null, '2026-10-19'],
  ['栖木资本年会伴手礼：正式方案 + 样品图', '进行中', '重要', '2026-10-29', 'c_qimu', null, '肉桂 + 盖碗；肉桂 + 水仙 + 盖碗', null, '2026-10-22'],
  ['问拾光咖啡阿宁：9 月寄卖款 0.31 万', '待办', '普通', '2026-10-29', 'c_shiguang', null, null, null, '2026-10-25'],
  ['定下春节礼盒包装方案', '等别人', '重要', '2026-10-30', null, 'p_spring', '等鸿印包装刘经理报价', null, '2026-10-25'],
  ['新品详情页和小红书预热笔记定稿', '进行中', '重要', '2026-10-30', null, 'p_xinpin', '预热笔记先不说新品名字', null, '2026-10-20'],
  ['视频号小店：新品提前提交审核', '待办', '普通', '2026-10-30', null, 'p_xinpin', '阿杰负责', null, '2026-10-26'],
  ['提醒梁晨 10/31 结 10 月货款，确认 11 月 2500 袋', '待办', '普通', '2026-10-30', 'c_nanyu', null, null, null, '2026-10-20'],
  ['告诉许国平门店 11/3 起停业', '待办', '普通', '2026-10-30', 'c_xuguoping', 'p_store', '他常带客户来，停业期间茶送到办公室', null, '2026-10-24'],
  ['通知门店会员停业时间，定补偿办法', '待办', '重要', '2026-10-31', null, 'p_store', '宋姐发会员群；复业后到店送一泡新茶', null, '2026-10-20'],
  ['邀请方雅琴来 10/31 品茶会', '待办', '普通', '2026-10-31', 'c_fangyaqin', null, null, null, '2026-10-25'],
  ['准备禾木瑜伽品鉴：3 款花草茶', '待办', '普通', '2026-11-02', 'c_hemu', null, '不要太甜的；礼盒要能放进瑜伽包', null, '2026-10-24'],
  ['带春节礼盒方案联系周明远（澜拓）', '待办', '重要', '2026-11-03', 'c_lantuo', 'p_spring', '9/22 回访时说春节可能还要，11 月再聊；中秋那款每份 180', null, '2026-09-22'],
  ['算一下汇远 120 元一份能不能做', '待办', '普通', '2026-11-01', 'c_huiyuan', null, '花草茶礼换小规格？比最便宜的礼盒低 40', null, '2026-10-20'],
  ['整理企业茶礼报价单模板（加春节款）', '待办', '普通', null, null, 'p_spring', null, null, '2026-10-18'],
  ['招一个兼职内容助理（小艾一个人顶不住）', '待办', '普通', null, null, null, null, null, '2026-10-12'],
  ['新品产品图拍完', '完成', '重要', '2026-10-25', 'c_aguang', 'p_xinpin', null, '2026-10-25', '2026-10-15'],
  ['锦川补货到仓验货', '完成', '普通', '2026-10-21', 'c_jinchuan', null, null, '2026-10-21', '2026-10-15'],
  ['给康屿发企业茶礼报价单', '完成', '普通', '2026-10-19', 'c_kangyu', null, null, '2026-10-19', '2026-10-17'],
  ['把茶博会名片整理进客户列表', '完成', '普通', '2026-10-18', null, null, null, '2026-10-18', '2026-10-17'],
  ['给栖木何雨桐发年会组合思路', '完成', '普通', '2026-10-22', 'c_qimu', null, null, '2026-10-22', '2026-10-18'],
]

// [ID, 客户, 节点, 金额(万), 到期, 已收, 收款日, 备注]
type R = [string, string, string, number, string, number, string | null, string | null]
const RECEIVABLES: R[] = [
  ['r_nanyu_08', 'c_nanyu', '8 月客房茶包货款', 1.6, '2026-08-31', 1.6, '2026-08-29', null],
  ['r_nanyu_09', 'c_nanyu', '9 月客房茶包货款', 1.6, '2026-09-30', 1.6, '2026-09-29', null],
  ['r_nanyu_10', 'c_nanyu', '10 月客房茶包货款', 1.6, '2026-10-31', 0, null, '月结，约定 10/31'],
  ['r_lantuo_dep', 'c_lantuo', '中秋茶礼 · 定金三成', 1.62, '2026-08-20', 1.62, '2026-08-20', null],
  ['r_lantuo_rest', 'c_lantuo', '中秋茶礼 · 尾款（账期 30 天）', 3.78, '2026-10-18', 3.78, '2026-10-16', null],
  ['r_jinchuan_dep', 'c_jinchuan', '中秋茶礼 · 定金三成', 1.56, '2026-09-05', 1.56, '2026-09-05', null],
  ['r_jinchuan_rest', 'c_jinchuan', '中秋茶礼 · 尾款', 3.64, '2026-10-31', 3.48, '2026-10-10', '压坏的 6 盒（0.16 万）等补发签收后结'],
  ['r_zhiyuan', 'c_zhiyuan', '中秋茶礼货款', 0.54, '2026-10-15', 0, null, '罗佳 10/16 说下周付'],
  ['r_beichen', 'c_beichen', '中秋茶礼货款', 1.08, '2026-10-20', 1.08, '2026-10-19', null],
  ['r_xinghe', 'c_xinghe', '教师节小礼货款', 0.63, '2026-09-15', 0.63, '2026-09-12', null],
  ['r_sanmu', 'c_sanmu', '团建茶礼货款', 0.24, '2026-11-04', 0, null, '送达后 7 天付'],
  ['r_yuejian_10', 'c_yuejian', '10 月客房茶包', 0.24, '2026-11-05', 0, null, null],
  ['r_shiguang_09', 'c_shiguang', '9 月寄卖结算', 0.31, '2026-10-25', 0, null, '阿宁说月底一起结'],
]

// 收支流水（万元）：回款按应收自动写；这里是 10 月的其他收支
const LEDGER: [string, '收入' | '支出', string, number, string | null, string][] = [
  ['2026-10-05', '支出', '房租', 1.8, null, '门店 + 仓库 10 月房租'],
  ['2026-10-10', '支出', '工资', 6.4, null, '9 月工资（8 人）'],
  ['2026-10-12', '支出', '进货', 4.2, 'c_wuyi', '肉桂秋茶 60 斤'],
  ['2026-10-15', '支出', '包装', 0.9, 'c_hongyin', '便携装玻璃管、外箱'],
  ['2026-10-20', '收入', '平台结算', 14.6, null, '抖店、天猫、小红书店 9 月结算'],
  ['2026-10-22', '支出', '推广', 2.1, null, '千川、万相台、聚光 10 月上半月'],
  ['2026-10-25', '支出', '物流', 0.6, 'c_chengpei', '10 月同城配送'],
]

const INBOX: [string, string, string, string, string | null][] = [
  ['n_1', '围炉白茶产品图拍完了，阿光周三交精修', '网页', '2026-10-25T12:10', '已处理'],
  ['n_2', '周会上说的：抖店直播间想加一个 19 元的试喝装，问问阿杰怎么算账', '网页', '2026-10-26T10:20', null],
  ['n_3', '老何：双十一快递要涨价，要不要提前跟城配快运谈个价', '微信', '2026-10-26T17:05', null],
  ['n_4', '茶博会认识的那个做酒店用品的，名片放抽屉了，好像姓龚', '网页', '2026-10-26T19:40', null],
  ['n_5', '宋姐：门店停业那几天，会员储值卡要不要顺延', '微信', '2026-10-26T21:30', null],
  ['n_6', '小红书评论区好几个人问“围炉煮茶用什么茶”（定时任务摘出来的）', 'Codex', '2026-10-27T07:05', null],
  ['n_7', '晓雯：天猫有个客户留言问能不能开增值税专票，说是公司采购的', '微信', '2026-10-27T08:12', null],
]

// 最近改动（从旧到新写入，网页按新的在上显示）
const CHANGES: [string, string, string, string, string, string][] = [
  ['2026-10-24T16:40', '网页', 'client', 'c_hemu', '跟进', '禾木瑜伽：苏曼电话，约 11/3 到门店品鉴'],
  ['2026-10-25T16:05', '网页', 'todo', '新品产品图拍完', '修改', '待办「新品产品图拍完」→完成'],
  ['2026-10-26T16:30', '网页', 'client', 'c_hongyin', '跟进', '鸿印包装：刘经理说纸张涨价，春节礼盒报价要再等两天'],
  ['2026-10-26T10:20', '网页', 'inbox', 'n_2', '新建', '随手记：抖店直播间想加一个 19 元的试喝装'],
  ['2026-10-26T18:40', '网页', 'todo', '新品详情页和小红书预热笔记定稿', '修改', '待办「新品详情页和小红书预热笔记定稿」→进行中'],
  ['2026-10-26T21:40', 'Codex', 'content', 'd_3', '修改', '草稿「试喝笔记：今年秋冬，我们在调一款新茶」写好了，等林总看'],
  ['2026-10-27T07:05', 'Codex', 'content', 'xhs', '生成', '定时任务：生成今天的小红书选题 10 个'],
  ['2026-10-27T07:20', '导入', 'data', 'src_douyin', '导入', '抖店 10/26 经营数据导入成功'],
  ['2026-10-27T07:31', '导入', 'data', 'src_tmall', '导入', '天猫 10/26 经营数据导入成功'],
  ['2026-10-27T07:36', '导入', 'data', 'src_xhs_shop', '导入', '小红书店 10/26 经营数据导入成功'],
  ['2026-10-27T07:44', '导入', 'data', 'src_wechat', '导入', '视频号小店 10/26 经营数据导入成功'],
  ['2026-10-27T07:50', '导入', 'data', 'src_xhs_notes', '失败', '小红书笔记数据导入失败：导出表的字段对不上（3 处）'],
  ['2026-10-27T07:55', 'Codex', 'biz', 'daily', '生成', '定时任务：经营早报已生成，5 个渠道里有 3 处异常'],
]

function seed() {
  for (const [key, value] of Object.entries(SETTINGS)) insert('settings', { key, value })

  for (const p of PROJECTS) {
    insert('projects', {
      id: p.id, name: p.name, client_id: null, stage: p.stage, contract: null, next_step: p.next, waiting_on: p.waiting ?? null,
      due: p.due, risk: p.risk ?? null, owner: p.owner, goal: p.goal, budget: p.budget ?? null, kb_path: p.kb, created_at: iso(p.created), updated_at: iso(p.updated),
    })
    p.miles.forEach(([date, title, status, note], i) => insert('project_milestones', { id: `m_${p.id.slice(2)}_${i + 1}`, project_id: p.id, date, title, status, note: note ?? null, sort: i }))
  }

  EVENTS.forEach(([title, start, end, kind, location, client, project, source, note], i) => {
    const allDay = !start.includes('T')
    insert('events', {
      id: `e_${String(i + 1).padStart(2, '0')}`, title, start, end, all_day: allDay ? 1 : 0, kind, location, client_id: client, project_id: project,
      note: note ?? null, source, created_at: iso('2026-10-18T09:00'), updated_at: iso('2026-10-18T09:00'),
    })
  })

  TODOS.forEach(([title, status, priority, due, client, project, note, done, created], i) => insert('todos', {
    id: `t_${i + 1}`, title, status, priority, due, client_id: client, project_id: project, note, done_at: done,
    created_at: iso(created), updated_at: iso(done ?? created),
  }))

  for (const [id, client, milestone, amount, due, received, rd, note] of RECEIVABLES) {
    insert('receivables', { id, project_id: null, client_id: client, milestone, amount, due, received, received_date: rd, note, created_at: iso('2026-06-01'), updated_at: iso(rd ?? '2026-10-01') })
    if (received > 0 && rd) {
      insert('ledger', {
        id: `l_${id.slice(2)}`, date: rd, direction: '收入', category: client === 'c_nanyu' || client === 'c_shiguang' || client === 'c_yuejian' ? '渠道货款' : '客户回款',
        amount: received, client_id: client, receivable_id: id, note: milestone, created_at: iso(rd),
      })
    }
  }
  LEDGER.forEach(([date, direction, category, amount, client, note], i) => insert('ledger', { id: `l_oct_${i + 1}`, date, direction, category, amount, client_id: client, note, created_at: iso(date) }))

  for (const [id, text, source, at, result] of INBOX) insert('inbox', { id, text, source, created_at: iso(at), done_at: result ? iso(at) : null, result })

  const todoId = (title: string) => `t_${TODOS.findIndex((t) => t[0] === title) + 1}`
  for (const [at, actor, entity, ref, action, summary] of CHANGES) insert('changes', { at: iso(at), actor, entity, entity_id: entity === 'todo' ? todoId(ref) : ref, action, summary })
}

export const base: SeedModule = {
  name: 'base',
  tables: ['changes', 'inbox', 'ledger', 'receivables', 'todos', 'events', 'project_milestones', 'projects', 'settings'],
  seed,
}
