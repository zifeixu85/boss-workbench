// AI 用量（2026-11-26 A梦 要：首页能看今日、近 7 日、近 30 日用了多少 token）：
// 从 Codex 对话记录里 token_count 那一行只取数字，按“累计比上一条多了多少”记到当天；重复的行（累计没变）不算；额度百分比照 Codex 自己写的。
// Claude Code 的同一条回复会写好几遍，按回复编号只算一次；单独一行显示，不并进 Codex 的总数。
import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.TZ = 'Asia/Shanghai'
const { codexParser } = await import('../files/server/modules/pa/codex.ts')
const { claudeParser } = await import('../files/server/modules/pa/claude.ts')
const { summarizeUsage, tokenText } = await import('../files/server/modules/pa/usage-calc.ts')

const J = (o: unknown) => JSON.stringify(o)
const cx = (ts: string, type: string, payload: unknown) => J({ timestamp: ts, type, payload })
const META = cx('2026-11-24T01:00:00.000Z', 'session_meta', { id: 'tid-1', cwd: '/Users/lin/工作/春节茶礼', originator: 'Codex Desktop', timestamp: '2026-11-24T01:00:00.000Z' })
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output })
const tc = (ts: string, total: ReturnType<typeof usage>, last: ReturnType<typeof usage>, pct?: number) =>
  cx(ts, 'event_msg', { type: 'token_count', info: { total_token_usage: total, last_token_usage: last }, rate_limits: pct === undefined ? null : { primary: { used_percent: pct, window_minutes: 10080, resets_at: 1796212628 } } })

test('Codex：token_count 按累计的差记到当天（本地日期）；累计没变的重复行不算；新算的输入 = 输入减缓存；额度取最后一条', () => {
  const p = codexParser()
  for (const l of [
    META,
    cx('2026-11-24T01:00:01.000Z', 'event_msg', { type: 'token_count', info: null, rate_limits: null }),
    tc('2026-11-24T02:00:00.000Z', usage(1000, 800, 50), usage(1000, 800, 50), 2),
    tc('2026-11-24T02:00:01.000Z', usage(1000, 800, 50), usage(1000, 800, 50), 2), // 重复
    tc('2026-11-24T17:00:00.000Z', usage(3000, 2600, 80), usage(2000, 1800, 30), 3), // 上海时间 11-25 01:00
  ]) p.line(l)
  const m = p.done()!
  assert.deepEqual(m.usage, { '2026-11-24': { fresh: 200, cached: 800, output: 50 }, '2026-11-25': { fresh: 200, cached: 1800, output: 30 } })
  assert.deepEqual(m.limits, { used_percent: 3, window_minutes: 10080, resets_at: 1796212628, at: '2026-11-24T17:00:00.000Z' })
})

test('Codex：累计变小了（换了一份计数）按这一条自己的数算，不出负数', () => {
  const p = codexParser()
  for (const l of [META, tc('2026-11-24T02:00:00.000Z', usage(5000, 4000, 100), usage(5000, 4000, 100)), tc('2026-11-24T03:00:00.000Z', usage(600, 500, 10), usage(600, 500, 10))]) p.line(l)
  assert.deepEqual(p.done()!.usage, { '2026-11-24': { fresh: 1100, cached: 4500, output: 110 } })
})

test('Claude Code：同一条回复写了好几遍只算一次；新算的 = 输入 + 写缓存，缓存 = 读缓存', () => {
  const p = claudeParser()
  const a = (id: string, ts: string, u: Record<string, number>) => J({ type: 'assistant', timestamp: ts, sessionId: 's1', cwd: '/Users/lin/工作', message: { id, role: 'assistant', content: [{ type: 'text', text: '好' }], usage: u } })
  const u1 = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 5000, output_tokens: 40 }
  for (const l of [J({ type: 'user', timestamp: '2026-11-24T02:00:00.000Z', sessionId: 's1', cwd: '/Users/lin/工作', message: { role: 'user', content: '做个表' } }),
    a('msg_1', '2026-11-24T02:00:01.000Z', u1), a('msg_1', '2026-11-24T02:00:02.000Z', u1), a('msg_2', '2026-11-24T02:01:00.000Z', { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 5100, output_tokens: 20 })]) p.line(l)
  assert.deepEqual(p.done()!.usage, { '2026-11-24': { fresh: 115, cached: 10100, output: 60 } })
})

test('汇总：今日、近 7 日、近 30 日；Codex 是总数，Claude Code 另起一行；按天补零；用得最多的文件夹；缓存占比', () => {
  const rows = [
    { tool: 'codex', day: '2026-11-26', cwd: '/Users/lin/工作/春节茶礼', fresh: 100, cached: 900, output: 10 },
    { tool: 'codex', day: '2026-11-24', cwd: '/Users/lin/工作/小红书', fresh: 50, cached: 450, output: 5 },
    { tool: 'codex', day: '2026-11-01', cwd: '/Users/lin/工作/春节茶礼', fresh: 1, cached: 1, output: 1 },
    { tool: 'claude', day: '2026-11-26', cwd: '/Users/lin/工作', fresh: 7, cached: 70, output: 3 },
  ]
  const today = summarizeUsage(rows, '2026-11-26', 'today')
  assert.deepEqual([today.total.all, today.total.fresh, today.total.cached, today.total.output], [1010, 100, 900, 10])
  assert.equal(today.cachedShare, 90)
  assert.deepEqual(today.claude, { fresh: 7, cached: 70, output: 3, all: 80 })
  const week = summarizeUsage(rows, '2026-11-26', '7d')
  assert.equal(week.total.all, 1515)
  assert.equal(week.days.length, 7)
  assert.deepEqual(week.days.map((d) => d.all), [0, 0, 0, 0, 505, 0, 1010])
  assert.deepEqual(week.top.map((t) => [t.name, t.all]), [['春节茶礼', 1010], ['小红书', 505]])
  assert.equal(summarizeUsage(rows, '2026-11-26', '30d').total.all, 1518)
  assert.equal(summarizeUsage([], '2026-11-26', '7d').cachedShare, null)
})

test('token 数写成人话：一万以下照写，万、亿保留一位小数', () => {
  assert.deepEqual(tokenText(9876), { value: '9876', unit: '' })
  assert.deepEqual(tokenText(181_288_237), { value: '1.8', unit: '亿' })
  assert.deepEqual(tokenText(3_456_789), { value: '345.7', unit: '万' })
  assert.deepEqual(tokenText(99_999_999), { value: '1.0', unit: '亿' }, '不写成 10000.0万')
  assert.deepEqual(tokenText(99_940_000), { value: '9994.0', unit: '万' })
})
