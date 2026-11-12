// 日历同步（只读）：日程页、设置页共用的状态和动作。服务端在 server/calendar/，接口 /api/calendar/*
import { SYNCED_EVENT_SOURCE } from '@shared/schema'
import { api, queryClient, useApi, useWrite } from '@/lib/api'

export type CalendarSourceId = 'off' | 'mac' | 'lark' | 'ics'

export type CalendarStatus = {
  source: CalendarSourceId
  sourceName: string
  /** 订阅链接只给网站名，比如“calendar.google.com 的订阅链接” */
  icsLabel: string | null
  platform: 'mac' | 'windows' | 'other'
  ok: boolean | null
  lastSyncAt: string | null
  lastTryAt: string | null
  count: number
  message: string | null
  code: string | null
  needsPrivacy: boolean
  syncing: boolean
}

export const isSynced = (e: { source?: string | null }) => e.source === SYNCED_EVENT_SOURCE

/** 2026-10-27T07:02:00Z → 15:02（今天）或 10/26 15:02 */
export function syncTime(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function useCalendarStatus() {
  return useApi<CalendarStatus>('/calendar/status', ['calendar-status'])
}

/** 同步没成功也是“请求成功”：这里改成报错，弹红色提示；状态照样刷新（显示原因、旧日程留着） */
async function orFail(p: Promise<CalendarStatus>) {
  const s = await p
  if (s.ok === false) { void queryClient.invalidateQueries(); throw new Error(s.message ?? '这次没同步成') }
  return s
}

export function useCalendarSync() {
  return useWrite(() => orFail(api.post<CalendarStatus>('/calendar/sync', {})), (s) => `已同步：未来两周 ${s.count} 条`)
}

export function useCalendarSource() {
  return useWrite((b: { source: CalendarSourceId; url?: string }) => orFail(api.patch<CalendarStatus>('/calendar/source', b)),
    (s) => (s.source === 'off' ? '不接日历了' : `${s.sourceName}连上了：未来两周 ${s.count} 条`))
}

export function useOpenPrivacy() {
  return useWrite(() => api.post('/calendar/privacy', {}), '已打开系统设置：在“日历”里打开「老板工作台 · 日历」')
}
