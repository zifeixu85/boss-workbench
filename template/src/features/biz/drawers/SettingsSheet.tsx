// 日报设置（右侧抽屉）：看哪些指标、跟谁比、多少算异常、写多长、几点写。异常阈值保存后马上生效；指标、对比、长短给 Codex 明早写早报用。
import { useState, type ReactNode } from 'react'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { Failed } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, useApi, useWrite } from '@/lib/api'
import type { Alert } from '@/lib/types'
import { localStamp } from '../fmt'
import type { BizConfig, Metric } from '../types'

const METRICS: [Metric, string][] = [['gmv', '成交额'], ['orders', '订单'], ['visitors', '访客'], ['conv_rate', '转化率'], ['aov', '客单价'], ['refund_rate', '退款率'], ['ad_spend', '推广花费'], ['roi', '推广 ROI']]
const DEFAULTS = { refund_mult: 2, refund_min: 6, roi_min: 2, roi_drop: 50, stock_days: 3, gmv_drop: 30 }

function Num({ value, onChange, step = 1, w = 'w-16', label }: { value: number; onChange: (v: number) => void; step?: number; w?: string; label: string }) {
  return <Input type="number" inputMode="decimal" step={step} aria-label={label} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))}
    className={`num ${w} inline-flex h-8 px-2 text-center`} />
}

function Rule({ title, children, hint }: { title: string; children: ReactNode; hint: string }) {
  return (
    <div className="rounded-lg border bg-background/60 px-4 py-3">
      <div className="text-[13px] font-medium">{title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13.5px]">{children}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { data, isError, error, refetch } = useApi<BizConfig>('/biz/config')
  const { data: alerts = [] } = useApi<Alert[]>('/biz/anomalies')
  // 没改过时直接用服务端的设置；一改就存一份草稿，保存或“不改了”后清掉
  const [draft, setDraft] = useState<BizConfig | null>(null)
  const c = draft ?? data ?? null
  const save = useWrite((x: Partial<BizConfig>) => api.patch<BizConfig>('/biz/config', x).then((r) => { setDraft(null); return r }), '日报设置已保存，异常按新阈值重算了')
  const setC = (fn: (p: BizConfig) => BizConfig) => { if (c) setDraft(fn(c)) }
  const set = <K extends keyof BizConfig>(k: K, v: BizConfig[K]) => setC((p) => ({ ...p, [k]: v }))
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const dirty = !!(c && data && JSON.stringify({ ...c, updated_at: null, updated_by: null }) !== JSON.stringify({ ...data, updated_at: null, updated_by: null }))
  const biz = alerts.filter((a) => a.module === 'biz').length
  const submit = () => { if (!c) return; const { updated_at: _u, updated_by: _b, ...rest } = c; save.mutate(rest) }
  return (
    <DetailSheet wide open onClose={onClose} eyebrow="经营 · 日报设置" title="日报设置"
      meta={data && <span>最近一次改：{data.updated_by ?? '—'} {localStamp(data.updated_at)} · 按现在的阈值，报出来还没处理完的 <b className="num text-foreground">{biz}</b> 条</span>}>
      {isError ? <Failed message={(error as Error).message} onRetry={() => refetch()} /> : !c ? <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div> : (
        <>
          <SheetSection title="早报里看哪些指标">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METRICS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-2 text-[13px]">
                  <Checkbox checked={c.metrics.includes(k)} onCheckedChange={() => set('metrics', toggle(c.metrics, k))} />{label}
                </label>
              ))}
            </div>
            {!c.metrics.length && <p className="mt-1.5 text-xs text-danger">至少留一个指标</p>}
          </SheetSection>

          <SheetSection title="跟谁比">
            <div className="flex flex-wrap gap-2">
              {([['prev', '前一天'], ['last_week', '上周同一天（周一比周一）']] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-2 text-[13px]">
                  <Checkbox checked={c.compare.includes(k)} onCheckedChange={() => set('compare', toggle(c.compare, k))} />{label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">周末、节日本来就高，知识库的数据口径建议主要看“上周同一天”。</p>
          </SheetSection>

          <SheetSection title="多少算异常（保存后马上按新阈值重算）" action={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setC((p) => ({ ...p, ...DEFAULTS }))}>恢复默认</Button>}>
            <div className="grid gap-2.5">
              <Rule title="退款突然多了" hint="拿近 3 天的退款率，和之前两周（6 到 20 天前）比。单量小的渠道退一单就会跳，所以两条要同时满足">
                退款率是平常的 <Num label="倍数" value={c.refund_mult} step={0.1} onChange={(v) => set('refund_mult', v)} /> 倍，而且超过 <Num label="退款率下限" value={c.refund_min} onChange={(v) => set('refund_min', v)} /> %
              </Rule>
              <Rule title="推广花了钱没带来成交" hint="ROI = 推广成交额 ÷ 推广花费，看近 3 天合起来的数（只算这 3 天花了 500 元以上的渠道）。两条满足一条就报：低于下限，或者比之前两周掉了这么多">
                推广 ROI 低于 <Num label="ROI 下限" value={c.roi_min} step={0.1} onChange={(v) => set('roi_min', v)} />，或者比之前掉了 <Num label="ROI 降幅" value={c.roi_drop} onChange={(v) => set('roi_drop', v)} /> %
              </Rule>
              <Rule title="货快断了" hint="可售天数 = 库存 ÷ 近 7 天日均销量；抖店云仓入仓要提前 5 天约">
                可售天数少于 <Num label="库存天数" value={c.stock_days} onChange={(v) => set('stock_days', v)} /> 天
              </Rule>
              <Rule title="成交掉得多" hint="和上周同一天比，避开周末、工作日的差别">
                某个渠道比上周同一天少 <Num label="成交降幅" value={c.gmv_drop} onChange={(v) => set('gmv_drop', v)} /> % 以上
              </Rule>
            </div>
          </SheetSection>

          <SheetSection title="写多长、几点写">
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup type="single" variant="outline" size="sm" value={c.length} onValueChange={(v) => v && set('length', v as BizConfig['length'])} aria-label="写多长">
                {(['简短', '标准', '详细'] as const).map((x) => <ToggleGroupItem key={x} value={x} className="px-3">{x}</ToggleGroupItem>)}
              </ToggleGroup>
              <label className="flex items-center gap-2 text-[13px]">每天 <Input aria-label="几点写" value={c.write_at} onChange={(e) => set('write_at', e.target.value)} className="num h-8 w-20 text-center" /> 写</label>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">简短：只写数和异常；标准：四段都写；详细：每个渠道单独一段。<b className="font-medium text-foreground">几点写这里只是记下来</b>：真正几点跑，要在 Codex 的定时任务里改（要晚于各平台导完的时间，最晚 07:44，所以是 07:55）。</p>
          </SheetSection>

          <p className="rounded-lg bg-surface-2/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            异常阈值保存后，这一页、渠道页和今日页的异常马上按新阈值重算。看哪些指标、跟谁比、写多长，是给 Codex 定时任务明早写早报用的，今天这份不会变。
          </p>
          {dirty && (
            <div className="sticky bottom-0 -mx-6 mt-4 -mb-5 flex items-center gap-2 border-t bg-card/95 px-6 py-3 backdrop-blur">
              <span className="mr-auto text-xs text-muted-foreground">改了还没保存</span>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>不改了</Button>
              <Button size="sm" disabled={save.isPending} onClick={submit}>{save.isPending ? '保存中…' : '保存设置'}</Button>
            </div>
          )}
        </>
      )}
    </DetailSheet>
  )
}
