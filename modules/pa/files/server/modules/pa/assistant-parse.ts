// 助理（约定 11.11，2026-11-27 A梦 定：“全部就要助理，都是我们的助理”）的纯计算：不读文件，传进来的是文字。
// - 每个助理的属性读 IDENTITY.md 开头的固定项；旧助理缺的从文件夹名、“角色”、“我管什么，不管什么”那一节补，还缺的留空并列出来。
// - 花名册（11.11 时叫同事清单）、派单记录是表格，按表头认列。
// - 一个对话归哪个助理，按下面的顺序认，前面的优先；认不出的不硬归（页面上放“没归到助理的”）：
//   常驻对话（标题和花名册里登记的一样）→ 标题以“<头像> <名字>”开头（新格式带“｜职责”，旧的没有；没头像的认“<名字>｜”）
//   → 第一句是“叫<名字>” → 工作台对话栏里选了叫哪位的 → 总助派单记录里交出去的那个对话 → 在工作台对话栏里开的（没说叫谁，默认总协调）。
import { front, sections, str } from './text.ts'

export type Assistant = {
  /** 助理文件夹名（页面地址用它） */
  key: string
  name: string; avatar: string; duty: string; owns: string; notOwns: string; call: string; can: string[]; chief: boolean
  /** 信条（IDENTITY 开头可选的一项，写了才显示） */
  motto: string
  /** 开头没写这几项新字段（11.11 以前建的） */
  legacy: boolean
  /** 缺的固定项 */
  missing: string[]
}
export type AssistantKey = { key: string; name: string; avatar: string; thread: string; chief: boolean }
export type Colleague = { avatar: string; name: string; path: string; duty: string; owns: string; notOwns: string; call: string; thread: string }
export type Dispatch = { day: string; what: string; to: string; done: string; stage: string; note: string; open: boolean }
export type MatchBy = '常驻对话' | '标题' | '第一句' | '派单记录' | '工作台对话栏'

const FIELDS = ['头像', '职责', '管什么', '不管什么', '怎么叫', '能做什么', '总协调'] as const
const OLD_KINDS: Record<string, string> = { 总助: '总助', 内容: '内容助理', 内容助理: '内容助理', 分身: '分身', 合伙人: '合伙人' }
/** 派单记录里这几档算交出去还没回、没核对 */
const CLOSED = ['我核对过', '用户验收了', '已叫停']

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? v.split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : [])

/** 文件夹名“职责-名字”（旧的“内容-小红”）拆开；只写职责的（“总助”）没有名字 */
function folderParts(folder: string): { duty: string; name: string } {
  const m = folder.match(/^(.+?)[-－—·](.+)$/)
  return m ? { duty: m[1].trim(), name: m[2].trim() } : { duty: folder, name: '' }
}

/** 旧写法“管：……。不管：……。”从“我管什么，不管什么”那一节拆出来；一行一条写了好几行“管：”的，接起来 */
function ownsFromBody(body: string): { owns: string; notOwns: string } {
  const t = sections(body).find((x) => x.title.replace(/\s/g, '') === '我管什么，不管什么')?.text ?? ''
  const owns: string[] = []
  const notOwns: string[] = []
  for (const m of t.matchAll(/(?<=^|[\n。；;\s])(不管|管)[:：]\s*([\s\S]*?)(?=(?<=[\n。；;\s])(?:不管|管)[:：]|$)/g)) {
    const v = m[2].replace(/\s+/g, ' ').trim()
    if (v) (m[1] === '管' ? owns : notOwns).push(v)
  }
  return { owns: owns.join(' '), notOwns: notOwns.join(' ') }
}

/** 信条：开头没写“信条”这一项时，从正文里“我的信条：……”或“信条：……”那一行取（引导工具写在“我是谁”第一条） */
function mottoFromBody(body: string): string {
  const m = body.match(/^\s*(?:[-*>]\s*)*(?:\*\*)?(?:我的)?信条(?:\*\*)?[:：]\s*(.+?)(?:\*\*)?\s*$/m)
  return m ? m[1].replace(/\*\*/g, '').trim() : ''
}

/** 一个助理的属性（IDENTITY.md 全文；没有这份文件传空串） */
export function assistantProps(folder: string, identity: string): Assistant {
  const { meta, body } = front(identity)
  const f = folderParts(folder)
  const has = (k: string) => meta[k] !== undefined && (Array.isArray(meta[k]) ? meta[k].length > 0 : str(meta[k]) !== '')
  const oldKind = OLD_KINDS[str(meta['角色'])] ?? OLD_KINDS[f.duty] ?? ''
  const name = str(meta['名字']) || str(meta['名称']) || f.name || f.duty
  const fallback = ownsFromBody(body)
  const missing = FIELDS.filter((k) => !has(k))
  return {
    key: folder, name,
    avatar: str(meta['头像']),
    duty: str(meta['职责']) || oldKind || (f.name ? f.duty : ''),
    owns: str(meta['管什么']) || fallback.owns,
    notOwns: str(meta['不管什么']) || fallback.notOwns,
    call: str(meta['怎么叫']) || `叫${name}`,
    can: list(meta['能做什么']),
    chief: has('总协调') ? str(meta['总协调']) === '是' : oldKind === '总助',
    motto: str(meta['信条']) || mottoFromBody(body),
    legacy: missing.length > 0,
    missing,
  }
}

/** 一张 Markdown 表格（到下一个小节标题为止的第一张）：按表头认列 */
function table(md: string, stopAt?: RegExp): Record<string, string>[] {
  const lines = front(md).body.split(/\r?\n/)
  const out: Record<string, string>[] = []
  let head: string[] | null = null
  for (const line of lines) {
    if (stopAt && stopAt.test(line)) break
    const t = line.trim()
    if (!t.startsWith('|')) { if (head && out.length) break; continue }
    const cells = t.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
    if (!head) { head = cells; continue }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
    out.push(Object.fromEntries(head.map((h, i) => [h.replace(/（.*?）|\(.*?\)/g, '').trim(), cells[i] ?? ''])))
  }
  return out
}

/** 去掉括号里的说明（“🧑‍💼 阿栀｜总助（我的知识库，置顶）”→“🧑‍💼 阿栀｜总助”） */
export const titleKey = (s: string) => s.replace(/[（(][^）)]*[）)]\s*$/, '').trim()
/** [[路径|显示名]] → 显示名；[[路径]] → 文件名 */
const unlink = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p: string, alias?: string) => alias ?? p.split('/').pop()!)

export function parseColleagues(md: string): Colleague[] {
  return table(md, /^##\s+不用了的/).filter((r) => r['名字']).map((r) => {
    const link = r['名字'].match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
    const thread = titleKey(r['常驻对话'] ?? '')
    return {
      avatar: r['头像'] ?? '', name: link ? (link[2] ?? link[1].split('/').pop()!) : r['名字'], path: link ? link[1] : '',
      duty: r['职责'] ?? '', owns: r['管什么'] ?? '', notOwns: r['不管什么'] ?? '', call: r['怎么叫'] ?? '',
      thread: /^(还没有|没有|—|-)?$/.test(thread) ? '' : thread,
    }
  })
}

/** 花名册里“不用了的”那张小表（删掉的助理不删文件夹，挪到这里）：名字、哪天停的、为什么 */
export function parseRetired(md: string): { name: string; day: string; why: string }[] {
  const body = front(md).body
  const at = body.search(/^##\s+不用了的/m)
  if (at < 0) return []
  return table(body.slice(at).replace(/^##[^\n]*\n/, '')).filter((r) => r['名字']).map((r) => ({ name: unlink(r['名字']), day: r['哪天停的'] ?? '', why: r['为什么'] ?? '' }))
}

export function parseDispatch(md: string): Dispatch[] {
  return table(md).filter((r) => r['什么事'] || r['交给谁']).map((r) => {
    const stage = r['到哪一档'] ?? ''
    return { day: r['哪天'] ?? '', what: unlink(r['什么事'] ?? ''), to: titleKey(unlink(r['交给谁'] ?? '')), done: r['做完怎么算'] ?? '', stage, note: r['备注'] ?? '', open: !CLOSED.includes(stage) }
  })
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 一个对话归哪个助理。dispatched：总助派单记录里“交给谁”那一栏的对话标题 */
export function matchAssistant(s: { title: string; first: string; dock: boolean; persona?: string | null }, list: AssistantKey[], dispatched: string[]): { key: string; by: MatchBy } | null {
  const title = s.title.trim()
  const hit = (by: MatchBy, f: (a: AssistantKey) => boolean) => { const a = list.find(f); return a ? { key: a.key, by } : null }
  return hit('常驻对话', (a) => !!a.thread && title === a.thread)
    ?? hit('标题', (a) => (!!a.avatar && new RegExp(`^${esc(a.avatar)}\\s*${esc(a.name)}(?:\\s|[｜|]|$)`, 'u').test(title)) || new RegExp(`^${esc(a.name)}\\s*[｜|]`, 'u').test(title))
    ?? hit('第一句', (a) => new RegExp(`^\\s*叫\\s*${esc(a.name)}(?:[\\s，,。.:：!！]|$)`, 'u').test(s.first))
    ?? (s.dock && s.persona ? hit('工作台对话栏', (a) => a.key === s.persona) : null)
    ?? (dispatched.includes(title) ? hit('派单记录', (a) => a.chief) : null)
    ?? (s.dock ? hit('工作台对话栏', (a) => a.chief) : null)
}

/** 看家本领（约定 11.12）：每条写成“**叫什么**。什么时候用：…。用了我会：…”。取名字：加粗的开头、小节标题、列表项“名字。/名字：”开头 */
export function skillNames(md: string): string[] {
  const lines = front(md).body.split(/\r?\n/).map((l) => l.trim())
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.map((x) => x?.replace(/[。：:，,\s]+$/, '').trim()).filter((x): x is string => !!x))]
  // 有加粗开头的条目，就只认它们（新版里还有“招牌打法”“自查清单”这些小节，标题不是本领名）
  const bold = uniq(lines.map((l) => l.match(/^(?:[-*]\s+|\d+[.、]\s*)?\*\*([^*]{1,30})\*\*/)?.[1]))
  if (bold.length) return bold
  return uniq(lines.map((l) => l.match(/^#{2,4}\s+(.{1,30})$/)?.[1] ?? l.match(/^[-*]\s+([^。：:，,]{1,20})[。：:]/)?.[1]))
}

/** 一份产出（核心接入点 works 给的）：谁做的、网页上怎么打开 */
export type Work = { id: string; kind: string; title: string; status: string; by: string[]; at: string; to: string }

/** 哪些产出是这位助理做的（约定 11.13）：命令里 --by 记的名字等于它的名字，或名字单独出现（“✍️ 阿柚”“小红书助理 阿柚”）；
 *  名字前后紧挨着别的字的不算（“阿柚子”不是阿柚）。按时间倒序 */
export function worksFor(items: Work[], name: string): Work[] {
  const n = name.trim()
  if (!n) return []
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, 'u')
  return items.filter((w) => w.by.some((b) => re.test(b.trim()))).sort((a, b) => b.at.localeCompare(a.at))
}
