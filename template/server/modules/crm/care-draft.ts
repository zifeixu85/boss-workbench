// “让 Codex 写一版”关怀草稿：真接本机 Codex（只读知识库），写好存进 client_care，标“Codex 现场写 · 时间”。归属：大客户模块。
// 90 秒没写完就停，如实说；不拿模板冒充 AI。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, ROOT } from '../../db.ts'
import { now } from '../../clock.ts'
import { type Actor, today } from '../../services/common.ts'
import { findClient } from '../../services/clients.ts'
import { findClientNote } from '../../services/kb.ts'
import { runCodex } from './codex.ts'
import { addCare } from './actions.ts'
import { careDraftInput } from './schema.ts'
import { assistantOf, identity } from '../../services/identity.ts'

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['gift', 'message', 'why'],
  properties: { gift: { type: 'string' }, message: { type: 'string' }, why: { type: 'string' } },
}
const CARE_FILE = '05-方法与判断/大客户关怀.md'
const read = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) ? readFileSync(abs, 'utf8').replace(/^---[\s\S]*?---\n/, '') : '' }

export async function careDraft(input: unknown, actor: Actor) {
  const data = careDraftInput.parse(input)
  const c = findClient(data.client_id) as ReturnType<typeof findClient> & { contact_name?: string | null }
  const extra = get<{ salutation: string | null; contact_name: string | null; segment: string | null }>('SELECT salutation, contact_name, segment FROM clients WHERE id = :id', { id: c.id })
  const traits = all<{ kind: string; text: string; source: string | null }>('SELECT kind, text, source FROM client_traits WHERE client_id = :id', { id: c.id })
  const orders = all<{ date: string; item: string; qty: number; unit: string }>("SELECT date, item, qty, unit FROM orders WHERE client_id = :id AND status = '已完成' ORDER BY date DESC LIMIT 6", { id: c.id })
  const note = findClientNote(c)
  const me = identity()
  const prompt = `${assistantOf(me)}。给客户写一条关怀消息的草稿，${me.owner}自己改、自己发。今天是 ${today()}。
当前目录是${me.owner}的知识库（只读）。下面附上了要用的东西，不用再读别的文件，尽快回答。

客户：${c.name}（${c.label ?? ''}）；称呼：${extra?.salutation || extra?.contact_name || c.name}；分组：${extra?.segment ?? ''}
这次是：${data.occasion}${data.date ? `（${data.date}）` : ''}
喜好和顾虑：${traits.map((t) => `${t.kind}：${t.text}`).join('；') || '未知'}
最近买过：${orders.map((o) => `${o.date} ${o.item} ${o.qty}${o.unit}`).join('；') || '没有'}
${note.path ? `\n## 客户档案（${note.path}，节选）\n${read(note.path).slice(0, 3500)}` : ''}

## 关怀的做法（${CARE_FILE}）
${read(CARE_FILE).slice(0, 3500)}

要求：照上面《大客户关怀》的规矩写（送什么、不送什么以它为准）；送礼和问候的消息里不提单子、不报价；还没上线的新品不提名字；不提别的客户。
这条消息${data.date ? ` ${data.date} 当天` : '这两天'}由${me.owner}自己发（不是今天提前发），东西送到、确认没坏再发。
可以提一句对方自己说过的喜好（例如他说过喜欢哪款茶），让人觉得${me.owner}记得；没说过的别编。
话短，像发微信，按平常的称呼叫。gift 写成短语，例如“一罐肉桂 + 手写卡”（不送就写空字符串）；message 写消息正文；why 用一句话说为什么这么写。只回 JSON。`
  const r = await runCodex({ prompt, schema: SCHEMA, cwd: ROOT })
  if (r.status !== '完成') return { ok: false as const, status: r.status, error: r.error, ms: r.ms }
  const j = r.json as { gift?: string; message?: string; why?: string }
  if (!j?.message) return { ok: false as const, status: '出错' as const, error: 'Codex 没写出消息正文，再试一次', ms: r.ms }
  const d = now()
  const stamp = `${Number(today().slice(5, 7))}/${Number(today().slice(8, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const care = addCare({
    client_id: c.id, occasion: data.occasion, date: data.date ?? today(), gift: j.gift?.trim() || null, message: j.message.trim(), status: '建议',
    author: `Codex 现场写 · ${stamp}${r.model ? `（${r.model}）` : ''}`, note: j.why?.trim() || null,
  }, actor)
  return { ok: true as const, care, ms: r.ms }
}
