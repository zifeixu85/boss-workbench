// 这一期的数（pa-week）：报告里“来源：工作台”的节从这里取。按本地日期算；对话按最后活动时间算在哪一期，几点开的按开始时间算。
import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.TZ = 'Asia/Shanghai'
const { periodData } = await import('../files/server/modules/pa/week-calc.ts')

const S = (started: string, last: string, status: string, object: string | null, folder = '工作') => ({ started_at: started, last_at: last, status, object: object ? { name: object } : null, folder })

test('一期的数：对话、做完、在等你、打断；产出；token；连续天数；没挂对象占比、深夜占比；按天、按小时、按对象；重复开对话', () => {
  const sessions = [
    S('2026-11-23T01:00:00Z', '2026-11-23T02:00:00Z', '做完了', '春节茶礼'),          // 周一 9 点
    S('2026-11-24T15:30:00Z', '2026-11-24T15:50:00Z', '在等我', null, '小红书'),        // 周二 23:30 深夜
    S('2026-11-25T02:00:00Z', '2026-11-25T03:00:00Z', '做完未读', '云杉物流'),
    S('2026-11-25T03:00:00Z', '2026-11-25T04:00:00Z', '没做完', '云杉物流'),
    S('2026-11-25T05:00:00Z', '2026-11-25T06:00:00Z', '进行中', '云杉物流'),
    S('2026-11-16T01:00:00Z', '2026-11-16T02:00:00Z', '做完了', '春节茶礼'),          // 上一周
  ]
  const outputs = [{ at: '2026-11-25T03:00:00Z', kind: '图片' }, { at: '2026-11-25T03:00:00Z', kind: '文档' }, { at: '2026-11-25T03:00:00Z', kind: '代码' }]
  const usage = [{ tool: 'codex', day: '2026-11-25', fresh: 10, cached: 80, output: 10 }, { tool: 'claude', day: '2026-11-25', fresh: 5, cached: 5, output: 5 }]
  const d = periodData({ sessions, outputs, usage, from: '2026-11-23', to: '2026-11-29', today: '2026-11-26' })
  assert.deepEqual([d.cards.对话数.value, d.cards.做完.value, d.cards.在等你.value, d.cards.打断.value], [5, 3, 1, 1])
  assert.deepEqual([d.cards.出图.value, d.cards.出文件.value], [1, 1], '代码不算')
  assert.equal(d.cards.token.value, 100, '只算 Codex')
  assert.equal(d.cards.连续天数.value, 3, '23、24、25 连着，26 还没有：到昨天为止')
  assert.deepEqual([d.cards.没挂对象占比.value, d.cards.深夜占比.value], [20, 20])
  assert.equal(d.series.按天对话.length, 7)
  assert.deepEqual(d.series.按天对话.slice(0, 3).map((x) => [x.talks, x.done]), [[1, 1], [1, 1], [3, 1]])
  assert.equal(d.series.按小时.find((h) => h.label === '23')!.value, 1)
  assert.deepEqual(d.series.按对象.map((x) => [x.label, x.value]), [['云杉物流', 3], ['春节茶礼', 1], ['小红书（文件夹）', 1]])
  assert.deepEqual(d.lists.重复开对话, [{ 对象: '云杉物流', 日期: '2026-11-25', 对话: 3 }])
})

test('没有对话的一期：数都是 0，占比是空的（不写 0%），按天照样补齐', () => {
  const d = periodData({ sessions: [], outputs: [], usage: [], from: '2026-11-25', to: '2026-11-25', today: '2026-11-26' })
  assert.equal(d.cards.对话数.value, 0)
  assert.equal(d.cards.没挂对象占比.value, null)
  assert.equal(d.series.按天对话.length, 1)
})
