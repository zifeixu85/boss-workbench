// 状态标签：同一个词在全站同一个颜色；颜色之外一定有文字
import { cn } from '@/lib/utils'

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'primary'

const TONE: Record<string, Tone> = {
  // 待办
  待办: 'neutral', 进行中: 'info', 等别人: 'warn', 完成: 'ok', 取消: 'neutral',
  紧急: 'danger', 重要: 'warn', 普通: 'neutral',
  // 客户（茶社用词）/ 商机
  新线索: 'neutral', 需求确认: 'info', 方案中: 'info', 报价中: 'primary', 待签约: 'warn', 交付中: 'primary', 售后: 'warn',
  待复购: 'primary', 合作中: 'ok', 维护中: 'ok', 暂停: 'neutral', 流失: 'neutral', 已签约: 'ok', 没成: 'neutral', 大客户: 'primary',
  // 项目和里程碑
  筹备: 'neutral', 收尾: 'warn', 已完成: 'ok', 未开始: 'neutral', 延期: 'danger',
  // 钱
  已收清: 'ok', 部分收款: 'info', 逾期: 'danger', '7天内到期': 'warn', 未到期: 'neutral',
  // 经营：库存和异常
  告急: 'danger', 偏紧: 'warn', 正常: 'ok', 待上线: 'neutral',
  // 小红书：排期、草稿、选题
  已发布: 'ok', 待发布: 'warn', 草稿: 'warn', 选题: 'neutral', 待定: 'neutral', 写作中: 'info', 已定稿: 'ok',
  新: 'primary', 已采纳: 'ok', 先放一放: 'neutral', 已放弃: 'neutral',
  // 数据源和导入
  超时: 'warn', 失败: 'danger', 成功: 'ok', 部分成功: 'warn', 停用: 'neutral', 'AI 建议': 'info', 已确认: 'ok', 未匹配: 'danger', 忽略: 'neutral',
  // 风险
  高: 'danger', 中: 'warn',
}

const CLS: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  primary: 'bg-accent text-accent-foreground',
  neutral: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ value, tone, className }: { value: string; tone?: Tone; className?: string }) {
  const t = tone ?? TONE[value] ?? 'neutral'
  return <span className={cn('inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11.5px] font-medium whitespace-nowrap', CLS[t], className)}>{value}</span>
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  const bg = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info', primary: 'bg-primary', neutral: 'bg-muted-foreground/50' }[tone]
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', bg)} />
}

/** 日程类型的颜色：日历和列表里共用 */
export const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  会面: { bg: 'var(--accent)', border: 'var(--primary)', text: 'var(--accent-foreground)' },
  品鉴: { bg: 'var(--warn-soft)', border: 'var(--warn)', text: 'var(--warn)' },
  送货: { bg: 'var(--info-soft)', border: 'var(--info)', text: 'var(--info)' },
  内部: { bg: 'var(--muted)', border: 'var(--muted-foreground)', text: 'var(--foreground)' },
  个人: { bg: 'var(--danger-soft)', border: 'var(--danger)', text: 'var(--danger)' },
}
