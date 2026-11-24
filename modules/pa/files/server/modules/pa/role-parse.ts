// 角色文件的几个数（约定 v0.4 第 5.3、5.5 节；v0.5 起人设在 SOUL.md，上限 60 行）。只算数，不读文件；传进来的是去掉开头属性以后的正文。

/** 旧格式 角色.md 正文不超过 50 行（从 20 行起步）：写长了，后面的它可能读不到 */
export const CARD_MAX_LINES = 50
/** SOUL.md（人设加做事的规矩）从 30 行起步，上限 60 行（约定 v0.5） */
export const SOUL_MAX_LINES = 60
/** 记忆.md 超过 60 行，总助提议归并 */
export const MEMORY_MAX_LINES = 60

const lines = (body: string) => body.split(/\r?\n/).filter((l) => l.trim() !== '')

/** 正文行数：空行不算，小节标题算 */
export function cardLines(body: string): number {
  return lines(body).length
}

export type MemoryStats = { lines: number; entries: number; undated: number; first: string; last: string }

/** 每条记忆写成 `- 2026-11-24｜规矩；原因`。数行数、条数、没带日期的条数，和最早、最近一条的日期 */
export function memoryStats(body: string): MemoryStats {
  const all = lines(body)
  const items = all.filter((l) => /^\s*[-*]\s+\S/.test(l))
  const dates = items
    .map((l) => l.match(/^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s*[｜|]/)?.[1])
    .filter((d): d is string => !!d)
    .sort()
  return { lines: all.length, entries: items.length, undated: items.length - dates.length, first: dates[0] ?? '', last: dates.at(-1) ?? '' }
}
