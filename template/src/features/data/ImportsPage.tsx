// 导入（四步）：① 拖文件 ② 认表、对字段 ③ 预览 ④ 完成。拖进来的文件存成草稿，地址栏 ?draft= 记着，刷新不丢。
// 有文件在对的时候，页头只留标题，步骤条和文件名合成一条吸顶的窄条，把首屏让给对照表。归属：数据源与导入模块
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Check, FileSpreadsheet } from 'lucide-react'
import { PageBody, PageHeader, SubTabs } from '@/components/page'
import { Failed } from '@/components/chart-kit'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DropStep } from './import/DropStep'
import { MapStep } from './import/MapStep'
import { PreviewStep } from './import/PreviewStep'
import { DoneStep } from './import/DoneStep'
import { useDraft } from './use-draft'
import { IMPORT_TABS } from './labels'

const STEPS = ['拖文件', '对字段', '预览', '完成'] as const

export default function ImportsPage() {
  const [sp, setSp] = useSearchParams()
  const draftId = sp.get('draft')
  const { data: v, error, refetch, isLoading } = useDraft(draftId)
  const go = (next: { draft?: string | null; step?: string | null }) => setSp((p) => {
    const n = new URLSearchParams(p)
    for (const [k, val] of Object.entries(next)) { if (val) n.set(k, val); else n.delete(k) }
    return n
  })
  const step = !draftId ? 0 : v?.draft.status === '已导入' ? 3 : sp.get('step') === 'preview' && v?.preview ? 2 : 1
  // 换一步就回到页面顶上（上一步滚到了底下的按钮）
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }) }, [step])

  return (
    <>
      <PageHeader eyebrow="数据" title="导入" desc={draftId ? undefined : '把平台后台导出的表拖进来：认出是哪家的表、对好字段、预览没问题再导。同一天同一渠道会覆盖，不会重复累加；导错了能一键撤销。'}>
        <SubTabs items={IMPORT_TABS} />
      </PageHeader>
      <Stepper current={step} fileName={v?.draft.file_name} rows={v?.analysis.row_count} sticky={!!draftId}
        onBack={(i) => { if (i === 0) go({ draft: null, step: null }); else if (i === 1 && step === 2) go({ step: null }) }} />
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-4">
        {!draftId ? <DropStep onCreated={(id) => go({ draft: id, step: null })} />
          : error ? <Failed message={`这份文件没打开：${(error as Error).message}`} onRetry={() => refetch()} />
          : isLoading || !v ? <div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-[420px]" /></div>
          : step === 3 ? <DoneStep v={v} onAgain={() => go({ draft: null, step: null })} />
          : step === 2 ? <PreviewStep v={v} onBack={() => go({ step: null })} onLeave={() => go({ draft: null, step: null })} />
          : <MapStep v={v} onNext={() => go({ step: 'preview' })} onLeave={() => go({ draft: null, step: null })} />}
      </PageBody>
    </>
  )
}

/** 步骤条：有文件时吸顶、右边写文件名；手机上只写“第 2 步 / 共 4 步 · 对字段” */
function Stepper({ current, fileName, rows, sticky, onBack }: { current: number; fileName?: string; rows?: number; sticky: boolean; onBack: (i: number) => void }) {
  return (
    <div className={cn('z-20 border-y bg-background/95 px-4 backdrop-blur md:px-7', sticky && 'sticky top-(--sticky-top)')}>
      <nav aria-label="导入步骤" className="flex min-w-0 items-center gap-1 py-2">
        <span className="text-[13px] font-medium sm:hidden">第 {current + 1} 步 / 共 4 步 · {STEPS[current]}</span>
        {STEPS.map((s, i) => {
          const done = i < current
          const can = done && current < 3 && i < 2
          return (
            <div key={s} className="hidden shrink-0 items-center gap-1 sm:flex">
              {i > 0 && <span aria-hidden className={cn('mx-1 h-px w-4 lg:mx-2 lg:w-8', i <= current ? 'bg-primary' : 'bg-border')} />}
              <button type="button" disabled={!can} onClick={() => onBack(i)} aria-current={i === current ? 'step' : undefined}
                className={cn('flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[13px]', can && 'hover:bg-muted', !can && 'cursor-default')}>
                <span className={cn('num grid size-5 place-items-center rounded-full border text-[12px] font-semibold',
                  i === current ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-primary/40 bg-accent text-primary' : 'text-muted-foreground')}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={cn(i === current ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
              </button>
            </div>
          )
        })}
        {fileName && (
          <span className="ml-auto hidden min-w-0 items-center gap-1.5 pl-4 text-xs text-muted-foreground md:inline-flex" title={fileName}>
            <FileSpreadsheet className="size-3.5 shrink-0" /><span className="truncate">{fileName}</span>{rows != null && <span className="num shrink-0">· {rows} 行</span>}
          </span>
        )}
      </nav>
    </div>
  )
}
