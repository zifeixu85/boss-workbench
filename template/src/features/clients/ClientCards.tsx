// 客户卡片：等级章 + 名字和联系人 + 四个关键数 + 下一步 + 提醒。归属：大客户模块
// 第二轮：等级改成方角小章“A 级”；金额同一个单位、不截断；在谈只算真谈过的，估的灰字写“估”。
// 第三轮（产品评审 #6 #22）：四个数按客户情况换——买过的看“今年成交 / 上次下单 / 待回款 / 多久没联系”；
//   有单在做、还没做完的看“在做 / 收款 / 卡在哪 / 多久没联系”；还没成交的看“在谈 / 预计哪天定 / 卡在哪 / 多久没联系”，不再三格都是“—”。
//   大客户却是 B、C 级的，名字下面一句小字说为什么。
// 第四轮：在做的、还没成交的只放三个数，“卡在哪”另起一整行写全（原来挤在第 3 格只剩“觉得我…”）；顾虑表里没有就用最近一次往来里听到的。
import type { ReactNode } from 'react'
import { useOverlay } from '@/app/overlay'
import { daysFromToday, md, relDay, shortDate, wan } from '@/lib/format'
import { StatusBadge } from '@/components/status'
import { MetaRow } from '@/components/data-view'
import { FlagChips, KeyMark, LevelMark, yuanToWan } from '@/features/crm/parts'
import { quietDays, silentText } from '@/features/crm/rules'
import type { ClientRow } from '@/features/crm/types'
import { cn } from '@/lib/utils'

function Num({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'danger' | 'muted' }) {
  return (
    <div className="min-w-0 px-2 py-2 first:pl-3">
      <dt className="text-[11px] whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className={cn('num mt-0.5 truncate font-heading text-[15px] leading-tight font-semibold whitespace-nowrap', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger', tone === 'muted' && 'font-normal text-muted-foreground')}>{value}</dd>
      {sub && <div className="num mt-0.5 truncate text-[11px] leading-snug whitespace-nowrap text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** 商机名里的份数（“春节客户礼 120 份”），配上金额算出每份多少 */
function perUnit(title: string | null, amountWan: number | null) {
  const qty = Number(title?.match(/(\d+)\s*份/)?.[1] ?? 0)
  if (!qty) return title?.includes('未定') ? '份数没定' : null
  return amountWan ? `${qty} 份 × ${Math.round((amountWan * 10000) / qty)}` : `${qty} 份，单价没定`
}

function quietCell(c: ClientRow) {
  const quiet = c.days_silent !== null && c.days_silent > quietDays(c.key_account === 1)
  if (c.days_silent !== null && c.days_silent <= 0) return <Num label="上次联系" value="今天" sub={c.last_contact ? md(c.last_contact) : undefined} />
  return <Num label="多久没联系" value={silentText(c.days_silent)} tone={quiet ? 'warn' : undefined} sub={c.last_contact ? `上次 ${md(c.last_contact)}` : '没联系过'} />
}

/** 卡在哪：一整行写全（第四轮：原来塞在第 3 格，只剩“觉得我…”三个字） */
function ConcernLine({ c }: { c: ClientRow }) {
  return (
    <p className="mx-4 mt-2 truncate text-[12.5px]" title={c.concern ? `${c.concern.text}${c.concern.source ? `（${c.concern.source}）` : ''}` : undefined}>
      <span className="text-muted-foreground">卡在哪：</span>
      {c.concern ? <>{c.concern.text}{c.concern.source && <span className="text-muted-foreground">（{c.concern.source}）</span>}</> : <span className="text-muted-foreground">还没听到顾虑，聊的时候问一句</span>}
    </p>
  )
}

/** 四个数（买过的）或三个数 + 卡在哪（在做的、还没成交的） */
function Numbers({ c }: { c: ClientRow }) {
  const recDays = c.receivable_due ? daysFromToday(c.receivable_due) : null
  const money = c.receivable_left ? <Num label="待回款" value={wan(c.receivable_left)} tone={recDays !== null && recDays < 0 ? 'danger' : undefined}
    sub={c.receivable_due ? (recDays! < 0 ? `逾期 ${-recDays!} 天` : `${md(c.receivable_due)} 到期`) : undefined} /> : null
  const grid = (n: 3 | 4, cells: ReactNode) => <dl className={cn('mx-4 mt-3 grid divide-x rounded-lg border bg-surface-2/50', n === 4 ? 'grid-cols-4' : 'grid-cols-3')}>{cells}</dl>
  if (c.total_spent > 0) {
    const ago = c.last_order ? -daysFromToday(c.last_order) : null
    const yearSub = c.spent_year ? (c.total_spent > c.spent_year ? `累计 ${wan(yuanToWan(c.total_spent))}` : `共 ${c.order_count} 单`) : `累计 ${wan(yuanToWan(c.total_spent))}`
    return grid(4, <>
      <Num label="今年成交" value={c.spent_year ? wan(yuanToWan(c.spent_year)) : '—'} tone={c.spent_year ? undefined : 'muted'} sub={yearSub} />
      <Num label="上次下单" value={c.last_order ? shortDate(c.last_order).replace(/^\d{4}年/, '') : '—'} tone={c.last_order ? undefined : 'muted'}
        sub={ago !== null ? (ago <= 365 ? `${ago} 天前` : `${c.last_order!.slice(0, 4)} 年`) : undefined} />
      {money ?? <Num label="待回款" value="—" tone="muted" sub="不欠钱" />}
      {quietCell(c)}
    </>)
  }
  if (c.pending_count > 0) {
    return <>
      {grid(3, <>
        <Num label="在做" value={wan(yuanToWan(c.pending_orders))} sub={`${c.pending_item ?? `${c.pending_count} 单`}${c.pending_date ? ` · ${md(c.pending_date)}` : ''}`} />
        {money ?? <Num label="收款" value="做完再收" tone="muted" sub="还没开单" />}
        {quietCell(c)}
      </>)}
      <ConcernLine c={c} />
    </>
  }
  const close = c.deal_close ? daysFromToday(c.deal_close) : null
  return <>
    {grid(3, <>
      <Num label="在谈" value={c.open_amount ? wan(c.open_amount) : c.deal_title ? '金额没定' : c.est_amount ? `估 ${wan(c.est_amount)}` : '—'}
        tone={c.open_amount ? undefined : 'muted'} sub={perUnit(c.deal_title, c.open_amount || null) ?? (c.est_amount ? '按上次的单估' : '还没开口')} />
      <Num label="预计哪天定" value={c.deal_close ? md(c.deal_close) : '没说'} tone={c.deal_close ? undefined : 'muted'}
        sub={close === null ? '问一句' : close < 0 ? `过了 ${-close} 天` : close === 0 ? '今天' : `还有 ${close} 天`} />
      {quietCell(c)}
    </>)}
    <ConcernLine c={c} />
  </>
}

export function ClientCards({ rows, showKeyMark = true }: { rows: ClientRow[]; showKeyMark?: boolean }) {
  const ov = useOverlay()
  if (!rows.length) return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">这个分类下没有客户，换个页签或清掉搜索看看</p>
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((c) => {
        const late = (c.follow_overdue ?? -1) > 0
        return (
          <button key={c.id} onClick={() => ov.openDetail('client', c.id)}
            className="group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-paper transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <div className="flex items-start gap-2 px-4 pt-3.5">
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  {c.kind === '客户' && <LevelMark level={c.level} />}
                  {showKeyMark && c.key_account === 1 && <KeyMark />}
                  <span className="truncate text-[15px] font-semibold">{c.name}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{[c.contact_name, c.contact_title].filter(Boolean).join(' · ') || c.label}{c.level_note && <span className="text-muted-foreground/80"> · {c.level_note}</span>}</span>
              </span>
              <StatusBadge value={c.stage} />
            </div>
            <Numbers c={c} />
            <p className="mx-4 mt-3 line-clamp-2 min-h-[2.6rem] text-[13px] leading-relaxed text-muted-foreground">
              {c.next_step ? <><span className="text-foreground/80">下一步：</span>{c.next_step}</> : c.last_summary ?? '还没有往来记录'}
            </p>
            <MetaRow className="mt-auto border-t px-4 py-2.5">
              <span className={late ? 'font-medium text-danger' : ''}>下次跟进 {c.next_follow ? relDay(c.next_follow) : '未定'}</span>
              {c.birthday && <span>{c.birthday.label} {relDay(c.birthday.date)}</span>}
              <FlagChips flags={c.flags} className="ml-auto" />
            </MetaRow>
          </button>
        )
      })}
    </div>
  )
}
