// 报告：总助、分身写在知识库 90-日志与报告/ 里的日报、周报、月报，可以前后翻；顶上四个数来自进展和产出（对话数、做完的事、产出数、用得最多的）。
// 这一页只读：报告由助理按口令写进知识库，再用命令登记进来。
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader, PageBody, Panel, Stat } from '@/components/page'
import { ViewTabs } from '@/components/view-tabs'
import { Markdown } from '@/components/markdown'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { kbLink, when } from './parts'
import type { ReportView } from './types'

const KINDS = ['日报', '周报', '月报'] as const
/** 这几节是分身写的（约定第 6 节），别的是总助写的 */
const TWIN = new Set(['这周的你', '目标对照', '分身的一句', '今天的你', '这个月的你'])

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

  const head = <PageHeader eyebrow="我的助理" title="报告" desc="总助、分身写的日报、周报、月报，放在知识库里；顶上几个数来自进展和产出。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody className="grid gap-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-24" /><Skeleton className="h-72" /></PageBody></>
  if (!d.kind) return <>{head}<PageBody><Panel><EmptyNote>日报、周报、月报都关着。要看哪种，在知识库档案.md 的“报告”表里把它改成“开”（比如“| 周报 | 开 | 每周五 18:00 |”），刷新这一页就有。</EmptyNote></Panel></PageBody></>
  const s = d.stats
  const groups = d.report ? [{ who: '总助写的', items: d.report.sections.filter((x) => !TWIN.has(x.title)) }, { who: '分身写的', items: d.report.sections.filter((x) => TWIN.has(x.title)) }].filter((g) => g.items.length) : []
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

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="AI 对话" value={s.sessions} unit="个" hint={`上一期 ${d.prev_stats.sessions} 个`} />
          <Stat label="做完的事" value={s.done} unit="件" hint={s.unread ? `${s.unread} 件还没看` : s.waiting ? `${s.waiting} 件在等你回话` : '都看过了'} />
          <Stat label="产出" value={s.outputs.total} unit="个" hint={`图 ${s.outputs.images} · 文件 ${s.outputs.files}（不算代码）`} />
          <Stat label="用得最多" value={<span className="text-[20px]">{s.top?.name ?? '—'}</span>} hint={s.top ? `${s.top.n} 个对话${s.top.object ? '' : '（按文件夹算，还没归到对象）'}` : '这一期没有对话'} />
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">这几个数按对话最后活动的时间算在哪一期；“做完的事”数的是 AI 把一轮做完了的对话，是推断的。只算这台电脑上 Codex、Claude Code 的对话。</p>

        {!d.report && (
          <Panel><EmptyNote>这一期还没有{d.kind}。在对话里让总助写：写进知识库 90-日志与报告/{d.kind}/ 下，再运行 pa-report-add 登记，这里就能看到。只显示知识库档案“报告”表里开着的几种。</EmptyNote></Panel>
        )}
        {d.report && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {d.report.by && <span>写的人：{d.report.by}</span>}
              {d.report.updated && <span>更新 {shortDate(d.report.updated)}</span>}
              {d.report.confirm && d.report.confirm !== '已确认' && <StatusBadge value={d.report.confirm} tone="warn" />}
              <StatusBadge value={d.report.registered_at ? `已登记 ${when(d.report.registered_at)}` : '文件在知识库里，还没登记'} tone="neutral" />
              <Link className="text-primary hover:underline" to={kbLink(d.report.path)}>看知识库原文</Link>
            </div>
            {d.report.problems.length > 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">这份报告的格式有几处不对：{d.report.problems.join('；')}</p>}
            <div className="grid gap-4 lg:grid-cols-2">
              {groups.flatMap((g) => g.items.map((x) => (
                <Panel key={x.title} title={x.title} desc={g.who}>
                  {x.text ? <Markdown source={x.text} /> : <p className="text-sm text-muted-foreground">这一节是空的。</p>}
                </Panel>
              )))}
            </div>
          </>
        )}
      </PageBody>
    </>
  )
}
