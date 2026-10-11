// 经营页面的地址栏状态：时间范围 ?days=7|14|30，以及经营自己的 4 种抽屉（刷新不丢、能分享链接、后退就关）。
//   ?anomaly=refund_xhs           异常详情（今日页“去看”就是带着它跳过来的）
//   ?report=rpt_20261026          经营早报全文
//   ?trace=gmv&tch=xhs&tfrom=…&tto=…   这个数是怎么来的（哪几天、哪个渠道、哪次导入）
//   ?settings=1                   日报设置
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { Days, Metric } from './types'

export const DAY_OPTIONS: Days[] = [7, 14, 30]
/** 默认近 14 天：近 30 天往前没有数据，“比上一段”整列是空的 */
export const DEFAULT_DAYS: Days = 14
/** 带上时间范围的地址（默认的 14 天不写进地址栏） */
export const withDays = (path: string, days: Days) => (days === DEFAULT_DAYS ? path : `${path}?days=${days}`)
const KEYS = ['anomaly', 'report', 'trace', 'tch', 'tfrom', 'tto', 'settings']

export function useDays(): [Days, (d: Days) => void] {
  const [sp, setSp] = useSearchParams()
  const n = Number(sp.get('days'))
  const days = (DAY_OPTIONS as number[]).includes(n) ? (n as Days) : DEFAULT_DAYS
  const set = useCallback((d: Days) => setSp((prev) => { const x = new URLSearchParams(prev); if (d === DEFAULT_DAYS) x.delete('days'); else x.set('days', String(d)); return x }, { replace: true }), [setSp])
  return [days, set]
}

export type TraceQuery = { metric: Metric; channel?: string | null; from: string; to: string }

export function useBizOverlay() {
  const [sp, setSp] = useSearchParams()
  const open = useCallback((set: Record<string, string | null | undefined>) => setSp((prev) => {
    const x = new URLSearchParams(prev)
    KEYS.forEach((k) => x.delete(k))
    for (const [k, v] of Object.entries(set)) if (v) x.set(k, v)
    return x
  }), [setSp])
  return {
    params: sp,
    openAnomaly: (id: string) => open({ anomaly: id }),
    openReport: (id: string) => open({ report: id }),
    openTrace: (q: TraceQuery) => open({ trace: q.metric, tch: q.channel ?? null, tfrom: q.from, tto: q.to }),
    openSettings: () => open({ settings: '1' }),
    close: () => open({}),
  }
}
