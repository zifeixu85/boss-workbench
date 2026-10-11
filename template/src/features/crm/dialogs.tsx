// 大客户模块的小弹窗：改阶段、改下次跟进、改答应的事、标黄的答应怎么定（例外 / 规则该改了）。改历史记录都要写原因（留新旧值和时间）。归属：大客户模块
import { useEffect, useState } from 'react'
import { ArrowRight, BellRing, BookPlus } from 'lucide-react'
import { CLIENT_STAGES } from '@shared/schema'
import { api, useWrite } from '@/lib/api'
import { fullDate, relDay, shortDate, todayStr } from '@/lib/format'
import { FormDialog } from '@/features/forms/FormDialog'
import { Choice, DatePicker, FormField, TextArea, TextInput } from '@/components/form'
import { StatusBadge } from '@/components/status'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ClientPromise } from './types'

export type StageTarget = { id: string; name: string; from: string; options?: readonly string[]; to?: string }

/** 改阶段：看板拖过来、抽屉里点“改阶段”都用它。原因必填 */
export function StageDialog({ target, onClose, onDone }: { target: StageTarget; onClose: () => void; onDone?: () => void }) {
  const options = (target.options ?? CLIENT_STAGES).filter((s) => s !== target.from)
  const [stage, setStage] = useState<string | null>(target.to && target.to !== target.from ? target.to : options.length === 1 ? options[0] : null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const w = useWrite((b: { stage: string; reason: string }) => api.patch(`/crm/clients/${target.id}/stage`, b), (r) => `${target.name}：${(r as { from: string }).from} → ${(r as { to: string }).to}`)
  const submit = () => {
    const e: Record<string, string> = {}
    if (!stage) e.stage = '选一个新阶段'
    if (reason.trim().length < 2) e.reason = '写一句为什么改，比如“10/28 发了效果图，陈静说下周定”'
    setErr(e)
    if (Object.keys(e).length) return
    w.mutate({ stage: stage!, reason: reason.trim() }, { onSuccess: () => { onDone?.(); onClose() } })
  }
  return (
    <FormDialog open onClose={onClose} title={`改阶段：${target.name}`} submitText="改阶段" submitting={w.isPending} onSubmit={submit}
      desc="阶段只在你确认后改。对方说“考虑一下”“再看看”，不算往前走。改动会留下新旧值、原因和时间。">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">现在</span><StatusBadge value={target.from} />
        <ArrowRight className="size-4 text-muted-foreground" />
        {stage ? <StatusBadge value={stage} /> : <span className="text-muted-foreground">选新阶段</span>}
      </div>
      {options.length > 1 && options.length <= 4 ? (
        <FormField label="改成" error={err.stage}>
          <ToggleGroup type="single" variant="outline" value={stage ?? ''} onValueChange={(v) => v && setStage(v)} className="flex-wrap justify-start">
            {options.map((s) => <ToggleGroupItem key={s} value={s} className="px-3">{s}</ToggleGroupItem>)}
          </ToggleGroup>
        </FormField>
      ) : options.length > 4 ? (
        <FormField label="改成" error={err.stage}><Choice value={stage} onChange={setStage} options={options} /></FormField>
      ) : null}
      <FormField label="为什么改" error={err.reason} hint="写清发生了什么，以后翻记录看得懂">
        <TextArea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：10/22 发了两个组合思路，何雨桐说下周给合伙人看正式方案" />
      </FormField>
    </FormDialog>
  )
}

/** 改下次跟进：填了日期，自动建一条待办（今日页和待办里都看得到）；清空日期，自动待办取消 */
export function FollowDialog({ client, onClose }: { client: { id: string; name: string; next_follow: string | null; next_step?: string | null }; onClose: () => void }) {
  const [date, setDate] = useState<string | null>(client.next_follow)
  const [step, setStep] = useState(client.next_step ?? '')
  const [reason, setReason] = useState('')
  const w = useWrite((b: { next_follow: string | null; next_step: string; reason: string }) => api.patch(`/crm/clients/${client.id}/follow`, b),
    (r) => ((r as { todo_id: string | null }).todo_id ? '已改，自动建了一条跟进待办' : '已改下次跟进'))
  const past = date && date < todayStr()
  return (
    <FormDialog open onClose={onClose} title={`下次跟进：${client.name}`} submitting={w.isPending}
      onSubmit={() => { if (!past) w.mutate({ next_follow: date, next_step: step, reason }, { onSuccess: onClose }) }}
      desc={client.next_follow ? `原来约的是 ${fullDate(client.next_follow)}（${relDay(client.next_follow)}）。` : '还没约下次跟进。'}>
      <FormField label="哪天联系" error={past ? `这个日子已经过了：要选今天（${shortDate(todayStr())}）或以后` : undefined}><DatePicker value={date} onChange={setDate} /></FormField>
      <FormField label="联系时做什么"><TextInput value={step} onChange={(e) => setStep(e.target.value)} placeholder="例如：问样品收到没有，包装哪里要改" /></FormField>
      <FormField label="为什么改（可不写）"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：陈静说合伙人 11/2 才开会" /></FormField>
      <p className="flex items-start gap-2 rounded-lg bg-accent/60 px-3 py-2 text-[13px] text-accent-foreground">
        <BellRing className="mt-0.5 size-4 shrink-0" />
        {date ? `保存后有一条待办“跟进${client.name}”，${shortDate(date)}那天出现在今日页；改日期它跟着改。到了那天记一笔跟进，它自动完成（提前聊过、日子没变，它还留着）。` : '日期清空后，之前自动建的跟进待办会取消。'}
      </p>
    </FormDialog>
  )
}

/** 答应的事：标已兑现 / 取消 / 改日期，原因必填 */
export function PromiseDialog({ p, mode, onClose }: { p: ClientPromise; mode: '已兑现' | '取消' | '改日期'; onClose: () => void }) {
  const [reason, setReason] = useState(mode === '已兑现' ? `${shortDate(todayStr())}做到了` : '')
  const [due, setDue] = useState<string | null>(p.due)
  const [err, setErr] = useState('')
  const w = useWrite((b: Record<string, unknown>) => api.patch(`/crm/promises/${p.id}`, b), mode === '已兑现' ? '已标为兑现' : mode === '取消' ? '已取消这件事' : '已改日期')
  const submit = () => {
    if (reason.trim().length < 2) { setErr('写一句原因'); return }
    const body = mode === '改日期' ? { due, reason: reason.trim() } : { status: mode, reason: reason.trim() }
    w.mutate(body, { onSuccess: onClose })
  }
  return (
    <FormDialog open onClose={onClose} submitting={w.isPending} onSubmit={submit}
      title={mode === '已兑现' ? '标为已兑现' : mode === '取消' ? '这件事不做了' : '改日期'}
      submitText={mode === '已兑现' ? '标为已兑现' : mode === '取消' ? '取消这件事' : '改日期'}
      desc={<>“{p.text}”{p.due ? `，原定 ${shortDate(p.due)} 前` : ''}。改动会留下新旧值、原因和时间。</>}>
      {mode === '改日期' && <FormField label="改到哪天前"><DatePicker value={due} onChange={setDue} /></FormField>}
      <FormField label={mode === '已兑现' ? '怎么做到的' : '为什么'} error={err}>
        <TextArea autoFocus rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setErr('') }} placeholder={mode === '已兑现' ? '例如：10/28 上午把两款效果图发给了陈静' : '例如：对方先打电话来了，这件事不用再做'} />
      </FormField>
    </FormDialog>
  )
}

type FindingPreview = { path: string; lines: string[]; n: number; exists: boolean }

/** 标黄的答应怎么定：这次算例外（写原因）；或者规则该改了（先看要加进知识库“待确认的发现”的那一节，确认后写，写前备份）。
 *  promiseId 有值：直接写进工作台；没有（还在新材料提取的结果里）：只把决定交回给表单，确认写入时一起写 */
export function ConflictDialog({ mode, promiseId, finding, onClose, onDecided }: {
  mode: '例外' | '改规则'; promiseId?: string
  finding: { client: string; promise: string; said: string; source: string | null; conflict: string }
  onClose: () => void; onDecided?: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<FindingPreview | null>(null)
  const w = useWrite((b: { decision: string; note: string }) => api.post(`/crm/promises/${promiseId}/decision`, b), mode === '例外' ? '已定为例外，不再标黄' : '已记进知识库“待确认的发现”，不再标黄')
  const findingKey = JSON.stringify(finding) // 父组件每次渲染都给新对象，按内容比
  useEffect(() => {
    if (mode !== '改规则') return
    const h = setTimeout(() => {
      const req = promiseId ? api.post<FindingPreview>(`/crm/promises/${promiseId}/decision/preview`, { note }) : api.post<FindingPreview>('/crm/findings/preview', { ...JSON.parse(findingKey), note })
      req.then(setPreview).catch(() => setPreview(null))
    }, 300)
    return () => clearTimeout(h)
  }, [mode, note, promiseId, findingKey])
  const submit = () => {
    if (note.trim().length < 2) { setErr(mode === '例外' ? '写一句为什么这次可以例外' : '写一句规则哪里该改'); return }
    if (!promiseId) { onDecided?.(note.trim()); onClose(); return }
    w.mutate({ decision: mode, note: note.trim() }, { onSuccess: () => { onDecided?.(note.trim()); onClose() } })
  }
  return (
    <FormDialog open onClose={onClose} submitting={w.isPending} onSubmit={submit}
      title={mode === '例外' ? '这次算例外' : '规则该改了'} submitText={mode === '例外' ? '定为例外' : promiseId ? '写进待确认的发现' : '就这么定'}
      desc={<>“{finding.promise}”和判断规则对不上：{finding.conflict}</>}>
      <FormField label={mode === '例外' ? '为什么这次可以例外' : '规则哪里该改'} error={err} hint={mode === '例外' ? '写进改动留痕；以后翻这单看得懂为什么降了' : '会在知识库 90-持续生长/待确认的发现.md 加一节，状态“待确认”，等你复盘时定怎么改'}>
        <TextArea autoFocus rows={2} value={note} onChange={(e) => { setNote(e.target.value); setErr('') }}
          placeholder={mode === '例外' ? '例如：律所送客户，150 份量大，每份让 20 换整单，算这一次' : '例如：量到 150 份以上的新客户，可以让一点价，不只送包装'} />
      </FormField>
      {mode === '改规则' && preview && (
        <div className="grid gap-1 rounded-md bg-muted/70 px-3 py-2 text-[12px] leading-relaxed">
          <span className="flex items-center gap-1.5 text-muted-foreground"><BookPlus className="size-3.5" />{promiseId ? '确认后' : '确认写入时'}在 {preview.path} 加这一节（写前备份原文件）：</span>
          {preview.lines.filter(Boolean).map((l, i) => <span key={i} className={i === 0 ? 'font-medium text-foreground' : 'text-foreground/80'}>{l.replace(/^##\s*/, '').replace(/\[(.+?)\]\(.+?\)/g, '$1')}</span>)}
        </div>
      )}
    </FormDialog>
  )
}
