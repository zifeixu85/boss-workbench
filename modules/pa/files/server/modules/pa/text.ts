// 小工具：文件开头那几行、Markdown 小节、第一句摘要、遮掉像密钥的串、按后缀分文件类型。只做文字处理，不读写文件。

export type MetaValue = string | string[]
export type Meta = Record<string, MetaValue>

/** 一个属性值：去掉引号；行内列表 [a, "b"] 拆开 */
function scalar(raw: string): MetaValue {
  const v = raw.trim()
  if (/^\[.*\]$/.test(v)) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    const out: string[] = []
    let cur = ''
    let quote = ''
    for (const ch of inner) {
      if (quote) { if (ch === quote) quote = ''; else cur += ch; continue }
      if (ch === '"' || ch === "'") { quote = ch; continue }
      if (ch === ',') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    if (cur.trim()) out.push(cur.trim())
    return out
  }
  const q = v.match(/^"((?:[^"\\]|\\.)*)"$/) ?? v.match(/^'((?:[^']|'')*)'$/)
  if (q) return q[1].replace(/''/g, "'").replace(/\\"/g, '"')
  return v.replace(/\s+#.*$/, '')
}

/** 文件开头两行 --- 之间的属性（Obsidian 的写法，是 YAML 的一小部分）：
 *  “键: 值”；值可以带引号；“键:” 下面每行“  - 值”是列表；也认行内列表 [a, b]。容忍 BOM、Windows 换行、全角冒号。
 *  不认多行文本、嵌套对象（约定里没有这些）。 */
export function front(md: string): { meta: Meta; body: string } {
  const text = md.replace(/^\uFEFF/, '')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/)
  if (!m) return { meta: {}, body: text }
  const meta: Meta = {}
  let last = ''
  for (const raw of m[1].split(/\r?\n/)) {
    const item = raw.match(/^\s*-\s+(.*)$/)
    if (item && last) {
      const cur = meta[last]
      const v = scalar(item[1]) as string
      meta[last] = Array.isArray(cur) ? [...cur, v] : cur ? [cur, v] : [v]
      continue
    }
    const kv = raw.match(/^([^\s:：#-][^:：]*)[:：](?:\s+(.*))?$/)
    if (kv) { last = kv[1].trim(); meta[last] = scalar(kv[2] ?? '') }
  }
  return { meta, body: text.slice(m[0].length) }
}

/** 属性值当一个字符串用（列表取第一个） */
export const str = (v: MetaValue | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '')
/** 属性值当列表用；旧写法（v0.1）的“甲、乙”也拆开 */
export const list = (v: MetaValue | undefined) => (Array.isArray(v) ? v : splitList(v))
/** 双链 [[路径|显示名]] → 路径；不是双链的原样 */
export const unlink = (v: string) => v.trim().replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1').trim()

/** 按二级标题拆正文：[{ title, text }]，标题前面的内容不算 */
export function sections(body: string): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = []
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) out.push({ title: h[1], text: '' })
    else if (out.length) out[out.length - 1].text += `${line}\n`
  }
  return out.map((s) => ({ title: s.title, text: s.text.trim() }))
}

/** “甲、乙，丙”拆开 */
export const splitList = (s: string | undefined) => (s ?? '').split(/[、,，;；]/).map((x) => x.trim().replace(/^`|`$/g, '')).filter(Boolean)

/** 列表行（- 或 * 或 1. 开头）的文字；不是列表的行原样算一条 */
export const bullets = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^(?:[-*+]|\d+[.、])\s+/, ''))

const SECRET = [
  /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|AIza|ya29)[-_A-Za-z0-9.]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
]
/** 遮掉像密钥、令牌、口令的串（宁可多遮）。只用在要存进数据库的标题和第一句上 */
export function redact(s: string): string {
  let out = s
  for (const re of SECRET) out = out.replace(re, '［已遮住］')
  return out.replace(/((?:password|passwd|pwd|secret|token|api[_-]?key|密码|口令|密钥)\s*[:：=]\s*)(?!［)(\S{4,})/gi, '$1［已遮住］')
}

/** 第一句摘要：去掉尖括号包着的系统内容，取第一行的第一句，最多 80 个字，遮掉像密钥的串 */
export function brief(text: string, max = 80): string {
  const clean = text.replace(/<([a-zA-Z_][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>\n]{1,80}>/g, ' ')
  const line = clean.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  const first = line.match(/^.*?[。！？!?]/)?.[0] ?? line
  const cut = [...first]
  return redact(cut.length > max ? `${cut.slice(0, max).join('')}…` : first)
}

const KINDS: [string, RegExp][] = [
  ['图片', /\.(png|jpe?g|gif|webp|svg|heic|avif|bmp)$/i],
  ['文档', /\.(md|markdown|txt|docx?|pdf|pptx?|key|pages|rtf)$/i],
  ['表格', /\.(xlsx?|csv|tsv|numbers)$/i],
  ['网页', /\.(html?|mhtml)$/i],
  ['代码', /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|zsh|sql|css|scss|json|ya?ml|toml|xml|vue|svelte|lock|plist|ini|conf|env)$/i],
]
export type FileKind = '图片' | '文档' | '表格' | '网页' | '代码' | '其他'
export const fileKind = (path: string): FileKind => (KINDS.find(([, re]) => re.test(path))?.[0] ?? '其他') as FileKind

/** 最后一段话像不像在问人、等人回：最后几行里有问句（问号后面可以跟一段括号说明），或者有“回一句 / 等你一句话 / 你来定”这类话；
 *  “有问题告诉我”“哪里不对直接说”这种客气话不算；书名号、引号里的问号不算 */
export function looksLikeAsking(text: string | null | undefined): boolean {
  if (!text) return false
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim().replace(/《[^》]*》|“[^”]*”|「[^」]*」/g, '“”')).filter(Boolean).slice(-4)
  const polite = /(如果|要是|的话|哪里|有问题|有什么|不对|随时)/
  return lines.some((l) => {
    if (/[?？](\s*[（(][^）)]*[）)])?\s*[)）」”"*_`。]*$/.test(l)) return true
    if (/(回一句|回我一句|说一声|等你一句话|等你回|等你定|等你确认|请确认|请你确认|你来定|你定一下|你选|选哪|要不要|是否需要|可以吗|行吗|好吗|看一眼告诉我|告诉我)/.test(l)) return !polite.test(l)
    return false
  })
}
