// 产出：AI 生成的图片和对话里写出来的文件。数据库里只有路径；图片要看时现读原文件，别的文件只告诉你在哪。文件只读不搬。
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, join } from 'node:path'
import { DB_PATH } from '../../db.ts'

const run = promisify(execFile)
import { all, get } from '../../db.ts'
import { NotFound, BadRequest } from '../../services/common.ts'
import { listSessions, now, TOOL_NAMES, type SessionView } from './store.ts'
import { imageSize } from './image-size.ts'

type Row = { id: string; session_id: string | null; path: string; kind: string; action: string; source: string; tool: string; at: string }
export type OutputView = {
  id: string; name: string; path: string; folder: string; kind: string; action: string; at: string; tool: string; tool_name: string
  session: { id: string; title: string; link: string | null } | null
  object: { path: string; name: string; type: string } | null
  exists: boolean
  /** 图片的宽高（读文件开头认的），认不出是 null；别的文件没有 */
  width?: number | null; height?: number | null
}
export const OUTPUT_KINDS = ['图片', '文档', '表格', '网页', '代码', '其他']

/** 最近 days 天的产出。默认只算新写出来的（新建、生成），改已有文件的不算；kind / object / tool 是筛选 */
/** 已经不在原处的文件（多是临时文件夹里的）默认不列，只数个数（gone）；带 gone 才列 */
export function listOutputs(opts: { days?: number; kind?: string; object?: string; tool?: string; session?: string; edits?: boolean; gone?: boolean; limit?: number; offset?: number } = {}) {
  const since = new Date(now() - (opts.days ?? 30) * 864e5).toISOString()
  const sessions = new Map<string, SessionView>(listSessions({ days: 3650, all: true }).map((s) => [s.id, s]))
  const rows = all<Row>(`SELECT * FROM pa_outputs WHERE at >= :since ${opts.edits ? '' : "AND action <> '修改'"} ORDER BY at DESC LIMIT 5000`, { since })
  const every = rows.map((r) => toView(r, sessions))
  const views = opts.gone ? every : every.filter((v) => v.exists)
  const match = (v: OutputView, skip?: string) => (skip === 'kind' || !opts.kind || v.kind === opts.kind) && (!opts.tool || v.tool === opts.tool) && (!opts.session || v.session?.id === opts.session)
    && (!opts.object || (opts.object === '-' ? !v.object : v.object?.path === opts.object))
  const hit = views.filter((v) => match(v))
  const counts: Record<string, number> = Object.fromEntries(OUTPUT_KINDS.map((k) => [k, 0]))
  for (const v of views) if (match(v, 'kind')) counts[v.kind] = (counts[v.kind] ?? 0) + 1
  const offset = opts.offset ?? 0
  const items = hit.slice(offset, offset + (opts.limit ?? 60)).map((v) => (v.kind === '图片' && v.exists ? { ...v, ...(imageSize(v.path) ?? { width: null, height: null }) } : v))
  const objects = [...new Map(views.filter((v) => v.object).map((v) => [v.object!.path, v.object!])).values()]
  return { items, total: hit.length, counts, gone: every.filter((v) => !v.exists && match(v)).length, objects, tools: [...new Set(views.map((v) => v.tool).filter(Boolean))].map((t) => ({ tool: t, name: TOOL_NAMES[t] ?? t })) }
}

function toView(r: Row, sessions: Map<string, SessionView>): OutputView {
  const s = r.session_id ? sessions.get(r.session_id) : undefined
  return {
    id: r.id, name: basename(r.path), path: r.path, folder: dirname(r.path), kind: r.kind, action: r.action, at: r.at, tool: r.tool, tool_name: TOOL_NAMES[r.tool] ?? (r.tool || '未知'),
    session: s ? { id: s.id, title: s.title, link: s.link } : null,
    object: s?.object ? { path: s.object.path, name: s.object.name, type: s.object.type } : null,
    exists: existsSync(r.path),
  }
}
const row = (id: string): Row => { const r = get<Row>('SELECT * FROM pa_outputs WHERE id = :id', { id }); if (!r) throw new NotFound('清单里没有这个文件'); return r }

/** 一个产出的详情：按编号直接取，不受列表条数和筛选的限制 */
export function getOutput(id: string): OutputView {
  return toView(row(id), new Map(listSessions({ days: 3650, all: true }).map((s) => [s.id, s])))
}

/** 在本机打开（交给 macOS 的 open）：图片、文档、表格、网页用默认的应用打开；代码和别的只在访达里显示（.command、.app 这类一打开就会运行）。
 *  只认清单里登记过、还在原处的文件。返回给 open 的参数 */
export const OPENABLE = new Set(['图片', '文档', '表格', '网页'])
export function openArgs(id: string, reveal: boolean): string[] {
  const r = row(id)
  if (!existsSync(r.path)) throw new NotFound('这个文件已经不在原来的位置了')
  if (reveal) return ['-R', r.path]
  if (!OPENABLE.has(r.kind)) throw new BadRequest('这类文件只能在访达里显示，不直接打开')
  return [r.path]
}
export async function openOnMac(id: string, reveal: boolean): Promise<{ reveal: boolean }> {
  if (process.platform !== 'darwin') throw new BadRequest('只有 Mac 上能从网页里直接打开；请到它所在的文件夹里打开')
  await run('/usr/bin/open', openArgs(id, reveal), { timeout: 10000 })
  return { reveal }
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml' }
/** 看一张图：只给清单里登记过的图片（按编号取，不收路径），不给别的文件 */
export function imageFile(id: string): { path: string; type: string; size: number } {
  const r = row(id)
  const type = MIME[r.path.split('.').pop()?.toLowerCase() ?? '']
  if (r.kind !== '图片' || !type) throw new BadRequest('这种图网页里显示不了，请点“在本机打开”')
  let size = 0
  try { size = statSync(r.path).size } catch { throw new NotFound('这张图已经不在原来的位置了') }
  if (size > 40 * 1024 * 1024) throw new BadRequest('这张图太大了，请点“在本机打开”')
  return { path: r.path, type, size }
}

/** 某段时间里的产出数（报告页顶上的数）：图片几张、新写的文件几个 */
/** 近几天的产出（给进展的图用）：只要时间和类型 */
export function recentOutputs(days: number): { at: string; kind: string }[] {
  return all<{ at: string; kind: string }>("SELECT at, kind FROM pa_outputs WHERE action <> '修改' AND at >= :since", { since: new Date(now() - days * 864e5).toISOString() })
}

export function outputStats(from: string, to: string) {
  const rows = all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM pa_outputs WHERE action <> '修改' AND kind <> '代码' AND at >= :a AND at < :b GROUP BY kind", { a: from, b: to })
  const images = rows.find((r) => r.kind === '图片')?.n ?? 0
  const total = rows.reduce((s, r) => s + r.n, 0)
  return { total, images, files: total - images }
}

/** 图库用的小图：Mac 上用系统自带的 sips 缩成 480 像素的 jpg，存在数据库旁边的 缩略图/（原图不动）；别的系统或缩不了就给原图。
 *  异步、最多同时缩两张：同步调用会卡住整个服务（一页几十张图要卡半分钟） */
const making = new Map<string, Promise<void>>()
let active = 0
const waiting: (() => void)[] = []
const slot = async () => { if (active >= 2) await new Promise<void>((r) => waiting.push(r)); active++ }
const release = () => { active--; waiting.shift()?.() }
export async function thumbFile(id: string): Promise<{ path: string; type: string; size: number }> {
  const f = imageFile(id)
  if (process.platform !== 'darwin' || f.type === 'image/svg+xml') return f
  const dir = join(dirname(DB_PATH), '缩略图')
  const out = join(dir, `${id}.jpg`)
  try {
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(f.path).mtimeMs) {
      if (!making.has(id)) making.set(id, (async () => {
        await slot()
        try { mkdirSync(dir, { recursive: true }); await run('/usr/bin/sips', ['-Z', '480', '-s', 'format', 'jpeg', f.path, '--out', out], { timeout: 15000 }) }
        finally { release(); making.delete(id) }
      })())
      await making.get(id)
    }
    return { path: out, type: 'image/jpeg', size: statSync(out).size }
  } catch { return f }
}
