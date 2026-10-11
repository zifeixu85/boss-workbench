// 经营的 4 种抽屉，按地址栏参数挂上（见 ../state.ts）。汇总页和渠道页都放一个 <BizDrawers />。
import { useBizOverlay } from '../state'
import type { Metric } from '../types'
import { AnomalySheet } from './AnomalySheet'
import { ReportSheet } from './ReportSheet'
import { SettingsSheet } from './SettingsSheet'
import { TraceSheet } from './TraceSheet'

const METRICS: Metric[] = ['gmv', 'orders', 'visitors', 'conv_rate', 'aov', 'refund_rate', 'ad_spend', 'roi']
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function BizDrawers({ fallbackDate }: { fallbackDate?: string }) {
  const ov = useBizOverlay()
  const p = ov.params
  const anomaly = p.get('anomaly')
  const report = p.get('report')
  const trace = p.get('trace') as Metric | null
  const to = p.get('tto') ?? fallbackDate
  const from = p.get('tfrom') ?? to
  return (
    <>
      {anomaly && <AnomalySheet key={anomaly} id={anomaly} onClose={ov.close} />}
      {report && <ReportSheet key={report} id={report} onClose={ov.close} />}
      {p.get('settings') && <SettingsSheet onClose={ov.close} />}
      {trace && METRICS.includes(trace) && to && from && DATE.test(to) && DATE.test(from) && (
        <TraceSheet q={{ metric: trace, channel: p.get('tch'), from, to }} onClose={ov.close} />
      )}
    </>
  )
}
