// 日程页顶上的一行：接的是哪个日历、最后同步几点、刷新。没接日历时给一个去设置页的入口
import { Link } from 'react-router'
import { CalendarSync, CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { syncTime, useCalendarStatus, useCalendarSync } from './sync'

export function SyncBar() {
  const { data: s } = useCalendarStatus()
  const sync = useCalendarSync()
  if (!s) return null
  if (s.source === 'off') {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <CalendarSync className="size-3.5" aria-hidden />
        还没接你自己的日历（Mac 日历、飞书、谷歌都行），接上以后未来两周的日程会自动出现在这里。
        <Link to="/settings#calendar" className="text-primary hover:underline">去接日历</Link>
      </p>
    )
  }
  const last = syncTime(s.lastSyncAt)
  const busy = sync.isPending || s.syncing
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-card px-2 font-medium text-foreground">
        <CalendarSync className="size-3.5" aria-hidden />{s.sourceName}
      </span>
      <span className="num">{last ? `最后同步 ${last}` : '还没同步过'}{s.ok && last ? ` · 未来两周 ${s.count} 条` : ''}</span>
      {s.ok === false && (
        <span className="inline-flex min-w-0 items-center gap-1 text-warn">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">这次没同步成{last ? '，先显示上次的' : ''}：{s.message}</span>
          <Link to="/settings#calendar" className="shrink-0 text-primary hover:underline">去看看</Link>
        </span>
      )}
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy} onClick={() => sync.mutate(undefined)}>
        <RefreshCw className={busy ? 'motion-safe:animate-spin' : ''} />{busy ? '同步中…' : '刷新'}
      </Button>
    </div>
  )
}
