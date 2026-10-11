// 写回知识库要改（或改了）哪几处：默认用人话分组说（开头改几处、答应过的事加几行、偏好补几处、往来记录加一行、收件箱备注），
// 原始的表格行收进“看原文”。提取结果的预览和写入后的结果页共用。归属：大客户模块（第四轮修产品评审 #15）
import { useState } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KbAdd, KbEdit, KbHeader } from './types'

export type KbChangeSet = {
  path: string; line: string; new_section?: boolean; header: KbHeader[]; rows: string[]
  edits?: KbEdit[]; adds?: KbAdd[]; inbox?: { path: string; line: string } | null; backup?: string | null
}

const md = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}` : v ?? '空')
const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** “| 林总 | 若到 150 份，每份 240 | 没说 | 待兑现（和规则对不上，等林总定）（10/23 微信） |” → 一句人话 */
function promiseRow(row: string) {
  const [who, what, due, status] = cells(row)
  const flag = status?.match(/（(和规则对不上[^）]*)）/)?.[1]
  return { text: `${who}答应：${what}`, sub: [due && due !== '没说' ? `${md(due)} 前` : '没说哪天', flag].filter(Boolean).join(' · '), warn: !!flag && !/例外|该改/.test(flag) }
}

/** 原地追加的那一行：只说后面加了什么 */
function added(e: KbEdit) {
  const extra = e.new.startsWith(e.old.replace(/\s*\|\s*$/, '')) ? e.new.slice(e.old.replace(/\s*\|\s*$/, '').length) : e.new
  const said = extra.match(/补[：:]\s*([^；|（]+)/)?.[1]?.trim()
  return said ?? extra.replace(/^[\s|；;]+|[\s|]+$/g, '').replace(/（工作台[^）]*）/g, '').slice(0, 80)
}

/** 新加的一行（表格行或列表项）：去掉表格竖线和来源括号 */
function addText(a: KbAdd) {
  if (a.line.trim().startsWith('|')) { const [k, v] = cells(a.line); return `${k}：${v}` }
  return a.line.replace(/^-\s*/, '').replace(/（[^）]*工作台提取[^）]*）。?$/, '')
}

/** 往来记录那一行：“- 2026-10-23｜微信｜说了什么；答应：…；来源：…” → “10/23 微信：说了什么” */
function talkLine(line: string) {
  const [date, channel, rest] = line.replace(/^-\s*/, '').split('｜')
  const said = (rest ?? '').split('；答应：')[0]
  return `${md(date)} ${channel ?? ''}：${said}`
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      <span className="text-[12.5px] font-medium text-foreground">{title}{count !== undefined && <span className="num ml-1 font-normal text-muted-foreground">{count} 处</span>}</span>
      <div className="grid gap-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>
    </li>
  )
}

export function KbChanges({ c, done, className }: { c: KbChangeSet; done?: boolean; className?: string }) {
  const [raw, setRaw] = useState(false)
  const edits = c.edits ?? []
  const prefs = edits.filter((e) => e.label.startsWith('偏好'))
  const missing = edits.filter((e) => !e.label.startsWith('偏好'))
  const prefAdds = (c.adds ?? []).filter((a) => a.label.startsWith('偏好'))
  const concernAdds = (c.adds ?? []).filter((a) => a.label.startsWith('顾虑'))
  const total = 1 + c.header.length + c.rows.length + edits.length + (c.adds?.length ?? 0)
  const verb = done ? '' : '要'
  return (
    <div className={cn('grid gap-2 rounded-lg border bg-background/70 px-3 py-2.5', className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
        <FileText className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{c.path.split('/').pop()?.replace(/\.md$/, '')}</span>
        <span className="text-muted-foreground">{done ? '改了' : '要改'} {total} 处，{done ? '写之前备份了原文件' : '写之前先备份原文件'}；只在后面加，不删原来的字</span>
      </p>
      <ul className="grid gap-2 pl-5">
        {c.header.length > 0 && (
          <Group title={`开头${verb}改 ${c.header.length} 处`}>
            <span>{c.header.map((h) => `${h.key} ${md(h.old)} → ${md(h.new)}`).join('、')}</span>
          </Group>
        )}
        {c.rows.length > 0 && (
          <Group title={`答应过的事${verb}加 ${c.rows.length} 行`}>
            {c.rows.map((r) => { const p = promiseRow(r); return <span key={r} className={cn(p.warn && 'text-warn')}>· {p.text}<span className="text-muted-foreground/80">（{p.sub}）</span></span> })}
          </Group>
        )}
        {(prefs.length > 0 || prefAdds.length > 0) && (
          <Group title={`偏好与重要日子${verb}补 ${prefs.length + prefAdds.length} 处`}>
            {prefs.map((e) => <span key={e.label}>· {e.label.replace(/^偏好与重要日子 · /, '')}：{added(e)}</span>)}
            {prefAdds.map((a) => <span key={a.line}>· {addText(a)}</span>)}
          </Group>
        )}
        {missing.map((e) => <Group key={e.label} title={e.label.replace(' · ', '：')}><span>后面补一句：{added(e)}</span></Group>)}
        {concernAdds.length > 0 && (
          <Group title={`顾虑${verb}加 ${concernAdds.length} 条`}>{concernAdds.map((a) => <span key={a.line}>· {addText(a)}</span>)}</Group>
        )}
        <Group title={`往来记录${c.new_section ? '（新开一节）' : ''}${verb}加 1 行`}><span className="line-clamp-2">{talkLine(c.line)}</span></Group>
        {c.inbox && <Group title="收件箱原件末尾加一句备注"><span>写明哪天由工作台提取、林总确认；原件不移动，知识库整理时再移走</span></Group>}
      </ul>
      <button type="button" onClick={() => setRaw((v) => !v)} className="inline-flex items-center gap-1 justify-self-start text-[12px] text-primary hover:underline">
        <ChevronRight className={cn('size-3.5 transition-transform', raw && 'rotate-90')} />{raw ? '收起原文' : '看原文（加进文件的那几行）'}
      </button>
      {raw && (
        <div className="grid gap-1 overflow-x-auto rounded-md bg-muted/70 px-3 py-2 text-[12px] leading-relaxed">
          {c.header.map((h) => <span key={h.key} className="whitespace-pre-wrap">{h.key}: <s className="text-muted-foreground">{h.old ?? ''}</s> → {h.new}</span>)}
          {edits.map((e) => <span key={e.label} className="whitespace-pre-wrap"><span className="text-ok">~</span> {e.new}</span>)}
          {[...c.rows, ...(c.adds ?? []).map((a) => a.line), c.line].map((l) => <span key={l} className="whitespace-pre-wrap"><span className="text-ok">+</span> {l}</span>)}
          {c.inbox && <span className="whitespace-pre-wrap"><span className="text-ok">+</span> {c.inbox.path} 末尾：备注：{c.inbox.line.replace(/^备注：/, '')}</span>}
          {c.backup && <span className="text-muted-foreground">备份：{c.backup}</span>}
        </div>
      )}
    </div>
  )
}
