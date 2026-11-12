// 知识库文件开头那几行（--- 之间的“键: 值”）：拆出来，换成给人看的一小排标签。
// 老板知识库的规矩是不把开头字段原样贴给老板看，所以页面上只显示：已确认 / 待确认 / 已过期、私密 / 可公开、来源，其余的键不显示。
// 写法照 boss-kb 的“文件开头”：容忍 BOM 和 Windows 换行；“来源”可以是一行，也可以是下面每行“  - 路径”的列表。

export type FrontMeta = { key: string; value: string; list: string[] }

/** 拆出开头那几行和正文；没有开头就是空的 meta */
export function splitFrontmatter(md: string): { meta: FrontMeta[]; body: string } {
  const text = md.replace(/^﻿/, '')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!m) return { meta: [], body: md }
  const meta: FrontMeta[] = []
  for (const raw of m[1].split(/\r?\n/)) {
    const item = raw.match(/^\s+-\s+(.*)$/)
    if (item && meta.length) { meta[meta.length - 1].list.push(item[1].trim()); continue }
    const kv = raw.match(/^([^\s:：][^:：]*)[:：]\s*(.*)$/)
    if (kv) meta.push({ key: kv[1].trim(), value: kv[2].trim(), list: [] })
  }
  return { meta, body: text.slice(m[0].length) }
}

export type MetaLabel =
  | { kind: 'confirm'; text: '已确认' | '待确认' | '已过期' }
  | { kind: 'privacy'; text: '私密' | '可公开' }
  | { kind: 'source'; text: string; paths: string[] }

const get = (meta: FrontMeta[], key: string) => meta.find((m) => m.key === key)

/** 给人看的标签：确认状态（不认识的值按待确认）、隐私（只标私密和可公开；内部是默认，不标；不认识的值按私密）、来源 */
export function metaLabels(meta: FrontMeta[]): MetaLabel[] {
  const out: MetaLabel[] = []
  const confirm = get(meta, '确认')?.value
  if (confirm) out.push({ kind: 'confirm', text: confirm === '已确认' || confirm === '已过期' ? confirm : '待确认' })
  const privacy = get(meta, '隐私')?.value
  if (privacy && privacy !== '内部') out.push({ kind: 'privacy', text: privacy === '可公开' ? '可公开' : '私密' })
  const src = get(meta, '来源')
  if (src) {
    const paths = [...(src.value ? [src.value] : []), ...src.list].map((p) => p.replace(/^["'`]|["'`]$/g, '').trim()).filter(Boolean)
    if (paths.length) out.push({ kind: 'source', text: `来源：${paths.map((p) => (p.split('/').pop() ?? p).replace(/\.md$/, '')).join('、')}`, paths })
  }
  return out
}
