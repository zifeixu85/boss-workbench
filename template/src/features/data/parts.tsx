// 数据源与导入模块的小零件：状态词的颜色、近 7 天的小格子和图例、怎么对上的标签、提示块。归属：数据源与导入模块
import { createElement, type ReactNode } from 'react'
import { RotateCcw, SearchX, Sparkles, type LucideIcon } from 'lucide-react'
import { api, useWrite } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { todayStr } from '@/lib/format'
import { cn } from '@/lib/utils'
import { iconOf, mdOf } from './labels'
import type { StripDay } from './types'

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'primary'
/** 本模块的状态词：用 StatusBadge 的 tone 指定颜色，不改公共的对照表 */
const TONE: Record<string, Tone> = {
  正常: 'ok', 没按时更新: 'warn', 读取失败: 'danger', 没数据: 'warn', 停用: 'neutral',
  成功: 'ok', 部分成功: 'warn', 失败: 'danger', 超时: 'warn', 进行中: 'info',
  已对上: 'ok', 拿不准: 'warn', 用不上: 'neutral',
  在用: 'ok', 有效: 'ok', 已撤销: 'neutral', 已清除: 'neutral', 表头变了: 'warn',
  预置: 'neutral', 样例表: 'neutral', 你导的: 'primary',
  新增: 'info', 覆盖: 'warn', 一样: 'neutral', 跳过: 'neutral', 有问题: 'danger', 要核对: 'warn',
  'AI 建议': 'info', 'Codex 建议': 'info', 已确认: 'ok', 未匹配: 'neutral', 忽略: 'neutral', 不导: 'neutral',
}
export function Badge({ value, className, tone }: { value: string; className?: string; tone?: Tone }) {
  return <StatusBadge value={value} tone={tone ?? TONE[value] ?? 'neutral'} className={className} />
}

/** “怎么对上的”小标签：自动的（规则、知识库、常见叫法、名字像）和 Codex、你选的分开显示 */
export function HowChip({ how }: { how: string }) {
  const cls: Record<string, string> = {
    规则: 'border-primary/30 text-primary', 旧规则: 'border-primary/30 text-primary', 知识库: 'border-primary/30 text-primary', 常见叫法: 'border-border text-muted-foreground',
    名字像: 'border-warn/40 text-warn', 没见过: 'border-border text-muted-foreground', Codex: 'border-info/40 bg-info-soft text-info', 你选的: 'border-foreground/25 text-foreground',
  }
  return <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[12px] whitespace-nowrap', cls[how] ?? 'border-border text-muted-foreground')}>{how === 'Codex' && <Sparkles className="size-3" />}{how}</span>
}

const CELL: Record<string, string> = { 成功: 'bg-ok/80', 失败: 'bg-danger', 超时: 'bg-warn', 部分成功: 'bg-warn', 补上了: 'bg-warn', 还没到点: 'border border-dashed border-muted-foreground/40 bg-transparent' }
const cellOf = (s: string | null) => CELL[s ?? ''] ?? 'bg-muted-foreground/15'

/** 近 7 天每天的运行结果：一格一天，颜色之外有悬停提示；size=md 在抽屉里用，下面带日期 */
export function RunStrip({ days, size = 'sm' }: { days: StripDay[]; size?: 'sm' | 'md' }) {
  const label = (d: StripDay) => `${d.date === todayStr() ? '今天' : mdOf(d.date)}：${d.status ?? '没跑'}${d.runs > 1 ? `（${d.runs} 次）` : ''}`
  if (size === 'md') {
    return (
      <div className="flex items-end gap-1.5" aria-label="最近 7 天的运行结果">
        {days.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div className="grid w-9 justify-items-center gap-1">
                <span className={cn('h-5 w-full rounded-[4px]', cellOf(d.status))} />
                <span className="num text-[12px] text-muted-foreground">{d.date === todayStr() ? '今天' : mdOf(d.date)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{label(d)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={days.map(label).join('，')}>
      {days.map((d) => <span key={d.date} title={label(d)} className={cn('h-3.5 w-2 rounded-[2px]', cellOf(d.status))} />)}
    </span>
  )
}

/** 小格子的图例 */
export function StripLegend({ className }: { className?: string }) {
  const items: [string, string][] = [['成功', CELL.成功], ['失败', CELL.失败], ['出过问题（超时、没导全、后来补上）', CELL.超时], ['没跑', 'bg-muted-foreground/15'], ['还没到点', CELL.还没到点]]
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground', className)}>
      {items.map(([t, c]) => <span key={t} className="inline-flex items-center gap-1"><span aria-hidden className={cn('h-3 w-2 rounded-[2px]', c)} />{t}</span>)}
    </span>
  )
}

/** 小提示块（主色浅底 / 警示 / 出错），比 Alert 组件多一个右侧操作位 */
export function Note({ tone = 'info', icon: Icon, title, children, action, className }: { tone?: 'info' | 'warn' | 'danger' | 'ok' | 'muted'; icon?: LucideIcon; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const cls = { info: 'border-primary/20 bg-accent/60', warn: 'border-warn/30 bg-warn-soft/70', danger: 'border-danger/30 bg-danger-soft/70', ok: 'border-ok/30 bg-ok-soft/70', muted: 'border-border bg-surface-2/60' }[tone]
  const ic = { info: 'text-primary', warn: 'text-warn', danger: 'text-danger', ok: 'text-ok', muted: 'text-muted-foreground' }[tone]
  return (
    <div className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3', cls, className)}>
      {Icon && <Icon className={cn('mt-0.5 size-4 shrink-0', ic)} aria-hidden />}
      <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
        {title && <div className="font-medium text-foreground">{title}</div>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  )
}

/** 待办状态的小圆点 + 灰字（“还差 4 列要你点头”这类正常的待办，不用红色） */
export function PendingHint({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'ok' }) {
  return (
    <span className="inline-flex items-start gap-1.5 text-left text-[13px] leading-snug text-muted-foreground">
      <span aria-hidden className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', tone === 'warn' ? 'bg-warn' : tone === 'danger' ? 'bg-danger' : 'bg-ok')} />{children}
    </span>
  )
}

/** 渠道 / 来源的图标（和侧栏一样） */
export function KindIcon({ of, className }: { of: Parameters<typeof iconOf>[0]; className?: string }) {
  return createElement(iconOf(of), { className, 'aria-hidden': true })
}

/** 抽屉里找不到东西（地址栏的 ID 不对、已经删了、彩排后复原过）：说清楚，给一个出口 */
export function GoneNote({ what, hint, onClose }: { what: string; hint?: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <SearchX className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-[14px] font-medium">找不到这个{what}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{hint ?? '链接里的编号不对，或者已经删掉了。'}</p>
      <Button size="sm" variant="outline" className="mt-1" onClick={onClose}>关掉，回到列表</Button>
    </div>
  )
}

/** 一次导了几张表：“5 张表：店铺日报 1 行 · 商品 9 个 · 流量来源 4 个 · 售后 4 单 · 千川推广 3 个计划” */
export function TablesLine({ tables, className }: { tables?: [string, number, string][]; className?: string }) {
  if (!tables?.length) return null
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      <span className="text-foreground/80">{tables.length} 张表：</span>
      {tables.map(([name, n, unit], i) => <span key={name} className="num">{i ? ' · ' : ''}{name} {n} {unit}</span>)}
    </p>
  )
}

/** 放回某个渠道的示例数据（示例清掉了、这个渠道现在没有数时） */
export function RestoreButton({ channel, name, className }: { channel: string; name: string; className?: string }) {
  const restore = useWrite(() => api.post<{ restored: number }>('/data/samples/restore', { channel }), (r) => `放回了${name}的示例数据 ${r.restored} 行`)
  return <Button size="sm" variant="outline" className={className} disabled={restore.isPending} onClick={(e) => { e.stopPropagation(); restore.mutate(undefined) }}><RotateCcw />放回{name}的示例数据</Button>
}
