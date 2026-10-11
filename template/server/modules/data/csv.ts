// 读 CSV：支持引号里的逗号和换行、Excel 加的 BOM；平台导出表开头常有几行说明，表头不一定在第 1 行。归属：数据源与导入模块。
import { guessByName, normHeader, PROFILES } from './fields.ts'

/** 按 RFC 4180 拆 CSV（也认制表符分隔的表） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? src.length : src.indexOf('\n'))
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((c) => c.trim()))
}

const filled = (r: string[]) => r.filter((c) => c !== '').length

/** 找表头：前 15 行里，非空格子最多、而且认得的叫法最多的那一行 */
export function findHeaderRow(rows: string[][]): number {
  const known = new Set(PROFILES.flatMap((p) => p.markers.map(normHeader)))
  let best = 0
  let bestScore = -1
  rows.slice(0, 15).forEach((r, i) => {
    const n = filled(r)
    if (n < 2) return
    const hits = r.filter((c) => c && (guessByName(c) || known.has(normHeader(c)))).length
    const numeric = r.filter((c) => /^[-¥￥\d,.%]+$/.test(c)).length
    const score = hits * 3 + n - numeric * 2
    if (score > bestScore) { bestScore = score; best = i }
  })
  return best
}

export type Table = {
  headerRow: number            // 表头在第几行（从 0 数）
  preamble: string[]           // 表头前面的说明行
  headers: string[]
  rows: { line: number; cells: string[] }[] // line：在文件里是第几行（从 1 数，给人看）
}

export function readTable(text: string): Table {
  const all = parseCsv(text)
  const headerRow = findHeaderRow(all)
  const headers = (all[headerRow] ?? []).map((h, i) => h || `第 ${i + 1} 列`)
  // 末尾空列去掉
  while (headers.length && /^第 \d+ 列$/.test(headers[headers.length - 1]) && all.slice(headerRow + 1).every((r) => !r[headers.length - 1])) headers.pop()
  const rows = all.slice(headerRow + 1)
    .map((cells, i) => ({ line: headerRow + i + 2, cells: headers.map((_, j) => cells[j] ?? '') }))
    .filter((r) => filled(r.cells) > 0)
  return { headerRow, preamble: all.slice(0, headerRow).map((r) => r.filter(Boolean).join(' ')).filter(Boolean), headers, rows }
}

/** 写 CSV（UTF-8 带 BOM、Windows 换行，Excel 双击打开不乱码） */
export function toCsv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return `﻿${rows.map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`
}
