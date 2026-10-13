// 各类新建弹窗。字段校验用前后端共用的 shared/schema，提示语一致。
import { useState } from 'react'
import type { ZodType } from 'zod'
import {
  todoInput, eventInput, clientInput, interactionInput, collectInput, ledgerInput, dealInput, projectInput,
  TODO_PRIORITY, TODO_STATUS, EVENT_KINDS, CLIENT_STAGES, CHANNELS, LEDGER_CATEGORIES, DEAL_STAGES, PROJECT_STAGES,
} from '@shared/schema'
import { api, useApi, useWrite } from '@/lib/api'
import type { Client, Receivable } from '@/lib/types'
import { todayStr, wan } from '@/lib/format'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FormDialog } from './FormDialog'
import { FormField, TextInput, TextArea, Choice, ClientChoice, ProjectChoice, DatePicker, DateTimePicker, MoneyInput, TimeInput, issuesToErrors } from '@/components/form'

type Props = { onClose: () => void; forId?: string | null; date?: string | null; text?: string | null }
type Errors = Record<string, string>

/** 本地状态 + 提交前用 zod 校验；服务端再校验一次 */
function useForm<T extends Record<string, unknown>>(schema: ZodType, initial: T, submit: (data: never) => Promise<unknown>, success: string, onDone: () => void) {
  const [v, setV] = useState<T>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const w = useWrite(submit, success)
  const set = (k: keyof T) => (val: unknown) => { setV((p) => ({ ...p, [k]: val })); setErrors((e) => ({ ...e, [k as string]: '' })) }
  const onSubmit = () => {
    const r = schema.safeParse(v)
    if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))); return }
    w.mutate(r.data as never, { onSuccess: onDone, onError: (e) => setErrors(issuesToErrors(e)) })
  }
  return { v, set, errors, onSubmit, pending: w.isPending }
}

export function NewTodoDialog({ onClose, forId, date, text }: Props) {
  const f = useForm(todoInput, { title: text ?? '', status: '待办', priority: '普通', due: date?.slice(0, 10) ?? todayStr(), due_time: date?.includes('T') ? date.slice(11, 16) : null, client_id: forId ?? null, project_id: null, note: '', owner: '' },
    (d) => api.post('/todos', d), '已新增待办', onClose)
  return (
    <FormDialog open onClose={onClose} title="新建待办" desc="要做的一件具体的事。关联客户后，会出现在客户详情和跟进清单里。" onSubmit={f.onSubmit} submitting={f.pending}>
      <FormField label="要做什么" error={f.errors.title}><TextInput autoFocus value={f.v.title} onChange={(e) => f.set('title')(e.target.value)} placeholder="例如：给衡言出两款升级包装效果图" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="优先级"><Choice value={f.v.priority} onChange={(x) => f.set('priority')(x ?? '普通')} options={TODO_PRIORITY} /></FormField>
        <FormField label="状态"><Choice value={f.v.status} onChange={(x) => f.set('status')(x ?? '待办')} options={TODO_STATUS.filter((s) => s !== '取消')} /></FormField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <FormField label="截止日期" error={f.errors.due}><DatePicker value={f.v.due} onChange={(v) => { f.set('due')(v); if (!v) f.set('due_time')(null) }} /></FormField>
        <FormField label="到期时间（可不填）" error={f.errors.due_time}><TimeInput label="到期时间" value={f.v.due_time} onChange={f.set('due_time')} /></FormField>
      </div>
      {f.v.due_time && <p className="-mt-2 text-xs text-muted-foreground">到期前 1 小时提醒你（已经不到 1 小时的，马上提醒）。</p>}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="关联客户"><ClientChoice value={f.v.client_id} onChange={f.set('client_id')} /></FormField>
        <FormField label="关联项目"><ProjectChoice value={f.v.project_id} onChange={f.set('project_id')} /></FormField>
      </div>
      <FormField label="谁做" hint="空着 = 你自己；团队里谁做写名字；在等对方写“对方”"><TextInput value={f.v.owner ?? ''} onChange={(e) => f.set('owner')(e.target.value)} placeholder="例如：小艾" /></FormField>
      <FormField label="备注"><TextArea value={f.v.note ?? ''} onChange={(e) => f.set('note')(e.target.value)} /></FormField>
    </FormDialog>
  )
}

export function NewEventDialog({ onClose, forId, date, text }: Props) {
  const start = date ?? `${todayStr()}T10:00`
  const allDay0 = !start.includes('T')
  const plusHour = (s: string) => (s.includes('T') ? `${s.slice(0, 11)}${String(Math.min(Number(s.slice(11, 13)) + 1, 22)).padStart(2, '0')}${s.slice(13)}` : null)
  const f = useForm(eventInput, { title: text ?? '', start, end: plusHour(start), all_day: allDay0, kind: '会面', location: '', client_id: forId ?? null, project_id: null, note: '' },
    (d) => api.post('/events', d), '已加入日程', onClose)
  return (
    <FormDialog open onClose={onClose} title="新建日程" desc="和谁、什么时候、在哪。日历的月、周、日视图都会显示。" onSubmit={f.onSubmit} submitting={f.pending}>
      <FormField label="标题" error={f.errors.title}><TextInput autoFocus value={f.v.title} onChange={(e) => f.set('title')(e.target.value)} placeholder="例如：栖木资本方案沟通" /></FormField>
      <FormField label="类型">
        <ToggleGroup type="single" variant="outline" value={f.v.kind} onValueChange={(x) => x && f.set('kind')(x)} className="flex-wrap justify-start">
          {EVENT_KINDS.map((k) => <ToggleGroupItem key={k} value={k} className="px-3">{k}</ToggleGroupItem>)}
        </ToggleGroup>
      </FormField>
      <div className="flex items-center gap-2"><Switch id="allday" checked={f.v.all_day} onCheckedChange={(c) => { f.set('all_day')(c); f.set('start')(c ? f.v.start.slice(0, 10) : `${f.v.start.slice(0, 10)}T10:00`); f.set('end')(c ? null : `${f.v.start.slice(0, 10)}T11:00`) }} /><Label htmlFor="allday">全天</Label></div>
      <FormField label="开始" error={f.errors.start}><DateTimePicker value={f.v.start} allDay={f.v.all_day} onChange={(x) => x && f.set('start')(x)} /></FormField>
      {!f.v.all_day && <FormField label="结束" error={f.errors.end}><DateTimePicker value={f.v.end} onChange={f.set('end')} /></FormField>}
      <FormField label="地点"><TextInput value={f.v.location ?? ''} onChange={(e) => f.set('location')(e.target.value)} /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="关联客户"><ClientChoice value={f.v.client_id} onChange={f.set('client_id')} /></FormField>
        <FormField label="关联项目"><ProjectChoice value={f.v.project_id} onChange={f.set('project_id')} /></FormField>
      </div>
    </FormDialog>
  )
}

export function NewClientDialog({ onClose }: Props) {
  const f = useForm(clientInput, { name: '', label: '', kind: '客户', stage: '新线索', source: '', city: '', phone: '', wechat: '', budget: null, next_follow: null, tags: [], note: '' },
    (d) => api.post('/clients', d), '已新增客户', onClose)
  return (
    <FormDialog wide open onClose={onClose} title="新建客户" desc="先填称呼就能保存，其余可以以后补。长期背景（这个人在意什么）写进知识库的客户笔记。" onSubmit={f.onSubmit} submitting={f.pending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="称呼" error={f.errors.name}><TextInput autoFocus value={f.v.name} onChange={(e) => f.set('name')(e.target.value)} placeholder="澜拓科技 / 许国平" /></FormField>
        <FormField label="补充说明"><TextInput value={f.v.label ?? ''} onChange={(e) => f.set('label')(e.target.value)} placeholder="约 300 人 · 员工礼" /></FormField>
        <FormField label="类型"><Choice value={f.v.kind} onChange={(x) => f.set('kind')(x ?? '客户')} options={['客户', '伙伴']} /></FormField>
        <FormField label="阶段"><Choice value={f.v.stage} onChange={(x) => f.set('stage')(x ?? '新线索')} options={CLIENT_STAGES} /></FormField>
        <FormField label="来源"><TextInput value={f.v.source ?? ''} onChange={(e) => f.set('source')(e.target.value)} placeholder="小红书 / 茶博会 / 老客户介绍" /></FormField>
        <FormField label="预算"><MoneyInput value={f.v.budget as number | null} onChange={f.set('budget')} /></FormField>
        <FormField label="电话"><TextInput value={f.v.phone ?? ''} onChange={(e) => f.set('phone')(e.target.value)} /></FormField>
        <FormField label="下次跟进"><DatePicker value={f.v.next_follow as string | null} onChange={f.set('next_follow')} /></FormField>
      </div>
      <FormField label="备注"><TextArea value={f.v.note ?? ''} onChange={(e) => f.set('note')(e.target.value)} /></FormField>
    </FormDialog>
  )
}

export function EditClientDialog({ onClose, forId }: Props) {
  const { data } = useApi<{ client: Client }>(forId ? `/clients/${forId}` : null)
  if (!data) return null
  return <EditClientForm c={data.client} onClose={onClose} />
}

function EditClientForm({ c, onClose }: { c: Client; onClose: () => void }) {
  const f = useForm(clientInput.partial(), { name: c.name, label: c.label ?? '', kind: c.kind, stage: c.stage, source: c.source ?? '', city: c.city ?? '', phone: c.phone ?? '', wechat: c.wechat ?? '', budget: c.budget, next_follow: c.next_follow, kb_path: c.kb_path ?? '', tags: c.tags, note: c.note ?? '' },
    (d) => api.patch(`/clients/${c.id}`, d), '客户资料已更新', onClose)
  return (
    <FormDialog wide open onClose={onClose} title={`编辑资料：${c.name}`} desc="阶段和下次跟进在抽屉里直接改；这里改联系方式、来源、预算等。" onSubmit={f.onSubmit} submitting={f.pending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="称呼" error={f.errors.name}><TextInput value={f.v.name} onChange={(e) => f.set('name')(e.target.value)} /></FormField>
        <FormField label="补充说明"><TextInput value={f.v.label ?? ''} onChange={(e) => f.set('label')(e.target.value)} /></FormField>
        <FormField label="来源"><TextInput value={f.v.source ?? ''} onChange={(e) => f.set('source')(e.target.value)} /></FormField>
        <FormField label="城市"><TextInput value={f.v.city ?? ''} onChange={(e) => f.set('city')(e.target.value)} /></FormField>
        <FormField label="电话"><TextInput value={f.v.phone ?? ''} onChange={(e) => f.set('phone')(e.target.value)} /></FormField>
        <FormField label="微信"><TextInput value={f.v.wechat ?? ''} onChange={(e) => f.set('wechat')(e.target.value)} /></FormField>
        <FormField label="预算"><MoneyInput value={f.v.budget as number | null} onChange={f.set('budget')} /></FormField>
        <FormField label="标签" hint="用逗号分开"><TextInput value={(f.v.tags as string[]).join('，')} onChange={(e) => f.set('tags')(e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean))} /></FormField>
      </div>
      <FormField label="背景笔记位置" hint="知识库里这位客户的长期背景，例如 04-客户/企业客户/澜拓科技.md"><TextInput value={f.v.kb_path ?? ''} onChange={(e) => f.set('kb_path')(e.target.value)} /></FormField>
      <FormField label="备注"><TextArea value={f.v.note ?? ''} onChange={(e) => f.set('note')(e.target.value)} /></FormField>
    </FormDialog>
  )
}

export function LogDialog({ onClose, forId, text }: Props) {
  const { data: clients = [] } = useApi<Client[]>('/clients')
  const f = useForm(interactionInput, { client_id: forId ?? '', date: todayStr(), channel: '微信', summary: text ?? '', next_step: '', next_follow: null },
    (d) => api.post('/interactions', d), '已记下这次跟进', onClose)
  const c = clients.find((x) => x.id === f.v.client_id)
  return (
    <FormDialog open onClose={onClose} title={c ? `记一笔：${c.name}` : '记一笔跟进'} desc="写下这次沟通说了什么。听不准的金额和结论标“（待确认）”。" onSubmit={f.onSubmit} submitting={f.pending}>
      {!forId && <FormField label="客户" error={f.errors.client_id}><ClientChoice value={f.v.client_id} onChange={(x) => f.set('client_id')(x ?? '')} /></FormField>}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="日期" error={f.errors.date}><DatePicker value={f.v.date} clearable={false} onChange={(x) => x && f.set('date')(x)} /></FormField>
        <FormField label="方式"><Choice value={f.v.channel} onChange={(x) => f.set('channel')(x ?? '微信')} options={CHANNELS} /></FormField>
      </div>
      <FormField label="沟通内容" error={f.errors.summary}><TextArea autoFocus rows={4} value={f.v.summary} onChange={(e) => f.set('summary')(e.target.value)} placeholder="例如：春节大概 300 份（待确认），每份 200 以内，11 月中给最终人数" /></FormField>
      <FormField label="下一步"><TextInput value={f.v.next_step ?? ''} onChange={(e) => f.set('next_step')(e.target.value)} placeholder="出两版春节方案" /></FormField>
      <FormField label="下次跟进" hint={c?.next_follow ? `原计划：${c.next_follow}` : undefined}><DatePicker value={f.v.next_follow} onChange={f.set('next_follow')} /></FormField>
    </FormDialog>
  )
}

export function CollectDialog({ onClose, forId }: Props) {
  const { data: recs = [] } = useApi<Receivable[]>('/receivables')
  const open = recs.filter((r) => r.status !== '已收清')
  const r0 = open.find((r) => r.id === forId)
  const f = useForm(collectInput, { receivable_id: forId ?? '', amount: r0?.outstanding ?? null, date: todayStr(), note: '' },
    (d) => api.post('/collect', d), '已登记回款，同时记了一笔收入', onClose)
  const r = open.find((x) => x.id === f.v.receivable_id)
  return (
    <FormDialog open onClose={onClose} title="登记回款" desc="回款会同时更新应收款和收支流水。" onSubmit={f.onSubmit} submitting={f.pending}>
      <FormField label="哪一笔应收" error={f.errors.receivable_id}>
        <Choice value={f.v.receivable_id} onChange={(x) => { f.set('receivable_id')(x ?? ''); const rr = open.find((y) => y.id === x); if (rr) f.set('amount')(rr.outstanding) }}
          options={open.map((x) => ({ value: x.id, label: `${x.client_name ?? ''} · ${x.milestone} · 未收 ${wan(x.outstanding)}` }))} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="本次收到" error={f.errors.amount} hint={r ? `未收 ${wan(r.outstanding)}，不能超过这个数` : undefined}><MoneyInput value={f.v.amount as number | null} onChange={f.set('amount')} /></FormField>
        <FormField label="到账日期"><DatePicker value={f.v.date} clearable={false} onChange={(x) => x && f.set('date')(x)} /></FormField>
      </div>
      <FormField label="备注"><TextInput value={f.v.note ?? ''} onChange={(e) => f.set('note')(e.target.value)} /></FormField>
    </FormDialog>
  )
}

export function LedgerDialog({ onClose }: Props) {
  const f = useForm(ledgerInput, { date: todayStr(), direction: '支出', category: LEDGER_CATEGORIES['支出'][0] as string, amount: null, client_id: null, project_id: null, note: '' },
    (d) => api.post('/ledger', d), '已记一笔', onClose)
  const cats = LEDGER_CATEGORIES[f.v.direction as '收入' | '支出']
  return (
    <FormDialog open onClose={onClose} title="记一笔收支" desc="客户的货款请用“登记回款”，会自动核销应收。这里记其他收入和支出。" onSubmit={f.onSubmit} submitting={f.pending}>
      <ToggleGroup type="single" variant="outline" value={f.v.direction} onValueChange={(x) => { if (x) { f.set('direction')(x); f.set('category')(LEDGER_CATEGORIES[x as '收入' | '支出'][0]) } }} className="justify-start">
        <ToggleGroupItem value="支出" className="px-5">支出</ToggleGroupItem><ToggleGroupItem value="收入" className="px-5">收入</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="类别"><Choice value={f.v.category} onChange={(x) => f.set('category')(x ?? cats[0])} options={cats} /></FormField>
        <FormField label="金额" error={f.errors.amount}><MoneyInput value={f.v.amount as number | null} onChange={f.set('amount')} /></FormField>
      </div>
      <FormField label="日期"><DatePicker value={f.v.date} clearable={false} onChange={(x) => x && f.set('date')(x)} /></FormField>
      <FormField label="关联项目"><ProjectChoice value={f.v.project_id} onChange={f.set('project_id')} /></FormField>
      <FormField label="备注"><TextInput value={f.v.note ?? ''} onChange={(e) => f.set('note')(e.target.value)} /></FormField>
    </FormDialog>
  )
}

export function NewDealDialog({ onClose, forId }: Props) {
  const f = useForm(dealInput, { client_id: forId ?? '', title: '', stage: '需求确认', amount: null, expected_close: null },
    (d) => api.post('/deals', d), '已新增商机', onClose)
  return (
    <FormDialog open onClose={onClose} title="新建商机" desc="一个客户可以有多个商机，例如中秋礼和春节礼。" onSubmit={f.onSubmit} submitting={f.pending}>
      {!forId && <FormField label="客户" error={f.errors.client_id}><ClientChoice value={f.v.client_id} onChange={(x) => f.set('client_id')(x ?? '')} /></FormField>}
      <FormField label="商机名称" error={f.errors.title}><TextInput autoFocus value={f.v.title} onChange={(e) => f.set('title')(e.target.value)} placeholder="春节员工礼 300 份" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="阶段"><Choice value={f.v.stage} onChange={(x) => f.set('stage')(x ?? '需求确认')} options={DEAL_STAGES} /></FormField>
        <FormField label="金额"><MoneyInput value={f.v.amount as number | null} onChange={f.set('amount')} /></FormField>
      </div>
      <FormField label="预计签约"><DatePicker value={f.v.expected_close as string | null} onChange={f.set('expected_close')} /></FormField>
    </FormDialog>
  )
}

export function NewProjectDialog({ onClose, forId }: Props) {
  const f = useForm(projectInput, { name: '', client_id: forId ?? null, stage: '筹备', contract: null, next_step: '', waiting_on: '', due: null, risk: '', owner: '', goal: '' },
    (d) => api.post('/projects', d), '已新建项目', onClose)
  return (
    <FormDialog open onClose={onClose} title="新建项目" desc="一件要多步推进的事，比如新品上市、春节预售、门店改造。里程碑在项目详情里加。" onSubmit={f.onSubmit} submitting={f.pending}>
      <FormField label="项目名称" error={f.errors.name}><TextInput autoFocus value={f.v.name} onChange={(e) => f.set('name')(e.target.value)} /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="客户"><ClientChoice value={f.v.client_id} onChange={f.set('client_id')} /></FormField>
        <FormField label="阶段"><Choice value={f.v.stage} onChange={(x) => f.set('stage')(x ?? '筹备')} options={PROJECT_STAGES} /></FormField>
        <FormField label="合同额"><MoneyInput value={f.v.contract as number | null} onChange={f.set('contract')} /></FormField>
        <FormField label="截止"><DatePicker value={f.v.due as string | null} onChange={f.set('due')} /></FormField>
      </div>
      <FormField label="负责人"><TextInput value={f.v.owner ?? ''} onChange={(e) => f.set('owner')(e.target.value)} placeholder="宋姐" /></FormField>
      <FormField label="想达到的结果"><TextArea value={f.v.goal ?? ''} onChange={(e) => f.set('goal')(e.target.value)} placeholder="11 月底前改造完，预算 6 万" /></FormField>
      <FormField label="下一步"><TextInput value={f.v.next_step ?? ''} onChange={(e) => f.set('next_step')(e.target.value)} /></FormField>
      <FormField label="在等谁"><TextInput value={f.v.waiting_on ?? ''} onChange={(e) => f.set('waiting_on')(e.target.value)} /></FormField>
    </FormDialog>
  )
}
