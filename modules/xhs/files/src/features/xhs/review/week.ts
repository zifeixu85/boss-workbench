// 复盘的一周：周二到下周一（和知识库的每周复盘一样）；key 是那个周二。归属：小红书内容模块。
import { addDays } from '@/lib/format'

export function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00`)
  const start = addDays(date, -((d.getDay() + 5) % 7))
  return { key: start, start, end: addDays(start, 6) }
}
