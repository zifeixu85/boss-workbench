// 大客户模块的种子：把 crm-data.ts 里的客户写进数据库。归属：大客户模块。
import { insert, iso, type SeedModule } from './lib.ts'
import { CLIENTS, DEALS } from './crm-data.ts'

function seed() {
  for (const c of CLIENTS) {
    const lastTalk = c.talks.map((t) => t.date).sort().at(-1) ?? c.since
    insert('clients', {
      id: c.id, name: c.name, label: c.label, kind: c.kind ?? '客户', stage: c.stage, source: c.source, city: c.city ?? '杭州',
      phone: c.phone ?? null, wechat: c.wechat ?? null, budget: c.budget ?? null, last_contact: lastTalk, next_follow: c.next_follow ?? null,
      kb_path: c.kb ?? null, tags: JSON.stringify(c.tags), note: c.note ?? null,
      segment: c.segment ?? null, key_account: c.key ? 1 : 0, contact_name: c.contact ?? null, contact_title: c.title ?? null,
      decision_maker: c.decision ?? null, headcount: c.headcount ?? null, source_detail: c.source_detail ?? null, since: c.since,
      next_step: c.next_step ?? null, created_at: iso(c.since), updated_at: iso(`${lastTalk}T18:00`),
    })
    c.talks.forEach((t, i) => {
      const id = `i_${c.id.slice(2)}_${i + 1}`
      insert('interactions', {
        id, client_id: c.id, date: t.date, channel: t.channel, summary: t.summary, next_step: t.next ?? null,
        actor: t.actor ?? '网页', with_whom: t.with ?? null, concerns: t.concerns ?? null, created_at: iso(`${t.date}T18:00`),
      })
      t.promises?.forEach((p, j) => insert('client_promises', {
        id: `pr_${c.id.slice(2)}_${i + 1}_${j + 1}`, client_id: c.id, interaction_id: id, text: p.text, due: p.due ?? null,
        status: p.status ?? '待兑现', done_at: p.done_at ?? null, note: p.note ?? null, created_at: iso(`${t.date}T18:00`),
      }))
    })
    c.orders?.forEach((o, i) => insert('orders', {
      id: `o_${c.id.slice(2)}_${i + 1}`, client_id: c.id, date: o.date, channel: o.channel, occasion: o.occasion ?? null, item: o.item,
      qty: o.qty, unit: o.unit ?? '份', unit_price: o.price ?? null, amount: o.amount ?? (o.price ?? 0) * o.qty,
      status: o.status ?? '已完成', note: o.note ?? null, created_at: iso(o.date),
    }))
    c.traits?.forEach(([kind, text, source], i) => insert('client_traits', {
      id: `tr_${c.id.slice(2)}_${i + 1}`, client_id: c.id, kind, text, source: source ?? null, created_at: iso(c.since),
    }))
    c.dates?.forEach((d, i) => insert('client_dates', {
      id: `dt_${c.id.slice(2)}_${i + 1}`, client_id: c.id, date: d.date, label: d.label, kind: d.kind, who: d.who ?? null, note: d.note ?? null,
    }))
    c.care?.forEach((x, i) => insert('client_care', {
      id: `cr_${c.id.slice(2)}_${i + 1}`, client_id: c.id, occasion: x.occasion, date: x.date ?? null, gift: x.gift ?? null,
      message: x.message ?? null, status: x.status ?? '建议', note: x.note ?? null, created_at: iso('2026-10-26T20:00'),
    }))
  }
  const lastOf = new Map(CLIENTS.map((c) => [c.id, c.talks.map((t) => t.date).sort().at(-1) ?? c.since]))
  for (const [id, client, title, stage, amount, close] of DEALS) {
    insert('deals', {
      id, client_id: client, title, stage, amount, expected_close: close,
      created_at: iso(CLIENTS.find((c) => c.id === client)!.since), updated_at: iso(`${lastOf.get(client)}T18:30`),
    })
  }
}

export const crm: SeedModule = {
  name: 'crm',
  tables: ['client_care', 'client_dates', 'client_traits', 'client_promises', 'orders', 'deals', 'interactions', 'clients'],
  seed,
}
