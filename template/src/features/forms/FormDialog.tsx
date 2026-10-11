// 弹窗表单外壳：标题、说明、内容、底部按钮；回车提交，Esc 关闭
import type { FormEvent, ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { cn } from '@/lib/utils'

export function FormDialog({ open, onClose, title, desc, children, onSubmit, submitting, submitText = '保存', wide }: {
  open: boolean; onClose: () => void; title: string; desc?: ReactNode; children: ReactNode
  onSubmit: () => void; submitting?: boolean; submitText?: string; wide?: boolean
}) {
  const handle = (e: FormEvent) => { e.preventDefault(); onSubmit() }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-h-[88vh] overflow-y-auto', wide ? 'sm:max-w-[640px]' : 'sm:max-w-[480px]')}>
        <form onSubmit={handle} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{title}</DialogTitle>
            {desc && <DialogDescription>{desc}</DialogDescription>}
          </DialogHeader>
          <FieldGroup className="gap-4">{children}</FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? '保存中…' : submitText}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
