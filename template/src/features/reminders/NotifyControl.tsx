// “开启提醒”按钮和这个浏览器的通知状态：今日页横幅、设置页、提醒页共用。
// 点了才申请通知权限（Safari 只认点击里直接申请的）。
import { BellOff, BellRing, Check } from 'lucide-react'
import { toast } from 'sonner'
import { deniedHelp, disableNotify, STATE_TEXT, useEnableNotify, useNotifyState } from '@/lib/reminders'
import { Button } from '@/components/ui/button'

/** 一行：状态 + 按钮 */
export function NotifyControl({ compact }: { compact?: boolean }) {
  const s = useNotifyState()
  const enable = useEnableNotify()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {s === 'granted' ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ok"><Check className="size-4" aria-hidden />浏览器提醒已开启</span>
          {!compact && <Button size="sm" variant="ghost" onClick={() => { disableNotify(); toast('这个浏览器里先不弹了', { description: '页面关着时照样有电脑系统通知。' }) }}><BellOff />这个浏览器先不弹</Button>}
        </>
      ) : s === 'denied' ? (
        <span className="text-sm text-warn">浏览器拒绝了通知：{deniedHelp()}</span>
      ) : s === 'unsupported' ? (
        <span className="text-sm text-muted-foreground">{STATE_TEXT.unsupported}</span>
      ) : (
        <Button size={compact ? 'sm' : 'default'} onClick={enable}><BellRing />开启提醒</Button>
      )}
      {!compact && s !== 'granted' && s !== 'denied' && s !== 'unsupported' && <span className="text-[13px] text-muted-foreground">{STATE_TEXT[s]}</span>}
    </div>
  )
}
