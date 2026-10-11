// 大客户模块的写入校验（网页接口和命令行共用）。归属：大客户模块
// 第二轮：日期要是真实存在的日子（2026-13-40 不收）；阶段写错给中文提示（原来报英文 Invalid option）。
import { z } from 'zod'
import { CHANNELS, CLIENT_STAGES } from '../../../shared/schema.ts'

/** 真实存在的日子：格式对、月份 1—12、这个月真有这一天 */
export function isRealDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d))
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d
}
const date = z.string().trim().refine(isRealDate, '日期要写成 2026-11-03 这样，而且是真有的一天')
const text = (max = 500) => z.string().trim().max(max)
const reason = z.string({ error: '写一句为什么改' }).trim().min(2, '写一句为什么改（至少两个字）').max(200)
const stage = z.enum(CLIENT_STAGES, { error: `阶段只能是：${CLIENT_STAGES.join('、')}` })

export const stageInput = z.object({ stage, reason })
export const followInput = z.object({
  next_follow: date.nullable(),
  next_step: text(200).optional().nullable(),
  reason: text(200).optional().nullable(),
})
export const promiseUpdate = z.object({
  status: z.enum(['待兑现', '已兑现', '取消']).optional(),
  due: date.nullable().optional(),
  text: text(300).min(1).optional(),
  note: text(300).optional().nullable(),
  reason,
})
export const promiseInput = z.object({
  client_id: z.string().min(1),
  text: text(300).min(1, '写清答应了什么'),
  due: date.nullable().optional(),
  who: text(20).default('林总'),
  to_whom: text(40).optional().nullable(),
})
/** 标黄的答应林总怎么定：这次算例外（写原因），或者规则该改了（预览后追加进知识库的待确认发现） */
export const decisionInput = z.object({
  decision: z.enum(['例外', '改规则'], { error: '选“这次算例外”还是“规则该改了”' }),
  note: z.string({ error: '写一句原因' }).trim().min(2, '写一句原因（至少两个字）').max(300),
})

export const CARE_STATUS = ['建议', '已安排', '已送出', '不做'] as const
export const careInput = z.object({
  client_id: z.string().min(1),
  occasion: text(40).min(1, '写清是什么日子，比如“立冬问候”'),
  date: date.nullable().optional(),
  gift: text(200).optional().nullable(),
  message: text(1000).optional().nullable(),
  status: z.enum(CARE_STATUS).default('建议'),
  author: text(80).optional().nullable(),
  note: text(300).optional().nullable(),
})
export const careUpdate = z.object({
  status: z.enum(CARE_STATUS).optional(),
  gift: text(200).optional().nullable(),
  message: text(1000).optional().nullable(),
})
export const careDraftInput = z.object({ client_id: z.string().min(1), occasion: text(40).min(1), date: date.nullable().optional() })

export const extractStart = z.object({
  source_path: z.string().trim().optional().nullable(),
  text: z.string().trim().max(20000).optional().nullable(),
  client_id: z.string().optional().nullable(),
}).refine((x) => !!(x.source_path || x.text), { message: '选一份材料，或者粘贴聊天、纪要' })
  // 第三轮：粘贴的太短（“短”“好的”）就不白跑一次 Codex
  .refine((x) => !!x.source_path || (x.text ?? '').replace(/\s/g, '').length >= 20, { message: '粘贴的文字太短了（至少 20 个字）：写清谁说了什么、哪天说的' })

/** 确认写入：网页上林总看过、改过的提取结果 */
export const extractConfirm = z.object({
  client_id: z.string().min(1, '先选是哪位客户'),
  date,
  channel: z.enum(CHANNELS),
  with_whom: text(40).optional().nullable(),
  summary: text(600).min(1, '写一句说了什么'),
  their_status: text(300).optional().nullable(),
  signals: text(300).optional().nullable(),
  concerns: text(300).optional().nullable(),
  promises: z.array(z.object({
    text: text(300).min(1), due: date.nullable().optional(), who: text(20).default('林总'), to_whom: text(40).optional().nullable(), conflict: text(400).optional().nullable(),
    decision: z.enum(['例外', '改规则']).optional().nullable(), decision_note: text(300).optional().nullable(),
  })).max(10).default([]),
  todos: z.array(z.object({ title: text(120).min(1), due: date.nullable().optional() })).max(10).default([]),
  next_follow: date.nullable().optional(),
  next_step: text(200).optional().nullable(),
  traits: z.array(z.object({ kind: z.enum(['口味', '包装', '送礼对象', '禁忌', '顾虑', '习惯']), text: text(200).min(1) })).max(10).default([]),
  dates: z.array(z.object({ date: z.string().regex(/^(\d{4}|-)-\d{2}-\d{2}$/, '日期写 2026-11-12，每年重复的写 --11-12'), label: text(40).min(1), kind: z.enum(['生日', '纪念日', '节日', '公司节点']), who: text(20).optional().nullable() })).max(5).default([]),
  /** 商机金额要不要改（林总勾了才改）：改成谈过的金额，写清依据 */
  deal: z.object({ id: z.string().min(1), amount: z.number().positive().max(999), title: text(80).optional().nullable(), basis: text(200).optional().nullable() }).optional().nullable(),
  kb_append: z.boolean().default(false),
  kb_line: text(1000).optional().nullable(),
  /** 这份新材料让之前记着的事不用做了：勾上的在确认写入时一起关掉（撤销时一起恢复；第三轮） */
  close_promises: z.array(z.string().min(1)).max(20).default([]),
  close_todos: z.array(z.string().min(1)).max(20).default([]),
  skip_care: z.array(z.string().min(1)).max(20).default([]),
})
export type ExtractConfirm = z.infer<typeof extractConfirm>
