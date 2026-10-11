// 随手记：先记下来，之后再整理成待办、跟进或日程
import { useState } from 'react'
import { api, useWrite } from '@/lib/api'
import { FormDialog } from '@/features/forms/FormDialog'
import { FormField, TextArea } from '@/components/form'

export function InboxDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const w = useWrite((t: string) => api.post('/inbox', { text: t }), '已放进收件箱')
  return (
    <FormDialog open onClose={onClose} title="随手记" desc="想到什么先记下来。之后在收件箱里一键转成待办、跟进或日程，也可以让 Codex 帮你整理。" submitText="记下"
      onSubmit={() => (text.trim() ? w.mutate(text.trim(), { onSuccess: onClose }) : setErr('写点什么再保存'))} submitting={w.isPending}>
      <FormField label="内容" error={err}><TextArea autoFocus rows={4} value={text} onChange={(e) => { setText(e.target.value); setErr('') }} placeholder="例如：老何说双十一快递要涨价，要提前谈" /></FormField>
    </FormDialog>
  )
}
