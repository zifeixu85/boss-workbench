// 进展的数字和图（给老板看自己这段时间做了多少）：纯计算，不碰数据库
// 运行：node --test modules/pa/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPulse } from '../files/server/modules/pa/pulse-calc.ts'

// 2026-11-24 是周二（本地时间中午）
const NOW = new Date('2026-11-24T12:00:00').getTime()
const at = (day: string, h = 10) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString()
const S = (day: string, status: string, object: string | null = null) => ({ last_at: at(day), status, object: object ? { name: object, type: '项目' } : null })
const O = (day: string, kind: string) => ({ at: at(day), kind })

test('近 14 天每天：做完几件、出了几张图、几个文件（代码不算）；没动的天也有一格', () => {
  const p = buildPulse([S('2026-11-24', '做完未读', '春节茶礼'), S('2026-11-24', '做完了'), S('2026-11-23', '在等我'), S('2026-11-20', '做完了', '春节茶礼')],
    [O('2026-11-24', '图片'), O('2026-11-24', '文档'), O('2026-11-24', '代码'), O('2026-11-23', '网页')], NOW, 14)
  assert.equal(p.days.length, 14)
  assert.equal(p.days[13].date, '2026-11-24')
  assert.deepEqual(p.days[13], { date: '2026-11-24', label: '11/24', done: 2, talks: 2, images: 1, files: 1 })
  assert.deepEqual(p.days[12], { date: '2026-11-23', label: '11/23', done: 0, talks: 1, images: 0, files: 1 })
  assert.equal(p.days[0].date, '2026-11-11')
})

test('本周（周一到今天）对比上周同一段；连续几天在用；本周花在哪', () => {
  const p = buildPulse([
    S('2026-11-24', '做完了', '春节茶礼'), S('2026-11-23', '做完未读', '春节茶礼'), S('2026-11-23', '做完了', '云杉物流'),
    S('2026-11-22', '做完了'), S('2026-11-17', '做完了'), S('2026-11-16', '做完了'),
  ], [O('2026-11-24', '图片'), O('2026-11-17', '文档')], NOW, 14)
  assert.deepEqual(p.week, { from: '2026-11-23', done: 3, talks: 3, images: 1, files: 0, last: { done: 2, outputs: 1 } })
  assert.equal(p.streak, 3, '22、23、24 三天连着都有')
  assert.deepEqual(p.top, [{ name: '春节茶礼', n: 2 }, { name: '云杉物流', n: 1 }])
  assert.equal(p.total.done, 6)
})

test('今天还没开始：连续天数从昨天往前数，不清零', () => {
  const p = buildPulse([S('2026-11-23', '做完了'), S('2026-11-22', '做完了')], [], NOW, 14)
  assert.equal(p.streak, 2)
  assert.equal(buildPulse([], [], NOW, 14).streak, 0)
})
