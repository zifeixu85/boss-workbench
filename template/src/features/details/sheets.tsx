// 日程、待办、项目的详情抽屉。默认只读排版，点“编辑”后字段才变成输入框（失焦或选择即保存）
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderKanban, MapPin, CheckCircle2 } from 'lucide-react'
import { EVENT_KINDS, MILESTONE_STATUS, PROJECT_STAGES, TODO_PRIORITY, TODO_STATUS } from '@shared/schema'
import { api, useApi, useWrite } from '@/lib/api'
import type { CalEvent, KbNote, Milestone, Project, Receivable, Todo } from '@/lib/types'
import { fullDate, relDay, shortDate, timeOf, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { StatusBadge, EVENT_COLORS } from '@/components/status'
import { Choice, ClientChoice, DatePicker, DateTimePicker, ProjectChoice, FormField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { DeleteButton, EditToggle, HeroFact, InlineText, LinkChip, Prose, ReadRow } from '@/components/detail-parts'

function duration(start: string, end: string | null) {
  if (!end || !start.includes('T')) return null
  const m = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  return m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分钟`
}

export function EventSheet({ id }: { id: string }) {
  const ov = useOverlay()
  const [editing, setEditing] = useState(false)
  const { data: e } = useApi<CalEvent>(`/events/${id}`)
  const patch = useWrite((b: Record<string, unknown>) => api.patch(`/events/${id}`, b), '日程已更新')
  const del = useWrite(() => api.del(`/events/${id}`), '已删除日程')
  const color = e ? EVENT_COLORS[e.kind] : undefined
  return (
    <DetailSheet open onClose={() => ov.closeDetail('event')} eyebrow="日程" title={e?.title}
      meta={e && <><span className="inline-flex h-5 items-center rounded-md px-1.5 text-[11.5px] font-medium" style={{ background: color?.bg, color: color?.text }}>{e.kind}</span>{e.source !== '手动' && <span>来自 {e.source}</span>}</>}
      actions={e && <><EditToggle editing={editing} onChange={setEditing} />{e.client_id && <Button size="sm" variant="outline" onClick={() => ov.openNew('log', { for: e.client_id! })}>会后记一笔跟进</Button>}</>}>
      {e && !editing && (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3">
            <HeroFact label={fullDate(e.start)} value={e.all_day ? '全天' : e.end ? `${timeOf(e.start)}–${timeOf(e.end)}` : timeOf(e.start)} sub={duration(e.start, e.end) ?? relDay(e.start)} />
            <HeroFact label="地点" value={<span className="text-base">{e.location || '未填'}</span>} sub={e.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-3" />到场前确认</span> : '可以点“编辑”补上'} />
          </div>
          <dl>
            <ReadRow label="和谁">{e.client_id ? <LinkChip label={e.client_name ?? '客户'} onClick={() => ov.openDetail('client', e.client_id!)} /> : <span className="text-muted-foreground">没有关联客户</span>}</ReadRow>
            <ReadRow label="项目">{e.project_id ? <LinkChip icon={FolderKanban} label={e.project_name ?? '项目'} onClick={() => ov.openDetail('project', e.project_id!)} /> : <span className="text-muted-foreground">—</span>}</ReadRow>
          </dl>
          <SheetSection title="备注"><Prose text={e.note} empty="还没有备注。会前要准备什么、会上谈了什么，点“编辑”写在这里。" /></SheetSection>
        </div>
      )}
      {e && editing && (
        <FieldGroup className="gap-4">
          <FormField label="标题"><InlineText value={e.title} onSave={(v) => patch.mutate({ title: v })} /></FormField>
          <FormField label="类型"><Choice value={e.kind} onChange={(v) => v && patch.mutate({ kind: v })} options={EVENT_KINDS} /></FormField>
          <FormField label="开始"><DateTimePicker value={e.start} allDay={!!e.all_day} onChange={(v) => v && patch.mutate({ start: v })} /></FormField>
          {!e.all_day && <FormField label="结束"><DateTimePicker value={e.end} onChange={(v) => patch.mutate({ end: v })} /></FormField>}
          <FormField label="地点"><InlineText value={e.location} onSave={(v) => patch.mutate({ location: v })} /></FormField>
          <FormField label="关联客户"><ClientChoice value={e.client_id} onChange={(v) => patch.mutate({ client_id: v })} /></FormField>
          <FormField label="备注"><InlineText multiline value={e.note} onSave={(v) => patch.mutate({ note: v })} placeholder="会前要准备什么、会上谈了什么" /></FormField>
          <div className="flex justify-end border-t pt-4"><DeleteButton what="日程" onConfirm={() => del.mutate(undefined, { onSuccess: () => ov.closeDetail('event') })} /></div>
        </FieldGroup>
      )}
    </DetailSheet>
  )
}

export function TodoSheet({ id }: { id: string }) {
  const ov = useOverlay()
  const [editing, setEditing] = useState(false)
  const { data: t } = useApi<Todo>(`/todos/${id}`, ['todo', id])
  const patch = useWrite((b: Record<string, unknown>) => api.patch(`/todos/${id}`, b), '待办已更新')
  const del = useWrite(() => api.del(`/todos/${id}`), '已删除待办')
  const late = t?.due && t.status !== '完成' && relDay(t.due).startsWith('已过')
  return (
    <DetailSheet open onClose={() => ov.closeDetail('todo')} eyebrow="待办" title={t?.title}
      meta={t && <><StatusBadge value={t.status} />{t.priority !== '普通' && <StatusBadge value={t.priority} />}</>}
      actions={t && <>
        <EditToggle editing={editing} onChange={setEditing} />
        {t.status !== '完成' ? <Button size="sm" variant="outline" onClick={() => patch.mutate({ status: '完成' })}><CheckCircle2 />标记完成</Button> : <Button size="sm" variant="ghost" onClick={() => patch.mutate({ status: '待办' })}>重新打开</Button>}
      </>}>
      {t && !editing && (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3">
            <HeroFact label="截止" value={t.due ? <span className={late ? 'text-danger' : ''}>{relDay(t.due)}</span> : '没定日期'} sub={t.due ? fullDate(t.due) : '点“编辑”定个日子'} />
            <HeroFact label="状态" value={<span className="text-base">{t.status}</span>} sub={t.status === '完成' ? `完成于 ${shortDate(t.done_at)}` : `优先级：${t.priority}`} />
          </div>
          <dl>
            <ReadRow label="客户">{t.client_id ? <LinkChip label={t.client_name ?? '客户'} onClick={() => ov.openDetail('client', t.client_id!)} /> : <span className="text-muted-foreground">—</span>}</ReadRow>
            <ReadRow label="项目">{t.project_id ? <LinkChip icon={FolderKanban} label={t.project_name ?? '项目'} onClick={() => ov.openDetail('project', t.project_id!)} /> : <span className="text-muted-foreground">—</span>}</ReadRow>
            <ReadRow label="建立">{shortDate(t.created_at)}</ReadRow>
          </dl>
          <SheetSection title="备注"><Prose text={t.note} /></SheetSection>
        </div>
      )}
      {t && editing && (
        <FieldGroup className="gap-4">
          <FormField label="要做什么"><InlineText value={t.title} onSave={(v) => patch.mutate({ title: v })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="状态"><Choice value={t.status} onChange={(v) => v && patch.mutate({ status: v })} options={TODO_STATUS} /></FormField>
            <FormField label="优先级"><Choice value={t.priority} onChange={(v) => v && patch.mutate({ priority: v })} options={TODO_PRIORITY} /></FormField>
          </div>
          <FormField label="截止日期"><DatePicker value={t.due} onChange={(v) => patch.mutate({ due: v })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="关联客户"><ClientChoice value={t.client_id} onChange={(v) => patch.mutate({ client_id: v })} /></FormField>
            <FormField label="关联项目"><ProjectChoice value={t.project_id} onChange={(v) => patch.mutate({ project_id: v })} /></FormField>
          </div>
          <FormField label="备注"><InlineText multiline value={t.note} onSave={(v) => patch.mutate({ note: v })} /></FormField>
          <div className="flex justify-end border-t pt-4"><DeleteButton what="待办" onConfirm={() => del.mutate(undefined, { onSuccess: () => ov.closeDetail('todo') })} /></div>
        </FieldGroup>
      )}
    </DetailSheet>
  )
}

type ProjectDetail = { project: Project; milestones: Milestone[]; todos: Todo[]; events: CalEvent[]; receivables: Receivable[]; kb_note: KbNote }
export function ProjectSheet({ id }: { id: string }) {
  const ov = useOverlay()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const { data } = useApi<ProjectDetail>(`/projects/${id}`)
  const patch = useWrite((b: Record<string, unknown>) => api.patch(`/projects/${id}`, b), '项目已更新')
  const mile = useWrite(({ mid, status }: { mid: string; status: string }) => api.patch(`/milestones/${mid}`, { status }), '里程碑已更新')
  const p = data?.project
  const done = data?.milestones.filter((m) => m.status === '完成').length ?? 0
  return (
    <DetailSheet wide open onClose={() => ov.closeDetail('project')} eyebrow="项目" title={p?.name}
      meta={p && <><StatusBadge value={p.stage} />{p.owner && <span>负责人 {p.owner}</span>}{p.client_id && <LinkChip label={p.client_name ?? '客户'} onClick={() => ov.openDetail('client', p.client_id!)} />}</>}
      actions={p && <><EditToggle editing={editing} onChange={setEditing} /><Button size="sm" variant="outline" onClick={() => ov.openNew('todo')}>加待办</Button></>}>
      {data && p && (
        <>
          {p.risks.length > 0 && (
            <div className="mb-5 grid gap-1.5 rounded-xl border border-danger/25 bg-danger-soft/60 p-3">
              {p.risks.map((r) => <div key={r.text} className="flex items-start gap-2 text-sm"><StatusBadge value={r.level} />{r.text}</div>)}
            </div>
          )}
          {!editing ? (
            <>
              <div className="mb-5 grid grid-cols-3 gap-3">
                <HeroFact label="截止" value={p.due ? relDay(p.due) : '未定'} sub={p.due ? shortDate(p.due) : undefined} />
                <HeroFact label={p.contract ? '合同' : '预算'} value={wan(p.contract ?? p.budget)} />
                <HeroFact label="里程碑" value={`${done}/${data.milestones.length}`} sub={data.milestones.length ? '完成 / 全部' : '还没设里程碑'} />
              </div>
              <dl className="mb-6">
                <ReadRow label="想达到">{p.goal || <span className="text-muted-foreground">没写</span>}</ReadRow>
                <ReadRow label="下一步">{p.next_step || <span className="text-muted-foreground">没写</span>}</ReadRow>
                <ReadRow label="在等谁">{p.waiting_on || <span className="text-muted-foreground">不用等人</span>}</ReadRow>
                <ReadRow label="知识库">{data.kb_note.path ? <LinkChip icon={FolderKanban} label={data.kb_note.path} onClick={() => navigate(`/kb?path=${encodeURIComponent(data.kb_note.path!)}`)} /> : <span className="text-muted-foreground">{data.kb_note.expected ? `还没有（预期 ${data.kb_note.expected}）` : '—'}</span>}</ReadRow>
                <ReadRow label="更新">{relDay(p.updated_at)}</ReadRow>
              </dl>
            </>
          ) : (
            <FieldGroup className="mb-6 gap-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="阶段"><Choice value={p.stage} onChange={(v) => v && patch.mutate({ stage: v })} options={PROJECT_STAGES} /></FormField>
                <FormField label="截止"><DatePicker value={p.due} onChange={(v) => patch.mutate({ due: v })} /></FormField>
              </div>
              <FormField label="负责人"><InlineText value={p.owner} onSave={(v) => patch.mutate({ owner: v })} /></FormField>
              <FormField label="想达到的结果"><InlineText multiline value={p.goal} onSave={(v) => patch.mutate({ goal: v })} /></FormField>
              <FormField label="下一步"><InlineText value={p.next_step} onSave={(v) => patch.mutate({ next_step: v })} /></FormField>
              <FormField label="在等谁"><InlineText value={p.waiting_on} onSave={(v) => patch.mutate({ waiting_on: v })} placeholder="没有就留空" /></FormField>
              <FormField label="手动标记的风险"><InlineText value={p.risk} onSave={(v) => patch.mutate({ risk: v })} placeholder="没有就留空" /></FormField>
            </FieldGroup>
          )}
          <SheetSection title="里程碑">
            <ol className="grid gap-1">
              {data.milestones.map((m) => {
                const late = m.status !== '完成' && relDay(m.date).startsWith('已过')
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                    <span className={`num w-16 shrink-0 text-xs ${late ? 'font-medium text-danger' : 'text-muted-foreground'}`}>{shortDate(m.date)}</span>
                    <span className="min-w-0 flex-1"><span className={m.status === '完成' ? 'text-muted-foreground' : ''}>{m.title}</span>{m.note && <span className="block text-xs text-muted-foreground">{m.note}</span>}</span>
                    {editing ? <div className="w-24"><Choice value={m.status} onChange={(v) => v && mile.mutate({ mid: m.id, status: v })} options={MILESTONE_STATUS} /></div> : <StatusBadge value={m.status} />}
                  </li>
                )
              })}
              {!data.milestones.length && <p className="px-2 text-sm text-muted-foreground">还没设里程碑。让 Codex 按知识库里的项目说明加上。</p>}
            </ol>
          </SheetSection>
          <SheetSection title="待办">
            {data.todos.map((t) => <button key={t.id} onClick={() => ov.openDetail('todo', t.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"><StatusBadge value={t.status} /><span className="flex-1 truncate">{t.title}</span><span className="text-xs text-muted-foreground">{relDay(t.due)}</span></button>)}
            {!data.todos.length && <p className="px-2 text-sm text-muted-foreground">没有</p>}
          </SheetSection>
          <SheetSection title="相关日程">
            {data.events.map((e) => <button key={e.id} onClick={() => ov.openDetail('event', e.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"><span className="num w-24 shrink-0 text-xs text-muted-foreground">{shortDate(e.start)} {timeOf(e.start)}</span><span className="flex-1 truncate">{e.title}</span></button>)}
            {!data.events.length && <p className="px-2 text-sm text-muted-foreground">没有</p>}
          </SheetSection>
          {data.receivables.length > 0 && (
            <SheetSection title="回款节点">
              {data.receivables.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="w-20">{r.milestone}</span><span className="num flex-1 text-muted-foreground">{wan(r.amount)} · {shortDate(r.due)}</span><span className="num text-xs">已收 {wan(r.received)}</span>
                  {r.received < r.amount && <Button size="xs" variant="outline" onClick={() => ov.openNew('collect', { for: r.id })}>登记回款</Button>}
                </div>
              ))}
            </SheetSection>
          )}
        </>
      )}
    </DetailSheet>
  )
}
