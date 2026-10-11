// 详情抽屉的两种身体：只读排版 / 编辑。用的是真抽屉里同一套零件（components/detail-parts.tsx）
import { useState } from 'react'
import { MessageCircleMore } from 'lucide-react'
import { toast } from 'sonner'
import { relDay, shortDate, wan } from '@/lib/format'
import { SheetSection } from '@/components/sheet-shell'
import { StatusBadge } from '@/components/status'
import { Choice, DatePicker, FormField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { EditToggle, HeroFact, InlineText, Prose, ReadRow } from '@/components/detail-parts'
import { CLIENTS, LOGS } from './display/data'

export const DEMO = CLIENTS[0]
const STAGES = ['新线索', '需求确认', '方案中', '报价中', '待签约', '待复购']
const NOTE = `${DEMO.note}。\n送客户要体面、低调，不要网红风；行政对接，合伙人拍板。`
const saved = (what: string) => toast.success(`示例：${what}已保存（不会写进数据库）`)

export function ReadBody() {
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <HeroFact label="下次跟进" value={relDay(DEMO.next)} sub={shortDate(DEMO.next)} />
        <HeroFact label="预算" value={wan(DEMO.budget)} sub="对方说的上限" />
      </div>
      <SheetSection title="基本信息">
        <dl>
          <ReadRow label="阶段"><StatusBadge value={DEMO.stage} /></ReadRow>
          <ReadRow label="来源">{DEMO.source}</ReadRow>
          <ReadRow label="城市">{DEMO.city}</ReadRow>
        </dl>
      </SheetSection>
      <SheetSection title="背景"><Prose text={NOTE} /></SheetSection>
      <SheetSection title="最近跟进">
        <ul className="grid gap-2">
          {LOGS.filter((l) => l.who === DEMO.name).map((l) => (
            <li key={l.id} className="text-[13px]"><span className="num mr-2 text-xs text-muted-foreground">{shortDate(l.date)} {l.channel}</span>{l.summary}</li>
          ))}
        </ul>
      </SheetSection>
    </div>
  )
}

/** 字段式编辑：每一项失焦或选好就保存，改完点右上角“完成”回到只读 */
export function EditBody() {
  const [stage, setStage] = useState(DEMO.stage)
  const [next, setNext] = useState<string | null>(DEMO.next)
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="阶段"><Choice value={stage} onChange={(x) => { if (x) { setStage(x); saved('阶段') } }} options={STAGES} /></FormField>
        <FormField label="下次跟进"><DatePicker value={next} onChange={(x) => { setNext(x); saved('下次跟进') }} /></FormField>
      </div>
      <FormField label="来源"><InlineText value={DEMO.source} onSave={() => saved('来源')} /></FormField>
      <FormField label="背景" hint="长期有用的话写这里，会存进知识库"><InlineText multiline value={NOTE} onSave={() => saved('背景')} /></FormField>
      <p className="text-xs text-muted-foreground">每一项改完就自动保存，不用找“保存”按钮；改完点右上角“完成”。</p>
    </div>
  )
}

/** 抽屉页头下面的操作：编辑 / 完成开关 + 常用动作 */
export function DemoActions({ editing, onChange }: { editing: boolean; onChange: (v: boolean) => void }) {
  return (
    <>
      <EditToggle editing={editing} onChange={onChange} />
      {!editing && <Button size="sm" variant="outline" onClick={() => toast('实际页面会打开“记一笔跟进”弹窗')}><MessageCircleMore />记一笔跟进</Button>}
    </>
  )
}
