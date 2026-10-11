// “转成待办”弹窗：标题是一句要做的事（短），建议和原因放备注，备注最后附上回到这条异常的地址。
// 写进公共的待办（POST /api/todos），今日页、待办页都能看到。
import { useState } from 'react'
import { FormDialog } from '@/features/forms/FormDialog'
import { Choice, DatePicker, FormField, TextArea, TextInput, issuesToErrors } from '@/components/form'
import { api, useWrite } from '@/lib/api'
import { todayStr } from '@/lib/format'
import { TODO_PRIORITY } from '@shared/schema'
import type { AnomalyDetail } from '../types'

export function TodoFromAnomaly({ a, onClose }: { a: AnomalyDetail; onClose: () => void }) {
  const [v, setV] = useState({ title: a.todo.title, due: todayStr() as string | null, priority: a.todo.priority as string, note: a.todo.note })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useWrite((x: typeof v) => api.post('/todos', { ...x, status: '待办', client_id: null, project_id: null }), '已转成待办')
  const submit = () => save.mutate(v, { onSuccess: onClose, onError: (e) => setErrors(issuesToErrors(e)) })
  return (
    <FormDialog open onClose={onClose} title="转成待办" desc="标题写要做的那件事；建议和原因放在备注里，备注最后有回到这条异常的地址。" onSubmit={submit} submitting={save.isPending} submitText="建待办" wide>
      <FormField label="要做什么" error={errors.title}><TextInput autoFocus value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="哪天前" error={errors.due}><DatePicker value={v.due} onChange={(due) => setV({ ...v, due })} /></FormField>
        <FormField label="优先级"><Choice value={v.priority} onChange={(p) => setV({ ...v, priority: p ?? '普通' })} options={[...TODO_PRIORITY]} /></FormField>
      </div>
      <FormField label="备注" error={errors.note}><TextArea rows={8} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} className="text-[13px] leading-relaxed" /></FormField>
    </FormDialog>
  )
}
