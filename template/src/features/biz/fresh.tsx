// 数据新鲜度：几点更新的、从哪来的、哪个来源没按时到。没到的不算成 0，提示“数据可能不全”，并链到数据源页。
// 手机上先缩成一行（“5 个渠道都到了 · 最晚 07:44”），点开再看每个渠道。
import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronDown, Clock3 } from 'lucide-react'
import { Dot } from '@/components/status'
import { addDays, md, shortDate, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { hhmm } from './fmt'
import type { ChannelFresh, Freshness, ImportRun } from './types'

const SHORT: Record<string, string> = { douyin: '抖店', tmall: '天猫', xhs: '小红书店', wechat: '视频号', store: '门店' }

function when(f: ChannelFresh, today: string) {
  if (!f.last_ok_at) return '没导过'
  return f.last_ok_at.slice(0, 10) === today ? hhmm(f.last_ok_at) : `昨晚 ${hhmm(f.last_ok_at)}`
}

export function FreshnessBar({ f }: { f: Freshness }) {
  const [open, setOpen] = useState(false)
  const late = f.late.length
  const summary = late ? `${late} 个渠道没按时到，数可能不全` : `${f.channels.length} 个渠道都到了${f.last_import_at ? ` · 最晚 ${hhmm(f.last_import_at)}` : ''}`
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-2.5 text-[13px] shadow-paper', late && 'border-warn/50 bg-warn-soft/40')}>
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="flex w-full items-center gap-2 text-left md:hidden">
        <Clock3 className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-medium whitespace-nowrap">截至 {f.data_through ? md(f.data_through) : '—'}</span>
        <span className={cn('min-w-0 flex-1 truncate text-xs', late ? 'text-warn' : 'text-muted-foreground')}>{summary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <div className={cn('flex-wrap items-center gap-x-4 gap-y-2 md:flex', open ? 'mt-2 flex' : 'hidden')}>
        <span className="hidden items-center gap-1.5 font-medium md:flex">
          <Clock3 className="size-4 text-primary" aria-hidden />
          数据截至 {f.data_through ? `${shortDate(f.data_through)} ${weekday(f.data_through)}` : '—'}
        </span>
        <ul className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="各渠道数据几点进来的">
          {f.channels.map((c) => (
            <li key={c.channel_id}>
              <Link to={c.source_id ? `/sources?source=${c.source_id}` : '/sources'} title={`${c.source_name ?? '未登记数据源'} · ${c.schedule ?? ''}${c.reason ? ` · ${c.reason}` : ''}`}
                className={cn('flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-0.5 text-xs whitespace-nowrap hover:border-primary/50', c.late && 'border-warn/60 bg-warn-soft text-warn')}>
                <Dot tone={c.late ? 'warn' : 'ok'} />{SHORT[c.channel_id] ?? c.channel_name}<span className="num text-muted-foreground">{when(c, f.today)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {f.report_source && <span className="text-xs whitespace-nowrap text-muted-foreground">经营早报 {hhmm(f.report_source.last_ok_at)} 写好</span>}
        {late > 0 && <span className="text-xs font-medium text-warn">{f.late.map((c) => `${SHORT[c.channel_id] ?? c.channel_name}：${c.reason}`).join('；')}。这几个渠道的数可能不全，不算成 0。</span>}
        <Link to="/sources" className="ml-auto flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground hover:text-primary">数据源<ArrowRight className="size-3.5" /></Link>
      </div>
    </div>
  )
}

/** 渠道页：这个渠道的数从哪来、今早几点进来、导了几行 */
export function ChannelFreshBar({ f, run, today }: { f: ChannelFresh | null; run: ImportRun | undefined; today: string }) {
  if (!f) return null
  const day = run ? (run.started_at.slice(0, 10) === today ? '今早' : run.started_at.slice(0, 10) === addDays(today, -1) && Number(run.started_at.slice(11, 13)) >= 18 ? '昨晚' : md(run.started_at)) : ''
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-card px-4 py-2.5 text-[13px] shadow-paper', f.late && 'border-warn/50 bg-warn-soft/40')}>
      <span className="flex items-center gap-1.5 font-medium whitespace-nowrap"><Clock3 className="size-4 text-primary" aria-hidden />数据截至 {f.data_through ? `${shortDate(f.data_through)} ${weekday(f.data_through)}` : '—'}</span>
      <span className="min-w-0 text-muted-foreground">来源：<span className="text-foreground">{f.source_name ?? '未登记'}</span>{f.owner ? ` · ${f.owner}导` : ''}</span>
      {run && <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground"><Dot tone={run.status === '成功' ? 'ok' : 'warn'} />
        {day} {hhmm(run.started_at)} {run.status === '成功' ? `进来 ${run.rows_ok ?? '—'} 行` : `导入${run.status}`}</span>}
      {f.late && <span className="text-xs font-medium text-warn">{f.reason}，数据可能不全</span>}
      <Link to={f.source_id ? `/sources?source=${f.source_id}` : '/sources'} className="ml-auto flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground hover:text-primary">数据源<ArrowRight className="size-3.5" /></Link>
    </div>
  )
}
