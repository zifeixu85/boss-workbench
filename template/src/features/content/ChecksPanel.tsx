// 发布前检查：规格、不能说的话、客户名字、新品名字和上线日、AI 腔、后台字眼。本地规则，不用 AI，边改边出结果。归属：小红书内容模块。
// 有问题的项放上面、展开写哪里有、建议怎么改；都过了就一行，点开看全部。下面是 Codex 写稿时自己核过的（之后有人改过就写清楚）。
import { useState } from 'react'
import { ChevronDown, CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { CheckItem, CheckResult } from '@shared/xhs-check'
import { cn } from '@/lib/utils'
import { useDocParam } from './KbDoc'
import { ExampleTag } from './badges'
import { mdhm } from './lib'
import type { AiCheck } from './types'

const ICON = {
  ok: <CircleCheck className="size-4 text-ok" aria-label="通过" />,
  warn: <TriangleAlert className="size-4 text-warn" aria-label="提醒" />,
  block: <OctagonAlert className="size-4 text-danger" aria-label="要改" />,
}

function Row({ i }: { i: CheckItem }) {
  const tips = [...new Set((i.hits ?? []).filter((h) => h.suggest).map((h) => h.suggest!))]
  return (
    <li className={cn('grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 px-3 py-2', i.level === 'block' && 'bg-danger-soft/60', i.level === 'warn' && 'bg-warn-soft/50')}>
      <span className="mt-0.5">{ICON[i.level]}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn('num text-[13px] font-medium', i.level === 'block' && 'text-danger', i.level === 'warn' && 'text-warn')}>{i.label}</span>
          <span className="text-xs text-muted-foreground">{i.detail}</span>
        </div>
        {i.level !== 'ok' && tips.length > 0 && <p className="mt-0.5 text-xs text-foreground/80">建议：{tips.join('；')}</p>}
      </div>
    </li>
  )
}

export function verdictOf(c: CheckResult) {
  return c.blocks ? `先改 ${c.blocks} 处再发` : c.warns ? `能发，${c.warns} 项提醒看一眼` : `${c.items.length} 项都过了`
}

export function ChecksPanel({ checks, ai, dirty }: { checks: CheckResult | null; ai?: AiCheck | null; dirty?: boolean }) {
  const doc = useDocParam()
  const [open, setOpen] = useState(false)
  if (!checks) return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">还没有稿件，写出第一版后这里自动查。</p>
  const bad = checks.items.filter((i) => i.level !== 'ok')
  const good = checks.items.filter((i) => i.level === 'ok')
  return (
    <section aria-label="发布前检查">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold">发布前检查 <span className="font-normal text-muted-foreground">· 按 {Number(checks.on.slice(5, 7))}/{Number(checks.on.slice(8, 10))} 发布来查</span></h3>
        <span className={cn('text-xs font-medium', checks.blocks ? 'text-danger' : checks.warns ? 'text-warn' : 'text-ok')}>{verdictOf(checks)}</span>
      </div>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {bad.map((i) => <Row key={i.key} i={i} />)}
        <li>
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40">
            <CircleCheck className="size-4 shrink-0 text-ok" />
            <span className="min-w-0 flex-1 truncate text-[13px]"><span className="font-medium text-ok">{bad.length ? `其余 ${good.length} 项都过了` : `${good.length} 项都过了`}</span><span className="ml-2 text-xs text-muted-foreground">{good.map((g) => g.label.replace(/ \d+\/\d+ 字| \d+ (个|张)/, '')).join('、')}</span></span>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </button>
        </li>
        {open && good.map((i) => <Row key={i.key} i={i} />)}
      </ul>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        查的词从{checks.sources.map((s, k) => (
          <span key={s.label}>{k > 0 && '、'}{s.path ? <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => doc.open(s.path!)}>{s.label}</button> : s.label}{s.note ? `（${s.note}）` : ''}</span>
        ))}里取，文件改了马上按新的查。
      </p>
      {ai && <AiChecks ai={ai} dirty={dirty} />}
    </section>
  )
}

/** Codex 写稿时自己核过的：之后有人改过稿子，就把改过的几版写出来——旧的自查不能当现在的结论，以上面的检查为准 */
function AiChecks({ ai, dirty }: { ai: AiCheck; dirty?: boolean }) {
  const changed = ai.later.length > 0 || dirty
  return (
    <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {changed ? `v${ai.version} 时 Codex 自己核过的（之后改过，以上面的检查为准）` : `Codex 写 v${ai.version} 时自己核过的`}
        <span className="font-normal">· {mdhm(ai.at)}</span>
        {ai.example && <ExampleTag />}
      </div>
      <ul className={cn('grid gap-1 text-xs', changed && 'text-muted-foreground')}>{ai.items.map((c, k) => <li key={k}><span className="text-muted-foreground">{c.item}：</span>{c.result}</li>)}</ul>
      {changed && (
        <ul className="mt-1.5 grid gap-0.5 border-t border-border/70 pt-1.5 text-xs text-warn">
          {ai.later.map((l) => <li key={l.version}>之后 v{l.version}：{l.author ?? ''}{l.origin}{l.note ? `（${l.note}）` : ''}</li>)}
          {dirty && <li>你手上还有没保存的修改</li>}
        </ul>
      )}
    </div>
  )
}
