// 异常详情（右侧抽屉）：一段话说清 → 处理（状态、谁跟、处理记录、转成待办）→ 证据图 → 可能的原因（一句结论 + 数字）→ 建议（标明谁几点写的）→ 同一段时间的运营记录。
// 运营记录的原话只在最后的时间线里出现一次，编号 ①②③ 和证据图、原因里的引用对上。头部只放标题，手机上不占半屏。
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Bot, Database, ListPlus } from 'lucide-react'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { EditToggle, InlineText, Prose, ReadRow } from '@/components/detail-parts'
import { Choice } from '@/components/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, useApi, useWrite } from '@/lib/api'
import { md, shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizBadge, KbText } from '../parts'
import { circled, localStamp } from '../fmt'
import { BizError } from '../errors'
import { EvidenceChart } from './EvidenceChart'
import { TodoFromAnomaly } from './TodoFromAnomaly'
import type { AnomalyDetail } from '../types'

const STATUS = ['待处理', '处理中', '已处理'] as const
const TEAM = ['林总', '阿杰', '晓雯', '老何', '宋姐', '小周', '小陈', '小艾']

export function AnomalySheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: a, isError, error, refetch } = useApi<AnomalyDetail>(`/biz/anomalies/${encodeURIComponent(id)}`)
  const nav = useNavigate()
  const [todo, setTodo] = useState(false)
  const opNo = (opId: string | null) => (opId && a ? a.ops.findIndex((o) => o.id === opId) + 1 || null : null)
  return (
    <DetailSheet wide open onClose={onClose} eyebrow={a ? `经营异常 · ${a.channel_name ?? '全店'} · ${a.kind}` : '经营异常'} title={isError ? '没找到这条异常' : a?.title}
      meta={a && <>
        {a.active ? <BizBadge value={a.level} /> : <BizBadge value={a.status} />}
        <span>{a.active ? `${shortDate(a.since)} 开始` : `${shortDate(a.first_seen)} 报的`}{a.active && a.first_seen && a.first_seen !== a.since ? ` · 规则 ${md(a.first_seen)} 第一次报出` : ''}</span>
        {a.channel_id && <Link to={`/channel/${a.channel_id}`} className="whitespace-nowrap text-primary hover:underline">去{a.channel_name}页</Link>}
      </>}>
      {isError ? (
        <BizError error={error} onRetry={() => refetch()} hint="可能已经标了已处理、规则不再报，或者链接是旧的"
          action={<Button size="sm" variant="outline" onClick={() => nav('/biz?status=all')}>看全部异常</Button>} />
      ) : !a ? <div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-56" /><Skeleton className="h-28" /></div> : (
        <>
          <p className="mb-5 rounded-lg bg-surface-2/70 px-4 py-3 text-[14px] leading-relaxed">{a.detail}。{a.cause ? `${a.cause}。` : ''}</p>
          <Handle a={a} onTodo={() => setTodo(true)} />
          <SheetSection title="证据"><EvidenceChart ev={a.evidence} channel={a.channel_id} opNo={opNo} /></SheetSection>
          <Reasons a={a} opNo={opNo} />
          <Suggestions a={a} />
          {a.ops.length > 0 && (
            <SheetSection title="同一段时间的运营记录">
              <ol className="relative grid gap-2.5 border-l pl-4">
                {a.ops.map((o, i) => (
                  <li key={o.id} className="relative text-[13px]">
                    <span aria-hidden className="absolute top-0.5 -left-[25px] grid size-4 place-content-center rounded-full bg-card text-[13px] leading-none font-semibold text-muted-foreground">{circled(i + 1)}</span>
                    <div className="text-xs text-muted-foreground"><span className="num">{md(o.at)} {o.at.slice(11, 16)}</span> · {o.who} · {o.kind}{o.channel_name ? ` · ${o.channel_name}` : ' · 全店'}</div>
                    <div className="mt-0.5 leading-relaxed">{o.action}</div>
                  </li>
                ))}
              </ol>
            </SheetSection>
          )}
          {todo && <TodoFromAnomaly a={a} onClose={() => setTodo(false)} />}
        </>
      )}
    </DetailSheet>
  )
}

/** 处理：状态三段切换（选状态）+ 右边两个按钮（编辑、转成待办），下面是谁跟和处理记录 */
function Handle({ a, onTodo }: { a: AnomalyDetail; onTodo: () => void }) {
  const [editing, setEditing] = useState(false)
  const save = useWrite((patch: Record<string, unknown>) => api.patch(`/biz/anomalies/${encodeURIComponent(a.id)}`, patch), '已更新处理状态')
  return (
    <SheetSection title="处理">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">状态</span>
          <ToggleGroup type="single" variant="outline" size="sm" value={a.status} aria-label="处理状态"
            onValueChange={(v) => v && v !== a.status && save.mutate({ status: v })}>
            {STATUS.map((s) => <ToggleGroupItem key={s} value={s} className="px-3">{s}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <div className="ml-auto flex gap-2">
          <EditToggle editing={editing} onChange={setEditing} />
          <Button size="sm" variant="outline" onClick={onTodo}><ListPlus />转成待办</Button>
        </div>
      </div>
      {a.quiet && <p className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">按现在的阈值，规则已经不报这条了（可能是日报设置里调了阈值）；还没标“已处理”，所以还挂在这里。</p>}
      {editing ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">谁跟</span>
            <Choice value={a.owner} onChange={(v) => save.mutate({ owner: v })} options={TEAM} allowEmpty emptyLabel="还没定" placeholder="选一个人" /></label>
          <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">处理记录</span>
            <InlineText multiline value={a.note} onSave={(v) => save.mutate({ note: v })} placeholder="做了什么、结果怎样，比如“碎了的 14 单都已补发”" /></label>
        </div>
      ) : (
        <dl>
          <ReadRow label="谁跟" muted={!a.owner}>{a.owner ?? '还没定，点“编辑”指定'}</ReadRow>
          <ReadRow label="处理记录"><Prose text={a.note} empty="还没写。点“编辑”补上做了什么。" /></ReadRow>
          <ReadRow label="最近改动" muted>{a.updated_by ? `${a.updated_by} · ${localStamp(a.updated_at)}` : '还没人动过'}</ReadRow>
        </dl>
      )}
    </SheetSection>
  )
}

function Reasons({ a, opNo }: { a: AnomalyDetail; opNo: (id: string | null) => number | null }) {
  return (
    <SheetSection title="可能的原因（规则从数据里对出来的）">
      {a.reasons.length ? (
        <ol className="grid gap-2.5">
          {a.reasons.map((r, i) => {
            const refs = r.ops.map((x) => opNo(x)).filter((n): n is number => !!n)
            return (
              <li key={r.title} className="rounded-lg border bg-background/60 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="num mt-0.5 grid size-5 shrink-0 place-content-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] leading-snug font-medium">{r.title}</div>
                    {(r.tags.length > 0 || refs.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.tags.map((b) => <span key={b.label + b.value} className="rounded-md border bg-card px-1.5 py-0.5 text-[11.5px] whitespace-nowrap"><span className="text-muted-foreground">{b.label} </span><span className="num font-medium">{b.value}</span></span>)}
                        {refs.length > 0 && <span className="rounded-md border border-dashed px-1.5 py-0.5 text-[11.5px] whitespace-nowrap text-muted-foreground">运营记录 <span className="text-foreground">{refs.map(circled).join('')}</span></span>}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Database className="size-3" aria-hidden />依据：{r.source}</div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      ) : <p className="text-sm text-muted-foreground">数据里没对出明显的原因（退款原因、运营记录、推广计划都看过了）。先连着看两天。</p>}
    </SheetSection>
  )
}

function Suggestions({ a }: { a: AnomalyDetail }) {
  return (
    <SheetSection title="建议">
      {a.suggestions.length ? (
        <div className="rounded-lg border border-primary/25 bg-accent/40 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="size-3.5 text-primary" aria-hidden />由 {a.suggested_by} {localStamp(a.suggested_at)} 写 · 涉及价格、出价、发货方式的，要林总拍板</div>
          <ol className="grid list-decimal gap-1.5 pl-5 text-[13.5px] leading-relaxed marker:text-muted-foreground">{a.suggestions.map((s) => <li key={s}><KbText text={s} /></li>)}</ol>
        </div>
      ) : (
        <p className={cn('text-sm text-muted-foreground')}>{a.active ? '还没有建议。Codex 定时任务明早写早报时会一起写上。' : '这条处理完了，当时没有留建议；怎么处理的看上面的处理记录。'}</p>
      )}
    </SheetSection>
  )
}
