// 报告：总助、分身写在知识库报告文件夹里的日报、周报、月报，可以前后翻。
// 有哪几节、每节用哪种块按“报告模板.md”（2026-11-26 A梦 定：提纲可改、样式通用、要有图）：来源是工作台的节现算现画，
// 来源是 AI 的节显示报告文件里写的。这一期还没写报告，工作台算的那几节照样显示。这一页只读。
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { kbLink, when } from './parts'
import { ReportSection } from './ReportBlocks'
import type { ReportView } from './types'

const KINDS = ['日报', '周报', '月报'] as const

function periodName(kind: string, period: string, range: { from: string; to: string }) {
  if (kind === '日报') return shortDate(period)
  if (kind === '月报') return `${period.slice(0, 4)} 年 ${Number(period.slice(5))} 月`
  return `${period.replace(/^(\d{4})-W0?(\d+)$/, '$1 年第 $2 周')}（${shortDate(range.from)}—${shortDate(range.to)}）`
}

export default function ReportsPage() {
  const [sp, setSp] = useSearchParams()
  const asked = sp.get('kind')
  const period = sp.get('period')
  const { data: d, error, refetch } = useApi<ReportView>(`/m/pa/reports?${new URLSearchParams({ ...(asked ? { kind: asked } : {}), ...(period ? { period } : {}) })}`)
  const go = (next: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(next)) { if (v === null) n.delete(k); else n.set(k, v) } return n }, { replace: true })

  const head = <PageHeader eyebrow="我的助理" title="报告" desc="总助、分身写的日报、周报、月报，放在知识库里。有哪几节按报告模板来，想加一节、去掉一节，在对话里跟总助说。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody className="grid gap-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-24" /><Skeleton className="h-72" /></PageBody></>
  if (!d.kind) return <>{head}<PageBody><Panel><EmptyNote>日报、周报、月报都关着。要看哪种，在知识库档案.md 的“报告”表里把它改成“开”（比如“| 周报 | 开 | 每周五 18:00 |”），刷新这一页就有。</EmptyNote></Panel></PageBody></>
  // 按模板排：模板里的节在前（分身写的、AI 写的这一期还没写就不占地方），报告里多写的节放后面
  const written = new Map((d.report?.sections ?? []).map((x) => [x.title, x.text.trim()]))
  const tpl = d.template.sections.filter((t) => t.source !== 'AI' ? true : written.has(t.title) || (!!d.report && t.who === '总助'))
  const extra = (d.report?.sections ?? []).filter((x) => !d.template.sections.some((t) => t.title === x.title))
  return (
    <>
      {head}
      <PageBody className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ViewTabs label="哪一种报告" value={d.kind} onChange={(v) => go({ kind: v, period: null })} items={KINDS.filter((k) => d.on.includes(k)).map((k) => ({ value: k, label: k, count: d.counts[k] ?? 0 }))} />
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="上一期" onClick={() => go({ period: d.prev })}><ChevronLeft /></Button>
            <span className="min-w-40 px-2 text-center text-sm font-medium">{periodName(d.kind, d.period, d.range)}</span>
            <Button variant="outline" size="icon" aria-label="下一期" disabled={!d.next} onClick={() => d.next && go({ period: d.next })}><ChevronRight /></Button>
          </div>
        </div>
        {d.template.problems.length > 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">报告模板有几处没认出来（那几项先不用）：{d.template.problems.join('；')}</p>}

        {!d.report && (
          <Panel><EmptyNote>这一期还没有{d.kind}。总助按报告模板写进知识库 {d.template.path.replace(/\/[^/]+$/, '')}/{d.kind}/ 下、用 pa-report-add 登记以后，读对话写的那几节就会出现在这里；下面工作台算的几节先看着。</EmptyNote></Panel>
        )}
        {d.report && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {d.report.by && <span>写的人：{d.report.by}</span>}
            {d.report.updated && <span>更新 {shortDate(d.report.updated)}</span>}
            {d.report.confirm && d.report.confirm !== '已确认' && <StatusBadge value={d.report.confirm} tone="warn" />}
            <StatusBadge value={d.report.registered_at ? `已登记 ${when(d.report.registered_at)}` : '文件在知识库里，还没登记'} tone="neutral" />
            <Link className="text-primary hover:underline" to={kbLink(d.report.path)}>看知识库原文</Link>
          </div>
        )}
        {d.report && d.report.problems.length > 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">这份报告的格式有几处不对：{d.report.problems.join('；')}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {tpl.map((t) => <ReportSection key={t.title} title={t.title} sec={t} text={written.get(t.title) ?? null} data={d.data} prev={d.prev_data} />)}
          {extra.map((x) => <ReportSection key={x.title} title={x.title} text={x.text.trim()} data={d.data} prev={d.prev_data} />)}
        </div>
        <p className="text-xs text-muted-foreground">
          有哪几节、每节怎么显示，按{d.template.exists ? <Link className="mx-1 text-primary hover:underline" to={kbLink(d.template.path)}>报告模板</Link> : '默认的报告模板'}来{d.template.exists ? '' : '（想改就跟总助说“周报里加一节……”，它会先把模板写进知识库）'}。
          工作台算的数按对话最后活动的时间算在哪一期，“做完”是推断的；只算这台电脑上 Codex、Claude Code 的对话。
        </p>
      </PageBody>
    </>
  )
}
