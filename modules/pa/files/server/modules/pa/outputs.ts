// 产出：AI 生成的图片和对话里写出来的文件。数据库里只有路径；图片要看时现读原文件，别的文件只告诉你在哪。文件只读不搬。
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { DB_PATH } from '../../db.ts'
import { all, get } from '../../db.ts'
import { NotFound, BadRequest } from '../../services/common.ts'
import { listSessions, now, TOOL_NAMES, type SessionView } from './store.ts'

type Row = { id: string; session_id: string | null; path: string; kind: string; action: string; source: string; tool: string; at: string }
export type OutputView = {
  id: string; name: string; path: string; folder: string; kind: string; action: string; at: string; tool: string; tool_name: string
  session: { id: string; title: string; link: string | null } | null
  object: { path: string; name: string; type: string } | null
  exists: boolean
}
export const OUTPUT_KINDS = ['图片', '文档', '表格', '网页', '代码', '其他']

/** 最近 days 天的产出。默认只算新写出来的（新建、生成），改已有文件的不算；kind / object / tool 是筛选 */
export function listOutputs(opts: { days?: number; kind?: string; object?: string; tool?: string; session?: string; edits?: boolean; limit?: number; offset?: number } = {}) {
  const since = new Date(now() - (opts.days ?? 30) * 864e5).toISOString()
  const sessions = new Map<string, SessionView>(listSessions({ days: 3650, all: true }).map((s) => [s.id, s]))
  const rows = all<Row>(`SELECT * FROM pa_outputs WHERE at >= :since ${opts.edits ? '' : "AND action <> '修改'"} ORDER BY at DESC LIMIT 5000`, { since })
  const views = rows.map((r): OutputView => {
    const s = r.session_id ? sessions.get(r.session_id) : undefined
    return {
      id: r.id, name: basename(r.path), path: r.path, folder: dirname(r.path), kind: r.kind, action: r.action, at: r.at, tool: r.tool, tool_name: TOOL_NAMES[r.tool] ?? (r.tool || '未知'),
      session: s ? { id: s.id, title: s.title, link: s.link } : null,
      object: s?.object ? { path: s.object.path, name: s.object.name, type: s.object.type } : null,
      exists: false,
    }
  })
  const match = (v: OutputView, skip?: string) => (skip === 'kind' || !opts.kind || v.kind === opts.kind) && (!opts.tool || v.tool === opts.tool) && (!opts.session || v.session?.id === opts.session)
    && (!opts.object || (opts.object === '-' ? !v.object : v.object?.path === opts.object))
  const hit = views.filter((v) => match(v))
  const counts: Record<string, number> = Object.fromEntries(OUTPUT_KINDS.map((k) => [k, 0]))
  for (const v of views) if (match(v, 'kind')) counts[v.kind] = (counts[v.kind] ?? 0) + 1
  const offset = opts.offset ?? 0
  const items = hit.slice(offset, offset + (opts.limit ?? 60)).map((v) => ({ ...v, exists: existsSync(v.path) }))
  const objects = [...new Map(views.filter((v) => v.object).map((v) => [v.object!.path, v.object!])).values()]
  return { items, total: hit.length, counts, objects, tools: [...new Set(views.map((v) => v.tool).filter(Boolean))].map((t) => ({ tool: t, name: TOOL_NAMES[t] ?? t })) }
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' }
/** 看一张图：只给清单里登记过的图片（按编号取，不收路径），不给别的文件 */
export function imageFile(id: string): { path: string; type: string; size: number } {
  const r = get<Row>('SELECT * FROM pa_outputs WHERE id = :id', { id })
  if (!r) throw new NotFound('清单里没有这个文件')
  const type = MIME[r.path.split('.').pop()?.toLowerCase() ?? '']
  if (r.kind !== '图片' || !type) throw new BadRequest('这里只能看图片；别的文件请到它所在的文件夹里打开')
  let size = 0
  try { size = statSync(r.path).size } catch { throw new NotFound('这张图已经不在原来的位置了') }
  if (size > 40 * 1024 * 1024) throw new BadRequest('这张图太大了，请到它所在的文件夹里打开')
  return { path: r.path, type, size }
}

/** 某段时间里的产出数（报告页顶上的数）：图片几张、新写的文件几个 */
export function outputStats(from: string, to: string) {
  const rows = all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM pa_outputs WHERE action <> '修改' AND kind <> '代码' AND at >= :a AND at < :b GROUP BY kind", { a: from, b: to })
  const images = rows.find((r) => r.kind === '图片')?.n ?? 0
  const total = rows.reduce((s, r) => s + r.n, 0)
  return { total, images, files: total - images }
}

/** 图库用的小图：Mac 上用系统自带的 sips 缩成 480 像素的 jpg，存在数据库旁边的 缩略图/（原图不动）；别的系统或缩不了就给原图 */
export function thumbFile(id: string): { path: string; type: string; size: number } {
  const f = imageFile(id)
  if (process.platform !== 'darwin') return f
  const dir = join(dirname(DB_PATH), '缩略图')
  const out = join(dir, `${id}.jpg`)
  try {
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(f.path).mtimeMs) {
      mkdirSync(dir, { recursive: true })
      execFileSync('/usr/bin/sips', ['-Z', '480', '-s', 'format', 'jpeg', f.path, '--out', out], { stdio: 'ignore', timeout: 15000 })
    }
    return { path: out, type: 'image/jpeg', size: statSync(out).size }
  } catch { return f }
}
