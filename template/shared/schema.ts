// 前后端共用的字段定义。网页表单、本地接口、Codex 命令行都按这里校验。
import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, '时间格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm')
/** 钟点 HH:mm（24 小时）；“8:30”自动补成“08:30”。提醒的到期时间、看汇总的时间、免打扰时段都用它 */
export const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const padHm = (v: unknown) => (typeof v === 'string' && /^\d:\d\d$/.test(v.trim()) ? `0${v.trim()}` : typeof v === 'string' ? v.trim() : v)
const hm = z.preprocess(padHm, z.string().regex(HM_RE, '时间写成 15:30 这样（24 小时）'))
/** 可以写空：空着表示“不设” */
const hmOrEmpty = z.preprocess(padHm, z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, '时间写成 08:30 这样（24 小时），空着表示不设'))
const optText = z.string().trim().max(2000).optional().nullable()
const money = z.number().min(0).max(100000)

// 客户阶段用词（示例是茶社）：企业茶礼按“线索 → 方案报价 → 交付售后 → 待复购”走；渠道伙伴是“合作中”，门店老茶客是“维护中”
export const CLIENT_STAGES = ['新线索', '需求确认', '方案中', '报价中', '待签约', '交付中', '售后', '待复购', '合作中', '维护中', '暂停', '流失'] as const
export const DEAL_STAGES = ['需求确认', '方案中', '报价中', '待签约', '已签约', '没成'] as const
export const PROJECT_STAGES = ['筹备', '进行中', '收尾', '已完成', '暂停'] as const
export const MILESTONE_STATUS = ['未开始', '进行中', '完成', '延期'] as const
export const EVENT_KINDS = ['会面', '品鉴', '送货', '内部', '个人'] as const
export const TODO_STATUS = ['待办', '进行中', '等别人', '完成', '取消'] as const
export const TODO_PRIORITY = ['紧急', '重要', '普通'] as const
export const CHANNELS = ['微信', '电话', '面谈', '到店', '邮件', '其他'] as const
export const LEDGER_CATEGORIES = { 收入: ['客户回款', '渠道货款', '门店收入', '平台结算', '其他收入'], 支出: ['进货', '包装', '物流', '推广', '工资', '房租', '其他支出'] } as const

export const clientInput = z.object({
  name: z.string().trim().min(1, '请填写称呼').max(40),
  label: optText,
  kind: z.enum(['客户', '伙伴']).default('客户'),
  stage: z.enum(CLIENT_STAGES).default('新线索'),
  source: optText, city: optText, phone: optText, wechat: optText,
  budget: money.optional().nullable(),
  next_follow: date.optional().nullable(),
  kb_path: optText,
  tags: z.array(z.string().max(20)).max(10).default([]),
  note: optText,
})
export type ClientInput = z.infer<typeof clientInput>

export const interactionInput = z.object({
  client_id: z.string().min(1),
  date,
  channel: z.enum(CHANNELS).default('微信'),
  summary: z.string().trim().min(1, '请写下这次沟通的内容').max(2000),
  next_step: optText,
  next_follow: date.optional().nullable(),
})
export type InteractionInput = z.infer<typeof interactionInput>

export const dealInput = z.object({
  client_id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  stage: z.enum(DEAL_STAGES).default('需求确认'),
  amount: money.optional().nullable(),
  expected_close: date.optional().nullable(),
})

export const projectInput = z.object({
  name: z.string().trim().min(1).max(80),
  client_id: z.string().optional().nullable(),
  stage: z.enum(PROJECT_STAGES).default('筹备'),
  contract: money.optional().nullable(),
  next_step: optText, waiting_on: optText,
  due: date.optional().nullable(),
  risk: optText,
  owner: optText,
  goal: optText,
  budget: money.optional().nullable(),
  kb_path: optText, // 项目说明在知识库里的位置，如 06-项目/门店改造.md（集成 10-12 加：搭建时从知识库导入项目要记下）
})

export const eventInput = z.object({
  title: z.string().trim().min(1, '请填写标题').max(80),
  start: dateTime,
  end: dateTime.optional().nullable(),
  all_day: z.boolean().default(false),
  kind: z.enum(EVENT_KINDS).default('会面'),
  location: optText,
  client_id: z.string().optional().nullable(),
  project_id: z.string().optional().nullable(),
  note: optText,
})
export type EventInput = z.infer<typeof eventInput>

export const todoInput = z.object({
  title: z.string().trim().min(1, '请填写要做的事').max(120),
  status: z.enum(TODO_STATUS).default('待办'),
  priority: z.enum(TODO_PRIORITY).default('普通'),
  due: date.optional().nullable(),
  /** 到期时间（可不填）。填了的，到期前 1 小时提醒；要先有截止日期 */
  due_time: hm.optional().nullable(),
  client_id: z.string().optional().nullable(),
  project_id: z.string().optional().nullable(),
  note: optText,
})
export type TodoInput = z.infer<typeof todoInput>

export const receivableInput = z.object({
  project_id: z.string().optional().nullable(),
  client_id: z.string().optional().nullable(),
  milestone: z.string().trim().min(1).max(20),
  amount: money.positive('金额要大于 0'),
  due: date,
  note: optText,
})

export const collectInput = z.object({
  receivable_id: z.string().min(1),
  amount: money.positive('金额要大于 0'),
  date,
  note: optText,
})

export const ledgerInput = z.object({
  date,
  direction: z.enum(['收入', '支出']),
  category: z.string().trim().min(1).max(20),
  amount: money.positive('金额要大于 0'),
  client_id: z.string().optional().nullable(),
  project_id: z.string().optional().nullable(),
  note: optText,
})

export const inboxInput = z.object({ text: z.string().trim().min(1).max(2000), source: z.string().max(20).default('网页') })

export const THEMES = ['jade', 'wood', 'navy', 'mono', 'night'] as const
export const settingsInput = z.object({
  nav_mode: z.enum(['simple', 'complex', 'top']).optional(),
  theme: z.enum(THEMES).optional(),
  mobile_nav: z.enum(['tabs', 'drawer']).optional(),
  owner: z.string().trim().max(20).optional(),
  business: z.string().trim().max(40).optional(),
  /** 小红书账号名（手机预览、给 Codex 的提示词用）；空着就用店名 */
  xhs_name: z.string().trim().max(30).optional(),
  // 提醒（2026-10-12 加，见 server/reminders/）：总开关、每天看汇总的时间、免打扰时段、演示模式下弹不弹系统通知
  remind_on: z.enum(['0', '1']).optional(),
  /** 每天几点提醒看汇总（确认页第 4 步老板说的时间）；空着 = 开机 5 分钟后提醒一次 */
  notify_at: hmOrEmpty.optional(),
  /** 免打扰时段，两个都空着 = 不设；可以跨午夜（22:00 到 08:00） */
  quiet_start: hmOrEmpty.optional(),
  quiet_end: hmOrEmpty.optional(),
  remind_demo_system: z.enum(['0', '1']).optional(),
})


// 统一的接口返回
export type ApiOk<T> = { ok: true; data: T }
export type ApiErr = { ok: false; error: string; issues?: { path: string; message: string }[] }
