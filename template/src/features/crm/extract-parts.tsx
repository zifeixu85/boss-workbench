// 新材料提取结果页用的小零件：一段（只读排版，右上角“改”）、短日期选择、标黄那条的“例外 / 规则该改了”。归属：大客户模块
import { Fragment, useState, type ReactNode } from 'react'
import { zhCN } from 'react-day-picker/locale'
import { CalendarIcon, PencilLine, Scale, TriangleAlert, X } from 'lucide-react'
import { shortDate, toDateStr, weekday } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusBadge } from '@/components/status'
import { cn } from '@/lib/utils'
import { ConflictDialog } from './dialogs'
import { SourceLink } from './parts'
import type { PromiseDraft } from './extract-utils'
import { conflictText } from './extract-utils'

/** 结果里的一段：默认只读排版；右上角“改”，点了才出现输入框 */
export function Section({ title, hint, icon, children, edit, editing, onEdit, tone, id, className }: {
  title: ReactNode; hint?: ReactNode; icon?: ReactNode; children: ReactNode; edit?: ReactNode; editing?: boolean; onEdit?: (v: boolean) => void; tone?: 'warn'; id?: string; className?: string
}) {
  return (
    <section id={id} className={cn('scroll-mt-24 rounded-xl border bg-card p-4', tone === 'warn' && 'border-warn/40 bg-warn-soft/50', className)}>
      <div className="flex items-start gap-2">
        <h3 className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13.5px] font-semibold', tone === 'warn' && 'text-warn')}>
          {icon}<span className="whitespace-nowrap">{title}</span>{hint && <span className="text-[12px] font-normal text-muted-foreground">{hint}</span>}
        </h3>
        {onEdit && <Button size="xs" variant="ghost" className="-mt-0.5 shrink-0 text-muted-foreground" onClick={() => onEdit(!editing)}>{editing ? '改好了' : <><PencilLine />改</>}</Button>}
      </div>
      <div className="mt-2.5">{editing && edit ? edit : children}</div>
    </section>
  )
}

/** 短日期选择：框里写“10月23日 周五”（共用的日期框写全年月日，这里放不下） */
export function ShortDate({ value, onChange, placeholder = '选日子', clearable = true, className }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string; clearable?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T00:00:00`) : undefined
  return (
    <div className={cn('flex min-w-0 gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={cn('min-w-0 flex-1 justify-start px-2.5 font-normal whitespace-nowrap', !value && 'text-muted-foreground')}>
            <CalendarIcon className="size-4 opacity-70" />{value ? `${shortDate(value)} ${weekday(value)}` : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" locale={zhCN} weekStartsOn={1} selected={selected} defaultMonth={selected} onSelect={(d) => { onChange(d ? toDateStr(d) : null); setOpen(false) }} />
        </PopoverContent>
      </Popover>
      {clearable && value && <Button type="button" variant="ghost" size="icon" aria-label="清除日期" onClick={() => onChange(null)}><X className="size-4" /></Button>}
    </div>
  )
}

/** 标黄的那条：规则、为什么、谁看出来的；当场能定“这次算例外 / 规则该改了”，定了变灰字（确认写入时一起记） */
export function ConflictBox({ p, clientName, said, source, ruleFile, onDecide }: {
  p: PromiseDraft; clientName: string; said: string; source: string | null; ruleFile?: string | null
  onDecide: (d: { decision: '例外' | '改规则' | null; note: string }) => void
}) {
  const [mode, setMode] = useState<'例外' | '改规则' | null>(null)
  if (p.decision) {
    return (
      <div className="mt-2 ml-7 flex items-start gap-1.5 rounded-md bg-muted/70 px-2.5 py-2 text-[12.5px] text-muted-foreground">
        <Scale className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{p.decision === '例外' ? '定为例外' : '说规则该改（确认写入时在知识库“待确认的发现”加一节）'}：{p.decision_note}<span className="block text-[11.5px] opacity-80">确认写入时一起记进改动留痕，不再标黄</span></span>
        <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => onDecide({ decision: null, note: '' })}>改主意</button>
      </div>
    )
  }
  return (
    <div className="mt-2 ml-7 rounded-md bg-card/80 px-2.5 py-2 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-1.5 font-medium text-warn"><TriangleAlert className="size-3.5" />和判断规则对不上{p.by.map((b) => <StatusBadge key={b} value={b === 'Codex' ? 'Codex 看出来的' : '工作台按价格表核对'} tone="warn" />)}</div>
      {p.rule && <p className="mt-1">{p.rule}{ruleFile && <SourceLink path={ruleFile} label="看规则原文" className="ml-2 align-middle" />}</p>}
      <p className="mt-0.5 text-muted-foreground">{p.conflict}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="xs" variant="outline" onClick={() => setMode('例外')}>这次算例外（写原因）</Button>
        <Button size="xs" variant="outline" onClick={() => setMode('改规则')}>规则该改了</Button>
        <span className="text-[11.5px] text-muted-foreground">不定也行：写进去后标黄挂着，在客户的“往来和答应”里再定</span>
      </div>
      {mode && <ConflictDialog mode={mode} onClose={() => setMode(null)} onDecided={(note) => onDecide({ decision: mode, note })}
        finding={{ client: clientName, promise: p.text, said, source, conflict: conflictText(p) }} />}
    </div>
  )
}

// ───────────── 材料原件：聊天排成“时间 / 说话人 / 内容”三栏（第三轮修产品评审 #14） ─────────────

/** 标题里的日期写成“10月23日”，并且不在中间断行 */
export function NiceTitle({ title, className }: { title: string; className?: string }) {
  const parts = title.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, _y: string, m: string, d: string) => `${Number(m)}月${Number(d)}日`).split(/\s*·\s*/)
  return <span className={className}>{parts.map((p, i) => <Fragment key={i}>{i > 0 && <span className="text-muted-foreground"> · </span>}<span className="whitespace-nowrap">{p}</span></Fragment>)}</span>
}

const CHAT = /^(\d{1,2}:\d{2})\s+([^：:\s]{1,12})[：:]\s*(.*)$/

/** 不是聊天的段落（电话纪要的要点、语音转写的引文）：一行一行排，正文字体；标题不重复（页面上已经有） */
function PlainLines({ text, hot }: { text: string; hot: (line: string) => boolean }) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^#\s/.test(l))
  if (!lines.length) return null
  return (
    <div className="grid gap-1 text-[14px] leading-7">
      {lines.map((l, i) => {
        const h = hot(l.replace(/^[-*>]\s*/, ''))
        if (/^##+\s/.test(l)) return <h4 key={i} className="mt-1 text-[13px] font-semibold text-muted-foreground">{l.replace(/^#+\s*/, '')}</h4>
        if (/^[-*]\s/.test(l)) return <p key={i} className={cn('flex gap-2 rounded-md px-2', h && 'bg-warn-soft/70')}><span className="text-muted-foreground">·</span><span className="min-w-0">{l.replace(/^[-*]\s*/, '')}</span></p>
        if (/^>\s?/.test(l)) return <blockquote key={i} className={cn('rounded-md border-l-[3px] border-border bg-surface-2/50 px-3 py-1.5', h && 'border-warn/50 bg-warn-soft/70')}>{l.replace(/^>\s?/, '')}</blockquote>
        return <p key={i} className={cn('rounded-md px-2', h && 'bg-warn-soft/70')}>{l}</p>
      })}
    </div>
  )
}

/** 原件只读：开头的说明（说话人、记录人）一行灰字；```text 里一行一句“14:02 陈静：……”的聊天排成三栏；别的一行一行排。
 *  highlight：工作台按字面先标出来要核对的几句，浅黄底 */
export function MaterialView({ body, highlight = [] }: { body: string; path?: string; highlight?: string[] }) {
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta = Object.fromEntries((fm?.[1] ?? '').split('\n').map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null }).filter((x): x is [string, string] => !!x))
  const rest = fm ? body.slice(fm[0].length) : body
  const blocks = rest.split(/```\w*\n?/)
  const hot = (line: string) => highlight.some((h) => h && line.includes(h.slice(0, 16)))
  return (
    <div className="grid gap-3">
      {(meta['说话人'] || meta['记录人']) && <p className="text-[12px] text-muted-foreground">{[meta['说话人'] && `说话人：${meta['说话人']}`, meta['记录人'] && `记录：${meta['记录人']}`].filter(Boolean).join(' · ')}</p>}
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim())
        const chat = i % 2 === 1 && lines.length > 0 && lines.filter((l) => CHAT.test(l.trim())).length >= lines.length * 0.6
        if (!chat) return <PlainLines key={i} text={b} hot={hot} />
        return (
          <ol key={i} className="grid gap-0.5 rounded-lg border bg-surface-2/40 p-2">
            {lines.map((l, j) => {
              const m = l.trim().match(CHAT)
              if (!m) return <li key={j} className="px-2 py-1 text-[13.5px] text-muted-foreground">{l}</li>
              const me = /林总|我/.test(m[2])
              return (
                <li key={j} className={cn('grid grid-cols-[44px_52px_minmax(0,1fr)] items-baseline gap-2 rounded-md px-2 py-1 text-[14px] leading-relaxed', hot(l) && 'bg-warn-soft/70')}>
                  <span className="num text-[12px] text-muted-foreground">{m[1]}</span>
                  <span className={cn('truncate font-medium', me ? 'text-primary' : 'text-foreground')}>{m[2]}</span>
                  <span className="min-w-0">{m[3]}</span>
                </li>
              )
            })}
          </ol>
        )
      })}
    </div>
  )
}
