// 经营日报：Codex 定时任务每天早上读工作台数据写好，用命令 biz-report-set 写回；网页只读、标明谁几点写的。归属：经营模块。
// 正文是 Markdown，按“## 昨天怎么样 / ## 哪里不对劲 / ## 可能的原因 / ## 建议”四段写；没按这个写也能存，网页整段显示。
import { z } from 'zod'
import { all, get, run, nowIso, uid, logChange } from '../../db.ts'
import { NotFound, type Actor } from '../../services/common.ts'
import { latestDate } from './service.ts'
import { realDate } from './period.ts'

export const REPORT_METHODS = ['定时任务', '命令行', '手写'] as const
export const SECTION_NAMES = ['昨天怎么样', '哪里不对劲', '可能的原因', '建议'] as const

type Row = { id: string; date: string; written_at: string; author: string; method: string; title: string; body: string; created_at: string }
export type Section = { heading: string; body: string }

/** 按二级标题拆段；标题前的文字算“摘要” */
export function sections(body: string): { lead: string; sections: Section[] } {
  const parts = body.split(/^##\s+/m)
  const lead = parts.shift()?.trim() ?? ''
  return { lead, sections: parts.map((p) => { const [h, ...rest] = p.split('\n'); return { heading: h.trim(), body: rest.join('\n').trim() } }) }
}

const shape = (r: Row) => ({ ...r, ...sections(r.body) })

export function listReports(limit = 10) {
  return all<Row>('SELECT * FROM biz_reports ORDER BY date DESC, written_at DESC LIMIT :n', { n: limit }).map(shape)
}

export function latestReport() {
  const r = get<Row>('SELECT * FROM biz_reports ORDER BY date DESC, written_at DESC LIMIT 1')
  return r ? shape(r) : null
}

export function getReport(id: string) {
  const r = get<Row>('SELECT * FROM biz_reports WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这份早报')
  return shape(r)
}

const date = z.string({ message: '日期写成 2026-10-26 这样' }).refine((v) => !!realDate(v), '日期写成 2026-10-26 这样（要是真实存在的日子）')
export const reportInput = z.object({
  date: date.optional(),
  body: z.string({ message: '早报正文要写文字' }).trim().min(20, '早报至少写一两句话').max(12000, '早报太长了，控制在一万字以内'),
  title: z.string({ message: '标题要写文字' }).trim().max(60, '标题最多 60 个字').optional(),
  author: z.string({ message: '谁写的要写名字' }).trim().max(30, '谁写的最多 30 个字').optional(),
  method: z.enum(REPORT_METHODS, { message: `方式只能是 ${REPORT_METHODS.join('、')}` }).default('命令行'),
  written_at: z.string({ message: '几点写好的写成 2026-10-27T07:55 这样' }).regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, '几点写好的写成 2026-10-27T07:55 这样').optional(),
}, { message: '要写成 JSON 对象' })

const localStamp = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 写回一份日报：同一天已有的就替换（一天只留一份），并记一笔“最近改动” */
export function setReport(input: unknown, actor: Actor | string) {
  const data = reportInput.parse(input)
  const d = data.date ?? latestDate()
  if (!d) throw new NotFound('还没有经营数据，写不了日报')
  const at = data.written_at ?? localStamp(nowIso())
  const author = data.author ?? (data.method === '定时任务' ? 'Codex 定时任务' : String(actor))
  const title = data.title ?? `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日 经营早报`
  const old = get<{ id: string }>('SELECT id FROM biz_reports WHERE date = :d', { d })
  const id = old?.id ?? uid('rpt')
  if (old) run('UPDATE biz_reports SET written_at = :at, author = :author, method = :method, title = :title, body = :body WHERE id = :id', { id, at, author, method: data.method, title, body: data.body })
  else run('INSERT INTO biz_reports (id, date, written_at, author, method, title, body, created_at) VALUES (:id, :d, :at, :author, :method, :title, :body, :c)', { id, d, at, author, method: data.method, title, body: data.body, c: nowIso() })
  logChange(String(actor), '经营早报', id, old ? '修改' : '新增', `${title}（${author} ${at.slice(11)} 写）`)
  return getReport(id)
}
