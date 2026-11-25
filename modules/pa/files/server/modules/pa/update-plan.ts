// 在对话里更新“我关注的”对象（知识库里的一份对象文件）：只改四处，别的地方一字不动。
//   状态（开头）、现在（整段换掉）、下一步（加一条 / 勾掉一条）、往来记录（末尾加一行，标“AI 记录，待确认”）。
// 改了任何一处，开头的“更新”换成今天。纯计算：传进来原文，返回改好的全文和改了哪几处；写文件、备份在 object-update.ts。

export type ObjectUpdate = {
  status?: string
  now?: string
  nextAdd?: string[]
  nextDone?: string[]
  log?: { channel?: string; text: string }
}
export type Change = { what: string; old: string; new: string }

const NOW_MAX = 600
const isHead = (l: string) => /^##\s/.test(l)

function frontEnd(lines: string[]): number {
  if (lines[0] !== '---') throw new Error('文件开头不对：要以 --- 开头的属性块开始')
  const e = lines.indexOf('---', 1)
  if (e < 0) throw new Error('文件开头不对：属性块没有用 --- 收尾')
  return e
}

/** 一节的位置：标题那一行、到下一节（或文件末尾）为止 */
function section(lines: string[], title: string): { head: number; end: number } | null {
  const head = lines.findIndex((l) => l.trim() === `## ${title}`)
  if (head < 0) return null
  const next = lines.findIndex((l, i) => i > head && isHead(l))
  return { head, end: next < 0 ? lines.length : next }
}
/** 这一节最后一行有字的下一行（往这里插） */
const afterLast = (lines: string[], s: { head: number; end: number }) => { let i = s.end - 1; while (i > s.head && !lines[i].trim()) i--; return i + 1 }
const insert = (lines: string[], at: number, add: string[]) => [...lines.slice(0, at), ...add, ...lines.slice(at)]
/** 属性块后面第一个位置（跳过紧跟着的空行） */
const bodyStart = (lines: string[]) => { const e = frontEnd(lines); return lines[e + 1] === '' ? e + 2 : e + 1 }

function setField(lines: string[], key: string, value: string): { lines: string[]; old: string } {
  const e = frontEnd(lines)
  const i = lines.findIndex((l, j) => j > 0 && j < e && new RegExp(`^${key}\\s*:`).test(l))
  if (i < 0) return { lines: insert(lines, e, [`${key}: ${value}`]), old: '' }
  return { lines: lines.map((l, j) => (j === i ? `${key}: ${value}` : l)), old: lines[i].replace(/^[^:]*:\s*/, '').trim() }
}

const oneLine = (s: string, what: string) => {
  const t = s.trim()
  if (!t) throw new Error(`${what}不能是空的`)
  if (/\n/.test(t)) throw new Error(`${what}只能写一行`)
  return t
}

/**
 * statuses：这一类对象能用的状态叫法（默认叫法、换过的叫法、状态对照左边的）；空数组表示不检查。statusField：状态写在哪个字段（默认“状态”）。
 * today：YYYY-MM-DD。
 */
export function planObjectUpdate(text: string, u: ObjectUpdate, today: string, statuses: string[], statusField = '状态'): { text: string; changes: Change[] } {
  let lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n')
  frontEnd(lines)
  const changes: Change[] = []

  if (u.status !== undefined) {
    const v = oneLine(u.status, '状态')
    if (statuses.length && !statuses.includes(v)) throw new Error(`状态只能是：${statuses.join('、')}`)
    const r = setField(lines, statusField, v)
    if (r.old !== v) { lines = r.lines; changes.push({ what: '状态', old: r.old, new: v }) }
  }

  if (u.now !== undefined) {
    const v = u.now.trim()
    if (!v) throw new Error('“现在”不能是空的')
    if (v.length > NOW_MAX) throw new Error(`“现在”写一两句就够了（现在 ${v.length} 个字，最多 ${NOW_MAX}）`)
    const s = section(lines, '现在')
    if (s) {
      const old = lines.slice(s.head + 1, s.end).join('\n').trim()
      lines = [...lines.slice(0, s.head + 1), ...v.split('\n'), '', ...lines.slice(s.end)]
      changes.push({ what: '现在', old, new: v })
    } else {
      lines = insert(lines, bodyStart(lines), ['## 现在', ...v.split('\n'), ''])
      changes.push({ what: '现在', old: '', new: v })
    }
  }

  for (const raw of u.nextDone ?? []) {
    const want = oneLine(raw, '要勾掉的下一步')
    const s = section(lines, '下一步')
    const hits = s ? lines.map((l, i) => ({ l, i })).filter(({ l, i }) => i > s.head && i < s.end && /^\s*- \[ \]/.test(l) && l.includes(want)) : []
    if (!hits.length) throw new Error(`下一步里没找到“${want}”（只认还没勾掉的）`)
    if (hits.length > 1) throw new Error(`“${want}”对上了 ${hits.length} 条，说得具体一点`)
    const h = hits[0]
    lines = lines.map((l, i) => (i === h.i ? l.replace('- [ ]', '- [x]') : l))
    changes.push({ what: '下一步', old: h.l.trim(), new: h.l.trim().replace('- [ ]', '- [x]') })
  }
  const adds = (u.nextAdd ?? []).map((x) => `- [ ] ${oneLine(x, '下一步').replace(/^-\s*\[[ x]\]\s*/, '')}`)
  if (adds.length) {
    const s = section(lines, '下一步')
    if (s) lines = insert(lines, afterLast(lines, s), adds)
    else {
      const n = section(lines, '现在')
      lines = insert(lines, n ? n.end : bodyStart(lines), ['## 下一步', ...adds, ''])
    }
    for (const a of adds) changes.push({ what: '下一步', old: '', new: a })
  }

  if (u.log) {
    const channel = u.log.channel?.trim() ? oneLine(u.log.channel, '渠道') : '对话'
    const body = (() => { try { return oneLine(u.log.text, '往来记录') } catch (e) { throw new Error(/一行/.test((e as Error).message) ? '往来记录只能加一行' : (e as Error).message) } })()
    const line = `- ${today}｜${channel}｜${body}；来源：和 AI 的对话（AI 记录，待确认）`
    const s = section(lines, '往来记录')
    if (s) lines = insert(lines, afterLast(lines, s), [line])
    else {
      const src = section(lines, '来源')
      if (src) lines = insert(lines, src.head, ['## 往来记录', line, ''])
      else {
        while (lines.length && lines[lines.length - 1] === '') lines.pop()
        lines = [...lines, '', '## 往来记录', line, '']
      }
    }
    changes.push({ what: '往来记录', old: '', new: line })
  }

  if (!changes.length) throw new Error('没有要改的：状态、现在、下一步、往来记录至少写一样（或者写的和原来一样）')
  const r = setField(lines, '更新', today)
  lines = r.lines
  if (r.old !== today) changes.push({ what: '更新', old: r.old, new: today })
  return { text: lines.join('\n'), changes }
}
