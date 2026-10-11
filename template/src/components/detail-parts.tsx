// 详情抽屉共用的零件：只读排版块、失焦保存输入框、删除确认、关联标签、编辑开关
import { useEffect, useState, type ReactNode } from 'react'
import { Pencil, Check, Trash2, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

/** 失焦或回车保存的输入框（编辑模式里用） */
export function InlineText({ value, onSave, multiline, placeholder }: { value: string | null; onSave: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  const commit = () => { if (v !== (value ?? '')) onSave(v) }
  return multiline
    ? <Textarea rows={3} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
    : <Input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
}

export function DeleteButton({ what, onConfirm }: { what: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-danger hover:text-danger"><Trash2 />删除</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>删除这个{what}？</AlertDialogTitle><AlertDialogDescription>删除后在“最近改动”里留有记录，但内容不能恢复。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={onConfirm} className="bg-danger hover:bg-danger/90">删除</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function LinkChip({ icon: Icon = User, label, onClick }: { icon?: typeof User; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs hover:border-primary hover:text-primary"><Icon className="size-3" />{label}</button>
}

/** 抽屉右上角的“编辑 / 完成”开关：默认只读，点了才出现输入框 */
export function EditToggle({ editing, onChange }: { editing: boolean; onChange: (v: boolean) => void }) {
  return editing
    ? <Button size="sm" onClick={() => onChange(false)}><Check />完成</Button>
    : <Button size="sm" variant="outline" onClick={() => onChange(true)}><Pencil />编辑</Button>
}

/** 只读模式的一行：左边小标签，右边内容 */
export function ReadRow({ label, children, muted }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-dashed py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? 'text-muted-foreground' : ''}>{children}</dd>
    </div>
  )
}

/** 只读模式的大号信息块：用于时间、金额等最重要的一项 */
export function HeroFact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-background/60 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 font-heading text-[22px] leading-tight font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** 正文：备注、说明等长文本，保留换行 */
export function Prose({ text, empty = '没有备注' }: { text?: string | null; empty?: string }) {
  return text?.trim()
    ? <p className="text-[14.5px] leading-7 whitespace-pre-wrap">{text}</p>
    : <p className="text-sm text-muted-foreground">{empty}</p>
}
