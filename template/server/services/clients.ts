// 客户与机会：客户档案、沟通记录、商机
import { all, get, run, tx, uid, nowIso, logChange, params } from '../db.ts'
import { clientInput, interactionInput, dealInput, type ClientInput } from '../../shared/schema.ts'
import { type Actor, NotFound, BadRequest, today, daysBetween, setClause, onlyGiven } from './common.ts'
import { syncFollowTodo } from '../modules/crm/follow.ts'

export type Client = {
  id: string; name: string; label: string | null; kind: string; stage: string
  source: string | null; city: string | null; phone: string | null; wechat: string | null
  budget: number | null; last_contact: string | null; next_follow: string | null
  kb_path: string | null; tags: string[]; note: string | null; created_at: string; updated_at: string
}

const decode = (r: Record<string, unknown>) => ({ ...r, tags: JSON.parse(String(r.tags || '[]')) }) as Client

export function listClients() {
  const rows = all(`
    SELECT c.*,
      (SELECT COALESCE(SUM(amount),0) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成')) AS open_amount,
      (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('已签约','没成')) AS open_deals,
      (SELECT summary FROM interactions i WHERE i.client_id = c.id ORDER BY date DESC, created_at DESC LIMIT 1) AS last_summary
    FROM clients c ORDER BY c.kind, COALESCE(c.next_follow, '9999') ASC`)
  const t = today()
  return rows.map((r) => {
    const c = decode(r)
    const overdue = c.next_follow ? daysBetween(c.next_follow, t) : null
    return { ...c, open_amount: Number(r.open_amount), open_deals: Number(r.open_deals), last_summary: r.last_summary as string | null, follow_overdue: overdue }
  })
}

/** LIKE 里 % 和 _ 是通配符：搜索词里出现时要转义（配合 ESCAPE '\\'） */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (m) => `\\${m}`)

/** 找客户：先按 ID、称呼精确找；找不到再模糊找（称呼、补充说明、联系人）。模糊命中多位时报错并列出候选，不悄悄挑第一个（E5 修 #8） */
export function findClient(idOrName: string) {
  const q = String(idOrName ?? '').trim()
  if (!q) throw new BadRequest('请写客户名字或 ID')
  const exact = get('SELECT * FROM clients WHERE id = :q OR name = :q ORDER BY (id = :q) DESC LIMIT 1', { q })
  if (exact) return decode(exact)
  const like = `%${escapeLike(q)}%`
  const hits = all(`SELECT * FROM clients WHERE name || COALESCE(label,'') LIKE :like ESCAPE '\\' OR COALESCE(contact_name,'') LIKE :like ESCAPE '\\'
    ORDER BY (name LIKE :like ESCAPE '\\') DESC, length(name) LIMIT 6`, { like })
  if (!hits.length) throw new NotFound(`找不到客户：${q}`)
  if (hits.length > 1) throw new BadRequest(`“${q}”对上了 ${hits.length} 位客户：${hits.map((h) => h.name).join('、')}。写全名或用 ID`)
  return decode(hits[0])
}

export function clientDetail(id: string) {
  const client = findClient(id)
  const cid = client.id
  return {
    client,
    interactions: all('SELECT * FROM interactions WHERE client_id = :cid ORDER BY date DESC, created_at DESC', { cid }),
    deals: all('SELECT * FROM deals WHERE client_id = :cid ORDER BY updated_at DESC', { cid }),
    projects: all('SELECT * FROM projects WHERE client_id = :cid ORDER BY updated_at DESC', { cid }),
    todos: all("SELECT * FROM todos WHERE client_id = :cid AND status NOT IN ('完成','取消') ORDER BY COALESCE(due,'9999')", { cid }),
    events: all('SELECT * FROM events WHERE client_id = :cid AND start >= :t ORDER BY start LIMIT 10', { cid, t: today() }),
    receivables: all('SELECT * FROM receivables WHERE client_id = :cid ORDER BY due', { cid }),
  }
}

export function createClient(input: unknown, actor: Actor) {
  const data = clientInput.parse(input)
  const id = uid('c')
  const at = nowIso()
  run(`INSERT INTO clients (id, name, label, kind, stage, source, city, phone, wechat, budget, next_follow, kb_path, tags, note, created_at, updated_at)
       VALUES (:id, :name, :label, :kind, :stage, :source, :city, :phone, :wechat, :budget, :next_follow, :kb_path, :tags, :note, :at, :at)`,
  params({ label: null, source: null, city: null, phone: null, wechat: null, budget: null, next_follow: null, kb_path: null, note: null, ...data, id, at }))
  logChange(actor, 'client', id, '新建', `新建客户 ${data.name}`)
  if (data.next_follow) syncFollowTodo(id, actor) // 填了下次跟进 → 自动建待办（大客户模块）
  return findClient(id)
}

const CLIENT_FIELDS: (keyof ClientInput)[] = ['name', 'label', 'kind', 'stage', 'source', 'city', 'phone', 'wechat', 'budget', 'next_follow', 'kb_path', 'tags', 'note']

export function updateClient(id: string, input: unknown, actor: Actor) {
  const before = findClient(id)
  const patch = onlyGiven(clientInput.partial().parse(input), input)
  const fields = Object.fromEntries(CLIENT_FIELDS.filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]]))
  if (!Object.keys(fields).length) throw new BadRequest('没有要修改的字段')
  run(`UPDATE clients SET ${setClause(fields)}, updated_at = :at WHERE id = :id`, params({ ...fields, at: nowIso(), id: before.id }))
  const changed = Object.keys(fields).map((k) => (k === 'stage' ? `阶段→${fields[k]}` : k === 'next_follow' ? `下次跟进→${fields[k] ?? '无'}` : k)).join('，')
  logChange(actor, 'client', before.id, '修改', `${before.name}：${changed}`)
  if ('next_follow' in fields) syncFollowTodo(before.id, actor) // 下次跟进变了 → 自动待办跟着改（大客户模块）
  return findClient(before.id)
}

/** 记一笔跟进：写沟通记录，同时更新“上次联系”“下次跟进”和“下一步”。
 *  E5 修 #4：没填新的下次跟进、而原来约的日子已经到了（≤ 这次沟通的日期），就清空，客户从“该联系了”里移走；
 *  填了“下一步”同步到客户档案（列表、抽屉、今日卡片读的是 clients.next_step）；自动跟进待办算完成，有新日期再建一条。 */
export function logInteraction(input: unknown, actor: Actor) {
  const data = interactionInput.parse(input)
  const client = findClient(data.client_id) as Client & { next_step?: string | null }
  return tx(() => {
    const id = uid('i')
    run(`INSERT INTO interactions (id, client_id, date, channel, summary, next_step, actor, created_at)
         VALUES (:id, :client_id, :date, :channel, :summary, :next_step, :actor, :at)`,
    params({ id, client_id: client.id, date: data.date, channel: data.channel, summary: data.summary, next_step: data.next_step ?? null, actor, at: nowIso() }))
    const last = client.last_contact && client.last_contact > data.date ? client.last_contact : data.date
    const keepOld = client.next_follow && client.next_follow > data.date ? client.next_follow : null
    const next = data.next_follow ?? keepOld
    const step = data.next_step?.trim() ? data.next_step.trim() : null
    run(`UPDATE clients SET last_contact = :last, next_follow = :next, ${step ? 'next_step = :step, ' : ''}updated_at = :at WHERE id = :id`, {
      last, next, ...(step ? { step } : {}), at: nowIso(), id: client.id,
    })
    logChange(actor, 'client', client.id, '跟进', `${client.name}：${data.summary.slice(0, 40)}`)
    syncFollowTodo(client.id, actor, { done: true })
    return { id, client: findClient(client.id) }
  })
}

export function createDeal(input: unknown, actor: Actor) {
  const data = dealInput.parse(input)
  const client = findClient(data.client_id)
  const id = uid('d')
  const at = nowIso()
  run(`INSERT INTO deals (id, client_id, title, stage, amount, expected_close, created_at, updated_at)
       VALUES (:id, :client_id, :title, :stage, :amount, :expected_close, :at, :at)`,
  params({ amount: null, expected_close: null, ...data, client_id: client.id, id, at }))
  logChange(actor, 'deal', id, '新建', `${client.name}：新商机「${data.title}」`)
  return get('SELECT * FROM deals WHERE id = :id', { id })
}

export function updateDeal(id: string, input: unknown, actor: Actor) {
  const before = get<{ title: string; client_id: string }>('SELECT * FROM deals WHERE id = :id', { id })
  if (!before) throw new NotFound('找不到这个商机')
  const patch = onlyGiven(dealInput.partial().omit({ client_id: true }).parse(input), input)
  if (!Object.keys(patch).length) throw new BadRequest('没有要修改的字段')
  run(`UPDATE deals SET ${setClause(patch)}, updated_at = :at WHERE id = :id`, params({ ...patch, at: nowIso(), id }))
  logChange(actor, 'deal', id, '修改', `商机「${before.title}」${patch.stage ? `→${patch.stage}` : '已更新'}`)
  return get('SELECT * FROM deals WHERE id = :id', { id })
}

export function listDeals() {
  return all(`SELECT d.*, c.name AS client_name, c.label AS client_label, c.source AS client_source
              FROM deals d JOIN clients c ON c.id = d.client_id ORDER BY d.updated_at DESC`)
}
