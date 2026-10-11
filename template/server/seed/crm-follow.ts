// 大客户模块（E5，客户详情加深）的种子：八项客户信息、改阶段留痕、关怀草稿的来源、几处和知识库对齐的数据。归属：大客户模块。
// 在 crm 和 base 之后跑。可以单独重灌：node server/seed/index.ts --only crm-follow
//   只清空本模块新加的 4 张表（client_facts、crm_edits、crm_extractions、crm_follow_todos）；
//   对 crm 已有表只做“补字段 / 按固定 ID 插入，已存在就跳过”，重复跑结果一样。
// 内容全部来自知识库 04-客户/ 的客户档案（10/25 建库），标明谁整理的、确认没有。衡言 10/23 微信、澜拓 10/26 电话还在收件箱，故意不写进来。
import { run as dbRun } from '../db.ts'
import { iso, type SeedModule } from './lib.ts'

const KB = {
  c_lantuo: '04-客户/企业客户/澜拓科技.md', c_hengyan: '04-客户/企业客户/衡言律师事务所.md', c_qingyan: '04-客户/企业客户/青砚建筑设计院.md',
  c_kangyu: '04-客户/企业客户/康屿医疗器械.md', c_jinchuan: '04-客户/企业客户/锦川置业.md', c_qimu: '04-客户/企业客户/栖木资本.md',
  c_nanyu: '04-客户/渠道客户/南屿精品酒店.md', c_hemu: '04-客户/企业客户/禾木瑜伽.md', c_xuguoping: '04-客户/门店老茶客/许国平.md', c_fangyaqin: '04-客户/门店老茶客/方雅琴.md',
} as const
type K = keyof typeof KB
const CONFIRMED = new Set<K>(['c_lantuo', 'c_qingyan']) // 知识库里这两份是“已确认”，其余“待确认”

type Kind = '身份与决策' | '真实诉求' | '决策信号' | '执行条件' | '沟通摘要'
const FACTS: Record<K, [Kind, string][]> = {
  c_lantuo: [
    ['身份与决策', '周明远（行政负责人）定方案；付款走公司流程。'],
    ['真实诉求', '员工节日礼，按人头发：要员工喜欢、节前准时送到；每次先说单份上限（春节问 180 以内，中秋 200 以内）。'],
    ['决策信号', '9/22 回访时说“春节可能还要，11 月再聊”——只是“可能”，没定。'],
    ['执行条件', '节前某天前全部送到（春节 1/20、中秋 9/20）；中秋定金三成，尾款走对方付款流程，10/16 到账。'],
    ['沟通摘要', '2025-12 小红书私信来的。2026 年春节 280 份、中秋 300 份都按时送到，周明远两次都说员工喜欢；还介绍了锦川置业。'],
  ],
  c_hengyan: [
    ['身份与决策', '陈静（行政主管）对接，合伙人会议拍板。'],
    ['真实诉求', '合伙人送客户的春节礼，约 120 份，要体面；陈静觉得我们的包装“有点普通”。'],
    ['决策信号', '10/16 说还在比两家；另一家是谁、报多少、合伙人哪天定，都还不知道。'],
    ['执行条件', '春节前送到；哪天送、送到哪、开不开票还没问。'],
    ['沟通摘要', '致远财税罗佳介绍，10/9 加微信。10/14 报了经典双罐 120 份 × 180；10/16 林总答应 10/28 前发两款升级包装效果图。'],
  ],
  c_qingyan: [
    ['身份与决策', '吴老师（院办）定，院长签字。'],
    ['真实诉求', '春节员工礼；设计师们喜欢花草茶（玫瑰白茶、桂花乌龙），喜欢有设计感、素一点的包装。'],
    ['决策信号', '2/3 说设计师们很喜欢；之后 8 个多月没联系，今年春节有没有别家在接触不知道。'],
    ['执行条件', '上次是 1/8 下单、1/20 送到（2026 年春节那单），可以当这次春节的时间参考。'],
    ['沟通摘要', '2025 设计周展位认识。2026 年春节花草茶礼 150 份、2.4 万；原定 10/20 联系，还没联系。'],
  ],
  c_kangyu: [
    ['身份与决策', '郑凯（采购经理）对接，采购部定；金额大要走合规审批。'],
    ['真实诉求', '年底客户礼，份数和用途还没说。'],
    ['决策信号', '10/19 发了报价单，对方没回。'],
    ['执行条件', '送礼单份不超过 200 元（合规）；包装别太奢华，不要像贵重礼品；审批要走多久不知道。'],
    ['沟通摘要', '10/17 茶博会留了名片。只推 200 以内的款：经典双罐 180、花草茶礼 160；岩茶木盒 260 不推。'],
  ],
  c_jinchuan: [
    ['身份与决策', '孙蕾（行政经理）自己拍板。'],
    ['真实诉求', '中秋、春节送业主和合作方，要按时、完好送到。'],
    ['决策信号', '6 盒压坏后孙蕾说“下次注意就好”——客气，不代表没记在心上。10/28 当面补发决定关系能不能续上。'],
    ['执行条件', '外箱加护角，送到当天拍照；10/28 上午林总自己送补发的 6 盒（城配快运的车）。'],
    ['沟通摘要', '周明远推荐来的。9/5 签岩茶木盒 200 份、5.2 万；9/24 反馈 6 盒压坏；9/25 林总电话道歉，答应补发、当面送去。'],
  ],
  c_qimu: [
    ['身份与决策', '何雨桐（总裁办）出方案，合伙人拍板。'],
    ['真实诉求', '年会伴手礼 60 份，送被投企业和合作伙伴：“要拿得出手，又不能太张扬”。'],
    ['决策信号', '10/22 说下周把正式方案给合伙人看；11/15 前定。'],
    ['执行条件', '每份 400 左右，岩茶 + 白瓷盖碗；12/18 年会，方案里写清定下来后多久能送到。'],
    ['沟通摘要', '许国平 10/15 带来门店喝茶。10/22 林总发了两个组合思路（肉桂 + 盖碗；肉桂 + 水仙 + 盖碗），答应 10/29 前发正式方案和样品图。'],
  ],
  c_nanyu: [
    ['身份与决策', '梁晨（采购）定用量，酒店财务月结。'],
    ['真实诉求', '客房茶包稳定供货；冬季入住率高，11 月起想加到每月 2500 袋。'],
    ['决策信号', '6—9 月货款都按时结；10/20 主动提加量。'],
    ['执行条件', '每月 2000 袋（桂花乌龙 1200 + 白毫银针 800），每袋 8 元，月底对账；10 月货款 1.6 万约定 10/31 结。'],
    ['沟通摘要', '5 月酒店用品展试喝，6/1 签合作。加量后单价不变是 AI 的假设，没谈过。'],
  ],
  c_hemu: [
    ['身份与决策', '苏曼（创始人）自己定。'],
    ['真实诉求', '3 家馆会员年卡礼，约 200 份花草茶：要“轻、健康”的调性，不要太甜，礼盒小到能放进瑜伽包。'],
    ['决策信号', '人数、预算都说清了，约了 11/3 下午到门店品鉴。'],
    ['执行条件', '每份 160 左右；文案只说口感和场景，不说功效（不说减肥、助眠）。'],
    ['沟通摘要', '10/21 看到小红书笔记私信来；10/24 电话说清人数和预算，林总答应 11/3 准备 3 款花草茶。'],
  ],
  c_xuguoping: [
    ['身份与决策', '本人，称呼许总。'],
    ['真实诉求', '只喝岩茶（肉桂、水仙）；常带客户来门店包间谈事；中秋、春节买岩茶木盒送客户。'],
    ['决策信号', '近 12 个月门店 15 笔约 1.8 万（含一次包间费），9/28 一次买了 2 斤肉桂；还帮我们带来了栖木资本。'],
    ['执行条件', '喜欢靠窗那间包间；门店 11/3 起停业约 10 天，那几天可以把茶送到他办公室。'],
    ['沟通摘要', '2023-04 路过进店。3/8 生日来喝茶，宋姐送了一泡老枞水仙；10/15 带何雨桐来谈事。'],
  ],
  c_fangyaqin: [
    ['身份与决策', '本人，称呼雅琴姐。'],
    ['真实诉求', '爱白茶（白牡丹、寿眉、白毫银针），常买来送朋友，想要更小一点的礼盒。'],
    ['决策信号', '周末品茶会常客，10/25 说很喜欢周末活动。'],
    ['执行条件', '门店现买现付；停业前最后一场品茶会是 10/31 周六下午。'],
    ['沟通摘要', '2024-04 品茶会认识。近 12 个月 14 笔约 1.2 万，白毫银针便携装买得最多。'],
  ],
}

/** 平常怎么称呼（知识库 05-方法与判断/大客户关怀.md“怎么说”；只在工作台的老茶客按门店的叫法） */
const SALUTATION: Record<string, string> = {
  c_lantuo: '周经理', c_jinchuan: '孙经理', c_qingyan: '吴老师', c_xuguoping: '许总', c_fangyaqin: '雅琴姐',
  c_chenmo: '陈哥', c_wangjg: '王哥', c_lixuan: '李萱',
}

/** 改阶段的历史（新旧值、原因、时间）：照往来记录补的 */
const STAGE_EDITS: [client: string, from: string, to: string, reason: string, at: string][] = [
  ['c_qingyan', '交付中', '待复购', '1/20 春节 150 份全部送到，2/3 吴老师说设计师们很喜欢', '2026-02-03T18:20'],
  ['c_jiahe', '报价中', '流失', '9/1 邵敏说选了别家，每份便宜 30', '2026-09-01T20:05'],
  ['c_lantuo', '交付中', '待复购', '中秋 300 份 9/18 全部送到；9/22 回访说春节可能还要，11 月再聊', '2026-09-22T16:40'],
  ['c_jinchuan', '交付中', '售后', '9/24 孙蕾反馈 6 盒外箱压坏、茶罐凹了，补发中', '2026-09-24T19:10'],
  ['c_mingshi', '待复购', '暂停', '10/10 赵立说今年预算砍了，春节不发茶礼', '2026-10-10T11:15'],
  ['c_hengyan', '新线索', '报价中', '10/14 发了报价单：经典双罐 120 份 × 180', '2026-10-14T17:30'],
  ['c_qimu', '需求确认', '方案中', '10/22 发了两个组合思路，何雨桐说下周给合伙人看正式方案', '2026-10-22T21:05'],
  ['c_sanmu', '新线索', '交付中', '10/24 江帆定了团建 15 份花草茶礼，10/28 送到', '2026-10-24T15:20'],
]

/** 关怀草稿是谁写的（格式见 modules/crm/authors.ts：类型 · 细节）。
 *  “Codex 定时任务”= 知识库 01-AI协作/工具与账号.md 里登记的每天 07:10 关怀草稿任务，用命令 care-add 存进来 */
export const CARE_AUTHOR: Record<string, string> = {
  cr_lantuo_1: 'Codex 定时任务 · 10/27 07:12 写',
  cr_qingyan_1: '知识库草稿 · Codex 10/25 整理知识库时起草 · 林总还没改',
  cr_jinchuan_1: '知识库草稿 · 林总定了 10/28 当面说',
  cr_xuguoping_1: '知识库草稿 · Codex 10/25 整理知识库时起草 · 林总还没改',
  cr_xuguoping_2: '知识库草稿 · 林总说的',
  cr_fangyaqin_1: '知识库草稿 · Codex 10/25 整理知识库时起草 · 林总还没改',
  cr_fangyaqin_2: '知识库草稿 · 宋姐说的 · 林总还没点头',
}

/** 按去年的单估的商机：还没开口谈，金额灰字、前面写“估”，不算进在谈和等级（第二轮修 #5） */
export const ESTIMATED: Record<string, string> = {
  d_lantuo_cny: '按中秋 300 份 × 180 估；9/22 周明远只说春节“可能”还要',
  d_qingyan_cny: '按今年春节 150 份估；2/3 以后没联系过',
  d_yunfan: '按今年春节 120 份 × 160 估；2/10 以后没联系过',
  d_beichen: '按中秋 60 份 × 180 估；唐宁只说“春节再聊”',
}

/** 只在工作台的门店老茶客：会员登记时留的生日、店员记下的口味 */
const EXTRA_DATES = [
  { id: 'dt_lixuan_1', client_id: 'c_lixuan', date: '--11-18', label: '李萱生日', kind: '生日', who: '李萱', note: '会员登记时填的' },
  { id: 'dt_chenmo_1', client_id: 'c_chenmo', date: '--01-09', label: '陈默生日', kind: '生日', who: '陈默', note: '会员登记时填的' },
]
const EXTRA_TRAITS = [
  { id: 'tr_chenmo_1', client_id: 'c_chenmo', kind: '口味', text: '爱水仙；问过冬天有没有焙火重一点的', source: '10/18 到店' },
  { id: 'tr_wangjg_1', client_id: 'c_wangjg', kind: '口味', text: '岩茶：大红袍、肉桂', source: '订单' },
  { id: 'tr_wangjg_2', client_id: 'c_wangjg', kind: '习惯', text: '8/22 说要出差一段时间', source: '8/22 到店' },
  { id: 'tr_lixuan_1', client_id: 'c_lixuan', kind: '口味', text: '花草茶、白牡丹都喝', source: '订单' },
  { id: 'tr_lixuan_2', client_id: 'c_lixuan', kind: '习惯', text: '周末品茶会常客，常带同事来', source: '宋姐' },
]
export const EXTRA_CARE = [
  { id: 'cr_chenmo_1', client_id: 'c_chenmo', occasion: '立冬问候', date: '2026-11-07', gift: '一罐焙火足一点的老枞水仙 + 手写卡',
    message: '陈哥，立冬了。上回你问冬天有没有焙火重一点的水仙，这批老枞水仙火候足，给你留了一罐，哪天方便我让人送过去。',
    author: 'Codex 定时任务 · 10/27 07:12 写', note: '他 10/18 来买水仙时问过“冬天有没有焙火重一点的”' },
  { id: 'cr_wangjg_1', client_id: 'c_wangjg', occasion: '好久没见，问候一声', date: '2026-10-28', gift: null,
    message: '王哥，好久没见你来喝茶了，出差回来了吧？最近天凉了，有空来坐坐，提前跟我说一声，给你留个位置。',
    author: 'Codex 定时任务 · 10/27 07:12 写', note: '8/22 买了 6 罐大红袍后两个多月没来；他说过要出差。只问候，不提买茶' },
]

/** 第三轮（产品评审 #16）：大客户的往来补到 4—8 条，和订单、知识库对得上；都早于各自最后一次往来，不改“上次联系”。
 *  来自门店收银、微信聊天记录（林总记在工作台），不是建库采访，所以不挂知识库原件 */
type ExtraTalk = { id: string; client_id: string; date: string; channel: '微信' | '电话' | '面谈' | '到店'; with: string; summary: string; next?: string; concerns?: string }
export const EXTRA_TALKS: ExtraTalk[] = [
  { id: 'i_hengyan_x1', client_id: 'c_hengyan', date: '2026-10-15', channel: '微信', with: '陈静', summary: '陈静说报价单转给合伙人了，合伙人想先看看包装长什么样', next: '准备包装的图' },
  { id: 'i_qingyan_x1', client_id: 'c_qingyan', date: '2026-01-10', channel: '微信', with: '吴老师', summary: '吴老师确认 1/20 前送到院里，院办签收；问卡片能不能写“新春快乐”四个字', next: '1/20 前送到' },
  { id: 'i_kangyu_x1', client_id: 'c_kangyu', date: '2026-10-18', channel: '微信', with: '郑凯', summary: '郑凯加了微信，说年底要给客户送礼，先要一份报价单；份数、用途都还没定', next: '发报价单' },
  { id: 'i_qimu_x1', client_id: 'c_qimu', date: '2026-10-20', channel: '微信', with: '何雨桐', summary: '何雨桐说年会定在 12/18，问组合里能不能放一张写给被投企业的卡片', next: '10/22 发组合思路' },
  { id: 'i_nanyu_x1', client_id: 'c_nanyu', date: '2026-07-30', channel: '微信', with: '梁晨', summary: '7 月对账，梁晨说客人反馈桂花乌龙好喝，白毫银针拿得少一点' },
  { id: 'i_nanyu_x2', client_id: 'c_nanyu', date: '2026-08-29', channel: '微信', with: '梁晨', summary: '8 月货款 1.6 万已付；梁晨问国庆前能不能早两天送' },
  { id: 'i_hemu_x1', client_id: 'c_hemu', date: '2026-10-22', channel: '微信', with: '苏曼', summary: '苏曼发了三家馆的会员人数，年卡会员加起来约 200 位；问有没有小一点的礼盒', next: '找小规格的花草茶礼盒' },
  { id: 'i_hemu_x2', client_id: 'c_hemu', date: '2026-10-23', channel: '微信', with: '苏曼', summary: '林总发了三款花草茶的图（桂花乌龙、玫瑰白茶、白牡丹），苏曼说玫瑰的怕太甜，想当面喝一下', next: '约品鉴' },
  { id: 'i_xuguoping_x1', client_id: 'c_xuguoping', date: '2023-04-16', channel: '到店', with: '许国平', summary: '路过茶空间进来喝茶，喝了肉桂和水仙，说以后谈事就来这儿' },
  { id: 'i_xuguoping_x2', client_id: 'c_xuguoping', date: '2025-01-18', channel: '到店', with: '许国平', summary: '春节前买 10 份岩茶木盒送客户，说去年送的反馈好' },
  { id: 'i_xuguoping_x3', client_id: 'c_xuguoping', date: '2025-11-08', channel: '到店', with: '许国平', summary: '来买肉桂，问今年的肉桂火候怎么样；宋姐给他留了靠窗那间包间' },
  { id: 'i_xuguoping_x4', client_id: 'c_xuguoping', date: '2026-09-12', channel: '到店', with: '许国平', summary: '中秋买 8 份岩茶木盒送客户；说春节还要' },
  { id: 'i_fangyaqin_x1', client_id: 'c_fangyaqin', date: '2024-04-13', channel: '到店', with: '方雅琴', summary: '第一次来周末品茶会，喝了白牡丹，办了会员' },
  { id: 'i_fangyaqin_x2', client_id: 'c_fangyaqin', date: '2025-12-21', channel: '到店', with: '方雅琴', summary: '买 10 盒白毫银针便携装送朋友，说朋友都喜欢小包装' },
  { id: 'i_fangyaqin_x3', client_id: 'c_fangyaqin', date: '2026-01-24', channel: '到店', with: '方雅琴', summary: '春节买 6 份经典双罐送人；问有没有更小的礼盒，双罐拎着有点重' },
  { id: 'i_fangyaqin_x4', client_id: 'c_fangyaqin', date: '2026-06-27', channel: '到店', with: '方雅琴', summary: '买了两个白瓷盖碗和 6 盒银针；宋姐教她盖碗怎么泡白茶' },
  { id: 'i_fangyaqin_x5', client_id: 'c_fangyaqin', date: '2026-08-29', channel: '到店', with: '方雅琴', summary: '买 3 饼寿眉，说秋天想喝点老一点的白茶' },
]

/** 第三轮（产品评审 #13、数据评审 #18）：门店收银里更早的单（知识库只整理了近 12 个月）。许国平 2023-04 起、方雅琴 2024-04 起，
 *  年度图不再只有两根柱子；都早于 2025-10-27，不改“近 12 个月”。经营模块只看 9/27—10/26 的门店，不受影响 */
type ExtraOrder = [id: string, client: string, date: string, occasion: string, item: string, qty: number, unit: string, price: number, note?: string]
export const EXTRA_ORDERS: ExtraOrder[] = [
  ['o_xuguoping_h1', 'c_xuguoping', '2023-04-16', '日常', '肉桂 100g', 2, '罐', 238, '第一次来'],
  ['o_xuguoping_h2', 'c_xuguoping', '2023-05-27', '日常', '水仙 100g', 4, '罐', 168],
  ['o_xuguoping_h3', 'c_xuguoping', '2023-07-08', '日常', '肉桂 100g', 4, '罐', 238],
  ['o_xuguoping_h4', 'c_xuguoping', '2023-09-16', '中秋', '岩茶木盒', 6, '份', 260, '送客户'],
  ['o_xuguoping_h5', 'c_xuguoping', '2023-10-21', '日常', '水仙 100g', 4, '罐', 168],
  ['o_xuguoping_h6', 'c_xuguoping', '2023-12-09', '日常', '肉桂 100g', 5, '罐', 238],
  ['o_xuguoping_h7', 'c_xuguoping', '2024-01-27', '春节', '岩茶木盒', 8, '份', 260, '送客户'],
  ['o_xuguoping_h8', 'c_xuguoping', '2024-03-08', '日常', '大红袍罐装 100g', 3, '罐', 198, '生日那天来'],
  ['o_xuguoping_h9', 'c_xuguoping', '2024-04-20', '日常', '肉桂 100g', 5, '罐', 238],
  ['o_xuguoping_h10', 'c_xuguoping', '2024-06-15', '日常', '水仙 100g', 6, '罐', 168],
  ['o_xuguoping_h11', 'c_xuguoping', '2024-08-10', '日常', '肉桂 100g', 5, '罐', 238],
  ['o_xuguoping_h12', 'c_xuguoping', '2024-09-07', '中秋', '岩茶木盒', 8, '份', 260, '送客户'],
  ['o_xuguoping_h13', 'c_xuguoping', '2024-10-19', '日常', '水仙 100g', 6, '罐', 168],
  ['o_xuguoping_h14', 'c_xuguoping', '2024-12-14', '日常', '肉桂 100g', 6, '罐', 238],
  ['o_xuguoping_h15', 'c_xuguoping', '2025-01-18', '春节', '岩茶木盒', 10, '份', 260, '送客户'],
  ['o_xuguoping_h16', 'c_xuguoping', '2025-03-08', '日常', '肉桂 100g', 4, '罐', 238, '生日那天来'],
  ['o_xuguoping_h17', 'c_xuguoping', '2025-05-17', '日常', '水仙 100g', 6, '罐', 168],
  ['o_xuguoping_h18', 'c_xuguoping', '2025-07-12', '日常', '肉桂 100g', 6, '罐', 238],
  ['o_xuguoping_h19', 'c_xuguoping', '2025-08-30', '日常', '便携旅行茶具套装', 1, '套', 199],
  ['o_xuguoping_h20', 'c_xuguoping', '2025-09-27', '中秋', '岩茶木盒', 8, '份', 260, '送客户'],
  ['o_xuguoping_h21', 'c_xuguoping', '2025-10-18', '日常', '水仙 100g', 4, '罐', 168],
  ['o_fangyaqin_h1', 'c_fangyaqin', '2024-04-13', '日常', '白牡丹罐装 100g', 2, '罐', 168, '第一次来品茶会'],
  ['o_fangyaqin_h2', 'c_fangyaqin', '2024-06-22', '日常', '玫瑰白茶', 6, '盒', 79],
  ['o_fangyaqin_h3', 'c_fangyaqin', '2024-09-14', '中秋', '经典双罐', 4, '份', 180, '送朋友'],
  ['o_fangyaqin_h4', 'c_fangyaqin', '2024-11-23', '日常', '寿眉饼 357g', 2, '饼', 268],
  ['o_fangyaqin_h5', 'c_fangyaqin', '2025-01-25', '春节', '经典双罐', 6, '份', 180, '送朋友'],
  ['o_fangyaqin_h6', 'c_fangyaqin', '2025-03-15', '日常', '白毫银针便携装', 6, '盒', 128],
  ['o_fangyaqin_h7', 'c_fangyaqin', '2025-05-24', '日常', '白牡丹罐装 100g', 4, '罐', 168],
  ['o_fangyaqin_h8', 'c_fangyaqin', '2025-07-19', '日常', '玫瑰白茶', 8, '盒', 79],
  ['o_fangyaqin_h9', 'c_fangyaqin', '2025-09-27', '中秋', '经典双罐', 6, '份', 180, '送朋友'],
  ['o_fangyaqin_h10', 'c_fangyaqin', '2025-10-11', '日常', '白毫银针便携装', 4, '盒', 128],
]

const SRC = {
  interview: '99-原始材料/采访记录/2026-10-20-建库采访.md',
  i_hengyan_3: '99-原始材料/聊天与通话/2026-10-16-衡言律所-电话纪要.md',
  i_jinchuan_6: '99-原始材料/聊天与通话/2026-10-21-锦川置业-微信聊天.md',
  i_hemu_2: '99-原始材料/聊天与通话/2026-10-24-禾木瑜伽-电话纪要.md',
}

type Exec = (sql: string, p?: Record<string, string | number | null>) => unknown

/** 下次跟进那天、标题是“联系 / 问 / 告诉 / 邀请 / 回 / 提醒 / 给某人打电话”的待办，就是这位客户的跟进待办 */
export const FOLLOW_LINK_SQL = `INSERT OR IGNORE INTO crm_follow_todos (client_id, todo_id)
  SELECT c.id, (SELECT t.id FROM todos t WHERE t.client_id = c.id AND t.due = c.next_follow AND t.status IN ('待办','进行中','等别人')
    AND (t.title LIKE '联系%' OR t.title LIKE '问%' OR t.title LIKE '告诉%' OR t.title LIKE '邀请%' OR t.title LIKE '回%' OR t.title LIKE '提醒%' OR t.title LIKE '给%打%电话%' OR t.title LIKE '带%联系%')
    ORDER BY t.created_at LIMIT 1)
  FROM clients c WHERE c.next_follow IS NOT NULL
    AND EXISTS (SELECT 1 FROM todos t WHERE t.client_id = c.id AND t.due = c.next_follow AND t.status IN ('待办','进行中','等别人')
    AND (t.title LIKE '联系%' OR t.title LIKE '问%' OR t.title LIKE '告诉%' OR t.title LIKE '邀请%' OR t.title LIKE '回%' OR t.title LIKE '提醒%' OR t.title LIKE '给%打%电话%' OR t.title LIKE '带%联系%'))`

/** exec 默认是 db.ts 的 run；单独给真库补数据时，可以传一个直接连库的执行函数（不触发别的模块的迁移） */
export function seedWith(run: Exec) {
  // 八项客户信息里的文字部分
  for (const [cid, rows] of Object.entries(FACTS) as [K, [Kind, string][]][]) {
    rows.forEach(([kind, text], i) => run(`INSERT INTO client_facts (id, client_id, kind, text, date, source, author, created_at)
      VALUES (:id, :cid, :kind, :text, '2026-10-25', :src, :author, :at)`, {
      id: `f_${cid.slice(2)}_${i + 1}`, cid, kind, text, src: KB[cid],
      author: CONFIRMED.has(cid) ? '知识库客户档案（林总已确认）' : '知识库客户档案（Codex 10/25 建库时整理，待确认）', at: iso('2026-10-25T21:00'),
    }))
  }
  for (const [cid, from, to, reason, at] of STAGE_EDITS) {
    run(`INSERT INTO crm_edits (client_id, entity, entity_id, old_value, new_value, reason, actor, at) VALUES (:cid, '阶段', :cid, :from, :to, :reason, '网页', :at)`, { cid, from, to, reason, at: iso(at) })
  }
  run(`INSERT INTO crm_edits (client_id, entity, entity_id, old_value, new_value, reason, actor, at)
       VALUES ('c_qingyan', '下次跟进', 'c_qingyan', '2026-10-13', '2026-10-20', '10/13 那周忙中秋尾款，往后挪一周', '网页', :at)`, { at: iso('2026-10-13T09:40') })

  // 对已有表：补字段、按固定 ID 插入（已存在就跳过）
  for (const [id, s] of Object.entries(SALUTATION)) run('UPDATE clients SET salutation = :s WHERE id = :id AND salutation IS NULL', { s, id })
  run(`UPDATE interactions SET source_file = :src WHERE source_file IS NULL AND client_id IN (${Object.keys(KB).map((k) => `'${k}'`).join(',')}) AND id NOT IN (${EXTRA_TALKS.map((x) => `'${x.id}'`).join(',')})`, { src: SRC.interview })
  for (const id of ['i_hengyan_3', 'i_jinchuan_6', 'i_hemu_2'] as const) run('UPDATE interactions SET source_file = :src WHERE id = :id', { src: SRC[id], id })
  run('UPDATE client_promises SET to_whom = (SELECT contact_name FROM clients c WHERE c.id = client_promises.client_id) WHERE to_whom IS NULL')
  run('UPDATE client_promises SET source_file = (SELECT source_file FROM interactions i WHERE i.id = client_promises.interaction_id) WHERE source_file IS NULL')
  for (const [id, a] of Object.entries(CARE_AUTHOR)) run('UPDATE client_care SET author = :a WHERE id = :id', { a, id })
  for (const [id, basis] of Object.entries(ESTIMATED)) run('UPDATE deals SET estimated = 1, basis = :basis WHERE id = :id', { basis, id })
  // 已经有的“去联系某人”的待办，当成这位客户的跟进待办（改下次跟进时改这条，不再另建一条一样的；第二轮修 #6）
  run(FOLLOW_LINK_SQL)
  // 知识库说 9/22 的“11 月再聊”是“可能”，不算谁答应了什么：不当成答应的事（跟进日期和待办还在）
  run("DELETE FROM client_promises WHERE id = 'pr_lantuo_7_1' AND status = '待兑现'")
  for (const d of EXTRA_DATES) run('INSERT OR IGNORE INTO client_dates (id, client_id, date, label, kind, who, note) VALUES (:id, :client_id, :date, :label, :kind, :who, :note)', d)
  for (const x of EXTRA_TRAITS) run('INSERT OR IGNORE INTO client_traits (id, client_id, kind, text, source, created_at) VALUES (:id, :client_id, :kind, :text, :source, :at)', { ...x, at: iso('2026-10-18') })
  // 第三轮：大客户补的往来、门店更早的单（固定 ID，已有就跳过）
  for (const x of EXTRA_TALKS) {
    run(`INSERT OR IGNORE INTO interactions (id, client_id, date, channel, summary, next_step, actor, with_whom, concerns, created_at)
         VALUES (:id, :client_id, :date, :channel, :summary, :next, '网页', :with, :concerns, :at)`, { ...x, next: x.next ?? null, concerns: x.concerns ?? null, at: iso(`${x.date}T18:00`) })
  }
  for (const [id, cid, date, occasion, item, qty, unit, price, note] of EXTRA_ORDERS) {
    run(`INSERT OR IGNORE INTO orders (id, client_id, date, channel, occasion, item, qty, unit, unit_price, amount, status, note, created_at)
         VALUES (:id, :cid, :date, '门店', :occasion, :item, :qty, :unit, :price, :amount, '已完成', :note, :at)`, { id, cid, date, occasion, item, qty, unit, price, amount: qty * price, note: note ?? null, at: iso(date) })
  }
  // 第三轮：方雅琴的品茶会邀请提前到 10/28 发（《大客户关怀》：提前两三天，别等到当天）；青砚的备注“去年春节”改成“今年春节”；
  // 澜拓那条定时任务草稿的时间对上 07:12
  run("UPDATE client_care SET date = '2026-10-28', occasion = '请来 10/31 品茶会', note = '品茶会 10/31 周六下午；《大客户关怀》说提前两三天发，别等到当天' WHERE id = 'cr_fangyaqin_1' AND date = '2026-10-31'")
  run("UPDATE clients SET note = '今年春节（1/8 下单）150 份花草茶礼；2/3 吴老师说设计师们很喜欢，之后 8 个多月没联系' WHERE id = 'c_qingyan' AND note LIKE '去年春节%'")
  run('UPDATE client_care SET created_at = :at WHERE id = :id', { at: iso('2026-10-27T07:12'), id: 'cr_lantuo_1' })
  for (const x of EXTRA_CARE) {
    run(`INSERT OR IGNORE INTO client_care (id, client_id, occasion, date, gift, message, status, note, author, created_at)
         VALUES (:id, :client_id, :occasion, :date, :gift, :message, '建议', :note, :author, :at)`, { ...x, at: iso('2026-10-27T07:12') })
  }
}

export const crmFollow: SeedModule = {
  name: 'crm-follow',
  tables: ['crm_follow_todos', 'crm_extractions', 'crm_edits', 'client_facts'],
  seed: () => { seedWith(dbRun) },
}
