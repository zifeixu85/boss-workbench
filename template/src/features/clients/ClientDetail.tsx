// 单个客户的全部信息。抽屉、整页（/clients/:id）、嵌入页（/embed/clients/:id，给 Codex 插件用）共用这一份。
// 头部：联系人与决策人、阶段、来源、累计消费、上次联系、下次跟进；下面 4 个页签（ClientTabs）。
// 归属：大客户模块。Overlays.tsx 用到这里导出的 5 个名字（useClientDetail、ClientTitle、ClientMeta、ClientActions、ClientBody），改名要同步。
// 第二轮：取数失败显示“没取到 + 重试”、按钮先禁用；伙伴用简化版。
// 第三轮（产品评审 #7 #9 #10 #22、README 线索 5）：标签行只留等级、大客户、城市（纯文字），不再重复阶段和描边标签；
//   手机上露 4 格（联系人、阶段、下次跟进、上次联系），“展开”只收来源和累计消费，不再透出灰格；
//   切到“概况”以外的页签，6 格收成一行摘要，正文往上提；“有新材料”只在蓝条里说一次；撞上门店停业的事标黄。
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { CalendarClock, CalendarPlus, ChevronDown, ExternalLink, FileSearch, ListPlus, MessageSquarePlus, MoveRight, Pencil, TriangleAlert } from 'lucide-react'
import { useApi } from '@/lib/api'
import { daysFromToday, shortDate, wan } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/app/overlay'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/status'
import { Skeleton } from '@/components/ui/skeleton'
import { Failed } from '@/components/chart-kit'
import { FlagChips, LevelMark, SourceLink, yuanToWan } from '@/features/crm/parts'
import { FollowDialog, StageDialog } from '@/features/crm/dialogs'
import { quietDays, silentText, toLocal } from '@/features/crm/rules'
import type { ClientProfile } from '@/features/crm/types'
import { ClientTabs } from './ClientTabs'

export function useClientDetail(id: string | null) {
  return useApi<ClientProfile>(id ? `/crm/clients/${encodeURIComponent(id)}` : null)
}

export function ClientTitle({ d }: { d?: ClientProfile }) {
  if (!d) return null
  // 手机上副信息另起一行，不把“员工礼”拆成两行（第四轮）
  return <>{d.client.name}{d.client.label && <span className="mt-0.5 block font-sans text-sm font-normal text-muted-foreground sm:mt-0 sm:ml-2 sm:inline">{d.client.label}</span>}</>
}

export function ClientMeta({ d }: { d?: ClientProfile }) {
  if (!d) return null
  const c = d.client
  return (
    <>
      {c.kind === '客户' && <LevelMark level={d.summary.level} />}
      {c.key_account === 1 && <StatusBadge value="大客户" />}
      {d.summary.level_note && <span className="text-muted-foreground">{d.summary.level_note}</span>}
      {c.city && <span className="text-muted-foreground">{d.summary.level_note ? '· ' : ''}{c.city}</span>}
    </>
  )
}

/** 抽屉 / 整页顶上的按钮：记一笔、改下次跟进、改阶段，其余收进“更多”。资料没取到时都先禁用 */
export function ClientActions({ id, withPageLink = true }: { id: string; withPageLink?: boolean }) {
  const ov = useOverlay()
  const { data } = useClientDetail(id)
  const [dlg, setDlg] = useState<'stage' | 'follow' | null>(null)
  const c = data?.client
  return (
    <>
      <Button size="sm" disabled={!c} onClick={() => ov.openNew('log', { for: id })}><MessageSquarePlus />记一笔跟进</Button>
      <Button size="sm" variant="outline" disabled={!c} onClick={() => setDlg('follow')}><CalendarClock />改下次跟进</Button>
      <Button size="sm" variant="outline" disabled={!c} onClick={() => setDlg('stage')}><MoveRight />改阶段</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={!c}>更多<ChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => ov.openNew('todo', { for: id })}><ListPlus />加一条待办</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ov.openNew('event', { for: id })}><CalendarPlus />约个时间</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ov.openNew('clientEdit', { for: id })}><Pencil />编辑资料</DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/clients/extract"><FileSearch />从新材料提取</Link></DropdownMenuItem>
          {withPageLink && <DropdownMenuItem asChild><Link to={`/clients/${id}`}><ExternalLink />整页打开</Link></DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {dlg === 'stage' && c && <StageDialog target={{ id: c.id, name: c.name, from: c.stage }} onClose={() => setDlg(null)} />}
      {dlg === 'follow' && c && <FollowDialog client={{ id: c.id, name: c.name, next_follow: c.next_follow, next_step: c.next_step }} onClose={() => setDlg(null)} />}
    </>
  )
}

function Fact({ label, children, sub, tone }: { label: string; children: ReactNode; sub?: ReactNode; tone?: 'danger' | 'warn' }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <div className="text-[11.5px] whitespace-nowrap text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 truncate text-[14.5px] font-medium', tone === 'danger' && 'text-danger', tone === 'warn' && 'text-warn')}>{children}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** “下次跟进”的说法：超期写“已过 X 天”（E5 修 #12：原来超过 30 天会写成“-40 天后”） */
function followText(date: string | null) {
  if (!date) return { text: '未定', sub: '点“改下次跟进”约一个日子', tone: undefined }
  const n = daysFromToday(date)
  if (n < 0) return { text: shortDate(date), sub: `已过 ${-n} 天`, tone: 'danger' as const }
  return { text: shortDate(date), sub: n === 0 ? '今天' : n === 1 ? '明天' : `${n} 天后`, tone: undefined }
}

/** 资料还没到：抽屉里从地址栏的 ?client=、整页从路径拿 ID，同一个查询看是不是出错了 */
function Pending() {
  const params = useParams()
  const [sp] = useSearchParams()
  const id = sp.get('client') ?? params.id ?? null
  const q = useClientDetail(id)
  if (q.error) return <Failed message={q.error.message} onRetry={() => q.refetch()} />
  return <div className="grid gap-3"><Skeleton className="h-36" /><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
}

export function ClientBody({ d }: { d?: ClientProfile }) {
  const mobile = useIsMobile()
  const [more, setMore] = useState(false)
  const [sp, setSp] = useSearchParams()
  if (!d) return <Pending />
  const c = d.client
  const s = d.summary
  const f = followText(c.next_follow)
  const partner = c.kind === '伙伴'
  const quiet = s.days_silent !== null && s.days_silent > quietDays(c.key_account === 1)
  const conflicts = d.promises.filter((p) => p.status === '待兑现' && p.conflict && !p.decision)
  const stageEdit = d.edits.find((e) => e.entity === '阶段')
  const overview = !sp.get('ctab') || sp.get('ctab') === 'overview'
  const lastText = c.last_contact ? shortDate(c.last_contact) : '—'
  const lastSub = s.days_silent !== null ? `${silentText(s.days_silent)}没联系${quiet && !partner ? '，太久了' : ''}` : undefined
  const spentText = d.stats.total_spent ? wan(yuanToWan(d.stats.total_spent)) : '—'
  const facts = {
    who: <Fact key="who" label={partner ? '联系人' : '联系人与决策人'} sub={c.decision_maker ?? undefined}>{c.contact_name ?? '—'}{c.contact_title && <span className="ml-1 text-xs font-normal text-muted-foreground">{c.contact_title}</span>}</Fact>,
    stage: <Fact key="stage" label="阶段" sub={stageEdit ? `${shortDate(toLocal(stageEdit.at))}从“${stageEdit.old_value}”改过来` : c.since ? `${shortDate(c.since)}开始往来` : undefined}>
      <StatusBadge value={c.stage} className="h-6 px-2 text-[13px]" />
    </Fact>,
    follow: <Fact key="follow" label="下次跟进" tone={f.tone} sub={<>{f.sub}{d.follow_todo && <span className="text-primary"> · 已建待办</span>}</>}>{f.text}</Fact>,
    src: <Fact key="src" label={partner ? '做什么' : '来源'} sub={partner ? undefined : c.source_detail ?? undefined}>{partner ? c.label ?? '—' : c.source ?? '—'}</Fact>,
    spent: partner
      ? <Fact key="since" label="合作多久" sub={c.since ? `${shortDate(c.since)}开始` : undefined}>{c.since ? `${Math.max(1, Math.round(-daysFromToday(c.since) / 365))} 年左右` : '—'}</Fact>
      : <Fact key="spent" label="累计消费" sub={d.stats.order_count ? `${d.stats.order_count} 单 · 上次 ${shortDate(d.stats.last_order)}` : s.pending_orders ? '有单在做，做完才算' : s.est_amount ? `估 ${wan(s.est_amount)}，还没谈` : '还没成交'}><span className="num">{spentText}</span></Fact>,
    last: <Fact key="last" label="上次联系" tone={quiet && !partner ? 'warn' : undefined} sub={lastSub}>{lastText}</Fact>,
  }
  // 桌面 3 × 2；手机先露 4 格（2 × 2），“展开”再看来源和累计消费
  const order = mobile ? [facts.who, facts.stage, facts.follow, facts.last, ...(more ? [facts.src, facts.spent] : [])] : [facts.who, facts.stage, facts.follow, facts.src, facts.spent, facts.last]
  const flags = s.flags.filter((x) => x !== '有新材料' || !s.materials.length) // 有新材料只在蓝条里说一次
  return (
    <div>
      <div className="overflow-hidden rounded-xl border bg-border">
        {overview ? (
          <div className="grid grid-cols-2 gap-px sm:grid-cols-3">
            {order}
            {mobile && <button type="button" onClick={() => setMore((v) => !v)} className="col-span-2 bg-card px-4 py-2 text-left text-[12.5px] text-primary">{more ? '收起' : '展开：来源、累计消费'}</button>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-card px-4 py-2.5 text-[13px]">
            <span><span className="text-muted-foreground">下次跟进 </span><span className={cn('num font-medium', f.tone === 'danger' && 'text-danger')}>{f.text}</span><span className="text-xs text-muted-foreground">（{f.sub}）</span></span>
            <span><span className="text-muted-foreground">上次联系 </span><span className={cn('num font-medium', quiet && !partner && 'text-warn')}>{lastText}</span>{lastSub && <span className="text-xs text-muted-foreground">（{lastSub}）</span>}</span>
            {!partner && <span><span className="text-muted-foreground">累计 </span><span className="num font-medium">{spentText}</span></span>}
          </div>
        )}
        {(c.next_step || flags.length > 0) && (
          <div className="mt-px flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-surface-2/70 px-4 py-2.5 text-[13px]">
            {c.next_step && <span className="min-w-0"><span className="text-muted-foreground">下一步：</span>{c.next_step}</span>}
            <FlagChips flags={flags} className="ml-auto" />
          </div>
        )}
      </div>
      {s.materials.length > 0 && (
        <Link to={`/clients/extract?file=${encodeURIComponent(s.materials[0].path)}`} className="mt-3 flex items-center gap-2 rounded-lg border border-info/25 bg-info-soft px-3 py-2 text-[13px] text-info hover:border-info/50">
          <FileSearch className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">收件箱有 {s.materials.length} 份新材料还没整理：{s.materials.map((m) => m.title.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, _y: string, mo: string, d: string) => `${Number(mo)}月${Number(d)}日`)).join('；')}</span>
          <span className="shrink-0 font-medium">去提取 →</span>
        </Link>
      )}
      {conflicts.length > 0 && (
        <button type="button" onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set('ctab', 'log'); return n }, { replace: true })}
          className="mt-3 flex w-full items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-left text-[13px] text-warn hover:border-warn/60">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">答应的“{conflicts[0].text}”和判断规则对不上，等你定</span>
          <span className="shrink-0 font-medium">去定 →</span>
        </button>
      )}
      {d.clashes.length > 0 && d.closure && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {d.clashes.map((x) => <span key={x.date + x.what} className="block">{shortDate(x.date)}“{x.what}”撞上{d.closure!.label}，{x.why}{x.also.length ? `（${[x.kind, ...x.also].join('、')}里都记着）` : ''}</span>)}
            <span className="block text-[12px] text-warn/80">改到复业以后，或者改去对方那里；改了在“往来和答应”里改日期</span>
          </span>
          {d.closure.source && <SourceLink path={d.closure.source} label="门店改造" className="shrink-0" />}
        </div>
      )}
      <div className="mt-5"><ClientTabs d={d} /></div>
    </div>
  )
}
