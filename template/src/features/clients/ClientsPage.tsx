// 客户列表：一排状态页签；搜索、“只看大客户”开关、范围（在跟 / 暂停流失 / 伙伴）和排序在第二排；表格或卡片（这一排最右端两个图标）。归属：大客户模块
// 第二轮：一页只留一排页签（原来三组）；“在谈”只算真谈过的单，按去年估的复购单独写；排序“按下次跟进”严格按日期；手机默认卡片，筛选收进弹层；出错时不显示 0。
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FileSearch, LayoutGrid, ListFilter, Search, Table2, UserPlus } from 'lucide-react'
import { useApi } from '@/lib/api'
import { NBSP, wan } from '@/lib/format'
import { useOverlay } from '@/app/overlay'
import { NAV } from '@/app/nav'
import { useIsMobile } from '@/hooks/use-mobile'
import { PageHeader, PageBody, SubTabs } from '@/components/page'
import { Choice } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ViewTabs } from '@/components/view-tabs'
import { Failed } from '@/components/chart-kit'
import { Skeleton } from '@/components/ui/skeleton'
import { STATUS_GROUPS, type StatusGroup } from '@/features/crm/rules'
import type { ClientRow } from '@/features/crm/types'
import { ClientCards } from './ClientCards'
import { ClientTable } from './ClientTable'

export const CLIENT_TABS = NAV.find((n) => n.key === 'clients')!.children!

const SCOPES = [{ value: 'active', label: '在跟的客户' }, { value: 'parked', label: '暂停、流失的' }, { value: 'partner', label: '合作伙伴' }] as const
type Scope = (typeof SCOPES)[number]['value']
const SORTS = [{ value: 'follow', label: '按下次跟进' }, { value: 'spent', label: '按累计消费' }, { value: 'silent', label: '按多久没联系' }, { value: 'year', label: '按今年成交' }]

const isParked = (c: ClientRow) => ['暂停', '流失'].includes(c.stage)
const inScope = (c: ClientRow, s: Scope) => (s === 'partner' ? c.kind === '伙伴' : c.kind === '客户' && (s === 'parked' ? isParked(c) : !isParked(c)))
const inGroup = (c: ClientRow, g: StatusGroup) => { const st = STATUS_GROUPS.find((x) => x.value === g)!.stages; return !st || (st as readonly string[]).includes(c.stage) }
const SORT_BY: Record<string, (a: ClientRow, b: ClientRow) => number> = {
  follow: (a, b) => (a.next_follow ?? '9999').localeCompare(b.next_follow ?? '9999') || b.key_account - a.key_account,
  spent: (a, b) => b.total_spent - a.total_spent,
  silent: (a, b) => (b.days_silent ?? -1) - (a.days_silent ?? -1),
  year: (a, b) => b.spent_year - a.spent_year,
}

export default function ClientsPage() {
  const ov = useOverlay()
  const mobile = useIsMobile()
  const { data = [], isLoading, error, refetch } = useApi<ClientRow[]>('/crm/clients')
  const [q, setQ] = useState('')
  const [sp, setSp] = useSearchParams()
  const view = sp.get('view') === 'cards' || sp.get('view') === 'table' ? sp.get('view')! : mobile ? 'cards' : 'table'
  const status = (STATUS_GROUPS.find((g) => g.value === sp.get('status'))?.value ?? 'all') as StatusGroup
  const scope = (SCOPES.find((s) => s.value === sp.get('scope'))?.value ?? 'active') as Scope
  const keyOnly = sp.get('key') === '1' || sp.get('scope') === 'key'
  const sort = sp.get('sort') ?? 'follow'
  const setParam = (k: string, v: string | null, def: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v === def || v === null) n.delete(k); else n.set(k, v); if (k === 'key' && p.get('scope') === 'key') n.delete('scope'); return n }, { replace: true })
  const base = useMemo(() => data.filter((c) => inScope(c, scope) && (!keyOnly || c.key_account === 1)), [data, scope, keyOnly])
  const rows = useMemo(() => {
    const needle = q.trim()
    const xs = base.filter((c) => (scope !== 'active' || inGroup(c, status)) && (!needle || `${c.name}${c.label ?? ''}${c.contact_name ?? ''}${c.source ?? ''}${c.note ?? ''}${c.tags.join('')}`.includes(needle)))
    return [...xs].sort(SORT_BY[sort] ?? SORT_BY.follow)
  }, [base, status, q, sort, scope])

  const active = data.filter((c) => inScope(c, 'active'))
  const parked = data.filter((c) => inScope(c, 'parked'))
  const keys = active.filter((c) => c.key_account === 1)
  const talked = active.reduce((a, c) => a + (c.open_amount ?? 0), 0)
  const est = active.reduce((a, c) => a + (c.est_amount ?? 0), 0)
  const quiet = active.filter((c) => c.flags.includes('久未联系'))
  const fresh = active.filter((c) => c.flags.includes('有新材料'))
  const firstFile = fresh[0]?.materials.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.path
  const extractLink = firstFile ? `/clients/extract?file=${encodeURIComponent(firstFile)}` : '/clients/extract'

  const desc = error ? '没取到客户数据。确认本地服务开着，再点下面的“重试”。'
    : isLoading ? '读取中…'
      : <>在跟的客户 {active.length} 位，其中大客户 {keys.length} 位。在谈 {wan(Math.round(talked * 10) / 10)}{est > 0 && <>；另有按去年估的复购约 {wan(Math.round(est * 10) / 10)}，还没开口</>}。
        {quiet.length > 0 && <> {quiet.length} 位太久没联系。</>}
        {fresh.length > 0 && <> <Link to={extractLink} className="text-primary hover:underline">{fresh.map((c) => c.name).join('、')}有新材料没整理</Link>。</>}
        {parked.length > 0 && <span className="text-muted-foreground/80"> 另有暂停、流失的 {parked.length} 位不在里面。</span>}</>

  const tabs = STATUS_GROUPS.map((g) => ({ value: g.value, label: g.label, count: error || isLoading ? undefined : base.filter((c) => inGroup(c, g.value)).length }))
  const viewToggle = (
    <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setParam('view', v, mobile ? 'cards' : 'table')} aria-label="怎么看" className="h-9 shrink-0">
      <ToggleGroupItem value="table" aria-label="表格" title="表格" className="px-2.5"><Table2 /></ToggleGroupItem>
      <ToggleGroupItem value="cards" aria-label="卡片" title="卡片" className="px-2.5"><LayoutGrid /></ToggleGroupItem>
    </ToggleGroup>
  )
  const keySwitch = (
    <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px]">
      <Switch checked={keyOnly} onCheckedChange={(v) => setParam('key', v ? '1' : null, null)} aria-label="只看大客户" />只看大客户
    </label>
  )
  const scopePick = <div className="w-36"><Choice value={scope} onChange={(v) => setParam('scope', v ?? 'active', 'active')} options={SCOPES} /></div>
  const sortPick = <div className="w-36"><Choice value={sort} onChange={(v) => setParam('sort', v ?? 'follow', 'follow')} options={SORTS} /></div>
  const filtered = keyOnly || scope !== 'active' || sort !== 'follow'

  return (
    <>
      <PageHeader eyebrow="客户" title="客户与跟进" desc={desc}
        actions={<>
          {fresh.length > 0 && <Button variant="outline" asChild><Link to={extractLink}><FileSearch />整理新材料</Link></Button>}
          <Button onClick={() => ov.openNew('client')}><UserPlus />新建客户</Button>
        </>}>
        <SubTabs items={CLIENT_TABS} />
      </PageHeader>
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {scope === 'active'
            ? <div className="-ml-4 min-w-0 flex-1 overflow-x-auto pl-4 sm:ml-0 sm:pl-0"><ViewTabs label="按状态" value={status} onChange={(v) => setParam('status', v, 'all')} items={tabs} /></div>
            : <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{scope === 'parked' ? '暂停、流失的客户：不在“在跟”的数里，想重新联系就打开改阶段。' : '合作伙伴：做礼盒、送货、拍图、供茶的，不是客户。'}<button className="ml-2 text-primary hover:underline" onClick={() => setParam('scope', 'active', 'active')}>回到在跟的客户</button></p>}
          {!mobile && viewToggle}
        </div>
        {mobile ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1"><Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字、联系人" className="pl-8" /></div>
            <Popover>
              <PopoverTrigger asChild><Button variant="outline" size="icon" aria-label="筛选和排序" className={filtered ? 'border-primary text-primary' : ''}><ListFilter /></Button></PopoverTrigger>
              <PopoverContent align="end" className="grid w-64 gap-3">
                {keySwitch}
                <div className="grid gap-1 text-[12.5px] text-muted-foreground">看哪些{scopePick}</div>
                <div className="grid gap-1 text-[12.5px] text-muted-foreground">怎么排{sortPick}</div>
              </PopoverContent>
            </Popover>
            {viewToggle}
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative w-64"><Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字、联系人、来源、标签" className="pl-8" /></div>
            {keySwitch}
            {scopePick}
            {sortPick}
            <span className="ml-auto text-xs text-muted-foreground">{error ? '' : `${rows.length}${NBSP}位`}</span>
          </div>
        )}
        {error ? <Failed message={error.message} onRetry={() => refetch()} />
          : isLoading ? <Skeleton className="h-96" />
            : view === 'cards' ? <ClientCards rows={rows} showKeyMark={!keyOnly} /> : <ClientTable rows={rows} showKeyMark={!keyOnly} />}
      </PageBody>
    </>
  )
}
