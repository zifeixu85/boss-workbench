// /api/calendar：日历来源的状态、马上同步、换来源、打开 Mac 的“日历”隐私设置。
// 同步来的日程本身还是走 /api/events 读（只读：改、删会被拒绝，见 services/schedule.ts）。
import { spawn } from 'node:child_process'
import { Hono } from 'hono'
import { z } from 'zod'
import { CALENDAR_SOURCES } from '../../shared/schema.ts'
import { BadRequest } from '../services/common.ts'
import { calendarStatus, maybeSync, setSource, syncNow } from './service.ts'

export const calendarRoutes = new Hono()
const ok = <T>(data: T) => ({ ok: true as const, data })
const sourceInput = z.object({ source: z.enum(CALENDAR_SOURCES), url: z.string().max(2000).optional() })

export const PRIVACY_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars'

calendarRoutes.get('/status', (c) => { maybeSync(); return c.json(ok(calendarStatus())) })
calendarRoutes.post('/sync', async (c) => { await syncNow(); return c.json(ok(calendarStatus())) })
// 换来源后马上读一次。换成 Mac 日历是老板在设置页亲手点的：这时可以弹一次系统授权窗（最多等 3 分钟）
calendarRoutes.patch('/source', async (c) => {
  const b = sourceInput.parse(await c.req.json().catch(() => ({})))
  setSource(b.source, '网页', b.url)
  if (b.source !== 'off') await syncNow({ request: b.source === 'mac' })
  return c.json(ok(calendarStatus()))
})
calendarRoutes.post('/privacy', (c) => {
  if (process.platform !== 'darwin') throw new BadRequest('只有 Mac 有这个设置')
  spawn('/usr/bin/open', [PRIVACY_URL], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  return c.json(ok({ opened: true }))
})
