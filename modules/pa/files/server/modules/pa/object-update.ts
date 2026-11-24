// 在对话里认出、更新“我关注的”对象。工作台网页不改对象，改都走对话：
//   pa-find：按名称、别名认出说的是哪个对象（给 AI 用，好打开右侧详情）
//   pa-update：先预演（什么都不写），把会改哪几处给老板看；老板确认后带 --confirm "他的原话" 再写。
//     只改状态、现在、下一步、往来记录四处（见 update-plan.ts）；写之前备份原文件，记进“最近改动”。
//     预演过的同一张改动才收（记在数据库旁边的 对象预演.json，留 24 小时），改过就要重新预演。
// 写完不用通知网页：工作台盯着知识库文件，文件一变，打开着的详情自己刷新。
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DB_PATH, logChange } from '../../db.ts'
import { backupKbFile, writeKb } from '../../services/kb.ts'
import { BadRequest, NotFound, type Actor } from '../../services/common.ts'
import { allObjects, findObject, readRel } from './kb.ts'
import { norm } from './match.ts'
import { planObjectUpdate, type Change, type ObjectUpdate } from './update-plan.ts'
import { now } from './store.ts'

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type Found = { type: string; name: string; path: string; status: string; now: string; aliases: string[]; by: '名称' | '别名' | '包含'; open: { kind: 'pa-object'; id: string } }

/** 按名称、别名认对象：先全等，再包含（两边都去掉空格标点比）。最多 8 个 */
export function findObjects(query: string): Found[] {
  const q = norm(query)
  if (q.length < 2) throw new BadRequest('至少写两个字')
  const rows = allObjects().map(({ cls, object: o }) => {
    const names = [o.name, ...o.aliases].map(norm).filter(Boolean)
    const by: Found['by'] | null = norm(o.name) === q ? '名称' : names.includes(q) ? '别名' : names.some((n) => n.includes(q) || (n.length >= 2 && q.includes(n))) ? '包含' : null
    return by ? { type: cls.name, name: o.name, path: o.path, status: cls.rename[o.status] ?? o.status, now: o.now.slice(0, 80), aliases: o.aliases, by, open: { kind: 'pa-object' as const, id: o.path } } : null
  }).filter((x): x is Found => !!x)
  const rank = { 名称: 0, 别名: 1, 包含: 2 }
  return rows.sort((a, b) => rank[a.by] - rank[b.by] || a.name.localeCompare(b.name, 'zh')).slice(0, 8)
}

// ── 预演记录
const PREVIEWS = join(dirname(DB_PATH), '对象预演.json')
const TTL = 24 * 3600 * 1000
const key = (path: string, u: ObjectUpdate) => createHash('sha256').update(JSON.stringify([path, u.status ?? null, u.now ?? null, u.nextAdd ?? [], u.nextDone ?? [], u.log ?? null])).digest('hex')
function previews(): Record<string, number> {
  try { const all = JSON.parse(readFileSync(PREVIEWS, 'utf8')) as Record<string, number>; return Object.fromEntries(Object.entries(all).filter(([, at]) => Date.now() - at < TTL)) } catch { return {} }
}
const save = (v: Record<string, number>) => { mkdirSync(dirname(PREVIEWS), { recursive: true }); writeFileSync(PREVIEWS, `${JSON.stringify(v)}\n`, 'utf8') }

export type UpdateResult = { path: string; name: string; type: string; written: boolean; changes: Change[]; backup?: string; open: { kind: 'pa-object'; id: string } }

export function updateObject(path: string, u: ObjectUpdate, opts: { yes?: boolean; confirmation?: string; actor?: Actor } = {}): UpdateResult {
  const hit = findObject(path)
  if (!hit) throw new NotFound(`“我关注的”里没有这个对象：${path}（先用 pa-find 认出它的路径）`)
  const { cls, object: o } = hit
  const allowed = [...new Set([...cls.statuses, ...Object.keys(cls.rename)])]
  const d = new Date(now())
  let plan
  try { plan = planObjectUpdate(readRel(o.path), u, localDay(d), allowed) } catch (e) { throw new BadRequest((e as Error).message) }
  const base = { path: o.path, name: o.name, type: cls.name, changes: plan.changes, open: { kind: 'pa-object' as const, id: o.path } }
  const k = key(o.path, u)
  if (!opts.yes) {
    save({ ...previews(), [k]: Date.now() })
    return { ...base, written: false }
  }
  const words = opts.confirmation?.trim()
  if (!words) throw new BadRequest('写之前要带老板确认的原话（--confirm）')
  const pv = previews()
  if (!(k in pv)) throw new BadRequest('这张改动没预演过（或预演以后改过）：先不带 --confirm 预演一次，给老板看过、他确认了再写')
  const stamp = `${localDay(d)}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const backup = backupKbFile(o.path, stamp) ?? undefined
  writeKb(o.path, plan.text)
  const { [k]: _done, ...rest } = pv
  save(rest)
  logChange(opts.actor ?? 'Codex', 'pa_object', o.path, '更新对象', `我关注的：更新「${o.name}」的${[...new Set(plan.changes.map((c) => c.what).filter((w) => w !== '更新'))].join('、')}（老板确认：${words.slice(0, 60)}）`)
  return { ...base, written: true, ...(backup ? { backup } : {}) }
}
