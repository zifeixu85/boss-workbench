// 解析 Codex 的回复：说明文字、“参考了：…”、<draft> / <options> / <topics> / <review> 标签块。归属：小红书内容模块。
// 格式见 .agents/skills/xhs-creator/SKILL.md。JSON 坏了不硬猜：说明照样显示，标出“稿件没解析出来”。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'

export type Parsed = {
  text: string
  refs: string[]
  draft: unknown | null
  options: { field: string; items: { text: string; note: string }[] } | null
  topics: unknown[] | null
  review: Record<string, unknown> | null
  broken: string | null
}

/** 宽松地解析 JSON：去掉 ``` 围栏、首尾多余字符、中文引号包裹的键名不管 */
function looseJson(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(s) } catch { /* 再试一次：截到最外层的括号 */ }
  const open = s.search(/[[{]/)
  const close = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (open >= 0 && close > open) return JSON.parse(s.slice(open, close + 1))
  throw new Error('不是 JSON')
}

function block(text: string, tag: string): { attrs: string; body: string } | null {
  const m = text.match(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? { attrs: m[1] ?? '', body: m[2] } : null
}

/** “参考了：a.md、b.md” → 知识库里真有的路径（没有扩展名的补 .md） */
function refsOf(text: string): string[] {
  const line = text.match(/参考了[:：]\s*(.+)/)?.[1] ?? ''
  const out: string[] = []
  for (const raw of line.split(/[、，,；;\s]+/)) {
    const p = raw.replace(/[`《》「」“”"'()（）]/g, '').replace(/^\.\//, '').trim()
    if (!p) continue
    const withExt = p.endsWith('.md') ? p : `${p}.md`
    if (existsSync(join(ROOT, withExt)) && !out.includes(withExt)) out.push(withExt)
  }
  return out
}

const FIELD_ALIAS: Record<string, string> = { title: 'title', titles: 'title', 标题: 'title', cover_text: 'cover_text', 封面: 'cover_text', 封面大字: 'cover_text', opening: 'opening', hook: 'opening', 开头: 'opening', angle: 'angle', 角度: 'angle' }

/** 候选是哪一项：标签里写了 field 就用它，没写按这次的要求猜 */
export function guessField(request: string) {
  if (/封面/.test(request)) return 'cover_text'
  if (/开头|第一句|钩子/.test(request)) return 'opening'
  if (/角度|切入|方向/.test(request)) return 'angle'
  return 'title'
}

export function parseReply(raw: string, request = ''): Parsed {
  const out: Parsed = { text: '', refs: refsOf(raw), draft: null, options: null, topics: null, review: null, broken: null }
  const d = block(raw, 'draft'), o = block(raw, 'options'), t = block(raw, 'topics'), r = block(raw, 'review')
  try { if (d) out.draft = looseJson(d.body) } catch { out.broken = '稿件' }
  try {
    if (o) {
      const items = looseJson(o.body)
      const field = FIELD_ALIAS[o.attrs.match(/field\s*=\s*["']?([^"'\s>]+)/)?.[1] ?? ''] ?? guessField(request)
      const list = (Array.isArray(items) ? items : []).map((x) => (typeof x === 'string' ? { text: x, note: '' } : { text: String((x as { text?: unknown }).text ?? ''), note: String((x as { note?: unknown }).note ?? '') }))
      out.options = { field, items: list.filter((x) => x.text.trim()).slice(0, 6) }
    }
  } catch { out.broken = '候选' }
  try { if (t) { const v = looseJson(t.body); out.topics = Array.isArray(v) ? v : null } } catch { out.broken = '选题' }
  try { if (r) { const v = looseJson(r.body); out.review = v && typeof v === 'object' ? v as Record<string, unknown> : null } } catch { out.broken = '复盘' }
  out.text = raw
    .replace(/<(draft|options|topics|review)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, '')
    .replace(/^.*参考了[:：].*$/m, '')
    .replace(/[^。！？\n]*(改名工具|自动命名|没有.{0,6}工具)[^。！？\n]*[。！？]?/g, '')
    .replace(/```\s*```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out
}
