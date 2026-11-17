// 一篇内容（xhs_pieces）：选题 → 已选 → 写稿中 → 待发布 → 已发布是同一条；稿件版本只增不改。归属：小红书内容模块。
import { z } from 'zod'
import { all, get, run, tx, uid, nowIso, localDate, logChange } from '../../db.ts'
import { now } from '../../clock.ts'
import { NotFound, BadRequest, today, type Actor } from '../../services/common.ts'
import { charCount } from '../../../shared/xhs-check.ts'
import { normalizeDraft, emptyDraft, type Draft } from './draft.ts'
import { checkDraft } from './checks.ts'
import { relatedAlerts, topComments } from './related.ts'
import { identity } from '../../services/identity.ts'

export const STATUSES = ['灵感池', '已选', '写稿中', '待发布', '已发布', '已放弃'] as const
export const SOURCES = ['评论区问题', '热点和节气', '同行爆款', '知识库客户常问', '自己想的', '复盘建议', '旧笔记翻新', '从一款茶开始', '对标笔记'] as const
export type Status = (typeof STATUSES)[number]

/** 真实存在的日子（2026-13-45 这种不收） */
const realDate = (s: string) => { const d = new Date(`${s}T00:00:00`); return !Number.isNaN(d.getTime()) && localDate(d) === s }
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期写成 2026-10-28').refine(realDate, '没有这一天')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间写成 18:30（00:00—23:59）')
const text = (max: number) => z.string().trim().max(max, `最多 ${max} 个字`)

export const pieceInput = z.object({
  title: text(60).min(1, '写个标题，20 字以内最好'),
  angle: text(200).optional().nullable(),
  format: z.enum(['图文', '视频'], { error: '形式只能是图文或视频' }).default('图文'),
  pillar_id: z.string().optional().nullable(),
  source: z.enum(SOURCES, { error: `来源只能是：${SOURCES.join('、')}` }).default('自己想的'),
  reason: text(400).optional().nullable(),
  ref: text(400).optional().nullable(),
  status: z.enum(STATUSES, { error: `状态只能是：${STATUSES.join('、')}` }).default('灵感池'),
  scheduled_date: date.optional().nullable(),
  scheduled_time: time.optional().nullable(),
  start: z.object({ kind: z.string(), ref: z.string().optional().nullable(), label: z.string().optional().nullable(), text: z.string().optional().nullable() }).optional().nullable(),
})
export const piecePatch = pieceInput.partial().extend({
  memo: text(400).optional().nullable(),
  warn: text(400).optional().nullable(),
  published_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, '发布时间写成 2026-10-27T12:10').refine((s) => realDate(s.slice(0, 10)), '没有这一天').optional().nullable(),
  publish_url: text(300).optional().nullable(),
})

type PieceDb = {
  id: string; title: string; angle: string | null; format: string; pillar_id: string | null; source: string; reason: string | null; ref: string | null
  warn: string | null; status: Status; topic_date: string | null; job_id: string | null; created_by: string; scheduled_date: string | null; scheduled_time: string | null
  published_at: string | null; publish_url: string | null; note_id: string | null; memo: string | null; start: string | null; sort: number
  created_at: string; updated_at: string
}
type VersionDb = { id: string; piece_id: string; version: number; data: string; origin: string; author: string | null; note: string | null; message_id: string | null; created_at: string; msg_origin?: string | null }

const PIECE_SQL = `SELECT p.*, pl.name AS pillar_name,
  v.version AS version, v.data AS vdata, v.created_at AS version_at, v.origin AS version_origin,
  s.impressions, s.reads, s.likes, s.saves, s.comments, s.new_followers, s.stats_date,
  b.impressions AS paid_impressions, b.reads AS paid_reads, b.likes AS paid_likes, b.saves AS paid_saves, b.comments AS paid_comments, b.new_followers AS paid_new_followers, b.spend AS paid_spend
  FROM xhs_pieces p
  LEFT JOIN content_pillars pl ON pl.id = p.pillar_id
  LEFT JOIN xhs_versions v ON v.piece_id = p.id AND v.version = (SELECT MAX(version) FROM xhs_versions WHERE piece_id = p.id)
  LEFT JOIN xhs_note_stats s ON s.note_id = p.note_id AND s.traffic = '自然'
  LEFT JOIN xhs_note_stats b ON b.note_id = p.note_id AND b.traffic = '投流'`

type PieceJoined = PieceDb & {
  pillar_name: string | null; version: number | null; vdata: string | null; version_at: string | null; version_origin: string | null
  impressions: number | null; reads: number | null; likes: number | null; saves: number | null; comments: number | null; new_followers: number | null; stats_date: string | null
  paid_impressions: number | null; paid_reads: number | null; paid_likes: number | null; paid_saves: number | null; paid_comments: number | null; paid_new_followers: number | null; paid_spend: number | null
}

const parseJson = <T>(s: string | null | undefined, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback } catch { return fallback } }
const sum = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0))
/** 现在，本地时间 2026-10-27T15:20 */
export const nowLocal = () => { const d = now(); return `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
/** 种子里预先写好的版本 ID 是 v_<篇>_<第几版>，现场存的是 v_<8 位>：用来在版本列表里标“示例” */
const seeded = (versionId: string) => versionId.split('_').length > 2
/** 还在做的几篇：列表、看板、日历上显示检查结论 */
const CHECKED: Status[] = ['已选', '写稿中', '待发布']

/** 列表里每篇带：最新稿件的轻量信息（封面要画，含每页第一行）、检查结论、数据（自然 + 投流合计和分开） */
function shape(r: PieceJoined) {
  const d = r.vdata ? normalizeDraft(parseJson(r.vdata, {}), undefined, r.pillar_id) : null
  const { vdata: _v, ...rest } = r
  const check = d && CHECKED.includes(r.status) ? checkDraft(d, r.scheduled_date) : null
  return {
    ...rest,
    start: parseJson<Record<string, string> | null>(r.start, null),
    ai: /Codex/.test(r.created_by),
    draft: d ? {
      title: d.title, cover_text: d.cover_text, cover: d.cover, pages: d.pages.map((p) => ({ role: p.role, text: p.text.slice(0, 60), pad: p.pad ?? null })),
      tags: d.tags, body_len: charCount(d.body),
    } : null,
    check: check ? { blocks: check.blocks, warns: check.warns } : null,
    total: r.note_id && r.reads != null ? {
      impressions: sum(r.impressions, r.paid_impressions), reads: sum(r.reads, r.paid_reads), likes: sum(r.likes, r.paid_likes),
      saves: sum(r.saves, r.paid_saves), comments: sum(r.comments, r.paid_comments), new_followers: sum(r.new_followers, r.paid_new_followers),
    } : null,
    boosted: (r.paid_spend ?? 0) > 0,
  }
}
export type PieceRow = ReturnType<typeof shape>

export function listPieces() {
  return all<PieceJoined>(`${PIECE_SQL} ORDER BY COALESCE(p.scheduled_date, p.published_at, p.topic_date, p.created_at) DESC, p.sort`).map(shape)
}

export function pieceRow(id: string) {
  const r = get<PieceJoined>(`${PIECE_SQL} WHERE p.id = :id`, { id })
  if (!r) throw new NotFound('找不到这一篇，可能已经删掉或放弃了')
  return shape(r)
}

export function versions(id: string) {
  return all<VersionDb>(`SELECT v.*, m.origin AS msg_origin FROM xhs_versions v LEFT JOIN xhs_messages m ON m.id = v.message_id
    WHERE v.piece_id = :id ORDER BY v.version DESC`, { id })
    .map(({ msg_origin, ...v }) => ({ ...v, data: normalizeDraft(parseJson(v.data, {})), example: msg_origin === '示例' || (seeded(v.id) && v.origin !== '导入') }))
}

export function latestDraft(id: string): { version: number; draft: Draft; at: string } | null {
  const v = get<VersionDb>('SELECT * FROM xhs_versions WHERE piece_id = :id ORDER BY version DESC LIMIT 1', { id })
  if (!v) return null
  const p = get<{ pillar_id: string | null }>('SELECT pillar_id FROM xhs_pieces WHERE id = :id', { id })
  return { version: v.version, draft: normalizeDraft(parseJson(v.data, {}), undefined, p?.pillar_id), at: v.created_at }
}

/** Codex 写稿时自己核过的：取最近一版“AI 写稿”的检查；之后有人改过，就把改过的几版列出来（旧的检查不能当现在的结论） */
function aiCheck(vs: ReturnType<typeof versions>) {
  const ai = vs.find((v) => v.origin === 'AI 写稿')
  if (!ai || !ai.data.checks.length) return null
  return {
    version: ai.version, author: ai.author, at: ai.created_at, example: ai.example, items: ai.data.checks,
    later: vs.filter((v) => v.version > ai.version).reverse().map((v) => ({ version: v.version, origin: v.origin, author: v.author, note: v.note })),
  }
}

/** 打开一篇：基本信息、当前稿件（没有稿件就按标题给空稿）、发布前检查、版本列表、Codex 的自查、评论、和经营那边的关联 */
export function pieceDetail(id: string) {
  const p = pieceRow(id)
  const cur = latestDraft(id)
  const draft = cur?.draft ?? emptyDraft(p.title, p.pillar_id)
  const publishOn = p.status === '已发布' ? p.published_at?.slice(0, 10) : p.scheduled_date
  const vs = versions(id)
  return {
    piece: p, draft, version: cur?.version ?? 0, has_draft: !!cur,
    checks: cur ? checkDraft(draft, publishOn) : null,
    ai_check: aiCheck(vs),
    versions: vs.map(({ data, ...v }) => ({ ...v, title: data.title, body_len: charCount(data.body) })),
    comments: p.note_id ? topComments(p.note_id) : [],
    related: relatedAlerts(p),
  }
}

function assertPillar(pillarId: string | null | undefined) {
  if (pillarId && !get('SELECT id FROM content_pillars WHERE id = :id', { id: pillarId })) throw new BadRequest('没有这个内容支柱')
}

export function createPiece(input: unknown, actor: Actor | string, extra: Partial<PieceDb> = {}) {
  const v = pieceInput.parse(input)
  assertPillar(v.pillar_id)
  if (!['灵感池', '已选', '写稿中'].includes(v.status)) throw new BadRequest('新建的只能放进灵感池、已选或写稿中；写好、定了日子再往后推')
  if (v.scheduled_date && v.scheduled_date < today()) throw new BadRequest('这天已经过了，换个日子')
  const id = uid('p')
  const at = nowIso()
  run(`INSERT INTO xhs_pieces (id, title, angle, format, pillar_id, source, reason, ref, warn, status, topic_date, job_id, created_by, scheduled_date, scheduled_time, start, sort, created_at, updated_at)
    VALUES (:id, :title, :angle, :format, :pillar_id, :source, :reason, :ref, :warn, :status, :topic_date, :job_id, :created_by, :scheduled_date, :scheduled_time, :start, :sort, :at, :at)`, {
    id, title: v.title, angle: v.angle ?? null, format: v.format, pillar_id: v.pillar_id ?? null, source: v.source, reason: v.reason ?? null, ref: v.ref ?? null,
    warn: extra.warn ?? null, status: v.status, topic_date: extra.topic_date ?? null, job_id: extra.job_id ?? null, created_by: extra.created_by ?? (actor === '网页' ? identity().owner : String(actor)),
    scheduled_date: v.scheduled_date ?? null, scheduled_time: v.scheduled_time ?? null, start: v.start ? JSON.stringify(v.start) : null, sort: extra.sort ?? 0, at,
  })
  logChange(actor === '网页' || actor === 'Codex' ? actor : 'Codex', 'xhs_piece', id, '新建', `小红书：新建「${v.title}」（${v.status}）`)
  return pieceRow(id)
}

/** 改字段、换状态、改排期。进“待发布”要有稿子和排期日；进“已发布”记发布时间（不能晚于现在）；发出去的不能退回 */
export function updatePiece(id: string, input: unknown, actor: Actor) {
  const cur = pieceRow(id)
  const raw = (input ?? {}) as Record<string, unknown>
  const v = piecePatch.parse(raw)
  const fields: Record<string, string | number | null> = {}
  for (const k of ['title', 'angle', 'format', 'pillar_id', 'source', 'reason', 'ref', 'status', 'scheduled_date', 'scheduled_time', 'memo', 'warn', 'published_at', 'publish_url'] as const) {
    if (k in raw) fields[k] = (v[k] as string | null | undefined) ?? null
  }
  if ('start' in raw) fields.start = v.start ? JSON.stringify(v.start) : null
  if ('pillar_id' in fields) assertPillar(fields.pillar_id as string | null)
  const next = (fields.status as Status | undefined) ?? cur.status
  if (cur.status === '已发布' && next !== '已发布') throw new BadRequest('已经发出去的笔记不能改回去；要再写一篇，用“从这篇翻新”')
  if (cur.status === '已发布' && 'scheduled_date' in fields) throw new BadRequest('已经发出去的笔记不能改排期')
  if ('published_at' in fields && next !== '已发布') throw new BadRequest('还没发出去，不用填发布时间')
  if (next === '已发布' && cur.status !== '已发布') fields.published_at = (fields.published_at as string | null) ?? nowLocal()
  if (fields.published_at && (fields.published_at as string) > nowLocal()) throw new BadRequest('这个时间还没到：在小红书 App 里发出去以后再标')
  if (next === '待发布' && cur.status !== '待发布') {
    if (!cur.version) throw new BadRequest('还没有稿子，先写一版再定稿')
    if (!fields.scheduled_date && !cur.scheduled_date) throw new BadRequest('先定一个发布日期，再移到“待发布”')
  }
  if (fields.scheduled_date && next !== '已发布' && (fields.scheduled_date as string) < today()) throw new BadRequest('这天已经过了，换个日子')
  if (!Object.keys(fields).length) return cur
  const sets = Object.keys(fields).map((k) => `${k} = :${k}`).join(', ')
  run(`UPDATE xhs_pieces SET ${sets}, updated_at = :at WHERE id = :id`, { ...fields, at: nowIso(), id })
  const what = fields.status && fields.status !== cur.status ? `移到「${fields.status}」` : 'scheduled_date' in fields ? `排到 ${fields.scheduled_date ?? '未定'}` : '改了内容'
  logChange(actor, 'xhs_piece', id, '修改', `小红书：「${cur.title}」${what}`)
  return pieceRow(id)
}

/** 存一个新版本（AI 写稿、手动修改、采用候选、恢复）。版本只增不改 */
export function saveVersion(id: string, data: unknown, opts: { origin: 'AI 写稿' | '手动修改' | '采用候选' | '恢复' | '导入'; author: string; note?: string | null; messageId?: string | null }) {
  const p = pieceRow(id)
  if (p.status === '已发布') throw new BadRequest('已经发出去的笔记不能再改稿；要改就“从这篇翻新”')
  const prev = latestDraft(id)
  const draft = normalizeDraft(data, prev?.draft, p.pillar_id)
  return tx(() => {
    const version = (prev?.version ?? 0) + 1
    run(`INSERT INTO xhs_versions (id, piece_id, version, data, origin, author, note, message_id, created_at)
      VALUES (:vid, :id, :version, :data, :origin, :author, :note, :mid, :at)`, {
      vid: uid('v'), id, version, data: JSON.stringify(draft), origin: opts.origin, author: opts.author, note: opts.note ?? null, mid: opts.messageId ?? null, at: nowIso(),
    })
    // 稿件写出来以后，选题自动进“写稿中”；标题跟着稿件走
    const next = ['灵感池', '已选'].includes(p.status) ? '写稿中' : p.status
    run('UPDATE xhs_pieces SET status = :next, title = :title, updated_at = :at WHERE id = :id', { next, title: draft.title || p.title, at: nowIso(), id })
    logChange(opts.author === '本机 Codex' ? 'Codex' : '网页', 'xhs_piece', id, '新版本', `小红书：「${draft.title || p.title}」存为 v${version}（${opts.origin}）`)
    return { version, draft }
  })
}

export function restoreVersion(id: string, version: number, actor: Actor) {
  const v = get<VersionDb>('SELECT * FROM xhs_versions WHERE piece_id = :id AND version = :version', { id, version })
  if (!v) throw new NotFound(`没有 v${version}`)
  return saveVersion(id, parseJson(v.data, {}), { origin: '恢复', author: actor === '网页' ? identity().owner : actor, note: `从 v${version} 恢复` })
}

/** 已发布：记发布时间（默认现在，不能晚于现在）、链接（可不填，导入数据时按标题和日期对上） */
export function markPublished(id: string, input: { published_at?: string | null; publish_url?: string | null }, actor: Actor) {
  return updatePiece(id, { status: '已发布', published_at: input.published_at || nowLocal(), publish_url: input.publish_url ?? null }, actor)
}
