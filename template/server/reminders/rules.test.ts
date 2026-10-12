// 提醒规则的测试（纯函数，不碰数据库）。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  todoCandidates, eventCandidates, followCandidates, alertCandidates, summaryDue, summaryCandidate, inQuiet, quietEndsAt, decide, groupPopups, morningOf,
  type TodoRow, type Candidate,
} from './rules.ts'
import type { RemindSettings } from './settings.ts'

const S: RemindSettings = { on: true, notify_at: '08:30', quiet_start: '22:00', quiet_end: '08:00', demo_system: false }
const t = (hm: string, day = '2030-03-05') => new Date(`${day}T${hm}:00`)
const todo = (o: Partial<TodoRow> = {}): TodoRow => ({ id: 't_1', title: '给衡言发效果图', due: '2030-03-05', due_time: '15:30', status: '待办', client_name: '衡言律师事务所', ...o })

test('待办：到期前 1 小时内才提醒，61 分钟前不提醒；过了 30 分钟以上不再补', () => {
  assert.equal(todoCandidates([todo()], t('14:29')).length, 0)
  const [c] = todoCandidates([todo()], t('14:30'))
  assert.equal(c.key, 'todo:t_1:2030-03-05T15:30')
  assert.equal(c.kind, '待办')
  assert.equal(c.title, '待办「给衡言发效果图」15:30 到期')
  assert.equal(c.body, '还有 60 分钟 · 衡言律师事务所')
  assert.equal(c.link, '/todos?todo=t_1')
  assert.equal(todoCandidates([todo()], t('15:25'))[0].body, '还有 5 分钟 · 衡言律师事务所')
  assert.match(todoCandidates([todo()], t('15:50'))[0].body, /已经过了 20 分钟/)
  assert.equal(todoCandidates([todo()], t('16:01')).length, 0)
})

test('待办：只有日期没有时间、已完成、取消的不单独提醒', () => {
  assert.equal(todoCandidates([todo({ due_time: null })], t('15:00')).length, 0)
  assert.equal(todoCandidates([todo({ status: '完成' })], t('15:00')).length, 0)
  assert.equal(todoCandidates([todo({ status: '取消' })], t('15:00')).length, 0)
  assert.equal(todoCandidates([todo({ status: '等别人' })], t('15:00')).length, 1)
})

test('待办：到期时间改了，key 跟着变（改了时间会再提醒一次）', () => {
  const a = todoCandidates([todo()], t('15:00'))[0].key
  const b = todoCandidates([todo({ due_time: '15:45' })], t('15:00'))[0].key
  assert.notEqual(a, b)
})

test('待办：跨午夜的写明天的日期', () => {
  const [c] = todoCandidates([todo({ due: '2030-03-06', due_time: '00:20' })], t('23:40'))
  assert.equal(c.title, '待办「给衡言发效果图」3/6 00:20 到期')
})

test('日程：开始前 15 分钟内提醒，全天的不提醒', () => {
  const e = { id: 'e_1', title: '澜拓方案沟通', start: '2030-03-05T10:00', all_day: 0, location: '澜拓 3 楼' }
  assert.equal(eventCandidates([e], t('09:44')).length, 0)
  const [c] = eventCandidates([e], t('09:45'))
  assert.equal(c.key, 'event:e_1:2030-03-05T10:00')
  assert.equal(c.body, '还有 15 分钟 · 澜拓 3 楼')
  assert.equal(eventCandidates([{ ...e, start: '2030-03-05', all_day: 1 }], t('09:50')).length, 0)
  assert.equal(eventCandidates([e], t('10:11')).length, 0)
})

test('跟进：下次跟进是今天的客户，免打扰结束（早上）以后才提醒', () => {
  const c = { id: 'c_1', name: '锦川置业', label: '置业 · 业主礼', next_follow: '2030-03-05', next_step: '送补发的 6 盒' }
  assert.equal(followCandidates([c], t('07:59'), S).length, 0)
  const [x] = followCandidates([c], t('08:00'), S)
  assert.equal(x.key, 'follow:c_1:2030-03-05')
  assert.equal(x.body, '送补发的 6 盒')
  assert.equal(followCandidates([{ ...c, next_follow: '2030-03-06' }], t('09:00'), S).length, 0)
  assert.equal(morningOf({ quiet_start: '', quiet_end: '' }), '08:00')
  assert.equal(morningOf({ quiet_start: '23:00', quiet_end: '07:00' }), '07:00')
})

test('经营异常按“一段持续的时间”记（key 不带会滑动的开始日期，service 补上这段的开头）；数据源每天一次', () => {
  const a = alertCandidates([{ id: 'roi_tmall', module: 'biz', title: 'ROI 掉了', detail: '…', since: '2030-03-01', link: '/channel/tmall?anomaly=roi_tmall' }], t('09:00'))[0]
  const b = alertCandidates([{ id: 'roi_tmall', module: 'biz', title: 'ROI 掉了', detail: '…', since: '2030-03-04', link: '' }], t('09:00', '2030-03-07'))[0]
  assert.equal(a.key, 'alert:roi_tmall')
  assert.equal(a.key, b.key)
  assert.equal(a.episode, true)
  assert.equal(a.kind, '异常')
  const d1 = alertCandidates([{ id: 'source_x', module: 'data', title: '没导进来', detail: '', since: null, link: '/sources' }], t('09:00'))[0]
  const d2 = alertCandidates([{ id: 'source_x', module: 'data', title: '没导进来', detail: '', since: null, link: '/sources' }], t('09:00', '2030-03-06'))[0]
  assert.equal(d1.kind, '数据源')
  assert.notEqual(d1.key, d2.key)
})

test('汇总：到了看汇总的时间才提醒；没设时间，开了 5 分钟后；免打扰时不补', () => {
  const started = t('07:00')
  assert.equal(summaryDue(t('08:29'), S, started), false)
  assert.equal(summaryDue(t('08:30'), S, started), true)
  assert.equal(summaryDue(t('23:00'), S, started), false, '半夜开机不叫看汇总')
  const none = { ...S, notify_at: '' }
  assert.equal(summaryDue(t('09:04'), none, t('09:00')), false)
  assert.equal(summaryDue(t('09:05'), none, t('09:00')), true)
  const c = summaryCandidate(t('08:30'), { events: 2, todos_today: 3, todos_overdue: 0, follows: 1, alerts: 4 })
  assert.equal(c.key, 'summary:2030-03-05')
  assert.equal(c.body, '今天有 2 个日程、3 件待办到期、1 位客户该跟进、4 处数据要留意。打开今日页看。')
})

test('免打扰什么时候结束；待办、日程带着提醒窗口的结束时间', () => {
  assert.equal(quietEndsAt(t('23:00'), S)?.toString(), t('08:00', '2030-03-06').toString())
  assert.equal(quietEndsAt(t('03:00'), S)?.toString(), t('08:00').toString())
  assert.equal(quietEndsAt(t('12:00'), S), null)
  assert.equal(todoCandidates([todo()], t('15:00'))[0].until?.toString(), t('16:00').toString())
})

test('免打扰：跨午夜、同一天、不设', () => {
  assert.equal(inQuiet(t('22:00'), S), true)
  assert.equal(inQuiet(t('03:00'), S), true)
  assert.equal(inQuiet(t('07:59'), S), true)
  assert.equal(inQuiet(t('08:00'), S), false)
  assert.equal(inQuiet(t('12:30'), { quiet_start: '12:00', quiet_end: '13:00' }), true)
  assert.equal(inQuiet(t('13:00'), { quiet_start: '12:00', quiet_end: '13:00' }), false)
  assert.equal(inQuiet(t('03:00'), { quiet_start: '', quiet_end: '' }), false)
})

test('怎么弹：关了 / 免打扰只记；页面开着走浏览器；演示模式默认不弹系统通知；不支持的系统只记', () => {
  const base = { s: S, now: t('10:00'), demo: false, browsers: 0, platform: 'darwin' }
  assert.deepEqual(decide(base), { via: '系统通知', note: null })
  assert.equal(decide({ ...base, platform: 'win32' }).via, '系统通知')
  assert.equal(decide({ ...base, platform: 'linux' }).via, '只记')
  assert.deepEqual(decide({ ...base, s: { ...S, on: false } }), { via: '只记', note: '提醒已关' })
  assert.equal(decide({ ...base, now: t('23:00'), browsers: 2 }).via, '只记', '免打扰时页面开着也不弹')
  assert.equal(decide({ ...base, browsers: 1 }).via, '浏览器通知')
  assert.equal(decide({ ...base, demo: true }).via, '只记')
  assert.match(decide({ ...base, demo: true }).note ?? '', /演示模式/)
  assert.equal(decide({ ...base, demo: true, browsers: 1 }).via, '浏览器通知', '演示时点过“开启提醒”的页面照样弹')
  assert.equal(decide({ ...base, demo: true, s: { ...S, demo_system: true } }).via, '系统通知')
})

test('一次弹几条：同类合成一条，最多 3 条，多的合成“还有 N 条提醒”', () => {
  let id = 0
  const mk = (kind: Candidate['kind'], title: string) => ({ key: `k${id}`, kind, title, body: 'b', link: '/x', id: ++id })
  const one = groupPopups([mk('待办', '待办 A')])
  assert.equal(one.length, 1)
  assert.equal(one[0].title, '待办 A')
  const follows = groupPopups([mk('跟进', '今天该跟进锦川置业'), mk('跟进', '今天该跟进澜拓科技'), mk('跟进', '今天该跟进衡言')])
  assert.equal(follows.length, 1)
  assert.equal(follows[0].title, '今天该跟进 3 位客户')
  assert.equal(follows[0].body, '锦川置业；澜拓科技；衡言')
  assert.deepEqual(follows[0].ids.length, 3)
  const many = groupPopups([mk('待办', 'a'), mk('日程', 'b'), mk('异常', 'c'), mk('异常', 'd'), mk('数据源', 'e'), mk('汇总', 'f')])
  assert.equal(many.length, 3)
  assert.equal(many[2].title, '还有 4 条提醒')
  assert.equal(many.flatMap((p) => p.ids).length, 6, '每条都算在某一次弹出里')
})
