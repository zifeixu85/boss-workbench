// 提醒的设置：存在 settings 表（键值），网页“设置 → 提醒”、命令 remind-set 都改这里。
//   remind_on           总开关，默认开（'0' = 关：照样记，不弹）
//   notify_at           每天几点提醒看汇总（确认页第 4 步老板说的时间）；空着 = 工作台开了 5 分钟后提醒一次
//   quiet_start/end     免打扰时段，默认 22:00—08:00；两个都写空 = 不设
//   remind_demo_system  演示模式（有演示日期）下要不要真的弹电脑系统通知，默认不弹（只记、浏览器通知照常）
import { all } from '../db.ts'

export type RemindSettings = { on: boolean; notify_at: string; quiet_start: string; quiet_end: string; demo_system: boolean }

export const DEFAULT_QUIET = { start: '22:00', end: '08:00' } as const
export const REMIND_KEYS = ['remind_on', 'notify_at', 'quiet_start', 'quiet_end', 'remind_demo_system'] as const

export function readRemindSettings(): RemindSettings {
  const rows = all<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE key IN (${REMIND_KEYS.map((k) => `'${k}'`).join(', ')})`)
  const s = new Map(rows.map((r) => [r.key, String(r.value ?? '').trim()]))
  return {
    on: s.get('remind_on') !== '0',
    notify_at: s.get('notify_at') ?? '',
    quiet_start: s.get('quiet_start') ?? DEFAULT_QUIET.start,
    quiet_end: s.get('quiet_end') ?? DEFAULT_QUIET.end,
    demo_system: s.get('remind_demo_system') === '1',
  }
}
