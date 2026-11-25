// 驾驶舱“今天要做”的口径：今天到期、过了截止日的，加上标成“进行中”的（2026-11-26 A梦 实测：移到进行中首页还是 0 件）。临时数据库里测。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-today-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const schedule = await import('./schedule.ts')
const { overview } = await import('./today.ts')
const { today, addDays } = await import('./common.ts')

test('今天要做：今天到期、过期的，和标成进行中的（没写截止日、截止日在以后的也算）；这周还要做不重复列；等别人的不算', () => {
  const t = today()
  const mk = (title: string, status: string, due?: string) => schedule.createTodo({ title, status, ...(due ? { due } : {}) }, '网页')
  mk('今天交报价', '待办', t)
  mk('昨天该回的', '待办', addDays(t, -1))
  mk('在做的海报', '进行中')
  mk('在做的方案', '进行中', addDays(t, 3))
  mk('下周的事', '待办', addDays(t, 3))
  mk('等供应商回', '等别人')
  const o = overview()
  assert.deepEqual(o.todos.today.map((x) => x.title).sort(), ['今天交报价', '昨天该回的', '在做的方案', '在做的海报'].sort())
  assert.deepEqual(o.todos.week.map((x) => x.title), ['下周的事'])
  const stat = o.home_stats.find((s) => s.label === '今天的待办')!
  assert.equal(stat.value, 4)
})
