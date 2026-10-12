// /api/reminders：最近的提醒、标已读、发一条测试提醒。提醒的设置走 /api/settings（键见 settings.ts）。
import { Hono } from 'hono'
import { z } from 'zod'
import { listReminders, markRead, unreadCount } from './store.ts'
import { deliveryStatus, sendTest } from './service.ts'

export const reminderRoutes = new Hono()
const ok = <T>(data: T) => ({ ok: true as const, data })
const readInput = z.object({ ids: z.array(z.number().int().positive()).max(500).optional(), all: z.boolean().optional() })

reminderRoutes.get('/', (c) => c.json(ok({
  items: listReminders({ limit: Number(c.req.query('limit')) || 100, unread: c.req.query('unread') === '1' }),
  unread: unreadCount(),
  status: deliveryStatus(),
})))
reminderRoutes.post('/read', async (c) => {
  const body = readInput.parse(await c.req.json().catch(() => ({})))
  return c.json(ok({ changed: markRead(body), unread: unreadCount() }))
})
reminderRoutes.post('/test', async (c) => {
  const r = await sendTest()
  return c.json(ok({ via: r.via, how: r.how, ok: r.ok, error: r.error ?? null }))
})
