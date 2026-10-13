// 导入规则：每种表（平台 + 报表）怎么对字段。卡片只写名字不一样的那几列（“聚光消耗(元) → 推广花费”），其余写“另 N 列名字一样”；
// 点开右侧抽屉看完整对照、谁确认的、改、停用。规则存在数据库里，同时写一份 工作台/导入规则/<平台>-<报表>。归属：数据源与导入模块
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowRight, ChevronDown, FilePlus2, FileText, Pause, Play, TriangleAlert } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { PageBody, PageHeader, SubTabs } from '@/components/page'
import { MetaRow } from '@/components/data-view'
import { ViewTabs } from '@/components/view-tabs'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { EditToggle, ReadRow } from '@/components/detail-parts'
import { Choice } from '@/components/form'
import { Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, GoneNote, HowChip, KindIcon, Note } from './parts'
import { IMPORT_TABS, CHANNEL_NAME, FIELD_LABEL, confirmedBy, rulePath, when } from './labels'
import type { FieldKey, Meta, Rule, RuleMap } from './types'

const TABS = [{ value: 'all', label: '全部' }, { value: '在用', label: '在用' }, { value: '停用', label: '停用' }] as const
type Tab = (typeof TABS)[number]['value']
const NOTE_LABEL: Record<string, string> = {
  'xhs_notes.title': '笔记标题', 'xhs_notes.published_at': '发布时间', 'xhs_notes.kind': '笔记类型', 'xhs_note_stats.impressions': '曝光', 'xhs_note_stats.reads': '阅读',
  'xhs_note_stats.likes': '点赞', 'xhs_note_stats.saves': '收藏', 'xhs_note_stats.comments': '评论', 'xhs_note_stats.shares': '分享', 'xhs_note_stats.new_followers': '涨粉', 'xhs_note_stats.traffic': '流量来源（自然 / 投流）',
}
const fieldName = (f: string | null) => (!f ? '不导' : FIELD_LABEL[f as FieldKey] ?? NOTE_LABEL[f] ?? f)
const target = (r: Rule) => (r.target === 'xhs_note_stats' ? '小红书 · 笔记数据' : `经营 · ${r.channel_id ? CHANNEL_NAME[r.channel_id] ?? r.channel_id : '按表里的渠道列'}`)
const norm = (s: string) => s.replace(/[（(][^）)]*[）)]/g, '').replace(/\s/g, '')
/** 叫法和工作台字段名有多像：0 = 一个字都不沾（最值得写在卡片上），1 = 一样 */
function likeness(m: RuleMap) {
  const a = norm(m.col)
  const b = norm(fieldName(m.field)).replace(/（.*$/, '')
  if (a === b || a.includes(b) || b.includes(a)) return 1
  const common = [...new Set(b)].filter((ch) => a.includes(ch)).length
  return common / new Set(b).size
}
/** 表里的叫法和工作台字段名不一样的那几列（真正有用的对照），最不像的排前面 */
const differs = (m: RuleMap) => !!m.field && likeness(m) <= 0.6 && !(m.field === 'date' && /日期|时间/.test(m.col))
const whoSaved = (r: Rule) => (r.origin === '示例' ? `预置 · ${r.created_by ?? ''} ${shortDate(r.created_at)}存` : `你 ${shortDate(r.created_at)} 存的`)

export default function ImportRulesPage() {
  const { data, isLoading, error, refetch } = useApi<Rule[]>('/data/rules')
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((t) => t.value === sp.get('status'))?.value ?? 'all') as Tab
  const openId = sp.get('rule')
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: k === 'status' })
  const rules = data ?? []
  const rows = rules.filter((r) => tab === 'all' || r.status === tab)
  const tmallMissing = !rules.some((r) => r.channel_id === 'tmall' && r.status === '在用')
  return (
    <>
      <PageHeader eyebrow="数据" title="导入规则" desc="同一种表对一次字段就存成规则，以后拖进来、或放进导入文件夹，直接按规则导；表头对不上就停下来提醒。每条规则也存成一份文件，在 工作台/导入规则/。"
        actions={<Button variant="outline" asChild><Link to="/imports">导入一种新表<ArrowRight /></Link></Button>}>
        <SubTabs items={IMPORT_TABS} />
      </PageHeader>
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {error ? <Failed message="导入规则没读出来" onRetry={() => refetch()} /> : isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ViewTabs label="按状态" value={tab} onChange={(v) => set('status', v === 'all' ? null : v)} items={TABS.map((t) => ({ value: t.value, label: t.label, count: t.value === 'all' ? rules.length : rules.filter((r) => r.status === t.value).length }))} />
              <span className="ml-auto text-xs text-muted-foreground">{rules.filter((r) => r.origin === '示例').length} 条预置，{rules.filter((r) => r.origin === '自己的').length} 条是你存的</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.filter((r) => r.status === '在用').map((r) => <RuleCard key={r.id} r={r} onOpen={() => set('rule', r.id)} />)}
              {tmallMissing && tab !== '停用' && (
                <Link to="/imports" className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
                  <FilePlus2 className="size-6" />
                  <span className="text-[14px] font-medium text-foreground">天猫新版表头还没规则</span>
                  <span className="text-[13px]">生意参谋 10/20 改版后，旧规则停用了。拖一份天猫表来，对一次字段就存下来</span>
                </Link>
              )}
            </div>
            {rows.some((r) => r.status !== '在用') && (
              <>
                {tab === 'all' && <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"><span>停用的规则</span><span className="h-px flex-1 bg-border" /></div>}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.filter((r) => r.status !== '在用').map((r) => <RuleCard key={r.id} r={r} onOpen={() => set('rule', r.id)} />)}
                </div>
              </>
            )}
            {!rows.length && !tmallMissing && <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{tab === '停用' ? '没有停用的规则' : '还没有导入规则：在“导入”页对好一种表的字段，导入时就会存下来'}</p>}
          </>
        )}
      </PageBody>
      {openId && <RuleSheet id={openId} onClose={() => set('rule', null)} />}
    </>
  )
}

function RuleCard({ r, onOpen }: { r: Rule; onOpen: () => void }) {
  const diff = r.mapping.filter(differs).sort((x, y) => likeness(x) - likeness(y))
  const same = r.mapping.filter((m) => m.field && !differs(m)).length
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn('group flex min-w-0 cursor-pointer flex-col rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40',
        r.status === '停用' ? 'border-dashed bg-transparent opacity-70 hover:opacity-100' : 'bg-card shadow-paper hover:shadow-float', r.alert && 'border-warn/40')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', r.status === '停用' ? 'bg-surface-2 text-muted-foreground' : 'bg-accent text-primary')}><KindIcon of={{ channel_id: r.channel_id, source_id: r.source_id, platform: r.platform }} className="size-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{r.platform}</span>
          <span className="block truncate text-[13px] text-muted-foreground" title={r.report}>{r.report}</span>
        </span>
        {r.alert ? <Badge value="表头变了" /> : <Badge value={r.status} />}
      </div>
      {r.alert ? (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn-soft/60 px-3 py-2 text-[13px]">
          <div className="flex items-center gap-1.5 font-medium text-warn"><TriangleAlert className="size-3.5" />平台改了列名，这条规则今早没对上</div>
          <Link to={`/sources?source=${r.alert.source_id}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 inline-flex items-center gap-1 text-primary hover:underline">{r.alert.pending} 列等你确认<ArrowRight className="size-3.5" /></Link>
        </div>
      ) : (
        <ul className="mt-3 grid gap-1 text-[13px]">
          {diff.slice(0, 3).map((m) => (
            <li key={m.col} className="flex min-w-0 items-center gap-1.5"><span className="truncate">{m.col}</span><ArrowRight className="size-3 shrink-0 text-muted-foreground" /><span className="shrink-0 font-medium">{fieldName(m.field)}</span></li>
          ))}
          {!diff.length && <li className="text-muted-foreground">表头和工作台的叫法一样</li>}
          <li className="pb-2.5 text-xs text-muted-foreground">{diff.length > 3 ? `还有 ${diff.length - 3} 列叫法不一样，` : ''}{same ? `另 ${same} 列名字差不多` : ''}{r.mapping.some((m) => !m.field) ? `${same ? '，' : ''}${r.mapping.filter((m) => !m.field).length} 列不导` : ''}</li>
        </ul>
      )}
      {r.status === '停用' && r.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.note}</p>}
      <MetaRow className="mt-auto border-t pt-2.5">
        <span>写进 {target(r)}</span>
        <span>最近用 {when(r.last_used_at)}</span>
        <span className="num">用过 {r.use_count} 次</span>
      </MetaRow>
      <div className="mt-1.5 text-[12px] text-muted-foreground">{whoSaved(r)}</div>
    </div>
  )
}

function RuleSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: r, error } = useApi<Rule>(`/data/rules/${id}`)
  const { data: meta } = useApi<Meta>('/data/meta')
  const { data: targets } = useApi<{ notes: { value: string; label: string }[] }>('/data/mapping-targets')
  const [editing, setEditing] = useState(false)
  const patch = useWrite((b: Record<string, unknown>) => api.patch<Rule>(`/data/rules/${id}`, b), '规则已更新')
  const daily = r?.target === 'channel_daily'
  const options = daily ? (meta?.fields ?? []).map((f) => ({ value: f.key, label: f.label })) : targets?.notes ?? []
  const used = r?.mapping.filter((m) => m.field) ?? []
  const unused = r?.mapping.filter((m) => !m.field) ?? []
  const row = (m: RuleMap) => <MapRow key={m.col} m={m} editing={editing} options={options} onChange={(f) => patch.mutate({ mapping: [{ col: m.col, field: f }] })} />
  return (
    <DetailSheet open onClose={onClose} wide eyebrow="导入规则" title={error ? '找不到这条导入规则' : r ? `${r.platform} · ${r.report}` : undefined}
      meta={r && <><Badge value={r.alert ? '表头变了' : r.status} /><span>写进 {target(r)}</span><span>· {whoSaved(r)}</span></>}
      actions={r && <>
        <EditToggle editing={editing} onChange={setEditing} />
        <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ status: r.status === '在用' ? '停用' : '在用' })}>{r.status === '在用' ? <><Pause />停用</> : <><Play />启用</>}</Button>
      </>}>
      {error ? <GoneNote what="导入规则" hint="链接里的编号不对，或者这条规则已经没有了（彩排后复原会去掉现场存的规则）。" onClose={onClose} /> : !r ? <Skeleton className="h-80" /> : (
        <div className="grid gap-1">
          {r.alert && <Note className="mb-4" tone="warn" icon={TriangleAlert} title="平台改了列名，这条规则今早没对上" action={<Button size="sm" variant="outline" className="bg-card" asChild><Link to={`/sources?source=${r.alert.source_id}`}>{r.alert.pending} 列等你确认<ArrowRight /></Link></Button>}>确认完新的对照，规则会换成新表头。</Note>}
          {r.status === '停用' && <Note className="mb-4" tone="warn" title="这条规则停用了">停用的规则不会再拿来对字段；同一种表拖进来要重新对一次。{r.note ? ` ${r.note}` : ''}</Note>}
          <SheetSection title={`字段对照（要导的 ${used.length} 列）`}>
            <ul className="divide-y rounded-xl border text-[13.5px]">{used.map(row)}</ul>
            {unused.length > 0 && (
              <Collapsible className="mt-2" defaultOpen={editing}>
                <CollapsibleTrigger className="group inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ChevronDown className="size-3.5 transition group-data-[state=open]:rotate-180" />不导的 {unused.length} 列：{unused.map((m) => m.col).join('、')}</CollapsibleTrigger>
                <CollapsibleContent><ul className="mt-2 divide-y rounded-xl border text-[13.5px]">{unused.map(row)}</ul></CollapsibleContent>
              </Collapsible>
            )}
          </SheetSection>
          <SheetSection title="怎么认、缺了怎么办">
            <dl>
              <ReadRow label="认表靠">表头里有这 {r.signature.length} 列中的六成以上，就认作这种表</ReadRow>
              <ReadRow label="缺了停">{r.required.length ? r.required.map((f) => FIELD_LABEL[f as FieldKey] ?? f).join('、') : '—'}<div className="text-xs text-muted-foreground">这几项缺了列，就停下来提醒，不当 0</div></ReadRow>
              <ReadRow label="日期格式">{meta?.date_formats.find((d) => d.value === r.date_format)?.label ?? r.date_format ?? '自动认'}</ReadRow>
              <ReadRow label="金额单位">{r.amount_unit}</ReadRow>
              <ReadRow label="规则文件"><span className="inline-flex items-center gap-1 text-[13px] break-all"><FileText className="size-3.5 shrink-0 text-muted-foreground" />{rulePath(r.file_path)}</span></ReadRow>
            </dl>
          </SheetSection>
          <SheetSection title="用的情况">
            <dl>
              <ReadRow label="存的">{when(r.created_at)}{r.created_by && ` · ${r.created_by === '网页' ? '你' : r.created_by}`}{r.origin === '示例' && <span className="text-muted-foreground">（预置）</span>}</ReadRow>
              <ReadRow label="最近用">{when(r.last_used_at)} · 一共 {r.use_count} 次</ReadRow>
              <ReadRow label="改过">{r.updated_at !== r.created_at ? when(r.updated_at) : '没改过'}</ReadRow>
              {r.note && r.status !== '停用' && <ReadRow label="备注">{r.note}</ReadRow>}
            </dl>
          </SheetSection>
        </div>
      )}
    </DetailSheet>
  )
}

function MapRow({ m, editing, options, onChange }: { m: RuleMap; editing: boolean; options: { value: string; label: string }[]; onChange: (f: string | null) => void }) {
  return (
    <li className="grid grid-cols-[minmax(0,180px)_16px_minmax(0,1fr)] items-center gap-3 px-3.5 py-2 sm:grid-cols-[200px_16px_minmax(0,1fr)]">
      <span className="truncate font-medium" title={m.col}>{m.col}</span>
      <ArrowRight className="size-3.5 text-muted-foreground" />
      {editing ? (
        <Choice className="h-8" value={m.field} allowEmpty emptyLabel="不导（用不上）" options={options} onChange={onChange} />
      ) : (
        <span className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5', !m.field && 'text-muted-foreground')}>
          <span className="truncate">{fieldName(m.field)}</span>
          {confirmedBy(m.by, m.at) ? <span className="text-[12px] text-muted-foreground">{confirmedBy(m.by, m.at)}</span> : m.how && <HowChip how={m.how} />}
        </span>
      )}
    </li>
  )
}
