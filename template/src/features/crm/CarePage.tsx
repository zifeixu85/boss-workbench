// 关怀与回访：未来 30 天的生日、纪念日、节日（立冬）和太久没联系的人，每人一条建议（送什么、怎么说）；右边是春节要提前问的老客户。归属：大客户模块
// 第二轮：每张卡只留三个按钮，“谁写的”单独一行不截断；老板的规矩从知识库《大客户关怀》读（读不到只留看原文）。
// 第三轮（产品评审 #11 #12、数据评审 #7）：类型用中性灰标签、4—6 个字，下一行不再重复；依据拆成“口味 / 送礼对象 / 习惯”几小块、各带出处；
//   约好的日子已经过了的单独一组、写“已过 X 天”（青砚原定 10/20 联系）；右栏春节名单改成“去年买了什么 + 右边一个状态小标签”。
import { useSearchParams } from 'react-router'
import { Leaf, PhoneCall, Snowflake } from 'lucide-react'
import { useApi } from '@/lib/api'
import { addDays, daysFromToday, md, shortDate, todayStr, wan, weekday } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { PageBody, PageHeader, Panel, Stat, SubTabs } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { ViewTabs } from '@/components/view-tabs'
import { Failed, Loading } from '@/components/chart-kit'
import { CLIENT_TABS } from '@/features/clients/ClientsPage'
import { cn } from '@/lib/utils'
import { CareDraftCard } from './CareDraft'
import { SourceLink, yuanToWan } from './parts'
import type { CareData, CareItem, CareRules } from './types'
import { useIdentity } from '@/lib/identity'

const STATUS = [{ value: 'todo', label: '待处理' }, { value: 'sent', label: '已发出' }, { value: 'skip', label: '不做' }] as const

function weekOf(date: string | null, overdue?: CareItem['overdue']) {
  if (overdue) return '约好的日子已经过了'
  if (!date) return '没定日子：太久没联系的'
  const t = todayStr()
  const monday = addDays(t, -((new Date(`${t}T00:00:00`).getDay() + 6) % 7))
  if (date < addDays(monday, 7)) return '这周'
  if (date < addDays(monday, 14)) return '下周'
  return '再往后'
}

export default function CarePage() {
  const { data, error, refetch, isLoading } = useApi<CareData>('/crm/care?days=30')
  const { owner } = useIdentity()
  const [sp, setSp] = useSearchParams()
  const status = (STATUS.find((s) => s.value === sp.get('status'))?.value ?? 'todo')
  const t = todayStr()
  const items = data?.items ?? []
  const pick = (s: string) => items.filter((x) => (s === 'sent' ? x.status === '已送出' : s === 'skip' ? x.status === '不做' : !['已送出', '不做'].includes(x.status)))
  const shown = pick(status)
  const groups = [...new Set(shown.map((x) => weekOf(x.date, x.overdue)))]
  const count = (k: CareItem['kind']) => items.filter((x) => x.kinds.includes(k)).length
  return (
    <>
      <PageHeader eyebrow="客户" title="关怀与回访"
        desc={`未来 30 天（${shortDate(t)}—${shortDate(addDays(t, 30))}）该关心一下的人，每人一条建议：送什么、怎么说。话都是草稿，${owner}自己改、自己发；送礼的消息里不提单子。`}>
        <SubTabs items={CLIENT_TABS} />
      </PageHeader>
      <PageBody className="grid gap-5">
        {error ? <Failed message={error.message} onRetry={() => refetch()} /> : isLoading || !data ? <Loading /> : <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="这 30 天要关心" value={pick('todo').length} unit="位" hint={`已发出 ${pick('sent').length} 条`} />
            <Stat label="生日和纪念日" value={count('生日') + count('纪念日')} unit="个" hint={items.filter((x) => x.kinds.includes('生日') || x.kinds.includes('纪念日')).map((x) => x.client_name).join('、') || '这个月没有'} />
            <Stat label="立冬 11月7日" value={count('立冬')} unit="位老茶客" hint="天冷了，喝点暖的" />
            <Stat label="太久没联系" value={count('久未联系')} unit="位" tone={count('久未联系') ? 'warn' : undefined} hint="大客户 30 天、其他 60 天没联系" />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid content-start gap-4">
              <ViewTabs label="按状态" value={status} onChange={(v) => setSp((p) => { const n = new URLSearchParams(p); if (v === 'todo') n.delete('status'); else n.set('status', v); return n }, { replace: true })}
                items={STATUS.map((s) => ({ value: s.value, label: s.label, count: pick(s.value).length }))} className="justify-self-start" />
              {!shown.length && <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{status === 'todo' ? '这 30 天没有要关心的人了。' : status === 'sent' ? '还没有标记“已发出”的。发完回来点一下，免得重复发。' : '没有“这次不做”的。'}</p>}
              {groups.map((g) => (
                <section key={g} className="grid gap-3">
                  <h2 className={cn('text-[13px] font-semibold text-muted-foreground', g.startsWith('约好') && 'text-danger')}>{g}<span className="ml-1.5 font-normal">{shown.filter((x) => weekOf(x.date, x.overdue) === g).length} 位</span></h2>
                  {shown.filter((x) => weekOf(x.date, x.overdue) === g).map((x) => <CareRow key={x.key} x={x} />)}
                </section>
              ))}
            </div>
            <aside className="grid content-start gap-5">
              <SpringPanel spring={data.spring} />
              <RulesPanel rules={data.rules} />
            </aside>
          </div>
        </>}
      </PageBody>
    </>
  )
}

function CareRow({ x }: { x: CareItem }) {
  const ov = useOverlay()
  const od = x.overdue
  const dateTop = od ? od.days : x.date ? Number(x.date.slice(8, 10)) : x.days_silent
  // 第二行：什么日子、哪天（类型已经在右上角标签里，不再重复）
  const when = od ? `原定 ${shortDate(od.from)}联系，已过 ${od.days} 天；草稿建议 ${shortDate(x.date)}发`
    : x.kind === '久未联系' ? x.reason
      : x.kind === '关怀安排' ? [x.occasion !== x.tag && x.occasion.length > 4 ? x.occasion : null, x.date ? `${shortDate(x.date)}${weekday(x.date)}发` : null].filter(Boolean).join(' · ')
        : `${x.reason.replace(/（.*）$/, '')} · ${shortDate(x.date)}`
  return (
    <article className="grid grid-cols-[58px_minmax(0,1fr)] gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-paper sm:gap-4">
      <div className={cn('flex h-fit flex-col items-center rounded-lg border px-1 py-2 text-center', od ? 'border-danger/30 bg-danger-soft' : x.kind === '久未联系' ? 'border-warn/30 bg-warn-soft' : x.days_left !== null && x.days_left <= 3 ? 'border-primary/30 bg-accent' : 'bg-surface-2/60')}>
        <span className={cn('num font-heading text-[22px] leading-none font-semibold', od && 'text-danger')}>{dateTop}</span>
        <span className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground">{od ? '天前该联系' : x.date ? `${Number(x.date.slice(5, 7))}月 ${weekday(x.date)}` : '天没联系'}</span>
        {!od && x.date && x.days_left !== null && <span className={cn('mt-1 text-[11px] font-medium whitespace-nowrap', x.days_left <= 1 ? 'text-primary' : 'text-muted-foreground')}>{x.days_left === 0 ? '今天' : x.days_left === 1 ? '明天' : x.days_left > 0 ? `${x.days_left} 天后` : `过了 ${-x.days_left} 天`}</span>}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button onClick={() => ov.openDetail('client', x.client_id)} className="text-[15px] font-semibold hover:text-primary">{x.client_name}</button>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{x.label}</span>
          {x.key_account === 1 && <StatusBadge value="大客户" />}
          <span className="ml-auto inline-flex h-5 items-center rounded-md border bg-surface-2/60 px-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">{x.tag}</span>
        </div>
        <p className={cn('mt-1 text-[12.5px] text-muted-foreground', od && 'text-danger')}>
          {when}
          {x.also.length > 0 && <span className="text-muted-foreground"> · 另外：{x.also.join('；')}</span>}
        </p>
        {x.basis_items.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {x.basis_items.map((b) => (
              <span key={b.kind + b.text} className="inline-flex max-w-full min-w-0 items-baseline gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 text-[11.5px] leading-snug">
                <span className="shrink-0 text-muted-foreground">{b.kind}</span><span className="min-w-0 text-foreground/80">{b.text}</span>{b.source && <span className="shrink-0 text-muted-foreground/80">· {b.source}</span>}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2">
          <CareDraftCard compact clientName={x.client_name} care={{ id: x.care_id, client_id: x.client_id, occasion: x.occasion, date: x.date, gift: x.gift, message: x.message, status: x.status, author: x.author, author_kind: x.author_kind, note: x.note, sent_at: x.sent_at }} />
        </div>
      </div>
    </article>
  )
}

/** 老板的关怀规矩：从知识库《大客户关怀》读原话；读不到就只给原文链接 */
function RulesPanel({ rules }: { rules: CareRules }) {
  const { owner } = useIdentity()
  return (
    <Panel title={<span className="flex items-center gap-1.5"><Leaf className="size-4 text-primary" />{owner}的规矩</span>}
      desc={rules.found ? `${owner}的原话，摘自知识库《大客户关怀》${rules.confirm ? `（${rules.confirm}）` : ''}；知识库改了这里跟着变` : '知识库里没读到《大客户关怀》'} bodyClass="px-5 py-4">
      {rules.found && rules.rules.length > 0 && (
        <ul className="grid gap-2 text-[13px] leading-relaxed">
          {rules.rules.map((r) => <li key={r} className="flex gap-1.5"><span className="text-muted-foreground">“</span><span className="min-w-0">{r}<span className="text-muted-foreground">”</span></span></li>)}
        </ul>
      )}
      {rules.found && rules.donts.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1 text-[12px] font-medium text-muted-foreground">别这样做</p>
          <ul className="grid gap-1 text-[12.5px] text-muted-foreground">{rules.donts.slice(0, 4).map((r) => <li key={r}>· {r}</li>)}</ul>
        </div>
      )}
      <SourceLink path={rules.file} label={`看原文：${rules.file}`} className="mt-3" />
    </Panel>
  )
}

function SpringPanel({ spring }: { spring: CareData['spring'] }) {
  const ov = useOverlay()
  const status = (c: CareData['spring']['clients'][number]) => {
    if (c.deal && !c.deal.estimated) return { text: `在谈 ${c.deal.amount ? wan(c.deal.amount) : ''}`.trim(), tone: 'text-foreground border-primary/30 bg-accent' }
    if (c.next_follow && c.next_follow < todayStr()) return { text: `该联系了 · 过 ${daysFromToday(c.next_follow) * -1} 天`, tone: 'text-danger border-danger/30 bg-danger-soft' }
    if (c.next_follow) return { text: c.next_follow === todayStr() ? '今天联系' : `下次 ${md(c.next_follow)}`, tone: 'text-muted-foreground' }
    return { text: '还没开口', tone: 'text-warn border-warn/30 bg-warn-soft' }
  }
  return (
    <Panel title={<span className="flex items-center gap-1.5"><Snowflake className="size-4 text-info" />春节还有 {spring.days_left} 天</span>}
      desc={`${shortDate(spring.date)}。${shortDate(spring.presale)}开始预售，老客户先通知；企业客户过节前先问候，别一上来就报价`} bodyClass="p-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3 pt-1 pb-1.5 text-[11.5px] text-muted-foreground"><span>谁 · 今年买过什么</span><span>春节这次</span></div>
      <ul className="grid">
        {spring.clients.map((c) => {
          const st = status(c)
          const total = c.bought.reduce((a, b) => a + b.amount, 0)
          return (
            <li key={c.client_id}>
              <button onClick={() => ov.openDetail('client', c.client_id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-3 py-2 text-left hover:bg-muted/60">
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium"><span className="truncate">{c.name}</span>{c.key_account === 1 && <StatusBadge value="大客户" className="h-4 px-1 text-[10.5px]" />}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                    {c.bought.map((b) => `${b.occasion} ${b.qty} ${b.unit}${b.item.replace(/（.*）/, '')}`).join('；')}<span className="num"> · {wan(yuanToWan(total))}</span>
                  </span>
                </span>
                <span className={cn('inline-flex h-6 items-center rounded-md border px-2 text-[12px] whitespace-nowrap', st.tone)} title={c.deal?.estimated ? `按去年估 ${c.deal.amount ? wan(c.deal.amount) : ''}` : undefined}>{st.text}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="flex items-center gap-1.5 px-3 pt-1 pb-2 text-[11.5px] text-muted-foreground"><PhoneCall className="size-3" />名单来自订单：今年春节、中秋买过茶礼的企业，春节买过礼盒送人的老茶客</p>
    </Panel>
  )
}
