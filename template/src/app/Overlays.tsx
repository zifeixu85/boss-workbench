// 根据地址栏参数显示详情抽屉和新建弹窗（见 overlay.ts）
import { useOverlay, type NewKind } from './overlay'
import { DetailSheet } from '@/components/sheet-shell'
import { ClientActions, ClientBody, ClientMeta, ClientTitle, useClientDetail } from '@/features/clients/ClientDetail'
import { EventSheet, ProjectSheet, TodoSheet } from '@/features/details/sheets'
import { CollectDialog, EditClientDialog, LedgerDialog, LogDialog, NewClientDialog, NewDealDialog, NewEventDialog, NewProjectDialog, NewTodoDialog } from '@/features/forms/dialogs'
import { InboxDialog } from '@/features/inbox/InboxDialog'

function ClientSheet({ id }: { id: string }) {
  const ov = useOverlay()
  const { data } = useClientDetail(id)
  return (
    <DetailSheet wide open onClose={() => ov.closeDetail('client')} eyebrow={data?.client.kind === '伙伴' ? '伙伴' : '客户'}
      title={<ClientTitle d={data} />} meta={<ClientMeta d={data} />} actions={<ClientActions id={id} />}>
      <ClientBody d={data} />
    </DetailSheet>
  )
}

const DIALOGS: Record<NewKind, React.ComponentType<{ onClose: () => void; forId?: string | null; date?: string | null; text?: string | null }>> = {
  todo: NewTodoDialog, event: NewEventDialog, client: NewClientDialog, clientEdit: EditClientDialog, log: LogDialog, collect: CollectDialog,
  ledger: LedgerDialog, deal: NewDealDialog, project: NewProjectDialog, inbox: InboxDialog,
}

export function Overlays() {
  const ov = useOverlay()
  const p = ov.params
  const kind = p.get('new') as NewKind | null
  const Dialog = kind ? DIALOGS[kind] : null
  return (
    <>
      {p.get('client') && <ClientSheet key={p.get('client')} id={p.get('client')!} />}
      {p.get('event') && <EventSheet key={p.get('event')} id={p.get('event')!} />}
      {p.get('todo') && <TodoSheet key={p.get('todo')} id={p.get('todo')!} />}
      {p.get('project') && <ProjectSheet key={p.get('project')} id={p.get('project')!} />}
      {Dialog && <Dialog key={`${kind}-${p.get('for')}`} onClose={ov.closeNew} forId={p.get('for')} date={p.get('date')} text={p.get('text')} />}
    </>
  )
}
