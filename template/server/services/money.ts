// 回款与现金流：应收（按合同节点）、收支流水、现金汇总与预测
import { all, get, run, tx, uid, nowIso, logChange, params } from '../db.ts'
import { receivableInput, collectInput, ledgerInput } from '../../shared/schema.ts'
import { type Actor, NotFound, BadRequest, today, addDays, daysBetween, isoWeek, round1 } from './common.ts'

/** 应收、回款按两位小数（0.54 万 = 5400 元）：舍到一位会把 0.54 显示成 0.5、把尾差 0.04 显示成 0（E5 修 #2） */
const round2 = (n: number) => Math.round(n * 100) / 100

export type ReceivableStatus = '已收清' | '部分收款' | '逾期' | '7天内到期' | '未到期'

export function receivableStatus(r: { amount: number; received: number; due: string }, t = today()): { status: ReceivableStatus; overdue_days: number } {
  const left = r.amount - r.received
  const d = daysBetween(r.due, t)
  if (left <= 0.001) return { status: '已收清', overdue_days: 0 }
  if (d > 0) return { status: '逾期', overdue_days: d }
  if (r.received > 0) return { status: '部分收款', overdue_days: 0 }
  if (d >= -7) return { status: '7天内到期', overdue_days: 0 }
  return { status: '未到期', overdue_days: 0 }
}

const REC_SQL = `SELECT r.*, c.name AS client_name, p.name AS project_name FROM receivables r
  LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN projects p ON p.id = r.project_id`

type Rec = { id: string; amount: number; received: number; due: string; milestone: string; client_name: string | null; project_name: string | null }

export function listReceivables() {
  const t = today()
  return all<Rec>(`${REC_SQL} ORDER BY r.due`).map((r) => ({ ...r, outstanding: round2(r.amount - r.received), ...receivableStatus(r, t) }))
}

export function createReceivable(input: unknown, actor: Actor) {
  const data = receivableInput.parse(input)
  const id = uid('r')
  const at = nowIso()
  run(`INSERT INTO receivables (id, project_id, client_id, milestone, amount, due, note, created_at, updated_at)
       VALUES (:id, :project_id, :client_id, :milestone, :amount, :due, :note, :at, :at)`,
  params({ project_id: null, client_id: null, note: null, ...data, id, at }))
  logChange(actor, 'receivable', id, '新建', `应收 ${data.milestone} ${data.amount} 万，${data.due} 到期`)
  return get(`${REC_SQL} WHERE r.id = :id`, { id })
}

/** 登记回款：应收的已收金额增加，同时写一条收入流水（同一个事务） */
export function collect(input: unknown, actor: Actor) {
  const data = collectInput.parse(input)
  const rec = get<Rec & { client_id: string | null; project_id: string | null }>(`${REC_SQL} WHERE r.id = :id`, { id: data.receivable_id })
  if (!rec) throw new NotFound('找不到这笔应收')
  const left = round2(rec.amount - rec.received)
  if (left <= 0) throw new BadRequest('这笔应收已经收清了')
  if (data.amount > left + 0.001) throw new BadRequest(`超过未收金额：这笔还差 ${left} 万，本次填了 ${data.amount} 万`)
  return tx(() => {
    run('UPDATE receivables SET received = received + :amt, received_date = :date, updated_at = :at WHERE id = :id', { amt: data.amount, date: data.date, at: nowIso(), id: rec.id })
    const lid = uid('l')
    run(`INSERT INTO ledger (id, date, direction, category, amount, client_id, project_id, receivable_id, note, created_at)
         VALUES (:id, :date, '收入', '客户回款', :amount, :client_id, :project_id, :rid, :note, :at)`,
    params({ id: lid, date: data.date, amount: data.amount, client_id: rec.client_id, project_id: rec.project_id, rid: rec.id, note: data.note ?? `${rec.project_name ?? rec.client_name ?? ''} ${rec.milestone}`, at: nowIso() }))
    logChange(actor, 'receivable', rec.id, '回款', `${rec.client_name ?? ''}${rec.milestone}回款 ${data.amount} 万`)
    return { receivable_id: rec.id, ledger_id: lid }
  })
}

export function listLedger(month?: string) {
  const where = month ? 'WHERE substr(l.date,1,7) = :m' : ''
  return all(`SELECT l.*, c.name AS client_name, p.name AS project_name FROM ledger l
    LEFT JOIN clients c ON c.id = l.client_id LEFT JOIN projects p ON p.id = l.project_id ${where}
    ORDER BY l.date DESC, l.created_at DESC LIMIT 300`, month ? { m: month } : {})
}

export function addLedger(input: unknown, actor: Actor) {
  const data = ledgerInput.parse(input)
  const id = uid('l')
  run(`INSERT INTO ledger (id, date, direction, category, amount, client_id, project_id, note, created_at)
       VALUES (:id, :date, :direction, :category, :amount, :client_id, :project_id, :note, :at)`,
  params({ client_id: null, project_id: null, note: null, ...data, id, at: nowIso() }))
  logChange(actor, 'ledger', id, '新建', `${data.direction} ${data.category} ${data.amount} 万`)
  return { id }
}

export function cashSummary() {
  const t = today()
  const month = t.slice(0, 7)
  const recs = listReceivables().filter((r) => r.status !== '已收清')
  const sum = (xs: { outstanding: number }[]) => round2(xs.reduce((a, r) => a + r.outstanding, 0))
  const flow = all<{ m: string; inflow: number; outflow: number }>(`
    SELECT substr(date,1,7) AS m,
      ROUND(SUM(CASE WHEN direction='收入' THEN amount ELSE 0 END),2) AS inflow,
      ROUND(SUM(CASE WHEN direction='支出' THEN amount ELSE 0 END),2) AS outflow
    FROM ledger GROUP BY m ORDER BY m DESC LIMIT 6`).reverse()
  const thisMonth = flow.find((f) => f.m === month) ?? { m: month, inflow: 0, outflow: 0 }
  const overdue = recs.filter((r) => r.status === '逾期')
  const aging = [
    { bucket: '未到期', amount: sum(recs.filter((r) => r.overdue_days === 0)) },
    { bucket: '逾期 1–30 天', amount: sum(overdue.filter((r) => r.overdue_days <= 30)) },
    { bucket: '逾期 31–60 天', amount: sum(overdue.filter((r) => r.overdue_days > 30 && r.overdue_days <= 60)) },
    { bucket: '逾期 60 天以上', amount: sum(overdue.filter((r) => r.overdue_days > 60)) },
  ]
  // 未来 8 周预计回款：按应收到期日分周；已逾期的单独列
  const weeks = Array.from({ length: 8 }, (_, i) => isoWeek(addDays(t, i * 7)))
  const forecast = weeks.map((w, i) => ({
    week: w.key, label: i === 0 ? '本周' : `${w.start.slice(5).replace('-', '/')}起`,
    amount: sum(recs.filter((r) => r.due >= w.start && r.due <= w.end && r.status !== '逾期')),
  }))
  const expense30 = get<{ s: number }>("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE direction='支出' AND date >= :d", { d: addDays(t, -90) })?.s ?? 0
  return {
    as_of: t,
    month: thisMonth,
    outstanding: sum(recs),
    overdue: { amount: sum(overdue), count: overdue.length },
    due_30: sum(recs.filter((r) => r.status !== '逾期' && daysBetween(t, r.due) <= 30)),
    avg_monthly_expense: round1(expense30 / 3),
    aging, forecast, flow,
  }
}
