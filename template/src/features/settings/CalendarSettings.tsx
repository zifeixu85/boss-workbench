// 设置 → 日历来源（2026-10-27）：接的是哪个日历、同步得怎么样、换来源。只读同步，工作台从不往日历里写。
// 服务端 server/calendar/；订阅链接只存在本机，这里只显示网站名。
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { CalendarSync, CircleAlert, CircleCheck, RefreshCw, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { syncTime, useCalendarSource, useCalendarStatus, useCalendarSync, useOpenPrivacy, type CalendarSourceId } from '@/features/calendar/sync'

const CHOICES: { id: CalendarSourceId; label: string; desc: string }[] = [
  { id: 'mac', label: 'Mac 日历', desc: '步骤最少：Mac 自带的“日历”里看得到的（包括登录在上面的 iCloud、谷歌、Outlook、企业微信日历）都会同步过来。第一次会弹系统窗口，点“允许完全访问”。' },
  { id: 'lark', label: '飞书日历', desc: '读你飞书的主日历。要先装好飞书命令行工具 lark-cli 并登录（在 Codex 里说“接飞书日历”，它会带你做）。' },
  { id: 'ics', label: '订阅链接', desc: '谷歌、苹果 iCloud、Outlook、飞书都能复制一个“私密地址”（以 https:// 或 webcal:// 开头），贴在下面。链接等于钥匙，只存在这台电脑上。' },
  { id: 'off', label: '不接', desc: '日程页只显示在工作台里建的。已经同步来的、今天以后的日程会拿掉，过去的留着。' },
]

export function CalendarSettings() {
  const { data: s } = useCalendarStatus()
  const sync = useCalendarSync()
  const change = useCalendarSource()
  const privacy = useOpenPrivacy()
  const [pick, setPick] = useState<CalendarSourceId | null>(null)
  const [url, setUrl] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  const loaded = !!s
  useEffect(() => { if (loaded && loc.hash === '#calendar') ref.current?.scrollIntoView({ block: 'start' }) }, [loc.hash, loaded])
  if (!s) return <p className="text-sm text-muted-foreground">读取日历来源…</p>

  const chosen = pick ?? s.source
  const info = CHOICES.find((c) => c.id === chosen)!
  const macOff = s.platform !== 'mac'
  const last = syncTime(s.lastSyncAt)
  const busy = change.isPending || sync.isPending
  const canApply = chosen !== s.source || (chosen === 'ics' && url.trim() !== '')
  const apply = () => change.mutate({ source: chosen, ...(chosen === 'ics' && url.trim() ? { url: url.trim() } : {}) }, { onSettled: () => { setPick(null); setUrl('') } })

  return (
    <div ref={ref} id="calendar" className="grid scroll-mt-20 gap-4">
      <div className="flex items-start gap-3">
        {s.source === 'off' ? <CalendarSync className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          : s.ok === false ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          : <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {s.source === 'off' ? '还没接日历' : `现在接的是：${s.sourceName}`}
            {s.source === 'ics' && s.icsLabel && <span className="font-normal text-muted-foreground">（{s.icsLabel}）</span>}
          </div>
          {s.source !== 'off' && (
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              {last ? `最后同步 ${last}，未来两周 ${s.count} 条` : '还没同步过'}
              {s.ok === false && <span className="block text-warn">这次没同步成：{s.message}{last ? '（上次同步的照常显示）' : ''}</span>}
            </div>
          )}
        </div>
        {s.source !== 'off' && (
          <Button size="sm" variant="outline" disabled={busy || s.syncing} onClick={() => sync.mutate(undefined)}>
            <RefreshCw className={sync.isPending || s.syncing ? 'motion-safe:animate-spin' : ''} />刷新
          </Button>
        )}
      </div>
      {s.needsPrivacy && s.platform === 'mac' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px]">
          <span className="min-w-0 flex-1">到 系统设置 → 隐私与安全性 → 日历，把「老板工作台 · 日历」打开（选“完全访问”），再点上面的“刷新”。</span>
          <Button size="sm" variant="outline" disabled={privacy.isPending} onClick={() => privacy.mutate(undefined)}><Settings2 />打开系统设置</Button>
        </div>
      )}
      <div className="grid gap-3 border-t pt-4">
        <div className="text-sm font-medium">从哪里读</div>
        <ToggleGroup type="single" variant="outline" value={chosen} onValueChange={(v) => v && setPick(v as CalendarSourceId)} className="flex-wrap justify-start" aria-label="日历来源">
          {CHOICES.map((c) => <ToggleGroupItem key={c.id} value={c.id} disabled={c.id === 'mac' && macOff} className="px-3">{c.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{chosen === 'mac' && macOff ? '这台电脑不是 Mac，用不了 Mac 日历：换成飞书日历或订阅链接。' : info.desc}</p>
        {chosen === 'ics' && (
          <Input aria-label="订阅链接" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder={s.icsLabel ? `已存：${s.icsLabel}，要换就贴新的` : 'https://… 或 webcal://…'} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={!canApply || busy || (chosen === 'mac' && macOff) || (chosen === 'ics' && !url.trim() && !s.icsLabel)} onClick={apply}>
            {change.isPending ? '连接中…' : chosen === 'off' ? '不接日历' : chosen === s.source ? '换成这个链接' : `连上${info.label}`}
          </Button>
          {change.isPending && chosen === 'mac' && <span className="text-[13px] text-muted-foreground">如果弹出“「老板工作台 · 日历」想访问你的日历”，点“允许完全访问”（最多等 3 分钟）</span>}
        </div>
        <p className="text-xs text-muted-foreground">只读：工作台只把未来两周的日程拿过来看，每 10 分钟同步一次，从不改你的日历。同步来的日程在工作台里不能改，到日历里改。</p>
      </div>
    </div>
  )
}
