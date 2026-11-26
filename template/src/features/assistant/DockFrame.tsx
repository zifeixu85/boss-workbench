// 对话栏的外框（2026-11-26 照 A梦 自用工作台的对话框）：头部左边历史 / 返回，中间对话名，右边新对话、钉住 / 浮着、收起。
// 钉住按钮的名字固定是“钉在右侧”，按没按下只用 aria-pressed 说（名字跟着变，读屏会读成“不钉在右侧，已按下”）。
import { createContext, useContext } from 'react'
import { PanelRightClose, Pin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DockLayout } from './dock-layout'

export interface DockFrame { layout: DockLayout; pinned: boolean; pinnable: boolean; togglePin: () => void; close: () => void }
export const DockFrameContext = createContext<DockFrame | null>(null)

export function DockHeader({ title, sub, left, actions }: { title: string; sub?: string; left?: React.ReactNode; actions?: React.ReactNode }) {
  const frame = useContext(DockFrameContext)
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-0.5 border-b px-2 py-1.5">
      {left}
      <div className="min-w-0 flex-1 px-1.5">
        <h2 className="truncate text-[14px] leading-5 font-semibold" title={title}>{title}</h2>
        {sub && <p className="truncate text-xs leading-4 text-muted-foreground" title={sub}>{sub}</p>}
      </div>
      {actions}
      {frame?.pinnable && (
        <Tip label={frame.pinned ? '改成浮在页面上（不挤页面）' : '钉在右侧（把页面往左挤，不挡内容）'}>
          <Button variant={frame.pinned ? 'secondary' : 'ghost'} size="icon-sm" onClick={frame.togglePin} aria-pressed={frame.pinned} aria-label="钉在右侧" className={frame.pinned ? 'text-primary' : undefined}><Pin /></Button>
        </Tip>
      )}
      {frame && (
        <Tip label={`收起（⌘J${frame.layout === 'pinned' ? '' : '，或 Esc'}）`}>
          <Button variant="ghost" size="icon-sm" onClick={frame.close} aria-label="收起对话栏">{frame.layout === 'full' ? <X /> : <PanelRightClose />}</Button>
        </Tip>
      )}
    </header>
  )
}

export function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
