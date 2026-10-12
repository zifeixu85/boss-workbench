// 提醒“算一遍”的测试：临时文件夹里的空数据库，假的系统通知（只记录，不真的弹）。运行：npm test
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

// 先指到临时数据库，再加载工作台的代码（db.ts 加载时就定了数据库位置）
const dir = mkdtempSync(join(os.tmpdir(), 'wb-remind-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'
const { tick, sendTest, _setHooksForTest } = await import('./service.ts')
const { listReminders, unreadCount, markRead } = await import('./store.ts')
const schedule = await import('../services/schedule.ts')
const clients = await import('../services/clients.ts')
const { saveSettings } = await import('../services/today.ts')

type Sent = { title: string; subtitle?: string; body: string; url?: string | null }
const sent: Sent[] = []
const pushes: { ids: number[]; via: string; popups: { title: string }[] }[] = []
let browsers = 0
const t = (hm: string, day = '2030-03-05') => new Date(`${day}T${hm}:00`)

before(() => {
  _setHooksForTest({
    browsers: () => browsers,
    push: (p) => pushes.push(p),
    send: async (n) => { sent.push(n); return { ok: true, how: '假的系统通知' } },
    platform: 'darwin', base: 'http://127.0.0.1:4517',
  }, t('06:00'))
  saveSettings({ notify_at: '08:30', business: '测试茶铺' }, '网页')
})

test('到期前 1 小时提醒一次，只弹一次；改了到期时间再提醒', async () => {
  const td = schedule.createTodo({ title: '给衡言发效果图', due: '2030-03-05', due_time: '15:30' }, '网页') as { id: string }
  sent.length = 0
  assert.equal((await tick(t('14:29'))).filter((r) => r.kind === '待办').length, 0, '61 分钟前不提醒')
  const first = (await tick(t('14:31'))).filter((r) => r.kind === '待办')
  assert.equal(first.length, 1)
  assert.equal(first[0].via, '系统通知')
  assert.equal(first[0].body, '还有 59 分钟')
  const mine = sent.find((s) => s.subtitle?.includes('给衡言发效果图'))
  assert.ok(mine, '发了系统通知')
  assert.equal(mine!.title, '老板工作台 · 测试茶铺')
  assert.equal(mine!.url, `http://127.0.0.1:4517/todos?todo=${td.id}`)
  sent.length = 0
  assert.equal((await tick(t('14:45'))).filter((r) => r.kind === '待办').length, 0, '同一条不再提醒')
  assert.equal((await tick(t('15:20'))).filter((r) => r.kind === '待办').length, 0)
  assert.equal(sent.filter((s) => s.subtitle?.includes('给衡言')).length, 0)
  schedule.updateTodo(td.id, { due_time: '16:30' }, '网页')
  assert.equal((await tick(t('15:31'))).filter((r) => r.kind === '待办').length, 1, '改了时间是新的一件事')
  schedule.updateTodo(td.id, { status: '完成' }, '网页')
})

test('免打扰时段：只记不弹；关了提醒：只记不弹', async () => {
  schedule.createTodo({ title: '夜里的事', due: '2030-03-05', due_time: '22:40' }, '网页')
  sent.length = 0
  const night = (await tick(t('22:10'))).find((r) => r.title.includes('夜里的事'))!
  assert.equal(night.via, '只记')
  assert.match(night.note ?? '', /免打扰/)
  assert.equal(sent.length, 0)

  saveSettings({ remind_on: '0' }, '网页')
  schedule.createTodo({ title: '关了也要记', due: '2030-03-05', due_time: '17:00' }, '网页')
  const off = (await tick(t('16:30'))).find((r) => r.title.includes('关了也要记'))!
  assert.equal(off.via, '只记')
  assert.equal(off.note, '提醒已关')
  assert.equal(sent.length, 0)
  saveSettings({ remind_on: '1' }, '网页')
})

test('免打扰：过了免打扰还在窗口里的先不记，免打扰结束后照常弹（8:30 到期的待办 8:00 弹）', async () => {
  schedule.createTodo({ title: '早上八点半的事', due: '2030-03-09', due_time: '08:30' }, '网页')
  schedule.createTodo({ title: '半夜三点的事', due: '2030-03-09', due_time: '03:00' }, '网页')
  sent.length = 0
  const night = await tick(t('02:30', '2030-03-09'))
  const three = night.find((r) => r.title.includes('半夜三点的事'))!
  assert.equal(three.via, '只记', '免打扰结束前窗口就过了：只记')
  assert.equal(night.filter((r) => r.title.includes('早上八点半')).length, 0, '还没到窗口')
  assert.equal((await tick(t('07:40', '2030-03-09'))).filter((r) => r.title.includes('早上八点半')).length, 0, '免打扰里先不记')
  const morning = (await tick(t('08:00', '2030-03-09'))).filter((r) => r.title.includes('早上八点半'))
  assert.equal(morning.length, 1)
  assert.equal(morning[0].via, '系统通知')
  assert.equal(morning[0].body, '还有 30 分钟')
  assert.equal(sent.length, 1)
})

test('经营异常：连着几天都在只提醒一次，消失两天以上又出现再提醒', async () => {
  const roi = (since: string) => ({ id: 'roi_tmall', module: 'biz' as const, title: '天猫推广 ROI 掉了', detail: 'ROI 1.6', since, link: '/channel/tmall?anomaly=roi_tmall' })
  let alerts = [roi('2030-04-01')]
  _setHooksForTest({ alerts: () => alerts })
  const kinds = async (hm: string, day: string) => (await tick(t(hm, day))).filter((r) => r.kind === '异常')
  const first = await kinds('10:00', '2030-04-03')
  assert.equal(first.length, 1)
  assert.equal(first[0].key, 'alert:roi_tmall#2030-04-03')
  alerts = [roi('2030-04-02')] // 开始日期随数据滑动
  assert.equal((await kinds('10:00', '2030-04-04')).length, 0, '还是这一段')
  alerts = []
  await kinds('10:00', '2030-04-05')
  alerts = [roi('2030-04-05')]
  assert.equal((await kinds('09:00', '2030-04-06')).length, 0, '只断了一天，还算同一段')
  alerts = []
  await kinds('10:00', '2030-04-07'); await kinds('10:00', '2030-04-08'); await kinds('10:00', '2030-04-09')
  alerts = [roi('2030-04-10')]
  const again = await kinds('10:00', '2030-04-10')
  assert.equal(again.length, 1, '消失两天以上又出现：新的一段')
  assert.equal(again[0].key, 'alert:roi_tmall#2030-04-10')
  _setHooksForTest({ alerts: () => [] })
})

test('页面开着、允许了通知：走浏览器通知，不发系统通知', async () => {
  browsers = 1
  sent.length = 0
  pushes.length = 0
  schedule.createEvent({ title: '澜拓方案沟通', start: '2030-03-05T18:00', location: '澜拓 3 楼' }, '网页')
  const r = (await tick(t('17:50'))).find((x) => x.kind === '日程')!
  assert.equal(r.via, '浏览器通知')
  assert.equal(r.body, '还有 10 分钟 · 澜拓 3 楼')
  assert.equal(sent.length, 0)
  const p = pushes.find((x) => x.ids.includes(r.id))!
  assert.equal(p.via, '浏览器通知')
  assert.equal(p.popups[0].title, '日程「澜拓方案沟通」18:00 开始')
  browsers = 0
})

test('每天看汇总：到点提醒一次；客户跟进：早上提醒，好几位合成一条弹', async () => {
  for (const name of ['锦川置业', '澜拓科技', '衡言律所']) clients.createClient({ name, next_follow: '2030-03-06', stage: '待复购' }, '网页')
  sent.length = 0
  const early = await tick(t('07:30', '2030-03-06'))
  assert.equal(early.filter((r) => r.kind === '跟进' || r.kind === '汇总').length, 0, '免打扰里不提醒')
  const morning = await tick(t('08:10', '2030-03-06'))
  assert.equal(morning.filter((r) => r.kind === '跟进').length, 3)
  assert.equal(morning.filter((r) => r.kind === '汇总').length, 0, '8:30 才提醒看汇总')
  assert.ok(sent.some((s) => s.subtitle === '今天该跟进 3 位客户'), '三位合成一条弹')
  const summary = await tick(t('08:31', '2030-03-06'))
  const s = summary.find((r) => r.kind === '汇总')!
  assert.equal(s.title, '今天的汇总好了')
  assert.match(s.body, /3 位客户该跟进/)
  assert.equal((await tick(t('12:00', '2030-03-06'))).filter((r) => r.kind === '汇总').length, 0, '一天只一次')
})

test('系统通知没发出去：记录改成“只记”，写上原因', async () => {
  _setHooksForTest({ send: async () => ({ ok: false, how: 'Mac 系统通知（osascript）', error: 'execution error' }) })
  schedule.createTodo({ title: '发不出去的', due: '2030-03-07', due_time: '10:00' }, '网页')
  const [r] = (await tick(t('09:30', '2030-03-07'))).filter((x) => x.title.includes('发不出去的'))
  assert.ok(r)
  const row = listReminders({ limit: 50 }).find((x) => x.id === r.id)!
  assert.equal(row.via, '只记')
  assert.match(row.note ?? '', /系统通知没发出去：execution error/)
  _setHooksForTest({ send: async (n) => { sent.push(n); return { ok: true, how: '假的系统通知' } } })
})

test('测试提醒：免打扰、关了也照发（是你点的）；标已读', async () => {
  saveSettings({ remind_on: '0' }, '网页')
  sent.length = 0
  const r = await sendTest(t('23:30'))
  assert.equal(r.via, '系统通知')
  assert.equal(sent[0].title, '老板工作台 · 测试')
  saveSettings({ remind_on: '1' }, '网页')
  const before = unreadCount()
  assert.ok(before > 0)
  assert.equal(markRead({ ids: [r.row.id] }), 1)
  assert.equal(unreadCount(), before - 1)
  markRead({ all: true })
  assert.equal(unreadCount(), 0)
})

test('待办的到期时间：没有日期不能单写时间；清掉日期时间也清掉', () => {
  assert.throws(() => schedule.createTodo({ title: 'x', due_time: '10:00' }, '网页'), /先选截止日期/)
  const td = schedule.createTodo({ title: 'y', due: '2030-03-08', due_time: '9:05' }, '网页') as { id: string; due_time: string }
  assert.equal(td.due_time, '09:05', '8:30 这种写法补成 08:30')
  const cleared = schedule.updateTodo(td.id, { due: null }, '网页') as { due: string | null; due_time: string | null }
  assert.equal(cleared.due, null)
  assert.equal(cleared.due_time, null)
})
