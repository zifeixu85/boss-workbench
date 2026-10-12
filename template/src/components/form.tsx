// 表单积木：所有弹窗和抽屉里的表单都用这些，长相和校验提示一致
import { useState, type ReactNode } from 'react'
import { zhCN } from 'react-day-picker/locale'
import { CalendarIcon, X } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldError, FieldLabel, FieldDescription } from '@/components/ui/field'
import { useApi } from '@/lib/api'
import type { Client, Project } from '@/lib/types'
import { fullDate, toDateStr } from '@/lib/format'
import { cn } from '@/lib/utils'

export function FormField({ label, error, hint, children, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function TextInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} />
}
export function TextArea(props: React.ComponentProps<typeof Textarea>) {
  return <Textarea rows={3} {...props} />
}

const NONE = '__none'
export function Choice({ value, onChange, options, placeholder = '请选择', allowEmpty, emptyLabel = '不关联', className, id }: {
  value?: string | null; onChange: (v: string | null) => void; options: readonly (string | { value: string; label: string })[]
  placeholder?: string; allowEmpty?: boolean; emptyLabel?: string; className?: string; id?: string
}) {
  return (
    <Select value={value ?? (allowEmpty ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className={cn('w-full', className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value
          return <SelectItem key={v} value={v}>{typeof o === 'string' ? o : o.label}</SelectItem>
        })}
      </SelectContent>
    </Select>
  )
}

export function ClientChoice({ value, onChange, kind }: { value?: string | null; onChange: (v: string | null) => void; kind?: '客户' | '伙伴' }) {
  const { data = [] } = useApi<Client[]>('/clients')
  const opts = data.filter((c) => !kind || c.kind === kind).map((c) => ({ value: c.id, label: `${c.name}${c.label ? `（${c.label}）` : ''}` }))
  return <Choice value={value} onChange={onChange} options={opts} allowEmpty placeholder="选择客户" />
}

export function ProjectChoice({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const { data = [] } = useApi<Project[]>('/projects')
  return <Choice value={value} onChange={onChange} options={data.map((p) => ({ value: p.id, label: p.name }))} allowEmpty placeholder="选择项目" />
}

export function DatePicker({ value, onChange, placeholder = '选择日期', clearable = true }: { value?: string | null; onChange: (v: string | null) => void; placeholder?: string; clearable?: boolean }) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T00:00:00`) : undefined
  return (
    <div className="flex gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={cn('flex-1 justify-start font-normal', !value && 'text-muted-foreground')}>
            <CalendarIcon className="size-4 opacity-70" />{value ? fullDate(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" locale={zhCN} selected={selected} defaultMonth={selected} onSelect={(d) => { onChange(d ? toDateStr(d) : null); setOpen(false) }} />
        </PopoverContent>
      </Popover>
      {clearable && value && <Button type="button" variant="ghost" size="icon" aria-label="清除日期" onClick={() => onChange(null)}><X className="size-4" /></Button>}
    </div>
  )
}

const TIMES = Array.from({ length: 30 }, (_, i) => { const h = 7 + Math.floor(i / 2); return `${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}` })

/** 日期 + 时间（半小时一档）。value 形如 2026-10-08T15:00；不选时间就是全天 */
export function DateTimePicker({ value, onChange, allDay }: { value?: string | null; onChange: (v: string | null) => void; allDay?: boolean }) {
  const date = value?.slice(0, 10) ?? null
  const time = value?.includes('T') ? value.slice(11, 16) : null
  return (
    <div className="grid grid-cols-[1fr_110px] gap-2">
      <DatePicker value={date} clearable={false} onChange={(d) => onChange(d ? (allDay || !time ? d : `${d}T${time}`) : null)} />
      {!allDay && <Choice value={time} onChange={(t) => date && onChange(t ? `${date}T${t}` : date)} options={TIMES} placeholder="时间" />}
    </div>
  )
}

/** 钟点（15:30 这样，24 小时，到分钟）。空着是 null。待办的到期时间、提醒设置用 */
export function TimeInput({ value, onChange, id, label, className }: { value?: string | null; onChange: (v: string | null) => void; id?: string; label?: string; className?: string }) {
  return <Input id={id} type="time" step={60} aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={cn('num w-32', className)} />
}

export function MoneyInput({ value, onChange, id }: { value?: number | null; onChange: (v: number | null) => void; id?: string }) {
  return (
    <div className="relative">
      <Input id={id} inputMode="decimal" value={value ?? ''} onChange={(e) => { const s = e.target.value.trim(); onChange(s === '' ? null : Number(s)) }} className="pr-10" />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">万元</span>
    </div>
  )
}

/** 把接口返回的字段错误映射成 { 字段: 提示 } */
export function issuesToErrors(err: unknown): Record<string, string> {
  const issues = (err as { issues?: { path: string; message: string }[] })?.issues ?? []
  return Object.fromEntries(issues.map((i) => [i.path, i.message]))
}
