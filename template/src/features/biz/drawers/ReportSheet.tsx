// 经营早报全文（右侧抽屉，只读）：昨天怎么样 → 哪里不对劲 → 可能的原因 → 建议。写明谁、几点写的；底下可以翻其他日子的。
// 正文里的知识库链接（[售后与补偿](05-…md)）由 Markdown 组件换成知识库页的链接，网页上不出现路径和命令。
import { Bot } from 'lucide-react'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { Markdown } from '@/components/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/api'
import { md, shortDate, weekday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BizError } from '../errors'
import { useBizOverlay } from '../state'
import type { Report } from '../types'
import { useIdentity } from '@/lib/identity'

export function ReportSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const ov = useBizOverlay()
  const { owner } = useIdentity()
  const { data: r, isError, error, refetch } = useApi<Report>(`/biz/reports/${encodeURIComponent(id)}`)
  const { data: list = [] } = useApi<Report[]>('/biz/reports?limit=10')
  return (
    <DetailSheet wide open onClose={onClose} eyebrow="经营早报（AI 写的）" title={isError ? '没找到这份早报' : r?.title}
      meta={r && <>
        <span className="flex items-center gap-1"><Bot className="size-3.5 text-primary" aria-hidden />由 {r.author} {md(r.written_at)} {r.written_at.slice(11, 16)} 写</span>
        <span>· 写的是 {shortDate(r.date)} {weekday(r.date)} 的数</span>
      </>}>
      {isError ? (
        <BizError error={error} onRetry={() => refetch()} hint="可能是旧链接" action={list[0] && <Button size="sm" variant="outline" onClick={() => ov.openReport(list[0].id)}>看最新一份</Button>} />
      ) : !r ? <div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : (
        <>
          {r.lead && <p className="mb-5 font-heading text-[16px] leading-relaxed font-medium">{r.lead}</p>}
          {r.sections.length ? r.sections.map((s, i) => (
            <section key={s.heading} className="mb-5 rounded-lg border bg-background/60 px-4 py-3">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold"><span className="num grid size-5 place-content-center rounded bg-accent text-[11px] text-accent-foreground">{i + 1}</span>{s.heading}</h3>
              <Markdown source={s.body} className="text-[13.5px] leading-6 [&_li]:my-0.5 [&_ol]:pl-5 [&_ul]:pl-5" />
            </section>
          )) : <Markdown source={r.body} />}

          <SheetSection title="这份早报怎么来的">
            <p className="rounded-lg bg-surface-2/70 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
              Codex 每天 07:55（各平台的数都导完以后）读工作台里的数，按“日报设置”的指标和阈值写好送回来；网页只读，数字以工作台为准。涉及价格、出价、发货方式的建议，要{owner}拍板。
              <Button variant="link" size="sm" className="h-auto px-1 py-0 text-[13px]" onClick={ov.openSettings}>看日报设置</Button>
            </p>
          </SheetSection>

          {list.length > 1 && (
            <SheetSection title="其他日子">
              <div className="flex flex-wrap gap-1.5">
                {list.map((x) => (
                  <button key={x.id} type="button" onClick={() => ov.openReport(x.id)}
                    className={cn('rounded-md border px-2 py-1 text-xs hover:border-primary hover:text-primary', x.id === r.id && 'border-primary bg-accent text-accent-foreground')}>
                    {md(x.date)} {weekday(x.date)}
                  </button>
                ))}
              </div>
            </SheetSection>
          )}
        </>
      )}
    </DetailSheet>
  )
}
