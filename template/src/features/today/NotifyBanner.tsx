// 今日页顶上的“开启提醒”：浏览器还没问过通知权限时才出现；点“以后再说”就不再显示（设置页、提醒页还能开）。
import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { dismissLater, laterDismissed, useEnableNotify, useNotifyState } from '@/lib/reminders'
import { Button } from '@/components/ui/button'

export function NotifyBanner() {
  const s = useNotifyState()
  const enable = useEnableNotify()
  const [later, setLater] = useState(laterDismissed)
  if (s !== 'default' || later) return null
  return (
    <section aria-label="开启提醒" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-primary/25 bg-accent/60 px-5 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><BellRing className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">开启提醒，到点叫你</div>
        <p className="mt-0.5 text-[13px] text-accent-foreground">待办快到期、日程快开始、客户该跟进、数据出问题时，在屏幕右上角弹出来。点“开启提醒”，浏览器问你时点“允许”。</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={enable}><BellRing />开启提醒</Button>
        <Button variant="ghost" onClick={() => { dismissLater(); setLater(true) }}>以后再说</Button>
      </div>
    </section>
  )
}
