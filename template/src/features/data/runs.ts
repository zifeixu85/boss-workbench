// 运行记录的整理：合并连着成功的、判断有没有明细可看。归属：数据源与导入模块
import type { Run } from './types'

export type Item = { kind: 'one'; run: Run } | { kind: 'group'; runs: Run[] }
/** 同一类、预置的成功记录有 3 条以上的合成一组（放在最新那条的位置）；失败、超时、没导全、你导的都单独一条 */
export function groupRuns(runs: Run[]): Item[] {
  const key = (r: Run) => `${r.actor}|${r.detail?.sub ?? ''}|${(r.message ?? '').replace(/[\d,./—:（）()]+/g, '#').slice(0, 6)}`
  const ok = (r: Run) => r.status === '成功' && r.batch_status !== '已撤销' && r.preset
  const by = new Map<string, Run[]>()
  runs.filter(ok).forEach((r) => by.set(key(r), [...(by.get(key(r)) ?? []), r]))
  const grouped = new Set([...by.values()].filter((xs) => xs.length >= 3).flat().map((r) => r.id))
  const out: Item[] = []
  for (const r of runs) {
    if (!grouped.has(r.id)) { out.push({ kind: 'one', run: r }); continue }
    const g = by.get(key(r))!
    if (g[0].id === r.id) out.push({ kind: 'group', runs: g })
  }
  return out
}

/** 有内容才画：缺了哪几列、多了哪几列、新表的第一行、哪几行没导、怎么办 */
export function hasRunDetail(d?: Run['detail'] | null) {
  return !!d && (!!d.表头?.length || !!d.缺少的列?.length || !!d.多出来的列?.length || !!d.样例行 || !!d.rows?.length || !!d.有问题的行?.length || !!d.建议 || !!d.拿不准的列?.length)
}

