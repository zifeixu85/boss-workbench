// 客户数据（虚构）：10 位大客户 + 18 位普通客户和线索 + 4 位伙伴。归属：大客户模块。
// 一位客户的全部信息写在一起：档案、订单、每次沟通（含答应了什么、顾虑）、偏好、重要日子、关怀建议。
// 金额：budget 是“这次大概多少钱”（万元）；订单 amount 是元。电话都是打码的假号。

export type Promise_ = { text: string; due?: string; status?: '待兑现' | '已兑现' | '取消'; done_at?: string; note?: string }
export type Talk = {
  date: string; channel: '微信' | '电话' | '面谈' | '到店' | '邮件' | '其他'; with?: string
  summary: string; next?: string; concerns?: string; promises?: Promise_[]; actor?: '网页' | 'Codex'
}
export type Order = { date: string; channel: '企业茶礼' | '门店' | '线上' | '渠道月结'; occasion?: string; item: string; qty: number; unit?: string; price?: number; amount?: number; status?: '进行中' | '已完成' | '已取消'; note?: string }
export type Trait = [kind: '口味' | '包装' | '送礼对象' | '禁忌' | '顾虑' | '习惯', text: string, source?: string]
export type KeyDate = { date: string; label: string; kind: '生日' | '纪念日' | '节日' | '公司节点'; who?: string; note?: string }
export type Care = { occasion: string; date?: string; gift?: string; message?: string; status?: '建议' | '已安排' | '已送出' | '不做'; note?: string }
export type SeedClient = {
  id: string; name: string; label: string; kind?: '客户' | '伙伴'; stage: string; segment?: string; key?: boolean
  source: string; source_detail?: string; city?: string; phone?: string; wechat?: string; budget?: number | null
  contact?: string; title?: string; decision?: string; headcount?: number; since: string
  next_follow?: string | null; next_step?: string; tags: string[]; note?: string; kb?: string
  talks: Talk[]; orders?: Order[]; traits?: Trait[]; dates?: KeyDate[]; care?: Care[]
}

export const CLIENTS: SeedClient[] = [
  // ───────────── 10 位大客户 ─────────────
  {
    id: 'c_lantuo', name: '澜拓科技', label: '科技公司 · 约 300 人 · 员工礼', stage: '待复购', segment: '企业茶礼', key: true,
    source: '小红书私信', source_detail: '2025 年 12 月周明远在小红书搜“企业茶礼”，私信过来', city: '杭州 · 滨江',
    phone: '139 **** 0526', wechat: '周明远（澜拓行政）', budget: null, contact: '周明远', title: '行政负责人',
    decision: '周明远定方案，付款走公司流程', headcount: 300, since: '2025-12-18',
    next_follow: '2026-11-03', next_step: '11/3 带春节礼盒方案联系周明远（9/22 说的“11 月再聊”）',
    tags: ['老客户', '员工礼'], note: '中秋 300 份已交付；9/22 回访时周明远说春节可能还要，11 月再聊',
    kb: '04-客户/企业客户/澜拓科技.md',
    orders: [
      { date: '2026-01-06', channel: '企业茶礼', occasion: '春节', item: '经典双罐（春节款）', qty: 280, price: 175, note: '2026 年春节员工礼，1/20 前全部送达' },
      { date: '2026-08-20', channel: '企业茶礼', occasion: '中秋', item: '经典双罐', qty: 300, price: 180, note: '三成定金 1.62 万；尾款 10/16 到账' },
    ],
    talks: [
      { date: '2025-12-18', channel: '微信', with: '周明远', summary: '小红书私信来的，问春节员工礼，280 人左右，预算每份 180 以内', next: '发报价单' },
      { date: '2026-01-05', channel: '电话', with: '周明远', summary: '定了经典双罐春节款 280 份，每份 175；要求 1/20 前送到', promises: [{ text: '1/20 前 280 份全部送到', due: '2026-01-20', status: '已兑现', done_at: '2026-01-20' }] },
      { date: '2026-01-20', channel: '微信', with: '周明远', summary: '280 份全部送达，周明远说员工反馈不错' },
      { date: '2026-08-12', channel: '微信', with: '周明远', summary: '询价中秋员工礼，300 份，预算每份 200 以内', concerns: '预算每份 200 以内' },
      { date: '2026-08-20', channel: '面谈', with: '周明远', summary: '定了经典双罐 300 份，签单 5.4 万，付了三成定金', promises: [{ text: '9/20 前 300 份全部送达', due: '2026-09-20', status: '已兑现', done_at: '2026-09-18' }] },
      { date: '2026-09-18', channel: '微信', with: '周明远', summary: '300 份全部送达，周明远说员工挺喜欢' },
      { date: '2026-09-22', channel: '电话', with: '周明远', summary: '林总回访，周明远说春节可能还要，11 月再聊', next: '11 月上旬带春节方案联系' }, // 知识库：“11 月再聊”是“可能”，不算谁答应了什么（E5 10/10 改）
    ],
    traits: [
      ['顾虑', '预算每份 200 以内', '8/12 微信'],
      ['送礼对象', '员工礼，春节和中秋各一次', '订单'],
      ['习惯', '周明远定方案，付款走公司流程', '建库采访'],
    ],
    care: [
      { occasion: '春节前回访', date: '2026-11-03', message: '周经理，中秋那批大家喝得还行吧？春节的礼盒我们换了新包装，先发您看看。', note: '带方案去，先问中秋的反馈' },
    ],
  },
  {
    id: 'c_hengyan', name: '衡言律师事务所', label: '律所 · 合伙人送客户', stage: '报价中', segment: '企业茶礼', key: true,
    source: '朋友介绍', source_detail: '致远财税的罗佳介绍（两家常合作）', city: '杭州 · 上城',
    phone: '186 **** 3391', wechat: '陈静（衡言行政）', budget: 2.16, contact: '陈静', title: '行政主管',
    decision: '陈静对接，最后由合伙人定', headcount: 60, since: '2026-10-09',
    next_follow: '2026-10-28', next_step: '10/28 前发两款升级包装的效果图',
    tags: ['新客户', '客户礼', '比价中'], note: '在和另一家比价，觉得我们的包装有点普通；答应 10/28 前发两款升级包装的效果图',
    kb: '04-客户/企业客户/衡言律师事务所.md',
    talks: [
      { date: '2026-10-09', channel: '微信', with: '陈静', summary: '罗佳介绍加了微信，问春节茶礼，合伙人送客户用，120 份左右', next: '发报价单' },
      { date: '2026-10-14', channel: '微信', with: '陈静', summary: '发了报价单：经典双罐 120 份，每份 180' },
      { date: '2026-10-16', channel: '电话', with: '陈静', summary: '陈静说还在比两家，觉得我们的包装有点普通；林总答应 10/28 前发两款升级包装的效果图', concerns: '包装有点普通；在比价', next: '10/28 前发效果图', promises: [{ text: '10/28 前发两款升级包装的效果图', due: '2026-10-28' }] },
    ],
    traits: [
      ['送礼对象', '合伙人送客户', '10/09 微信'],
      ['顾虑', '觉得我们的包装有点普通', '10/16 电话'],
      ['顾虑', '在和另一家比价', '10/16 电话'],
      ['习惯', '陈静对接，最后由合伙人定', '10/09 微信'],
    ],
  },
  {
    id: 'c_qingyan', name: '青砚建筑设计院', label: '设计院 · 约 150 人 · 员工礼', stage: '待复购', segment: '企业茶礼', key: true,
    source: '展会', source_detail: '2025 年设计周展位认识吴老师', city: '杭州 · 西湖',
    phone: '135 **** 7720', wechat: '吴老师（青砚院办）', budget: 2.4, contact: '吴老师', title: '院办',
    decision: '吴老师定，院长签字', headcount: 150, since: '2025-12-26',
    next_follow: '2026-10-20', next_step: '联系吴老师问今年春节怎么安排，带上花草茶礼新包装的图',
    tags: ['老客户', '员工礼', '喜欢花草茶'], note: '今年春节（1/8 下单）150 份花草茶礼；2/3 吴老师说设计师们很喜欢，之后 8 个多月没联系',
    orders: [{ date: '2026-01-08', channel: '企业茶礼', occasion: '春节', item: '花草茶礼', qty: 150, price: 160, note: '1/20 全部送达' }],
    kb: '04-客户/企业客户/青砚建筑设计院.md',
    talks: [
      { date: '2025-12-26', channel: '面谈', with: '吴老师', summary: '设计周展位认识，问春节员工礼，喜欢有设计感的包装' },
      { date: '2026-01-08', channel: '微信', with: '吴老师', summary: '下单春节花草茶礼 150 份' },
      { date: '2026-01-20', channel: '微信', with: '吴老师', summary: '150 份全部送达' },
      { date: '2026-02-03', channel: '微信', with: '吴老师', summary: '吴老师说设计师们很喜欢花草茶', next: '找时间问下一个节日' },
    ],
    traits: [
      ['口味', '设计师们喜欢花草茶（玫瑰白茶、桂花乌龙）', '2/3 微信'],
      ['包装', '喜欢有设计感、素一点的包装', '2025-12 设计周'],
      ['送礼对象', '员工礼，春节发', '2026-01'],
    ],
    care: [{ occasion: '重新联系', date: '2026-10-28', gift: '花草茶礼新包装的图', message: '吴老师好，好久没联系！今年花草茶礼换了新包装，先发您看看，春节要是还给设计师们准备，我提前留好货。', note: '8 个多月没联系，先问候，不直接报价' }],
  },
  {
    id: 'c_kangyu', name: '康屿医疗器械', label: '医疗器械 · 客户礼', stage: '新线索', segment: '企业茶礼', key: true,
    source: '茶博会', source_detail: '10/17 杭州茶博会展位，郑凯留了名片', city: '杭州 · 余杭',
    phone: '158 **** 4419', budget: null, contact: '郑凯', title: '采购经理',
    decision: '采购部；金额大要走合规审批', headcount: 200, since: '2026-10-17',
    next_follow: '2026-10-29', next_step: '问报价单看了没，问份数和用途；推经典双罐 180（不超 200）',
    tags: ['新线索', '合规限额'], note: '送礼有合规限制：单份不超过 200 元',
    kb: '04-客户/企业客户/康屿医疗器械.md',
    talks: [
      { date: '2026-10-17', channel: '面谈', with: '郑凯', summary: '茶博会展位认识，留了名片，要企业茶礼报价单' },
      { date: '2026-10-19', channel: '微信', with: '郑凯', summary: '发了企业茶礼报价单，对方没回；郑凯之前提到送礼有合规限制，单份不能超过 200', concerns: '合规：单份不超过 200 元', next: '10/29 问报价单看了没' },
    ],
    traits: [
      ['顾虑', '送礼合规：单份不超过 200 元', '10/19 微信'],
      ['禁忌', '包装别太奢华，不要看起来像贵重礼品', '10/17 茶博会'],
    ],
  },
  {
    id: 'c_jinchuan', name: '锦川置业', label: '地产 · 送业主和合作方', stage: '售后', segment: '企业茶礼', key: true,
    source: '老客户介绍', source_detail: '澜拓周明远推荐（两家在同一个园区）', city: '杭州 · 滨江',
    phone: '133 **** 6075', wechat: '孙蕾（锦川行政）', budget: null, contact: '孙蕾', title: '行政经理',
    decision: '孙蕾定', headcount: 600, since: '2026-09-01',
    next_follow: '2026-10-28', next_step: '送补发的 6 盒、当面道歉；顺便问春节送业主的打算',
    tags: ['首次合作', '售后中'], note: '中秋 6 盒外箱压坏、茶罐凹了；孙蕾没发火，说“下次注意就好”',
    orders: [
      { date: '2026-09-05', channel: '企业茶礼', occasion: '中秋', item: '岩茶木盒', qty: 200, price: 260, note: '9/21 送达；6 盒压坏，补发中' },
      { date: '2026-10-28', channel: '企业茶礼', occasion: '中秋', item: '岩茶木盒（补发）', qty: 6, price: 0, amount: 0, status: '进行中', note: '压坏的 6 盒补发，不收钱' },
    ],
    kb: '04-客户/企业客户/锦川置业.md',
    talks: [
      { date: '2026-09-01', channel: '电话', with: '孙蕾', summary: '周明远推荐过来，问中秋送业主的礼盒，200 份' },
      { date: '2026-09-05', channel: '面谈', with: '孙蕾', summary: '签单：岩茶木盒 200 份，5.2 万，付三成定金', promises: [{ text: '9/22 前送达', due: '2026-09-22', status: '已兑现', done_at: '2026-09-21' }] },
      { date: '2026-09-21', channel: '微信', with: '孙蕾', summary: '200 份送达' },
      { date: '2026-09-24', channel: '微信', with: '孙蕾', summary: '孙蕾反馈 6 盒外箱压坏、茶罐凹了，发了照片', concerns: '对我们的物流包装不放心' },
      { date: '2026-09-25', channel: '电话', with: '孙蕾', summary: '林总电话道歉，答应补发 6 盒；孙蕾没发火，说“下次注意就好”', promises: [{ text: '补发 6 盒岩茶木盒，林总当面送去道歉', due: '2026-10-28' }] },
      { date: '2026-10-21', channel: '微信', with: '孙蕾', summary: '补货到了，跟孙蕾约好 10/28 上午送过去，林总自己去' },
    ],
    traits: [
      ['顾虑', '对物流包装不放心（中秋 6 盒压坏）', '9/24 微信'],
      ['送礼对象', '送业主和合作方', '9/1 电话'],
      ['包装', '要按时、完好送到；外箱加护角', '9/25 电话'],
    ],
    care: [{ occasion: '当面道歉', date: '2026-10-28', gift: '白牡丹一罐 + 手写道歉卡', message: '孙经理，上次的事是我们没做好，这 6 盒我亲自送来；以后外箱都加护角，送到当天拍照给您。', status: '已安排', note: '不提新品名字（11/5 上线前不对外说）' }],
  },
  {
    id: 'c_qimu', name: '栖木资本', label: '投资公司 · 年会伴手礼', stage: '方案中', segment: '企业茶礼', key: true,
    source: '老客户介绍', source_detail: '老茶客许国平 10/15 带何雨桐来门店喝茶', city: '杭州 · 上城',
    phone: '177 **** 2083', wechat: '何雨桐（栖木总裁办）', budget: 2.4, contact: '何雨桐', title: '总裁办',
    decision: '合伙人定，何雨桐出方案', headcount: 40, since: '2026-10-15',
    next_follow: '2026-10-29', next_step: '发正式方案：肉桂 + 白瓷盖碗、肉桂 + 水仙 + 盖碗两种组合，附样品图',
    tags: ['新客户', '高端', '年会'], note: '60 份，小而精，每份 400 左右；11/15 前定',
    kb: '04-客户/企业客户/栖木资本.md',
    talks: [
      { date: '2026-10-15', channel: '到店', with: '何雨桐', summary: '许国平带何雨桐来门店喝茶，聊到年底年会伴手礼' },
      { date: '2026-10-18', channel: '微信', with: '何雨桐', summary: '年会伴手礼 60 份，要高端、小而精，预算每份 400；偏好岩茶 + 白瓷盖碗的组合；11/15 前定', concerns: '要拿得出手，又不能太张扬' },
      { date: '2026-10-22', channel: '微信', with: '何雨桐', summary: '林总发了两个组合思路（肉桂 + 盖碗；肉桂 + 水仙 + 盖碗），何雨桐说下周给合伙人看正式方案', promises: [{ text: '10/29 前发正式方案和样品图', due: '2026-10-29' }] },
    ],
    traits: [
      ['口味', '偏好岩茶', '10/18 微信'],
      ['包装', '小而精；岩茶配白瓷盖碗', '10/18 微信'],
      ['送礼对象', '年会伴手礼，送被投企业和合作伙伴', '10/18 微信'],
    ],
    dates: [
      { date: '2026-11-15', label: '伴手礼方案截止', kind: '公司节点' },
      { date: '2026-12-18', label: '栖木年会', kind: '公司节点' },
    ],
  },
  {
    id: 'c_nanyu', name: '南屿精品酒店', label: '精品酒店 · 客房茶包', stage: '合作中', segment: '渠道合作', key: true,
    source: '酒店用品展', source_detail: '2026 年 5 月酒店用品展，梁晨来展位试喝', city: '杭州 · 西湖',
    phone: '150 **** 9132', wechat: '梁晨（南屿采购）', budget: 1.6, contact: '梁晨', title: '采购',
    decision: '梁晨定量，财务月结', headcount: 80, since: '2026-06-01',
    next_follow: '2026-10-30', next_step: '10/31 结 10 月货款 1.6 万；确认 11 月起每月加到 2500 袋',
    tags: ['渠道', '月结', '客房茶包'], note: '每月 2000 袋（桂花乌龙 + 白毫银针），月结；10 月货款 1.6 万约定 10/31 结',
    orders: ['06', '07', '08', '09', '10'].map((m) => ({
      date: `2026-${m}-${m === '06' || m === '09' ? '30' : '31'}`, channel: '渠道月结' as const, occasion: '月结', item: '客房茶包（桂花乌龙 1200 袋 + 白毫银针 800 袋）',
      qty: 2000, unit: '袋', price: 8, status: (m === '10' ? '进行中' : '已完成') as '进行中' | '已完成', note: m === '10' ? '10 月货款约定 10/31 结' : undefined,
    })),
    kb: '04-客户/渠道客户/南屿精品酒店.md',
    talks: [
      { date: '2026-05-22', channel: '面谈', with: '梁晨', summary: '酒店用品展上试喝，想给客房配茶包' },
      { date: '2026-06-01', channel: '面谈', with: '梁晨', summary: '签合作：每月 2000 袋，桂花乌龙 + 白毫银针，月结' },
      { date: '2026-09-29', channel: '微信', with: '梁晨', summary: '9 月货款 1.6 万已付' },
      { date: '2026-10-20', channel: '电话', with: '梁晨', summary: '冬季入住率高，11 月起想加到每月 2500 袋；10 月货款约定 10/31 结', next: '10/31 前确认 11 月加量', promises: [{ text: '10/31 前确认 11 月起每月 2500 袋能供上', due: '2026-10-31' }] },
    ],
    traits: [
      ['习惯', '月底对账，财务月结', '6/1 签合作'],
      ['口味', '客人反馈桂花乌龙最受欢迎', '10/20 电话'],
    ],
  },
  {
    id: 'c_hemu', name: '禾木瑜伽', label: '瑜伽馆 · 3 家店 · 会员礼', stage: '新线索', segment: '企业茶礼', key: true,
    source: '小红书', source_detail: '10/21 苏曼看到“办公室 3 分钟泡茶”那篇笔记，私信过来', city: '杭州 · 拱墅',
    phone: '189 **** 5547', wechat: '苏曼（禾木瑜伽）', budget: 3.2, contact: '苏曼', title: '创始人',
    decision: '苏曼自己定', since: '2026-10-21',
    next_follow: '2026-11-01', next_step: '11/3 下午到门店品鉴：准备 3 款花草茶',
    tags: ['新线索', '会员礼', '花草茶'], note: '会员年卡礼品约 200 份花草茶礼；要“轻、健康”的调性，但文案不能说功效',
    kb: '04-客户/企业客户/禾木瑜伽.md',
    talks: [
      { date: '2026-10-21', channel: '微信', with: '苏曼', summary: '看到小红书笔记私信来，问会员年卡礼品，三家馆一起做' },
      { date: '2026-10-24', channel: '电话', with: '苏曼', summary: '会员年卡礼品约 200 份花草茶礼，想要“轻、健康”的调性，预算每份 160 左右；约 11/3 下午到门店品鉴', concerns: '不想要太甜的花草茶；礼盒要小，能放进瑜伽包', promises: [{ text: '11/3 下午在门店安排品鉴，准备 3 款花草茶', due: '2026-11-03' }] },
    ],
    traits: [
      ['口味', '想要“轻、健康”的调性，不要太甜', '10/24 电话'],
      ['包装', '小一点，能放进瑜伽包', '10/24 电话'],
      ['送礼对象', '会员年卡礼品，约 200 位会员', '10/24 电话'],
      ['禁忌', '文案不能说功效（不说减肥、助眠这类）', '品牌规则'],
    ],
    dates: [{ date: '2026-11-03', label: '苏曼到门店品鉴', kind: '公司节点' }],
  },
  {
    id: 'c_xuguoping', name: '许国平', label: '门店老茶客 · VIP', stage: '维护中', segment: '门店老茶客', key: true,
    source: '门店到访', source_detail: '2023 年春天路过茶空间进来喝茶', city: '杭州 · 上城',
    phone: '137 **** 8806', wechat: '许国平', budget: null, contact: '许国平', title: '本人', since: '2023-04-16',
    next_follow: '2026-10-30', next_step: '告诉他门店 11/3 起停业约 10 天；他常带客户来谈事，停业期间可以把茶送到他办公室',
    tags: ['VIP', '只喝岩茶', '常带客户来'], note: '年消费约 1.8 万，只喝岩茶（肉桂、水仙）；常带客户来门店谈事',
    orders: [
      { date: '2025-11-08', channel: '门店', occasion: '日常', item: '肉桂 100g', qty: 4, unit: '罐', price: 238 },
      { date: '2025-12-20', channel: '门店', occasion: '日常', item: '水仙 100g', qty: 6, unit: '罐', price: 168 },
      { date: '2026-01-15', channel: '门店', occasion: '春节', item: '岩茶木盒', qty: 10, price: 260, note: '送客户' },
      { date: '2026-02-26', channel: '门店', occasion: '日常', item: '肉桂 100g', qty: 6, unit: '罐', price: 238 },
      { date: '2026-03-08', channel: '门店', occasion: '日常', item: '大红袍罐装 100g', qty: 4, unit: '罐', price: 198, note: '生日那天来喝茶' },
      { date: '2026-04-18', channel: '门店', occasion: '日常', item: '肉桂 100g', qty: 5, unit: '罐', price: 238 },
      { date: '2026-05-05', channel: '门店', occasion: '日常', item: '寿眉饼 357g', qty: 3, unit: '饼', price: 268, note: '帮朋友带的' },
      { date: '2026-05-30', channel: '门店', occasion: '日常', item: '水仙 100g', qty: 6, unit: '罐', price: 168 },
      { date: '2026-06-21', channel: '门店', occasion: '日常', item: '便携旅行茶具套装', qty: 2, unit: '套', price: 199 },
      { date: '2026-07-19', channel: '门店', occasion: '日常', item: '肉桂 100g', qty: 6, unit: '罐', price: 238 },
      { date: '2026-08-23', channel: '门店', occasion: '日常', item: '水仙 100g', qty: 4, unit: '罐', price: 168 },
      { date: '2026-09-12', channel: '门店', occasion: '中秋', item: '岩茶木盒', qty: 8, price: 260, note: '送客户' },
      { date: '2026-09-28', channel: '门店', occasion: '日常', item: '肉桂 100g（2 斤）', qty: 10, unit: '罐', price: 238, note: '说中秋送人用完了' },
      { date: '2026-10-02', channel: '门店', occasion: '日常', item: '肉桂 100g', qty: 4, unit: '罐', price: 238 },
      { date: '2026-10-15', channel: '门店', occasion: '日常', item: '茶空间包间（带客户谈事）', qty: 1, unit: '次', price: 288 },
    ],
    kb: '04-客户/门店老茶客/许国平.md',
    talks: [
      { date: '2026-03-08', channel: '到店', with: '许国平', summary: '生日那天来喝茶，宋姐送了一泡老枞水仙' },
      { date: '2026-09-28', channel: '到店', with: '许国平', summary: '买了 2 斤肉桂，说中秋送人用完了' },
      { date: '2026-10-15', channel: '到店', with: '许国平', summary: '带栖木资本的何雨桐来门店喝茶谈事，顺便介绍了年会伴手礼的事' },
    ],
    traits: [
      ['口味', '只喝岩茶：肉桂、水仙；不喝花草茶', '宋姐'],
      ['习惯', '常带客户来门店包间谈事，喜欢靠窗那间', '宋姐'],
      ['送礼对象', '中秋、春节买岩茶木盒送客户', '订单'],
    ],
    dates: [{ date: '--03-08', label: '许国平生日', kind: '生日', who: '许国平' }],
    care: [
      { occasion: '门店停业提前说', date: '2026-10-30', message: '许总，门店 11/3 起装修十来天，13 号前后重新开。这段时间要带客户喝茶，提前跟我说，我把肉桂送到你办公室。', note: '他常带客户来，别让他白跑' },
      { occasion: '许国平生日', date: '2027-03-08', gift: '老枞水仙一泡，留靠窗包间', message: '许总生日快乐，今天包间给你留好了。' },
    ],
  },
  {
    id: 'c_fangyaqin', name: '方雅琴', label: '门店会员 · VIP', stage: '维护中', segment: '门店老茶客', key: true,
    source: '门店活动', source_detail: '2024 年春天参加门店周末品茶会', city: '杭州 · 西湖',
    phone: '136 **** 1268', wechat: '雅琴', budget: null, contact: '方雅琴', title: '本人', since: '2024-04-13',
    next_follow: '2026-10-31', next_step: '邀请她来停业前最后一场周末品茶会（10/31），顺便说停业时间',
    tags: ['VIP', '爱白茶', '常买来送人', '周末品茶会常客'], note: '年消费约 1.2 万，爱白茶，常买来送人；喜欢门店的周末品茶活动',
    orders: [
      { date: '2025-11-16', channel: '门店', occasion: '日常', item: '白牡丹罐装 100g', qty: 6, unit: '罐', price: 168 },
      { date: '2025-12-21', channel: '门店', occasion: '日常', item: '白毫银针便携装', qty: 10, unit: '盒', price: 128, note: '送朋友' },
      { date: '2026-01-24', channel: '门店', occasion: '春节', item: '经典双罐', qty: 6, price: 180 },
      { date: '2026-02-14', channel: '门店', occasion: '日常', item: '玫瑰白茶', qty: 12, unit: '盒', price: 79 },
      { date: '2026-03-14', channel: '门店', occasion: '日常', item: '寿眉饼 357g', qty: 2, unit: '饼', price: 268 },
      { date: '2026-04-25', channel: '门店', occasion: '日常', item: '玫瑰白茶', qty: 6, unit: '盒', price: 79 },
      { date: '2026-05-16', channel: '门店', occasion: '日常', item: '白牡丹罐装 100g', qty: 4, unit: '罐', price: 168 },
      { date: '2026-06-27', channel: '门店', occasion: '日常', item: '白瓷盖碗', qty: 2, unit: '个', price: 89 },
      { date: '2026-06-27', channel: '门店', occasion: '日常', item: '白毫银针便携装', qty: 6, unit: '盒', price: 128 },
      { date: '2026-07-25', channel: '门店', occasion: '日常', item: '白毫银针便携装', qty: 8, unit: '盒', price: 128 },
      { date: '2026-08-29', channel: '门店', occasion: '日常', item: '寿眉饼 357g', qty: 3, unit: '饼', price: 268 },
      { date: '2026-09-19', channel: '门店', occasion: '中秋', item: '经典双罐', qty: 8, price: 180, note: '送朋友' },
      { date: '2026-10-04', channel: '门店', occasion: '日常', item: '白牡丹罐装 100g', qty: 6, unit: '罐', price: 168 },
      { date: '2026-10-25', channel: '门店', occasion: '日常', item: '白毫银针便携装', qty: 6, unit: '盒', price: 128, note: '周末品茶会后买的' },
    ],
    kb: '04-客户/门店老茶客/方雅琴.md',
    talks: [
      { date: '2026-09-19', channel: '到店', with: '方雅琴', summary: '买 8 份经典双罐送朋友，问有没有更小一点的礼盒' },
      { date: '2026-10-25', channel: '到店', with: '方雅琴', summary: '来了周末品茶会「秋天的第一泡白茶」，买了 6 盒便携装；说很喜欢周末活动' },
    ],
    traits: [
      ['口味', '爱白茶：白牡丹、寿眉、白毫银针', '宋姐'],
      ['送礼对象', '常买来送朋友；想要更小的礼盒', '9/19 到店'],
      ['习惯', '周末品茶会常客', '宋姐'],
    ],
    dates: [{ date: '--12-02', label: '方雅琴生日', kind: '生日', who: '方雅琴' }],
    care: [
      { occasion: '请来 10/31 品茶会', date: '2026-10-28', message: '雅琴姐，这周六下午是门店装修前最后一场品茶会，给你留了位置；11/3 起停十来天，复业第一场还请你来。', note: '品茶会 10/31 周六下午；《大客户关怀》说提前两三天发，别等到当天' },
      { occasion: '方雅琴生日', date: '2026-12-02', gift: '新品白茶一饼 + 手写卡', message: '雅琴姐生日快乐！今年秋冬的新白茶到了，给你留了一饼，周末来店里我们一起开。', note: '新品 11/5 上线后才能说名字' },
    ],
  },

  // ───────────── 普通客户和线索 ─────────────
  {
    id: 'c_zhiyuan', name: '致远财税', label: '财税公司 · 12 人', stage: '售后', segment: '企业茶礼', source: '朋友介绍', source_detail: '门店老客户介绍',
    city: '杭州 · 上城', phone: '138 **** 2716', contact: '罗佳', title: '合伙人', headcount: 12, since: '2025-09-10',
    next_follow: '2026-10-27', next_step: '中秋款 0.54 万已过期 12 天，问罗佳什么时候付', tags: ['小单', '待回款'], note: '约定 10/15 付款，还没到账',
    orders: [{ date: '2026-09-15', channel: '企业茶礼', occasion: '中秋', item: '经典双罐', qty: 30, price: 180 }],
    talks: [
      { date: '2026-09-10', channel: '微信', with: '罗佳', summary: '中秋 30 份经典双罐，送客户' },
      { date: '2026-10-16', channel: '微信', with: '罗佳', summary: '问款的事，罗佳说下周付' },
    ],
  },
  {
    id: 'c_yunfan', name: '云帆跨境电商', label: '跨境电商 · 约 120 人', stage: '待复购', segment: '企业茶礼', source: '小红书',
    city: '杭州 · 滨江', phone: '152 **** 8840', contact: '高婷', title: 'HR', headcount: 120, since: '2025-12-10', budget: 1.92,
    next_follow: '2026-11-05', next_step: '春节员工礼：问今年人数和预算', tags: ['老客户', '员工礼'],
    orders: [{ date: '2026-01-12', channel: '企业茶礼', occasion: '春节', item: '花草茶礼', qty: 120, price: 160 }],
    talks: [
      { date: '2025-12-10', channel: '微信', with: '高婷', summary: '小红书私信来的，春节员工礼 120 份' },
      { date: '2026-01-12', channel: '微信', with: '高婷', summary: '下单花草茶礼 120 份' },
      { date: '2026-02-10', channel: '微信', with: '高婷', summary: '高婷说员工挺喜欢，明年还找我们' },
    ],
  },
  {
    id: 'c_beichen', name: '北辰广告', label: '广告公司 · 约 60 人', stage: '待复购', segment: '企业茶礼', source: '抖音',
    city: '杭州 · 拱墅', phone: '131 **** 6627', contact: '唐宁', title: '行政', headcount: 60, since: '2026-08-28', budget: 1.08,
    next_follow: '2026-11-06', next_step: '带春节方案联系唐宁', tags: ['中秋新客户'],
    orders: [{ date: '2026-09-10', channel: '企业茶礼', occasion: '中秋', item: '经典双罐', qty: 60, price: 180 }],
    talks: [
      { date: '2026-08-28', channel: '微信', with: '唐宁', summary: '抖音企业号私信，中秋 60 份' },
      { date: '2026-09-10', channel: '微信', with: '唐宁', summary: '下单经典双罐 60 份' },
      { date: '2026-10-19', channel: '微信', with: '唐宁', summary: '尾款付清，唐宁说春节再聊' },
    ],
  },
  {
    id: 'c_huiyuan', name: '汇远物流', label: '物流公司 · 约 500 人 · 工会福利', stage: '需求确认', segment: '企业茶礼', source: '茶博会', source_detail: '10/17 茶博会',
    city: '杭州 · 萧山', phone: '139 **** 3058', contact: '马骏', title: '工会主席', headcount: 500, since: '2026-10-17', budget: 6.0,
    next_follow: '2026-11-02', next_step: '算一下 120 元一份能不能做：花草茶礼换小规格？', tags: ['大单', '预算紧'], note: '工会春节福利 500 份，预算每份 120，比最便宜的礼盒还低 40',
    talks: [
      { date: '2026-10-17', channel: '面谈', with: '马骏', summary: '茶博会认识，工会想给员工发春节福利' },
      { date: '2026-10-20', channel: '电话', with: '马骏', summary: '工会春节福利 500 份，预算每份 120', concerns: '预算每份 120' },
    ],
    traits: [['顾虑', '预算每份 120，比花草茶礼 160 低', '10/20 电话']],
  },
  {
    id: 'c_xinghe', name: '星禾教育', label: '培训学校 · 约 80 人', stage: '待复购', segment: '企业茶礼', source: '门店到访',
    city: '杭州 · 西湖', phone: '159 **** 4206', contact: '袁老师', title: '校长助理', headcount: 80, since: '2026-08-30',
    next_follow: '2026-11-20', next_step: '春节教师礼：11 月下旬再问', tags: ['教师节客户'],
    orders: [{ date: '2026-09-08', channel: '企业茶礼', occasion: '教师节', item: '玫瑰白茶小礼包', qty: 80, price: 79 }],
    talks: [
      { date: '2026-08-30', channel: '到店', with: '袁老师', summary: '路过门店进来问教师节小礼' },
      { date: '2026-09-12', channel: '微信', with: '袁老师', summary: '老师们很喜欢，春节再说' },
    ],
  },
  {
    id: 'c_lanting', name: '兰亭会计师事务所', label: '会计师事务所 · 约 100 人', stage: '报价中', segment: '企业茶礼', source: '行业活动', source_detail: '10/11 财税沙龙，罗佳带去的',
    city: '杭州 · 江干', phone: '187 **** 0394', contact: '冯琳', title: '办公室主任', headcount: 100, since: '2026-10-11', budget: 1.8,
    next_follow: '2026-10-30', next_step: '跟进报价：经典双罐 100 份', tags: ['新客户', '员工礼'],
    talks: [
      { date: '2026-10-11', channel: '面谈', with: '冯琳', summary: '财税沙龙上认识，问春节员工礼' },
      { date: '2026-10-22', channel: '微信', with: '冯琳', summary: '发了报价单：经典双罐 100 份 × 180', concerns: '想要能放下 A4 贺卡的盒子' },
    ],
  },
  {
    id: 'c_mingshi', name: '明石建设', label: '建筑公司 · 约 400 人', stage: '暂停', segment: '企业茶礼', source: '展会',
    city: '杭州 · 萧山', phone: '135 **** 9910', contact: '赵立', title: '综合办', headcount: 400, since: '2025-09-01',
    next_follow: null, next_step: '明年中秋前再问', tags: ['预算砍了'],
    orders: [{ date: '2025-09-20', channel: '企业茶礼', occasion: '中秋', item: '经典双罐', qty: 200, price: 180 }],
    talks: [{ date: '2026-10-10', channel: '电话', with: '赵立', summary: '今年预算砍了，春节不发茶礼了', concerns: '公司今年控制费用' }],
  },
  {
    id: 'c_jiahe', name: '嘉禾地产', label: '地产公司', stage: '流失', segment: '企业茶礼', source: '朋友介绍',
    city: '杭州 · 余杭', phone: '134 **** 5521', contact: '邵敏', title: '行政', since: '2026-08-15',
    next_follow: null, tags: ['比价流失'], note: '中秋选了别家，每份便宜 30',
    talks: [
      { date: '2026-08-15', channel: '微信', with: '邵敏', summary: '中秋业主礼 300 份询价' },
      { date: '2026-09-01', channel: '微信', with: '邵敏', summary: '选了别家，每份便宜 30', concerns: '只比单价' },
    ],
  },
  {
    id: 'c_yuejian', name: '悦见民宿', label: '民宿 · 4 家店 · 客房茶包', stage: '合作中', segment: '渠道合作', source: '小红书',
    city: '湖州 · 莫干山', phone: '182 **** 7731', contact: '叶子', title: '主理人', since: '2026-07-01', budget: 0.24,
    next_follow: '2026-11-03', next_step: '对 10 月茶包账（0.24 万）；问秋冬要不要换一半成水仙', tags: ['渠道', '客房茶包'],
    orders: ['07', '08', '09', '10'].map((m) => ({ date: `2026-${m}-${m === '09' ? '30' : '31'}`, channel: '渠道月结' as const, occasion: '月结', item: '客房茶包（桂花乌龙）', qty: 300, unit: '袋', price: 8, status: (m === '10' ? '进行中' : '已完成') as '进行中' | '已完成' })),
    talks: [
      { date: '2026-07-01', channel: '微信', with: '叶子', summary: '小量客房茶包合作，每月 300 袋' },
      { date: '2026-10-24', channel: '微信', with: '叶子', summary: '叶子说秋冬客人更爱喝岩茶，问能不能换一半成水仙' },
    ],
  },
  {
    id: 'c_shiguang', name: '拾光咖啡', label: '咖啡馆 · 2 家店 · 寄卖', stage: '合作中', segment: '渠道合作', source: '朋友介绍',
    city: '杭州 · 西湖', phone: '157 **** 3380', contact: '阿宁', title: '店长', since: '2026-05-10',
    next_follow: '2026-10-29', next_step: '9 月寄卖款 0.31 万还没结，问一下', tags: ['寄卖'],
    orders: [
      { date: '2026-06-30', channel: '渠道月结', occasion: '寄卖结算', item: '白毫银针便携装（寄卖）', qty: 22, unit: '盒', price: 115 },
      { date: '2026-07-31', channel: '渠道月结', occasion: '寄卖结算', item: '白毫银针便携装（寄卖）', qty: 25, unit: '盒', price: 115 },
      { date: '2026-08-31', channel: '渠道月结', occasion: '寄卖结算', item: '白毫银针便携装（寄卖）', qty: 24, unit: '盒', price: 115 },
      { date: '2026-09-30', channel: '渠道月结', occasion: '寄卖结算', item: '白毫银针便携装（寄卖）', qty: 27, unit: '盒', price: 115, note: '款还没结' },
    ],
    talks: [{ date: '2026-10-21', channel: '微信', with: '阿宁', summary: '补了 30 盒便携装；9 月寄卖款阿宁说月底一起结' }],
  },
  {
    id: 'c_sanmu', name: '三木设计工作室', label: '设计工作室 · 15 人', stage: '交付中', segment: '企业茶礼', source: '老客户介绍', source_detail: '青砚吴老师介绍',
    city: '杭州 · 西湖', phone: '178 **** 6651', contact: '江帆', title: '合伙人', headcount: 15, since: '2026-10-15', budget: 0.24,
    next_follow: '2026-10-28', next_step: '10/28 送团建下午茶茶礼', tags: ['小单'],
    orders: [{ date: '2026-10-24', channel: '企业茶礼', occasion: '团建', item: '花草茶礼', qty: 15, price: 160, status: '进行中', note: '10/28 送到' }],
    talks: [{ date: '2026-10-24', channel: '微信', with: '江帆', summary: '团建 15 份花草茶礼，10/28 送到', promises: [{ text: '10/28 送到工作室', due: '2026-10-28' }] }],
  },
  {
    id: 'c_haorui', name: '浩瑞医药', label: '医药公司 · 年会抽奖', stage: '新线索', segment: '企业茶礼', source: '茶博会', source_detail: '10/17 茶博会',
    city: '杭州 · 滨江', phone: '153 **** 2049', contact: '卢可', title: '总经办', since: '2026-10-17', budget: 0.8,
    next_follow: '2026-10-30', next_step: '问年会抽奖礼品的预算和合规上限', tags: ['新线索'], note: '医药行业，合规要求可能和康屿类似，先问清金额上限',
    talks: [{ date: '2026-10-17', channel: '面谈', with: '卢可', summary: '茶博会认识，年会抽奖礼品 20 份，要高端一点' }],
  },
  {
    id: 'c_chenmo', name: '陈默', label: '门店会员 · 爱水仙', stage: '维护中', segment: '门店老茶客', source: '门店到访',
    city: '杭州', phone: '139 **** 7745', contact: '陈默', title: '本人', since: '2024-09-07', next_follow: null, tags: ['会员'],
    orders: [
      { date: '2026-03-21', channel: '门店', occasion: '日常', item: '水仙 100g', qty: 6, unit: '罐', price: 168 },
      { date: '2026-06-13', channel: '门店', occasion: '日常', item: '水仙 100g', qty: 8, unit: '罐', price: 168 },
      { date: '2026-09-05', channel: '门店', occasion: '中秋', item: '岩茶木盒', qty: 4, price: 260 },
      { date: '2026-10-18', channel: '门店', occasion: '日常', item: '水仙 100g', qty: 6, unit: '罐', price: 168 },
    ],
    talks: [{ date: '2026-10-18', channel: '到店', with: '陈默', summary: '买了 6 罐水仙，问冬天有没有焙火重一点的' }],
  },
  {
    id: 'c_lixuan', name: '李萱', label: '门店会员 · 周末品茶会常客', stage: '维护中', segment: '门店老茶客', source: '门店活动',
    city: '杭州', phone: '188 **** 0372', contact: '李萱', title: '本人', since: '2025-05-17', next_follow: '2026-10-31', next_step: '邀请 10/31 品茶会', tags: ['会员', '品茶会'],
    orders: [
      { date: '2026-04-26', channel: '门店', occasion: '日常', item: '玫瑰白茶', qty: 8, unit: '盒', price: 79 },
      { date: '2026-07-12', channel: '门店', occasion: '日常', item: '桂花乌龙', qty: 10, unit: '盒', price: 69 },
      { date: '2026-09-27', channel: '门店', occasion: '日常', item: '白牡丹罐装 100g', qty: 4, unit: '罐', price: 168 },
      { date: '2026-10-25', channel: '门店', occasion: '日常', item: '白瓷盖碗', qty: 2, unit: '个', price: 89 },
    ],
    talks: [{ date: '2026-10-25', channel: '到店', with: '李萱', summary: '来了周末品茶会，带了一位同事' }],
  },
  {
    id: 'c_wangjg', name: '王建国', label: '老茶客 · 两个月没来', stage: '维护中', segment: '门店老茶客', source: '门店到访',
    city: '杭州', phone: '137 **** 2261', contact: '王建国', title: '本人', since: '2023-10-02',
    next_follow: '2026-10-28', next_step: '打个电话：两个月没来，问问最近在喝什么', tags: ['老茶客', '久未到店'],
    orders: [
      { date: '2026-02-08', channel: '门店', occasion: '春节', item: '岩茶木盒', qty: 6, price: 260 },
      { date: '2026-04-11', channel: '门店', occasion: '日常', item: '大红袍罐装 100g', qty: 8, unit: '罐', price: 198 },
      { date: '2026-06-06', channel: '门店', occasion: '日常', item: '肉桂 100g', qty: 6, unit: '罐', price: 238 },
      { date: '2026-08-22', channel: '门店', occasion: '日常', item: '大红袍罐装 100g', qty: 6, unit: '罐', price: 198 },
    ],
    talks: [{ date: '2026-08-22', channel: '到店', with: '王建国', summary: '买了 6 罐大红袍，说要出差一段时间' }],
  },
  {
    id: 'c_suqing', name: '苏晴', label: '天猫老客 · 复购 8 次', stage: '维护中', segment: '零售', source: '天猫',
    city: '上海', contact: '苏晴', title: '本人', since: '2025-03-02', next_follow: null, tags: ['线上老客'],
    orders: [
      { date: '2026-05-20', channel: '线上', occasion: '日常', item: '白牡丹罐装 100g', qty: 4, unit: '罐', price: 168 },
      { date: '2026-08-08', channel: '线上', occasion: '日常', item: '寿眉饼 357g', qty: 2, unit: '饼', price: 268 },
      { date: '2026-10-12', channel: '线上', occasion: '日常', item: '白牡丹罐装 100g', qty: 6, unit: '罐', price: 168 },
    ],
    talks: [{ date: '2026-10-12', channel: '其他', with: '苏晴', summary: '天猫客服记录：问白牡丹能不能开发票，第 8 次复购' }],
  },
  {
    id: 'c_huangtao', name: '黄涛', label: '抖店直播间常客 · 常买来送人', stage: '维护中', segment: '零售', source: '抖店',
    city: '宁波', contact: '黄涛', title: '本人', since: '2025-11-20', next_follow: null, tags: ['直播间常客'],
    orders: [
      { date: '2026-06-18', channel: '线上', occasion: '日常', item: '白毫银针便携装', qty: 10, unit: '盒', price: 128 },
      { date: '2026-09-20', channel: '线上', occasion: '中秋', item: '白毫银针便携装', qty: 12, unit: '盒', price: 128 },
    ],
    talks: [{ date: '2026-09-20', channel: '其他', with: '黄涛', summary: '抖店客服记录：中秋一次买 12 盒便携装送客户' }],
  },
  {
    id: 'c_zhaoyue', name: '赵悦', label: '小红书粉丝 · 想买小份礼盒', stage: '新线索', segment: '零售', source: '小红书', source_detail: '10/26 小红书私信',
    city: '杭州', contact: '赵悦', title: '本人', since: '2026-10-26', budget: 0.11,
    next_follow: '2026-10-28', next_step: '回复：6 份同事小礼，推经典双罐或便携装礼盒', tags: ['新线索'],
    talks: [{ date: '2026-10-26', channel: '其他', with: '赵悦', summary: '小红书私信：公司年底想送 6 位同事，问有没有小份礼盒' }],
  },

  // ───────────── 伙伴 ─────────────
  {
    id: 'c_hongyin', name: '鸿印包装', label: '礼盒供应商', kind: '伙伴', stage: '合作中', source: '老伙伴',
    city: '杭州 · 萧山', phone: '138 **** 5512', contact: '刘经理', title: '业务', since: '2022-08-01',
    next_follow: '2026-10-27', next_step: '今天 16:00 电话：春节红色系礼盒报价（定方案要用）', tags: ['供应商', '春节礼盒'],
    note: '春节红色系礼盒的报价还没回，卡着 10/30 定包装方案',
    talks: [
      { date: '2026-10-22', channel: '面谈', with: '刘经理', summary: '来送春节红色系礼盒样品，3 款' },
      { date: '2026-10-25', channel: '微信', with: '刘经理', summary: '催报价，刘经理说周一（10/26）给' },
      { date: '2026-10-26', channel: '微信', with: '刘经理', summary: '刘经理说纸张涨价，报价要再等两天', concerns: '纸价涨了，报价可能比去年高' },
    ],
  },
  {
    id: 'c_chengpei', name: '城配快运', label: '同城配送', kind: '伙伴', stage: '合作中', source: '老伙伴',
    city: '杭州', phone: '130 **** 8827', contact: '小马', title: '调度', since: '2024-01-10',
    next_follow: '2026-10-28', next_step: '10/28 上午送锦川 6 盒，外箱加护角', tags: ['物流'],
    talks: [{ date: '2026-10-21', channel: '电话', with: '小马', summary: '锦川补发那 6 盒，10/28 上午用他们的车送' }],
  },
  {
    id: 'c_aguang', name: '阿光', label: '产品摄影师', kind: '伙伴', stage: '合作中', source: '朋友介绍',
    city: '杭州', contact: '阿光', title: '摄影师', since: '2025-03-01', next_follow: '2026-10-28', next_step: '周三交新品精修图', tags: ['摄影'],
    talks: [{ date: '2026-10-25', channel: '面谈', with: '阿光', summary: '新品产品图拍完，周三（10/28）交精修' }],
  },
  {
    id: 'c_wuyi', name: '武夷岩茶厂', label: '岩茶供应', kind: '伙伴', stage: '合作中', source: '老伙伴',
    city: '福建 · 武夷山', contact: '黄师傅', title: '厂长', since: '2018-03-01', next_follow: null, tags: ['供应商'],
    note: '进货价和账期不记在这里（见知识库“边界”）',
    talks: [{ date: '2026-10-12', channel: '电话', with: '黄师傅', summary: '今年肉桂秋茶到货 60 斤' }],
  },
]

/** 商机：在谈的、签下的、没成的 */
export const DEALS: [id: string, client: string, title: string, stage: string, amount: number | null, close: string][] = [
  ['d_lantuo_cny', 'c_lantuo', '2027 春节员工礼（按中秋 300 份估）', '需求确认', 5.4, '2026-11-30'],
  ['d_hengyan_cny', 'c_hengyan', '春节客户礼 120 份（经典双罐）', '报价中', 2.16, '2026-11-15'],
  ['d_qimu_ny', 'c_qimu', '年会伴手礼 60 份（岩茶 + 盖碗）', '方案中', 2.4, '2026-11-15'],
  ['d_hemu', 'c_hemu', '会员年卡礼 200 份（花草茶礼）', '需求确认', 3.2, '2026-11-20'],
  ['d_kangyu', 'c_kangyu', '年底客户礼（份数未定）', '需求确认', null, '2026-11-30'],
  ['d_qingyan_cny', 'c_qingyan', '2027 春节花草茶礼（复购）', '需求确认', 2.4, '2026-11-30'],
  ['d_lanting', 'c_lanting', '春节员工礼 100 份（经典双罐）', '报价中', 1.8, '2026-11-10'],
  ['d_huiyuan', 'c_huiyuan', '工会春节福利 500 份', '需求确认', 6.0, '2026-12-01'],
  ['d_haorui', 'c_haorui', '年会抽奖礼品 20 份', '需求确认', 0.8, '2026-12-10'],
  ['d_yunfan', 'c_yunfan', '2027 春节员工礼（复购）', '需求确认', 1.92, '2026-11-25'],
  ['d_beichen', 'c_beichen', '2027 春节员工礼', '需求确认', 1.08, '2026-11-25'],
  ['d_nanyu_up', 'c_nanyu', '11 月起客房茶包加量到 2500 袋', '待签约', 0.4, '2026-10-31'],
  ['d_zhaoyue', 'c_zhaoyue', '同事小礼 6 份', '需求确认', 0.11, '2026-10-30'],
  ['d_lantuo_mid', 'c_lantuo', '中秋员工礼 300 份', '已签约', 5.4, '2026-08-20'],
  ['d_jinchuan_mid', 'c_jinchuan', '中秋业主礼 200 份（岩茶木盒）', '已签约', 5.2, '2026-09-05'],
  ['d_zhiyuan_mid', 'c_zhiyuan', '中秋客户礼 30 份', '已签约', 0.54, '2026-09-15'],
  ['d_beichen_mid', 'c_beichen', '中秋员工礼 60 份', '已签约', 1.08, '2026-09-10'],
  ['d_xinghe', 'c_xinghe', '教师节小礼 80 份', '已签约', 0.63, '2026-09-08'],
  ['d_sanmu', 'c_sanmu', '团建下午茶 15 份', '已签约', 0.24, '2026-10-24'],
  ['d_jiahe', 'c_jiahe', '中秋业主礼 300 份', '没成', 7.8, '2026-09-01'],
  ['d_mingshi', 'c_mingshi', '2027 春节员工礼', '没成', 3.6, '2026-10-10'],
]
