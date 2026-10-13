// 新材料提取的结果：顶上一句结论；各段默认只读排版，右上角“改”才变输入框；和判断规则对不上的只在那条答应里展开，当场能定；
// 待办默认只勾我们要做、有日子、不重复的；商机金额要不要改由老板勾；确认后才写入。归属：大客户模块
// 第四轮（产品评审 #15、数据评审 #4 #8 #9 #15 #19）：写回知识库的预览用人话分组说（开头几处、答应过的事、偏好与重要日子、顾虑、往来、收件箱备注），原文收进“看原文”；
//   “之前记着、还没做的”改成勾选、确认写入时一起关（撤销能恢复），过时的回访草稿默认勾上；预先跑的结果写“事先”，不写日子；
//   Codex 那句改成“只能看、不能改文件”（只读沙箱也能看本机别的文件，不说“只读了知识库”）。
import { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, ChevronUp, CircleAlert, Handshake, Hourglass, Inbox, ListTodo, Sparkles } from 'lucide-react'
import { CHANNELS } from '@shared/schema'
import { api, useWrite } from '@/lib/api'
import { relDay, shortDate, wan, weekday } from '@/lib/format'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Choice, ClientChoice } from '@/components/form'
import { StatusBadge } from '@/components/status'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SourceLink } from './parts'
import { initialDraft, payloadOf, similar, type Draft } from './extract-utils'
import { ConflictBox, Section, ShortDate } from './extract-parts'
import { KbChanges } from './kb-changes'
import type { Extraction, KbPreview } from './types'
import { useIdentity } from '@/lib/identity'

type Preview = KbPreview

export function ExtractResult({ x }: { x: Extraction }) {
  const mobile = useIsMobile()
  const { owner } = useIdentity()
  const [d, setD] = useState<Draft>(() => initialDraft(x, owner))
  const [edit, setEdit] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [showPlan, setShowPlan] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const ed = (k: string) => ({ editing: !!edit[k], onEdit: (v: boolean) => setEdit((e) => ({ ...e, [k]: v })) })
  const payload = useMemo(() => payloadOf(d), [d])
  const r = x.result!
  const confirm = useWrite((b: unknown) => api.post<Extraction>(`/crm/extractions/${x.id}/confirm`, b), '已写入：往来记录、答应的事、待办和下次跟进')
  const discard = useWrite(() => api.post(`/crm/extractions/${x.id}/discard`, {}), '这次提取不要了，什么都没写')

  // 写回知识库要改的几处：写之前先给看（改表单后 0.4 秒更新一次）
  useEffect(() => {
    if (!d.client_id || !d.summary.trim() || !d.kb_append) { setPreview(null); return }
    const h = setTimeout(() => { api.post<Preview>(`/crm/extractions/${x.id}/preview`, payload).then(setPreview).catch(() => setPreview(null)) }, 400)
    return () => clearTimeout(h)
  }, [payload, d.client_id, d.summary, d.kb_append, x.id])

  const clientName = x.client?.name ?? '这位客户'
  const said = `${shortDate(d.date)}${d.channel}`
  const on = payload.promises.length
  const yellow = d.promises.filter((p) => p.on && p.conflict && !p.decision).length
  const kbCount = d.kb_append && preview?.ok ? 1 + preview.header.length + preview.rows.length + preview.edits.length + preview.adds.length : 0
  const closing = d.close.filter((c) => c.on).length
  const items = 1 + on + payload.todos.length + (d.next_follow ? 1 : 0) + payload.traits.length + payload.dates.length + (payload.deal ? 1 : 0) + closing
  const plan = [`往来记录 1 条`, on && `答应的事 ${on} 件${yellow ? `（${yellow} 件标黄）` : ''}`, payload.todos.length && `待办 ${payload.todos.length} 条`,
    d.next_follow && `下次跟进 ${shortDate(d.next_follow)}（自动建待办）`, payload.traits.length && `喜好 ${payload.traits.length} 条`, payload.dates.length && `重要日子 ${payload.dates.length} 个`,
    payload.deal && `商机改成 ${wan(payload.deal.amount)}`, closing && `关掉之前记着的 ${closing} 件`, kbCount && `知识库客户文件 ${kbCount} 处`].filter(Boolean) as string[]
  // 和规则对不上、但没落在哪条答应上的（落在答应上的已经在那条里展开了）
  const loose = x.conflicts.filter((c) => !d.promises.some((p) => p.conflict && (similar(p.text, c.about) >= 0.35 || (p.rule && c.rule && similar(p.rule, c.rule) >= 0.6))))
  const inPromises = d.promises.filter((p) => p.conflict).length
  const prepared = (x.engine ?? '').startsWith('预先')

  const conclusion = [
    `答应 ${on} 件${yellow ? `（${yellow} 件标黄）` : ''}`,
    r.not_decided ? '对方还没定，不算成交' : null,
    d.next_follow ? `下次跟进 ${shortDate(d.next_follow)}` : null,
    `会建 ${payload.todos.length} 个待办`,
  ].filter(Boolean)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-[12.5px]', prepared ? 'border-warn/30 bg-warn-soft/60 text-warn' : 'border-info/25 bg-info-soft/60 text-info')}>
        <Sparkles className="size-4 shrink-0" />
        {prepared
          ? <span className="min-w-0">这是{x.engine?.replace(/^预先跑好的 · /, '') ?? '事先'}用 Codex 跑过一次的结果，不是现场生成；Codex 现在用不了时拿来演示</span>
          : <Tooltip><TooltipTrigger asChild><span className="min-w-0 cursor-help">本机 Codex 现场提取的 · 用时 {x.elapsed_s} 秒 · 只能看、不能改文件</span></TooltipTrigger><TooltipContent>{x.model ? `用的模型：${x.model}` : '没记下模型名'}</TooltipContent></Tooltip>}
        <span className="ml-auto text-foreground/70">点“确认写入”之前，什么都没写</span>
      </div>

      <section className="rounded-xl border bg-card px-5 py-4 shadow-paper">
        <p className="text-[12px] text-muted-foreground">{clientName} · {shortDate(d.date)} {weekday(d.date)} · {d.channel}{d.with_whom ? ` · 和 ${d.with_whom}` : ''}</p>
        <p className="mt-1 font-heading text-[17px] leading-snug font-semibold">{conclusion.join(' · ')}</p>
        {!d.client_id && <p className="mt-1.5 text-[12.5px] text-warn">先选是哪位客户：说话人不明的，问清楚再写，别猜。</p>}
      </section>

      <Section title="是谁、哪天、说了什么" hint={r.client.sure ? `Codex：${r.client.why}` : `Codex 拿不准是谁：${r.client.why}`} {...ed('who')} onEdit={d.client_id ? ed('who').onEdit : undefined} editing={!d.client_id || !!edit.who}
        edit={<div className="grid gap-2.5">
          <div className="max-w-sm"><ClientChoice kind="客户" value={d.client_id || null} onChange={(v) => set('client_id', v ?? '')} /></div>
          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 sm:grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)]">
            <ShortDate value={d.date} clearable={false} onChange={(v) => v && set('date', v)} />
            <Choice value={d.channel} onChange={(v) => set('channel', v ?? '微信')} options={CHANNELS} />
            <Input value={d.with_whom} onChange={(e) => set('with_whom', e.target.value)} placeholder="和谁" className="col-span-2 sm:col-span-1" />
          </div>
          <Textarea rows={3} value={d.summary} onChange={(e) => set('summary', e.target.value)} />
        </div>}>
        <p className="text-[14px] leading-relaxed">{d.summary}</p>
      </Section>

      <Section id="promises" title="你答应的" hint="勾上的写进“答应过的事”；和已经记着的重复的默认不勾" icon={<BookOpenCheck className="size-4 text-primary" />} {...ed('promises')}
        edit={<ul className="grid gap-2">{d.promises.map((p, i) => (
          <li key={i} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_170px]">
            <Input value={p.text} onChange={(e) => set('promises', d.promises.map((q, j) => (j === i ? { ...q, text: e.target.value } : q)))} />
            <ShortDate value={p.due} placeholder="哪天前（没说）" onChange={(v) => set('promises', d.promises.map((q, j) => (j === i ? { ...q, due: v } : q)))} />
          </li>))}</ul>}>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {d.promises.map((p, i) => (
            <li key={i} className={cn('rounded-lg border p-2.5', p.conflict && !p.decision ? 'border-warn/50 bg-warn-soft' : 'bg-background/60', !p.on && 'opacity-60')}>
              <div className="flex items-start gap-2.5">
                <Checkbox className="mt-0.5" checked={p.on} onCheckedChange={(c) => set('promises', d.promises.map((q, j) => (j === i ? { ...q, on: !!c } : q)))} aria-label="写入这一条" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-medium">{p.text}</span>
                    <span className="num text-[12.5px] whitespace-nowrap text-muted-foreground">{p.due ? `${shortDate(p.due)}前 · ${relDay(p.due)}` : '没说哪天'}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{p.who} 答应 {p.to_whom || '对方'} · 原话：“{p.quote}”</p>
                  {p.dup && <p className="mt-1 text-[12px] text-muted-foreground">和已经记着的“{p.dup}”是一件事，默认不重复写。</p>}
                </div>
              </div>
              {p.conflict && <ConflictBox p={p} clientName={clientName} said={said} source={x.source_path} ruleFile={x.conflicts[0]?.rule_file}
                onDecide={(v) => set('promises', d.promises.map((q, j) => (j === i ? { ...q, decision: v.decision, decision_note: v.note } : q)))} />}
            </li>
          ))}
          {!d.promises.length && <p className="text-[13px] text-muted-foreground">这份材料里你没答应什么。</p>}
        </ul>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="对方的状态" icon={<Hourglass className="size-4 text-muted-foreground" />} {...ed('status')}
          edit={<Textarea rows={3} value={d.their_status} onChange={(e) => set('their_status', e.target.value)} />}>
          {r.not_decided && <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]"><StatusBadge value="还没定" tone="warn" />不算成交，阶段不改（现在是“{x.client?.stage ?? '—'}”）</p>}
          <p className="text-[13.5px] leading-relaxed">{d.their_status || <span className="text-muted-foreground">没说</span>}</p>
        </Section>
        <Section title="顾虑 · 怎么定" {...ed('signals')}
          edit={<div className="grid gap-2"><Textarea rows={2} value={d.concerns} onChange={(e) => set('concerns', e.target.value)} placeholder="顾虑" /><Textarea rows={2} value={d.signals} onChange={(e) => set('signals', e.target.value)} placeholder="怎么定：谁拍板、哪天定、在跟谁比" /></div>}>
          <dl className="grid gap-1.5 text-[13px] leading-relaxed">
            <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted-foreground">顾虑</dt><dd className="min-w-0">{d.concerns || '没听到'}</dd></div>
            <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted-foreground">怎么定</dt><dd className="min-w-0">{d.signals || '没有'}</dd></div>
          </dl>
        </Section>
      </div>

      <Section title="下一步" hint="勾上的建成待办" icon={<ListTodo className="size-4 text-primary" />} {...ed('next')}
        edit={<div className="grid gap-2">
          {d.todos.map((t, i) => (
            <div key={i} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_170px]">
              <Input value={t.title} onChange={(e) => set('todos', d.todos.map((q, j) => (j === i ? { ...q, title: e.target.value } : q)))} />
              <ShortDate value={t.due} placeholder="哪天" onChange={(v) => set('todos', d.todos.map((q, j) => (j === i ? { ...q, due: v } : q)))} />
            </div>
          ))}
          <div className="grid gap-1.5 border-t border-dashed pt-2 sm:grid-cols-[170px_minmax(0,1fr)]">
            <ShortDate value={d.next_follow} placeholder="下次跟进" onChange={(v) => set('next_follow', v)} />
            <Input value={d.next_step} onChange={(e) => set('next_step', e.target.value)} placeholder="那天做什么" />
          </div>
        </div>}>
        <ul className="grid gap-1.5">
          {d.todos.map((t, i) => (
            <li key={i} className={cn('flex items-start gap-2.5 text-[13.5px]', !t.on && 'text-muted-foreground')}>
              <Checkbox className="mt-0.5" checked={t.on} onCheckedChange={(c) => set('todos', d.todos.map((q, j) => (j === i ? { ...q, on: !!c } : q)))} aria-label="建成待办" />
              <span className="min-w-0 flex-1">{t.title}{t.due && <span className="num ml-1.5 whitespace-nowrap text-muted-foreground">{shortDate(t.due)}</span>}{!t.on && t.why && <span className="block text-[12px]">没勾：{t.why}</span>}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2 text-[13px]">
          <span className="text-muted-foreground">下次跟进</span> <b className="num font-semibold">{d.next_follow ? `${shortDate(d.next_follow)} ${weekday(d.next_follow)}` : '不约'}</b>
          {x.client?.next_follow && x.client.next_follow !== d.next_follow && <span className="text-muted-foreground">（原来 {shortDate(x.client.next_follow)}）</span>}
          {x.client?.next_follow && x.client.next_follow === d.next_follow && <span className="text-muted-foreground">（和原来约的一样）</span>}
          {d.next_step && <span className="block text-muted-foreground">那天做什么：{d.next_step}</span>}
          {r.next_follow.why && <span className="block text-[12px] text-muted-foreground">Codex 为什么建议这天：{r.next_follow.why}{d.next_follow ? ` · 会有一条“跟进”待办，${relDay(d.next_follow)}出现在今日页` : ''}</span>}
        </div>
      </Section>

      {(d.traits.length > 0 || d.dates.length > 0) && (
        <Section title="喜好和重要日子" hint="关怀和做方案用得上的；生日写进去，关怀页就会提醒">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
            {d.dates.map((x2, i) => (
              <li key={`d${i}`} className="flex items-center gap-2.5">
                <Checkbox checked={x2.on} onCheckedChange={(c) => set('dates', d.dates.map((q, j) => (j === i ? { ...q, on: !!c } : q)))} />
                <StatusBadge value={x2.kind} tone="primary" /><span className="min-w-0 flex-1">{x2.label}</span>
                <span className="num whitespace-nowrap text-muted-foreground">{x2.date.startsWith('--') ? `每年 ${Number(x2.date.slice(2, 4))}月${Number(x2.date.slice(5, 7))}日` : shortDate(x2.date)}</span>
              </li>
            ))}
            {d.traits.map((t, i) => (
              <li key={`t${i}`} className="flex items-start gap-2.5">
                <Checkbox className="mt-0.5" checked={t.on} onCheckedChange={(c) => set('traits', d.traits.map((q, j) => (j === i ? { ...q, on: !!c } : q)))} />
                <StatusBadge value={t.kind} tone="neutral" /><span className="min-w-0 flex-1">{t.text}{t.why && !t.on && <span className="ml-1.5 text-[12px] text-muted-foreground">{t.why}</span>}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {d.deal && (
        <Section title="商机金额要不要改" hint="默认不改，你定" icon={<Handshake className="size-4 text-muted-foreground" />}>
          <p className="text-[13px] leading-relaxed">
            {d.deal.title}：现在记 <b className={cn('num font-semibold', d.deal.estimated && 'text-muted-foreground')}>{d.deal.estimated ? '估 ' : ''}{wan(d.deal.old)}</b>
            {x.deal_hint ? <>。这次说约 {x.deal_hint.qty} 份、每份 {x.deal_hint.unit_price} → 约 <b className="num font-semibold">{wan(x.deal_hint.amount)}</b>（{x.deal_hint.why}）</> : '。这份材料里没说份数和单价。'}
          </p>
          <label className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <Checkbox checked={d.deal.on} onCheckedChange={(c) => set('deal', { ...d.deal!, on: !!c })} />改成
            <Input value={d.deal.amount} inputMode="decimal" onChange={(e) => set('deal', { ...d.deal!, amount: e.target.value, on: true })} className="h-8 w-20 text-right" />万，算谈过的
            <span className="text-[12px] text-muted-foreground">（依据：{d.deal.basis}）</span>
          </label>
        </Section>
      )}

      {d.close.length > 0 && (
        <Section title={`${clientName}之前记着、还没做的`} hint="这份材料让哪件不用做了，勾上；确认写入时一起关掉，撤销时一起恢复" icon={<Inbox className="size-4 text-muted-foreground" />}>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
            {d.close.map((c, i) => (
              <li key={c.id} className={cn('flex items-start gap-2.5', !c.on && 'text-foreground/90')}>
                <Checkbox className="mt-0.5" checked={c.on} onCheckedChange={(v) => set('close', d.close.map((q, j) => (j === i ? { ...q, on: !!v } : q)))} aria-label="确认写入时关掉这一件" />
                <span className="min-w-0 flex-1">
                  <span className="mr-1.5 inline-flex h-5 items-center rounded-md border bg-surface-2/60 px-1.5 align-middle text-[12px] text-muted-foreground">{c.kind}</span>
                  <span className="align-middle">{c.text.length > 60 ? `${c.text.slice(0, 60)}…` : c.text}</span>
                  {c.date && <span className="num ml-1 align-middle whitespace-nowrap text-muted-foreground">（{shortDate(c.date)}）</span>}
                  {c.on && <span className="block text-[12px] text-muted-foreground">{c.why ?? '确认写入时关掉'}{c.kind === '关怀草稿' ? '：标“不做”' : c.kind === '待办' ? '：标“取消”' : '：标“不做了”'}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.unsure.length > 0 && (
        <Section title="Codex 拿不准的" icon={<CircleAlert className="size-4 text-muted-foreground" />}>
          <ul className="grid gap-1 text-[13px] text-muted-foreground">{r.unsure.map((u) => <li key={u}>· {u}</li>)}</ul>
        </Section>
      )}

      {inPromises > 0 && loose.length === 0 && (
        <a href="#promises" className="flex items-center gap-1.5 rounded-lg border border-dashed border-warn/40 px-3 py-2 text-[12.5px] text-warn hover:bg-warn-soft/50">
          <ChevronUp className="size-4" />{inPromises} 条和判断规则对不上，在上面“你答应的”里定
        </a>
      )}
      {loose.length > 0 && (
        <Section title="还有和判断规则对不上的" tone="warn">
          <ul className="grid gap-2 text-[13px]">
            {loose.map((c, i) => <li key={i}><b className="font-medium">{c.about}</b>：{c.why}{c.rule_file && <SourceLink path={c.rule_file} label="看规则原文" className="ml-2 align-middle" />}</li>)}
          </ul>
        </Section>
      )}

      <section className="rounded-xl border bg-card p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
          <Checkbox className="mt-0.5" checked={d.kb_append} onCheckedChange={(c) => set('kb_append', !!c)} />
          <span className="min-w-0 flex-1"><span className="font-medium">同时写回知识库</span>：这位客户的档案跟着更新，写之前先备份原文件；收件箱原件末尾记一句“已提取”。</span>
        </label>
        {d.kb_append && preview && (preview.ok
          ? <KbChanges className="mt-2.5 ml-6" c={preview} />
          : <p className="mt-1.5 ml-6 text-[12px] text-muted-foreground">{preview.error}</p>)}
      </section>

      <section className="sticky bottom-3 z-10 rounded-xl border bg-card/95 px-4 py-3 shadow-float backdrop-blur">
        {mobile ? (
          <>
            {showPlan && <p className="mb-2 text-[12.5px] text-muted-foreground">会写入：{plan.join(' · ')}</p>}
            <div className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 text-left text-[13px] font-medium" onClick={() => setShowPlan((v) => !v)}>会写入 {items} 项 {showPlan ? '▾' : '▸'}</button>
              <Button variant="ghost" size="sm" disabled={discard.isPending} onClick={() => discard.mutate(undefined)}>放弃</Button>
              <Button size="sm" disabled={!d.client_id || !d.summary.trim() || confirm.isPending} onClick={() => confirm.mutate({ ...payload, kb_line: d.kb_append && preview?.ok ? preview.line : null })}>{confirm.isPending ? '写入中…' : '确认写入'}</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">会写入：{plan.join(' · ')}</span>
            <Button variant="ghost" disabled={discard.isPending} onClick={() => discard.mutate(undefined)}>放弃这次</Button>
            <Button disabled={!d.client_id || !d.summary.trim() || confirm.isPending} onClick={() => confirm.mutate({ ...payload, kb_line: d.kb_append && preview?.ok ? preview.line : null })}>
              {confirm.isPending ? '写入中…' : '确认写入'}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
