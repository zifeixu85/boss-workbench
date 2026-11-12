// 稿件：一份 JSON（存库、给 Codex、给页面都是这一份）。归属：小红书内容模块。
// 字段按“小红书创作”Skill 的 <draft> 格式：format titles title cover_text pages body tags checks；
// 工作台自己多存一个 cover（封面模板、垫图、底色），封面用模板实时画，不依赖生图。

export type DraftPage = { role: '封面' | '内页'; text: string; pad?: string | null }
export type DraftCover = { template: string; pad: string; tone: string }
export type Draft = {
  format: '图文' | '视频'
  title: string
  titles: string[]
  cover_text: string
  cover: DraftCover
  pages: DraftPage[]
  body: string
  tags: string[]
  checks: { item: string; result: string }[]
}

/** 封面模板（xhs_assets 里的 a_cover1—4）、垫图（a_pad1—5）、底色 */
export const TEMPLATES = ['a_cover1', 'a_cover2', 'a_cover3', 'a_cover4'] as const
export const PADS = ['a_pad1', 'a_pad2', 'a_pad3', 'a_pad4', 'a_pad5'] as const
export const TONES = ['米白', '茶绿', '暖棕', '雾蓝'] as const

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const arr = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,，、\s]+/) : [])

/** 按内容支柱和标题挑一个合适的默认封面 */
export function defaultCover(pillarId?: string | null, title = ''): DraftCover {
  if (pillarId === 'pl_week') return { template: 'a_cover4', pad: 'a_pad1', tone: '米白' }
  if (pillarId === 'pl_gear') return { template: 'a_cover1', pad: /公道杯|玻璃/.test(title) ? 'a_pad2' : 'a_pad1', tone: '茶绿' }
  if (pillarId === 'pl_new') return { template: 'a_cover1', pad: 'a_pad5', tone: '暖棕' }
  if (/加班|保温杯|晚/.test(title)) return { template: 'a_cover1', pad: 'a_pad3', tone: '暖棕' }
  if (/开会|会议/.test(title)) return { template: 'a_cover1', pad: 'a_pad4', tone: '雾蓝' }
  return { template: 'a_cover1', pad: 'a_pad1', tone: '米白' }
}

/** 把任何来源（Codex、网页、导入）的稿件整理成同一个形状；缺的补默认值，多的丢掉 */
export function normalizeDraft(input: unknown, base?: Partial<Draft>, pillarId?: string | null): Draft {
  const d = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const pick = <K extends keyof Draft>(k: K): unknown => (d[k] !== undefined ? d[k] : base?.[k])
  const titles = arr(pick('titles')).map((t) => str(t, 60).trim()).filter(Boolean).slice(0, 6)
  const title = str(pick('title'), 60).trim() || titles[0] || ''
  const tags = arr(pick('tags')).map((t) => str(t, 30).replace(/^#+/, '').trim()).filter(Boolean)
  const pagesIn = arr(pick('pages')) as unknown[]
  const pages: DraftPage[] = pagesIn.map((p, i) => {
    const o = (p && typeof p === 'object' ? p : { text: p }) as Record<string, unknown>
    const role: DraftPage['role'] = o.role === '封面' || (i === 0 && o.role !== '内页') ? '封面' : '内页'
    return { role, text: str(o.text, 200), pad: typeof o.pad === 'string' ? o.pad : null }
  }).filter((p) => p.text.trim()).slice(0, 9)
  const coverIn = (pick('cover') ?? {}) as Partial<DraftCover>
  const fallback = defaultCover(pillarId, title)
  const cover: DraftCover = {
    template: TEMPLATES.includes(coverIn.template as never) ? coverIn.template! : fallback.template,
    pad: PADS.includes(coverIn.pad as never) ? coverIn.pad! : fallback.pad,
    tone: TONES.includes(coverIn.tone as never) ? coverIn.tone! : fallback.tone,
  }
  const cover_text = str(pick('cover_text'), 40).trim() || pages[0]?.text.replace(/\n/g, ' ') || title
  if (!pages.length && cover_text) pages.push({ role: '封面', text: cover_text })
  const checks = (arr(pick('checks')) as unknown[]).map((c) => {
    const o = (c && typeof c === 'object' ? c : { result: c }) as Record<string, unknown>
    return { item: str(o.item, 40) || '检查', result: str(o.result, 300) }
  }).filter((c) => c.result).slice(0, 12)
  return {
    format: pick('format') === '视频' ? '视频' : '图文',
    title,
    titles: titles.length ? (titles.includes(title) ? titles : [title, ...titles]).slice(0, 6) : title ? [title] : [],
    cover_text,
    cover,
    pages,
    body: str(pick('body'), 3000).replace(/\r\n/g, '\n'),
    tags: [...new Set(tags)].slice(0, 12),
    checks,
  }
}

/** 空稿：选题刚进创作、还没写 */
export function emptyDraft(title: string, pillarId?: string | null): Draft {
  return normalizeDraft({ title, titles: [title], cover_text: '', pages: [], body: '', tags: [] }, undefined, pillarId)
}

/** 复制 / 导出用的 Markdown（给小艾贴到小红书 App 里） */
export function draftMarkdown(d: Draft) {
  const lines = [`# ${d.title}`, '']
  if (d.titles.length > 1) lines.push(`备选标题：${d.titles.filter((t) => t !== d.title).join(' / ')}`, '')
  lines.push(`封面大字：${d.cover_text}`, '')
  if (d.pages.length) {
    lines.push('图片页：')
    d.pages.forEach((p, i) => lines.push(`${i + 1}. ${p.role === '封面' ? '封面' : '内页'}｜${p.text.replace(/\n/g, ' ')}`))
    lines.push('')
  }
  lines.push(d.body.trim(), '', d.tags.map((t) => `#${t}`).join(' '))
  return lines.join('\n')
}
