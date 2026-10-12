// 设置页的“提醒”：总开关、这个浏览器的通知、每天看汇总的时间、免打扰时段、演示时弹不弹系统通知、发一条测试提醒。
// 存在 settings 表（remind_on、notify_at、quiet_start、quiet_end、remind_demo_system），规则见 server/reminders/。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowRight, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { RemindSettings, Settings } from '@/lib/types'
import { api, useWrite } from '@/lib/api'
import { TimeInput } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { NotifyControl } from '@/features/reminders/NotifyControl'

const DEFAULTS: RemindSettings = { on: true, notify_at: '', quiet_start: '22:00', quiet_end: '08:00', demo_system: false }
type Patch = Partial<Record<'remind_on' | 'notify_at' | 'quiet_start' | 'quiet_end' | 'remind_demo_system', string>>

function Line({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {desc && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function ReminderSettings({ settings }: { settings: Settings }) {
  const r = settings.reminders ?? DEFAULTS
  const save = useWrite((b: Patch) => api.patch<Settings>('/settings', b), '提醒设置已保存')
  const test = useWrite(() => api.post<{ via: string; how: string; ok: boolean; error: string | null }>('/reminders/test', {}))
  const [at, setAt] = useState<string | null>(r.notify_at || null)
  const [qs, setQs] = useState<string | null>(r.quiet_start || '22:00')
  const [qe, setQe] = useState<string | null>(r.quiet_end || '08:00')
  const quietOn = !!(r.quiet_start && r.quiet_end)
  const ref = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  useEffect(() => { if (loc.hash === '#reminders') ref.current?.scrollIntoView({ block: 'start' }) }, [loc.hash])

  const sendTest = () => test.mutate(undefined, {
    onSuccess: (x) => x.ok
      ? toast.success(`测试提醒已发出（${x.how}）`, { description: x.via === '系统通知' ? '没看到的话：Mac 到 系统设置 → 通知 → 脚本编辑器 打开“允许通知”；Windows 到 设置 → 系统 → 通知 打开 Windows PowerShell 的通知。' : '看屏幕右上角（Windows 是右下角）。' })
      : toast.error('测试提醒没弹出来', { description: x.error ?? x.how }),
  })

  return (
    <div ref={ref} id="reminders" className="scroll-mt-20 divide-y">
      <Line title="到点提醒" desc="关掉以后照样记在“提醒”页里，只是不弹。">
        <Switch checked={r.on} aria-label="到点提醒" onCheckedChange={(c) => save.mutate({ remind_on: c ? '1' : '0' })} />
        <span className="text-sm text-muted-foreground">{r.on ? '开着' : '关着'}</span>
      </Line>
      <Line title="这个浏览器" desc="页面开着时用浏览器通知，点通知直接打开对应页面。">
        <NotifyControl />
      </Line>
      <Line title="每天看汇总" desc={<>每天这个时间提醒你看今天的汇总（建工作台时按你说的时间设好了）。空着：工作台开了 5 分钟后提醒一次。</>}>
        <TimeInput label="每天看汇总的时间" value={at} onChange={setAt} />
        <Button size="sm" variant="outline" disabled={(at ?? '') === r.notify_at || save.isPending} onClick={() => save.mutate({ notify_at: at ?? '' })}>保存</Button>
      </Line>
      <Line title="免打扰" desc="这段时间不弹。到早上还有效的（比如 8:30 到期的待办）免打扰一结束就弹，过时的只记在“提醒”页。可以跨午夜（22:00 到 08:00）。">
        <Switch checked={quietOn} aria-label="免打扰" onCheckedChange={(c) => save.mutate(c ? { quiet_start: qs ?? '22:00', quiet_end: qe ?? '08:00' } : { quiet_start: '', quiet_end: '' })} />
        {quietOn && (
          <>
            <TimeInput label="免打扰从" value={qs} onChange={setQs} />
            <span className="text-sm text-muted-foreground">到</span>
            <TimeInput label="免打扰到" value={qe} onChange={setQe} />
            <Button size="sm" variant="outline" disabled={!qs || !qe || (qs === r.quiet_start && qe === r.quiet_end) || save.isPending} onClick={() => save.mutate({ quiet_start: qs!, quiet_end: qe! })}>保存</Button>
          </>
        )}
      </Line>
      {settings.demo && (
        <Line title="演示时也弹电脑系统通知" desc="现在是演示日期。默认只记、不弹电脑系统通知（免得演示时乱弹）；点过“开启提醒”的页面照样有浏览器通知。">
          <Switch checked={r.demo_system} aria-label="演示时也弹电脑系统通知" onCheckedChange={(c) => save.mutate({ remind_demo_system: c ? '1' : '0' })} />
        </Line>
      )}
      <Line title="试一下" desc="页面开着、开了提醒时用浏览器通知；不然用电脑系统通知。Mac 的系统通知显示为“脚本编辑器”发的，第一次要在 系统设置 → 通知 → 脚本编辑器 里允许。">
        <Button size="sm" variant="outline" disabled={test.isPending} onClick={sendTest}><Send />发一条测试提醒</Button>
        <Button size="sm" variant="ghost" asChild><Link to="/reminders">最近的提醒<ArrowRight /></Link></Button>
      </Line>
    </div>
  )
}
