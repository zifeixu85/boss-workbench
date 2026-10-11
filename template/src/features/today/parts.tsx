// 今日页的小零件：涨跌、一行待办、面板右上角的“去看”链接
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { api, useWrite } from '@/lib/api'
import type { Todo } from '@/lib/types'
import { relDay } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/** 涨跌：红涨绿跌，只说方向（规范：设计令牌与风格.md） */
export function Delta({ value, suffix = '%', className }: { value: number | null | undefined; suffix?: string; className?: string }) {
  if (value === null || value === undefined) return <span className={cn('text-muted-foreground', className)}>—</span>
  return (
    <span className={cn('num whitespace-nowrap', value > 0 && 'text-rise', value < 0 && 'text-fall', className)}>
      {value > 0 ? '▲' : value < 0 ? '▼' : ''}{' '}{Math.abs(value)}{suffix}
    </span>
  )
}

export function GoLink({ to, children }: { to: string; children: ReactNode }) {
  return <Button variant="ghost" size="sm" asChild><Link to={to}>{children}<ArrowRight /></Link></Button>
}

export function TodoLine({ t }: { t: Todo }) {
  const ov = useOverlay()
  const done = useWrite(() => api.patch(`/todos/${t.id}`, { status: '完成' }), `已完成：${t.title}`)
  const overdue = t.due && relDay(t.due).startsWith('已过')
  return (
    <div className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
      <Checkbox className="mt-0.5" aria-label={`完成 ${t.title}`} onCheckedChange={() => done.mutate(undefined)} />
      <button className="min-w-0 flex-1 text-left" onClick={() => ov.openDetail('todo', t.id)}>
        <div className="text-sm leading-snug">{t.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={cn(overdue && 'font-medium text-danger')}>{relDay(t.due)}</span>
          {t.client_name && <span>· {t.client_name}</span>}
          {t.project_name && !t.client_name && <span>· {t.project_name}</span>}
          {t.status !== '待办' && <StatusBadge value={t.status} />}
          {t.priority !== '普通' && <StatusBadge value={t.priority} />}
        </div>
      </button>
    </div>
  )
}
