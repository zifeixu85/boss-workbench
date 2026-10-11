// 7. 详情与表单：详情在右侧抽屉、默认只读排版、点“编辑”再改；新建用弹窗；删除二次确认；地址栏参数
import { useState } from 'react'
import { PanelRightOpen, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DetailSheet } from '@/components/sheet-shell'
import { StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Code, Example, Rules, Section } from '../parts'
import { DEMO, DemoActions, EditBody, ReadBody } from './detail-demo'

const PARAMS: [string, string][] = [
  ['?client=c_qian', '打开客户详情抽屉（?event= ?todo= ?project= 同理）'],
  ['?new=todo', '打开新建弹窗：todo / event / client / log / collect / ledger / deal / project / inbox'],
  ['&for=c_qian', '新建时预先关联的客户或应收款'],
  ['&date=2026-10-08T15:00', '新建日程、待办时预填的时间'],
  ['&text=…', '预填内容（比如把随手记转成待办）'],
  ['?view=board ?week=2026-W41', '页面自己的视图、选中的周，也写进地址栏'],
]

const KEYS: [string[], string][] = [[['⌘', 'K'], '全局搜索'], [['T'], '新建待办'], [['E'], '新建日程'], [['L'], '记一笔跟进'], [['C'], '新建客户'], [['N'], '随手记'], [['⌘', '↵'], '编辑框里保存'], [['Esc'], '关闭抽屉 / 弹窗']]

function MockSheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-float">
      <div className="border-b px-5 pt-4 pb-3">
        <div className="text-xs text-muted-foreground">客户 · {title}</div>
        <div className="mt-0.5 font-heading text-lg font-semibold">{DEMO.name}<span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{DEMO.label}</span></div>
        <div className="mt-1.5 flex gap-2 text-xs"><StatusBadge value={DEMO.stage} /></div>
      </div>
      <div className="max-h-[440px] overflow-y-auto px-5 py-4">{children}</div>
    </div>
  )
}

export function DetailSection() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  return (
    <Section title="详情与表单" desc="看详情、改内容、新建、删除，各有固定的做法。老板学会一次，所有模块都一样。">
      <Rules items={[
        <><b>详情一律在右侧抽屉</b>（<Code>DetailSheet</Code>），列表还留在左边，看完一个点下一个。</>,
        <><b>默认只读、排好版</b>：像一页资料那样读。点页头的“编辑”才出现输入框。</>,
        <>两种编辑法：<b>字段式</b>（抽屉里一项项改，失焦或选好就保存，改完点“完成”回到只读，用 <Code>EditToggle</Code> + <Code>InlineText</Code>）；<b>整篇式</b>（周报正文这种长文，改完点“保存”或 ⌘+回车，“取消”放弃）。</>,
        <><b>新建一律用弹窗</b>（<Code>FormDialog</Code>）：字段少、一屏填完；回车保存、Esc 关闭。</>,
        <><b>删除要二次确认</b>（<Code>AlertDialog</Code>），并说清删了会怎样。</>,
        <>抽屉和弹窗都由<b>地址栏参数</b>控制（<Code>app/overlay.ts</Code>）：能分享链接、刷新不丢、按“后退”就关闭。</>,
      ]} />

      <Example title="只读 vs 编辑" tag="<DetailSheet />" desc="同一个抽屉的两种状态。左边是默认看到的，右边是点了“编辑”之后。"
        use="字段多、要细看的东西：客户、项目、日程、待办。" avoid="不要一打开就是满屏输入框；不要把详情做成新页面跳走（客户整页 /clients/:id 只给嵌入和打印用）。" bodyClass="bg-surface-2/40">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => { setEditing(false); setOpen(true) }}><PanelRightOpen />打开真抽屉试试</Button>
          <span className="text-xs text-muted-foreground">示例数据，保存不会写进数据库</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <MockSheet title="只读"><ReadBody /></MockSheet>
          <MockSheet title="编辑中"><EditBody /></MockSheet>
        </div>
      </Example>

      <DetailSheet open={open} onClose={() => setOpen(false)} eyebrow="客户 · 示例" wide
        title={<>{DEMO.name}<span className="ml-2 font-sans text-sm font-normal text-muted-foreground">{DEMO.label}</span></>}
        meta={<><StatusBadge value={DEMO.stage} /><span>{editing ? '编辑中' : '只读'}</span></>}
        actions={<DemoActions editing={editing} onChange={setEditing} />}>
        {editing ? <EditBody /> : <ReadBody />}
      </DetailSheet>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Example title="地址栏参数" tag="useOverlay()" desc="页面里打开抽屉 / 弹窗，用 ov.openDetail('client', id)、ov.openNew('todo')，不要自己管 open 状态。">
          <dl className="grid gap-2 text-[13px]">
            {PARAMS.map(([k, v]) => (
              <div key={k} className="grid gap-x-3 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
                <dt><code className="font-mono text-[12px] break-all text-primary">{k}</code></dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Example>
        <div className="grid content-start gap-5">
          <Example title="快捷键" desc="光标在输入框里时，单个字母不生效；Windows 把 ⌘ 换成 Ctrl。">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
              {KEYS.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between gap-2">{label}<KbdGroup>{keys.map((k) => <Kbd key={k} className="min-w-6">{k}</Kbd>)}</KbdGroup></li>
              ))}
            </ul>
          </Example>
          <Example title="删除：二次确认" tag="<AlertDialog />" desc="按钮用 destructive 样式；确认框写清后果。">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 />删除这个客户</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除「{DEMO.name}」？</AlertDialogTitle>
                  <AlertDialogDescription>删除后在“最近改动”里留有记录，但内容不能恢复。（这是示例，不会真的删。）</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => toast('示例：没有删除任何东西')}>删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Example>
        </div>
      </div>
    </Section>
  )
}
