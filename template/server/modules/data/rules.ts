// 导入规则：一种表（平台 + 报表）怎么对字段。老板确认过一次就存下来，以后同一种表直接按它导；表头对不上就停下来。
// 数据库 import_rules 是准；每条规则同时写一份 工作台/导入规则/<平台>-<报表>.json，Codex 和人都能直接看。归属：数据源与导入模块。
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, ROOT, uid, logChange } from '../../db.ts'
import { BadRequest, NotFound } from '../../services/common.ts'
import { CHANNELS, FIELD, NOTE_TARGETS, targetLabel, type DateFmt, type FieldKey } from './fields.ts'
import { stamp } from './time.ts'

/** 一列怎么对：how 是怎么对上的（规则、常见叫法、知识库、你选的、Codex）；人点过头的记 by（谁）和 at（几点） */
export type RuleMap = { col: string; field: string | null; how?: string; by?: string; at?: string }
export type Rule = {
  id: string; source_id: string | null; platform: string; report: string; channel_id: string | null
  target: 'channel_daily' | 'xhs_note_stats'; signature: string[]; mapping: RuleMap[]; required: FieldKey[]
  date_format: DateFmt | null; amount_unit: '元' | '万元'; status: '在用' | '停用'; origin: '示例' | '自己的'
  file_path: string | null; created_at: string; created_by: string | null; updated_at: string
  last_used_at: string | null; use_count: number; note: string | null
}
type RuleRow = Omit<Rule, 'signature' | 'mapping' | 'required'> & { signature: string; mapping: string; required: string }

export const RULE_DIR = join(ROOT, '工作台', '导入规则')
const parse = (r: RuleRow): Rule => ({ ...r, signature: JSON.parse(r.signature), mapping: JSON.parse(r.mapping), required: JSON.parse(r.required) })

export const listRules = (): Rule[] => all<RuleRow>(`SELECT * FROM import_rules ORDER BY CASE status WHEN '在用' THEN 0 ELSE 1 END, COALESCE(last_used_at, created_at) DESC`).map(parse)
export const activeRules = (): Rule[] => listRules().filter((r) => r.status === '在用' && r.target === 'channel_daily')

export function getRule(id: string): Rule {
  const r = get<RuleRow>('SELECT * FROM import_rules WHERE id = :id', { id })
  if (!r) throw new NotFound('找不到这条导入规则')
  return parse(r)
}

/** 规则文件名：天猫-生意参谋店铺日报.json（去掉文件名里不能用的字符） */
export function ruleFileName(platform: string, report: string) {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\s·・（）()]+/g, '')
  return `${clean(platform)}-${clean(report)}.json`
}

/** 把规则写成 JSON 文件（给人和 Codex 看；改规则以数据库为准，文件跟着更新） */
export function writeRuleFile(rule: Rule): string {
  mkdirSync(RULE_DIR, { recursive: true })
  const name = ruleFileName(rule.platform, rule.report)
  const rel = `工作台/导入规则/${name}`
  const body = {
    说明: '工作台的导入规则：同一种表以后按这里对字段。改规则请在工作台“导入规则”页改，这份文件会跟着更新。',
    平台: rule.platform, 报表: rule.report, 状态: rule.status, 来源: rule.origin === '示例' ? '示例数据' : '自己存的',
    写进: rule.target === 'channel_daily' ? `经营 · 每天的数（${rule.channel_id ? CHANNELS[rule.channel_id]?.name ?? rule.channel_id : '按表里的“渠道”列'}）` : '小红书 · 笔记数据',
    表头特征: rule.signature,
    字段对照: rule.mapping.map((m) => ({ 表里的列: m.col, 工作台字段: targetLabel(m.field), 字段代码: m.field, ...(m.by ? { 谁确认的: m.by, 几点: m.at } : {}) })),
    缺了就停下来: rule.required.map((f) => FIELD[f]?.label ?? f),
    日期格式: rule.date_format, 金额单位: rule.amount_unit,
    存的时间: rule.created_at, 谁存的: rule.created_by, 最近一次用: rule.last_used_at, 用过几次: rule.use_count, 备注: rule.note,
  }
  writeFileSync(join(RULE_DIR, name), `${JSON.stringify(body, null, 2)}\n`)
  return rel
}

export type NewRule = Pick<Rule, 'platform' | 'report' | 'channel_id' | 'target' | 'signature' | 'mapping' | 'required' | 'date_format' | 'amount_unit'> & {
  source_id?: string | null; origin?: Rule['origin']; created_by: string; created_at?: string; note?: string | null
  last_used_at?: string | null; use_count?: number; status?: Rule['status']
  /** 预置规则用固定 ID（rule_douyin 这样），彩排后复原 ID 不变，存下来的链接还能打开 */
  id?: string
}

export function createRule(input: NewRule, opts: { quiet?: boolean } = {}): Rule {
  const id = input.id ?? uid('rule')
  const at = input.created_at ?? stamp()
  run(`INSERT INTO import_rules (id, source_id, platform, report, channel_id, target, signature, mapping, required, date_format, amount_unit, status, origin,
      created_at, created_by, updated_at, last_used_at, use_count, note)
    VALUES (:id, :source_id, :platform, :report, :channel_id, :target, :signature, :mapping, :required, :date_format, :amount_unit, :status, :origin,
      :at, :by, :at, :last, :uses, :note)`, {
    id, source_id: input.source_id ?? null, platform: input.platform, report: input.report, channel_id: input.channel_id, target: input.target,
    signature: JSON.stringify(input.signature), mapping: JSON.stringify(input.mapping), required: JSON.stringify(input.required),
    date_format: input.date_format, amount_unit: input.amount_unit, status: input.status ?? '在用', origin: input.origin ?? '自己的',
    at, by: input.created_by, last: input.last_used_at ?? null, uses: input.use_count ?? 0, note: input.note ?? null,
  })
  const rule = getRule(id)
  const file = writeRuleFile(rule)
  run('UPDATE import_rules SET file_path = :f WHERE id = :id', { f: file, id })
  if (!opts.quiet) logChange('网页', 'data', id, '新建', `存了导入规则「${rule.platform} · ${rule.report}」`)
  return { ...rule, file_path: file }
}

/** 同一种表又对了一次（表头变了或改了对照）：更新规则，旧规则的对照写进备注 */
export function reviseRule(id: string, patch: Pick<Rule, 'signature' | 'mapping' | 'required' | 'date_format' | 'amount_unit'> & { channel_id?: string | null }, by: string): Rule {
  const old = getRule(id)
  const at = stamp()
  run(`UPDATE import_rules SET signature = :sig, mapping = :map, required = :req, date_format = :df, amount_unit = :unit, channel_id = COALESCE(:ch, channel_id),
      updated_at = :at, note = :note, origin = '自己的' WHERE id = :id`, {
    id, sig: JSON.stringify(patch.signature), map: JSON.stringify(patch.mapping), req: JSON.stringify(patch.required), df: patch.date_format,
    unit: patch.amount_unit, ch: patch.channel_id ?? null, at, note: `${at.slice(5, 10).replace('-', '/')} ${by}改过对照（原来 ${old.mapping.filter((m) => m.field).length} 列对上）${old.note ? `；${old.note}` : ''}`.slice(0, 300),
  })
  const rule = getRule(id)
  writeRuleFile(rule)
  logChange('网页', 'data', id, '修改', `改了导入规则「${rule.platform} · ${rule.report}」的对照`)
  return rule
}

/** 工作台/导入规则/ 里数据库已经没有的规则文件（彩排后重建示例时清掉）。返回删掉的文件名 */
export function removeOrphanRuleFiles(): string[] {
  if (!existsSync(RULE_DIR)) return []
  const keep = new Set(listRules().map((r) => ruleFileName(r.platform, r.report)))
  const gone = readdirSync(RULE_DIR).filter((f) => f.endsWith('.json') && !keep.has(f))
  gone.forEach((f) => rmSync(join(RULE_DIR, f), { force: true }))
  return gone
}

export function touchRule(id: string) {
  run('UPDATE import_rules SET last_used_at = :at, use_count = use_count + 1 WHERE id = :id', { id, at: stamp() })
  writeRuleFile(getRule(id))
}

/** 网页上能改的：停用 / 启用、备注、某一列对到哪、缺了要不要停 */
export function updateRule(id: string, input: unknown): Rule {
  const body = (input ?? {}) as { status?: string; note?: string | null; mapping?: { col: string; field: string | null }[]; required?: string[] }
  const rule = getRule(id)
  const at = stamp()
  if (body.status !== undefined) {
    if (body.status !== '在用' && body.status !== '停用') throw new BadRequest('状态只能是“在用”或“停用”')
    run('UPDATE import_rules SET status = :s, updated_at = :at WHERE id = :id', { s: body.status, at, id })
    logChange('网页', 'data', id, body.status === '停用' ? '停用' : '启用', `${body.status === '停用' ? '停用' : '启用'}了导入规则「${rule.platform} · ${rule.report}」`)
  }
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== 'string') throw new BadRequest('备注要写文字')
    run('UPDATE import_rules SET note = :n, updated_at = :at WHERE id = :id', { n: body.note?.trim().slice(0, 300) || null, at, id })
  }
  if (body.mapping !== undefined) {
    if (!Array.isArray(body.mapping)) throw new BadRequest('字段对照格式不对')
    const valid = new Set<string>(rule.target === 'channel_daily' ? Object.keys(FIELD) : NOTE_TARGETS.map((t) => t.value))
    const byCol = new Map(body.mapping.map((m) => [m.col, m.field]))
    const mapping = rule.mapping.map((m) => {
      if (!byCol.has(m.col)) return m
      const f = byCol.get(m.col) ?? null
      if (f !== null && !valid.has(f)) throw new BadRequest(`「${m.col}」对的字段不认识`)
      return { ...m, field: f, how: '你选的', by: '你', at }
    })
    const taken = mapping.filter((m) => m.field && m.field !== 'channel').map((m) => m.field)
    if (new Set(taken).size !== taken.length) throw new BadRequest('有两列对到了同一个工作台字段，只能留一列')
    run('UPDATE import_rules SET mapping = :m, updated_at = :at, origin = :o WHERE id = :id', { m: JSON.stringify(mapping), at, id, o: '自己的' })
    logChange('网页', 'data', id, '修改', `改了导入规则「${rule.platform} · ${rule.report}」的字段对照`)
  }
  if (body.required !== undefined) {
    if (!Array.isArray(body.required) || body.required.some((f) => !(f in FIELD))) throw new BadRequest('“缺了就停下来”的字段不认识')
    run('UPDATE import_rules SET required = :r, updated_at = :at WHERE id = :id', { r: JSON.stringify(body.required), at, id })
  }
  const next = getRule(id)
  writeRuleFile(next)
  return next
}

