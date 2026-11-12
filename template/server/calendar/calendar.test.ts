// 日历同步的测试：临时文件夹里的空数据库；Mac 助手、飞书命令行、网络都换成假的，不碰这台电脑真的日历和权限。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

process.env.TZ = 'Asia/Shanghai'
const dir = mkdtempSync(join(os.tmpdir(), 'wb-calendar-'))
process.env.WORKBENCH_ROOT = dir
process.env.WORKBENCH_DB = join(dir, 'workbench.db')
process.env.DEMO_TODAY = 'off'

const { toRows, rowId, syncWindow, addDay } = await import('./rows.ts')
const { macItems, macProblem, runHelper } = await import('./mac.ts')
const { larkItems, parseAgenda, readLark } = await import('./lark.ts')
const { icsItems, fetchIcs, normalizeIcsUrl, maskUrl, wallToDate } = await import('./ics.ts')
const svc = await import('./service.ts')
const store = await import('./store.ts')
const schedule = await import('../services/schedule.ts')
const { all, get, open, run } = await import('../db.ts')
const { SYNCED_EVENT_SOURCE, SYNCED_EVENT_READONLY } = await import('../../shared/schema.ts')
open()

const HERE = new URL('.', import.meta.url).pathname
const W = { from: '2026-10-26', to: '2026-11-16' }
type R = Record<string, unknown>
const synced = () => all<R>('SELECT * FROM events WHERE source = :s ORDER BY start', { s: SYNCED_EVENT_SOURCE })

// ── 纯规则 ──
test('行 id 稳定：同一来源、同一日程、同一次发生 → 同一个 id；换一次发生就不同', () => {
  assert.equal(rowId('mac', 'A', '2026-11-02T01:00:00Z'), rowId('mac', 'A', '2026-11-02T01:00:00Z'))
  assert.notEqual(rowId('mac', 'A', '2026-11-02T01:00:00Z'), rowId('mac', 'A', '2026-11-09T01:00:00Z'))
  assert.notEqual(rowId('mac', 'A', 'x'), rowId('ics', 'A', 'x'))
  assert.match(rowId('lark', 'A', 'x'), /^cal_[0-9a-f]{20}$/)
})

test('Mac 助手的 JSON → 行：拒绝的、取消的、生日日历的不要；全天日程 end 是结束后那天；类型固定“日历”', () => {
  const data = {
    version: 1, status: 'fullAccess',
    calendars: [{ id: 'c1', title: '工作', type: 'icloud' }, { id: 'c2', title: '生日', type: 'birthdays' }],
    events: [
      { uid: 'U1', occurrence: '2026-10-28T07:00:00Z', title: '和王总喝茶', allDay: false, start: '2026-10-28T15:00', end: '2026-10-28T16:00', location: '店里', calendarId: 'c1', myResponse: 'accepted' },
      { uid: 'U2', occurrence: '2026-10-29T16:00:00Z', title: '展会', allDay: true, start: '2026-10-30', end: '2026-11-01', calendarId: 'c1' },
      { uid: 'U3', occurrence: '2026-10-29T02:00:00Z', title: '拒了的会', allDay: false, start: '2026-10-29T10:00', end: '2026-10-29T11:00', calendarId: 'c1', myResponse: 'declined' },
      { uid: 'U4', occurrence: '2026-10-30T16:00:00Z', title: '张三生日', allDay: true, start: '2026-10-31', end: '2026-11-01', calendarId: 'c2' },
      { uid: 'U5', occurrence: 'x', title: '坏时间', allDay: false, start: '明天下午', calendarId: 'c1' },
    ],
  }
  const { rows, skipped } = toRows('mac', macItems(data), W)
  assert.deepEqual(rows.map((r) => r.title), ['和王总喝茶', '展会'])
  assert.equal(skipped, 1)
  assert.deepEqual({ ...rows[0] }, { id: rowId('mac', 'U1', '2026-10-28T07:00:00Z'), title: '和王总喝茶', start: '2026-10-28T15:00', end: '2026-10-28T16:00', all_day: 0, kind: '日历', location: '店里', note: '来自 Mac 日历「工作」', source: SYNCED_EVENT_SOURCE })
  assert.equal(rows[1].all_day, 1)
  assert.equal(rows[1].end, '2026-11-01')
  assert.equal(macProblem('fullAccess'), null)
  assert.match(macProblem('denied')!, /隐私与安全性/)
  assert.match(macProblem('restricted')!, /飞书日历或订阅链接/)
})

test('同步时间窗：今天 0 点起 14 天', () => {
  assert.deepEqual(syncWindow(new Date('2026-10-27T15:00:00+08:00')), { from: '2026-10-27', to: '2026-11-10' })
  assert.equal(addDay('2026-12-31', 1), '2027-01-01')
})

test('飞书 +agenda：重复日程每次一个 id、全天日程的结束日期换成“结束后的那天”、拒绝的不要', () => {
  const out = {
    ok: true, identity: 'user', data: [
      { event_id: 'abc_1793030400', summary: '周会', start_time: { datetime: '2026-10-27T10:00:00+08:00', timezone: 'Asia/Shanghai' }, end_time: { datetime: '2026-10-27T11:00:00+08:00' }, self_rsvp_status: 'accept' },
      { event_id: 'abc_1793635200', summary: '周会', start_time: { datetime: '2026-11-03T10:00:00+08:00' }, end_time: { datetime: '2026-11-03T11:00:00+08:00' }, self_rsvp_status: 'accept' },
      { event_id: 'def', summary: '团建', start_time: { date: '2026-10-30' }, end_time: { date: '2026-10-31' }, location: { name: '郊外' } },
      { event_id: 'ghi', summary: '拒了', start_time: { datetime: '2026-10-28T09:00:00+08:00' }, end_time: { datetime: '2026-10-28T09:30:00+08:00' }, self_rsvp_status: 'decline' },
      { event_id: 'utc', summary: '东京时间的会', start_time: { datetime: '2026-10-29T10:00:00+09:00' }, end_time: { datetime: '2026-10-29T10:30:00+09:00' } },
    ],
  }
  const r = parseAgenda({ error: null, stdout: `提示：有新版本\n${JSON.stringify(out)}`, stderr: '' })
  assert.equal(r.ok, true)
  const { rows } = toRows('lark', r.ok ? r.items : [], W)
  assert.deepEqual(rows.map((x) => [x.title, x.start, x.end, x.location]), [
    ['周会', '2026-10-27T10:00', '2026-10-27T11:00', null],
    ['东京时间的会', '2026-10-29T09:00', '2026-10-29T09:30', null],
    ['团建', '2026-10-30', '2026-11-01', '郊外'],
    ['周会', '2026-11-03T10:00', '2026-11-03T11:00', null],
  ])
  assert.equal(new Set(rows.map((x) => x.id)).size, 4)
  assert.equal(larkItems('不是数组').length, 0)
})

test('飞书出错说人话：没装、没登录、看不懂', async () => {
  const missing = parseAgenda({ error: Object.assign(new Error('spawn lark-cli ENOENT'), { code: 'ENOENT' }), stdout: '', stderr: '' })
  assert.equal(missing.ok, false)
  assert.equal(!missing.ok && missing.code, 'missing-cli')
  const auth = parseAgenda({ error: Object.assign(new Error('exit 1'), { code: '1' }) as never, stdout: JSON.stringify({ ok: false, error: { type: 'authorization', message: 'user not logged in' } }), stderr: '' })
  assert.equal(!auth.ok && auth.code, 'not-logged-in')
  assert.match(!auth.ok ? auth.reason : '', /lark-cli auth login/)
  // 命令行参数：只读的 +agenda，带本地时区
  let seen: string[] = []
  await readLark({ from: '2026-10-27', to: '2026-11-10' }, async (_bin, args) => { seen = args; return { error: null, stdout: '{"ok":true,"data":[]}', stderr: '' } })
  assert.deepEqual(seen.slice(0, 4), ['calendar', '+agenda', '--as', 'user'])
  assert.equal(seen[seen.indexOf('--start') + 1], '2026-10-27T00:00:00+08:00')
})

test('ICS：每周重复 + 时区（纽约夏令时结束）+ 删掉的一次 + 改过时间的一次 + 只写时区名的 + 全天 + 浮动时间', async () => {
  const text = readFileSync(join(HERE, 'fixtures', 'weekly.ics'), 'utf8')
  const items = await icsItems(text, W)
  const { rows } = toRows('ics', items, W)
  assert.deepEqual(rows.map((r) => [r.title, r.start, r.end]), [
    ['周会', '2026-10-26T21:00', '2026-10-26T22:00'], // 10/26 纽约还是夏令时 09:00 EDT = 北京 21:00
    ['周会（改时间）', '2026-11-02T23:30', '2026-11-03T00:30'], // 改到 10:30 EST（夏令时 11/1 结束）= 北京 23:30
    ['东京客户电话', '2026-11-03T09:00', '2026-11-03T10:00'], // 文件里没有 Asia/Tokyo 的定义，用系统时区表
    ['供应商来访', '2026-11-04T10:00', '2026-11-04T11:00'],
    ['展会', '2026-11-05', '2026-11-07'],
    ['店里盘点', '2026-11-06T15:00', '2026-11-06T16:00'], // 浮动时间按本地
  ])
  // 11/9 那次删掉了（EXDATE），11/16 那次在窗外；取消的、我拒绝的不要
  assert.ok(!rows.some((r) => r.start.startsWith('2026-11-09') || r.start.startsWith('2026-11-16')))
  assert.ok(items.some((i) => i.cancelled) && items.some((i) => i.response === 'declined'))
  // 再展开一次，id 一样
  const again = toRows('ics', await icsItems(text, W), W).rows
  assert.deepEqual(again.map((r) => r.id), rows.map((r) => r.id))
  assert.equal(rows[0].note, '来自订阅链接「boss@example.com」')
})

test('ICS：时区换算按系统时区表，跨夏令时也对', () => {
  assert.equal(wallToDate(2026, 11, 2, 9, 0, 'America/New_York').toISOString(), '2026-11-02T14:00:00.000Z')
  assert.equal(wallToDate(2026, 10, 26, 9, 0, 'America/New_York').toISOString(), '2026-10-26T13:00:00.000Z')
})

test('ICS 链接：webcal 换成 https、http 不收、网页只显示网站名；取的时候有超时、有大小上限、打不开说人话', async () => {
  assert.equal(normalizeIcsUrl(' webcal://p01-caldav.icloud.com/published/2/abc '), 'https://p01-caldav.icloud.com/published/2/abc')
  assert.throws(() => normalizeIcsUrl('http://example.com/a.ics'), /https/)
  assert.throws(() => normalizeIcsUrl('随便写的'), /不像一个链接/)
  assert.equal(maskUrl('https://calendar.google.com/calendar/ical/x%40gmail.com/private-secret/basic.ics'), 'calendar.google.com 的订阅链接')
  const secret = 'https://calendar.google.com/private-SECRET/basic.ics'
  const fake = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch
  const r404 = await fetchIcs(secret, { fetchImpl: fake('', 404) })
  assert.equal(!r404.ok && r404.code, 'http')
  assert.ok(!r404.ok && !r404.reason.includes('SECRET'), '错误信息里不带链接')
  const big = await fetchIcs(secret, { fetchImpl: fake('BEGIN:VCALENDAR\n' + 'x'.repeat(2000)), maxBytes: 1000 })
  assert.equal(!big.ok && big.code, 'too-big')
  const html = await fetchIcs(secret, { fetchImpl: fake('<html>登录</html>') })
  assert.equal(!html.ok && html.code, 'bad-file')
  const down = await fetchIcs(secret, { fetchImpl: (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) }) as unknown as typeof fetch })
  assert.equal(!down.ok && down.code, 'network')
  const slow = await fetchIcs(secret, { timeoutMs: 50, fetchImpl: ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch })
  assert.equal(!slow.ok && slow.code, 'timeout')
  const good = await fetchIcs(secret, { fetchImpl: fake('BEGIN:VCALENDAR\nEND:VCALENDAR\n') })
  assert.equal(good.ok, true)
})

// ── 写库：时间窗整体替换、只读、失败留旧数据 ──
const NOW = new Date('2026-10-27T09:00:00+08:00')
const macData = (events: { uid: string; title: string; start: string; end?: string }[]) => ({
  version: 1, status: 'fullAccess', calendars: [{ id: 'c1', title: '工作', type: 'icloud' }],
  events: events.map((e) => ({ ...e, occurrence: e.start, allDay: e.start.length === 10, calendarId: 'c1' })),
})
let macReply: unknown = macData([])
let macCalls: { request: boolean }[] = []
svc.setReaders({ mac: async (o) => { macCalls.push({ request: o.request }); return macReply as never } })

test('换进时间窗：日历里删掉、改期的跟着变；手动和 Codex 建的日程不动；窗外的旧同步记录不动', async () => {
  schedule.createEvent({ title: '手动建的会', start: '2026-10-28T10:00' }, '网页')
  schedule.createEvent({ title: 'Codex 建的', start: '2026-10-29T10:00' }, 'Codex')
  run(`INSERT INTO events (id, title, start, kind, note, source, created_at, updated_at) VALUES ('cal_old', '上个月的', '2026-09-01T10:00', '日历', '', :s, 'x', 'x')`, { s: SYNCED_EVENT_SOURCE })
  store.writeSource('mac')
  macReply = macData([{ uid: 'A', title: '见王总', start: '2026-10-28T15:00', end: '2026-10-28T16:00' }, { uid: 'B', title: '展会', start: '2026-10-30', end: '2026-11-01' }])
  const r1 = await svc.syncNow({ now: NOW })
  assert.equal(r1.ok, true)
  assert.equal(r1.count, 2)
  assert.deepEqual(synced().map((e) => e.title), ['上个月的', '见王总', '展会'])
  const idA = synced().find((e) => e.title === '见王总')!.id
  // 第二次：B 删掉了，A 改了标题，新加 C
  macReply = macData([{ uid: 'A', title: '见王总（改到店里）', start: '2026-10-28T15:00', end: '2026-10-28T16:00' }, { uid: 'C', title: '新会', start: '2026-11-02T09:00' }])
  await svc.syncNow({ now: NOW })
  assert.deepEqual(synced().map((e) => e.title), ['上个月的', '见王总（改到店里）', '新会'])
  assert.equal(synced().find((e) => e.title === '见王总（改到店里）')!.id, idA, 'id 不变')
  assert.deepEqual(all<R>("SELECT title FROM events WHERE source != :s ORDER BY start", { s: SYNCED_EVENT_SOURCE }).map((e) => e.title), ['手动建的会', 'Codex 建的'])
  assert.equal(macCalls.every((c) => !c.request), true, '后台同步从不请求权限')
})

test('同步来的日程只读：网页改、删和命令行一样被拒绝，说“请在日历里改”', () => {
  const e = synced().find((x) => x.title === '新会')!
  assert.throws(() => schedule.updateEvent(String(e.id), { title: '偷偷改' }, '网页'), (err: Error & { status?: number }) => err.message === SYNCED_EVENT_READONLY && err.status === 400)
  assert.throws(() => schedule.deleteEvent(String(e.id), 'Codex'), new RegExp(SYNCED_EVENT_READONLY))
  assert.equal(get<R>('SELECT title FROM events WHERE id = :id', { id: String(e.id) })!.title, '新会')
  // 手动建的照常能改
  const m = all<R>("SELECT id FROM events WHERE title = '手动建的会'")[0]
  assert.equal((schedule.updateEvent(String(m.id), { title: '手动建的会（改）' }, '网页') as R).title, '手动建的会（改）')
})

test('读不到（没权限、超时）：旧数据一条不动，状态记下原因，上次成功的时间还在', async () => {
  const before = synced().map((e) => e.id)
  const ok = store.readRecord()!
  macReply = { version: 1, status: 'denied', events: [] }
  const r = await svc.syncNow({ now: NOW })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'denied')
  assert.deepEqual(synced().map((e) => e.id), before)
  const s = svc.calendarStatus()
  assert.equal(s.ok, false)
  assert.equal(s.needsPrivacy, true)
  assert.equal(s.lastSyncAt, ok.lastSyncAt)
  assert.equal(s.count, 2)
  assert.match(svc.statusText(s), /没同步成.*旧的照常显示/)
  macReply = { version: 1, status: 'timeout' }
  assert.equal((await svc.syncNow({ now: NOW })).code, 'timeout')
  assert.deepEqual(synced().map((e) => e.id), before)
})

test('前台连接才请求权限；同一时间只跑一次；2 分钟内不重复同步', async () => {
  macCalls = []
  macReply = macData([{ uid: 'A', title: '见王总', start: '2026-10-28T15:00' }])
  const [a, b] = [svc.syncNow({ now: NOW }), svc.syncNow({ now: NOW })]
  assert.equal(a, b, '后台同步合并成一次')
  await a
  await svc.syncNow({ request: true, now: NOW })
  assert.deepEqual(macCalls, [{ request: false }, { request: true }])
  assert.equal(svc.maybeSync(Date.now()), false, '刚同步过')
  assert.equal(svc.maybeSync(Date.now() + svc.STALE_MS + 1000), true, '过了 2 分钟再同步')
  await svc.syncNow()
})

test('换来源：订阅链接只存本机、状态里只给网站名；不接日历时今天起的同步日程拿掉、过去的留着', async () => {
  assert.throws(() => svc.setSource('ics', 'Codex', 'http://x.com/a.ics'), /https/)
  let fetched = ''
  svc.setReaders({ ics: async (url) => { fetched = url; return { ok: true, items: [] } } })
  svc.setSource('ics', 'Codex', 'webcal://calendar.example.com/secret-token/basic.ics')
  await svc.syncNow({ now: NOW })
  assert.equal(fetched, 'https://calendar.example.com/secret-token/basic.ics')
  const s = svc.calendarStatus()
  assert.equal(s.icsLabel, 'calendar.example.com 的订阅链接')
  assert.ok(!JSON.stringify(s).includes('secret-token'), '状态里没有整条链接')
  assert.ok(!JSON.stringify(all('SELECT summary FROM changes')).includes('secret-token'), '最近改动里没有链接')
  // 换了来源：mac 留下的同步日程在新来源第一次同步时被换掉
  assert.equal(synced().filter((e) => String(e.start) >= '2026-10-27').length, 0)
  run(`INSERT INTO events (id, title, start, kind, note, source, created_at, updated_at) VALUES ('cal_future', '以后的', '2099-01-01T10:00', '日历', '', :s, 'x', 'x')`, { s: SYNCED_EVENT_SOURCE })
  const off = svc.setSource('off', '网页')
  assert.equal(off.removed, 1)
  assert.deepEqual(synced().map((e) => e.title), ['上个月的'])
  assert.equal(svc.calendarStatus().source, 'off')
  assert.equal(svc.maybeSync(), false, '不接日历就不同步')
  svc.setReaders(null)
})

test('数据库约束：类型“日历”能写，乱写的类型照样拒绝；新建表单不能选“日历”', () => {
  assert.throws(() => run(`INSERT INTO events (id, title, start, kind, source, created_at, updated_at) VALUES ('bad', 'x', '2026-10-28', '乱写', '手动', 'x', 'x')`), /CHECK/)
  assert.throws(() => schedule.createEvent({ title: '想冒充', start: '2026-10-28T10:00', kind: '日历' }, '网页'))
})

// ── Mac 助手：经 open 启动、轮询输出文件（open 换成假的脚本，不启动任何 App） ──
test('Mac 助手：参数对（后台加 -g -j、前台不加、带 --request）、读到输出文件、超时说清', async () => {
  const fakeDir = mkdtempSync(join(os.tmpdir(), 'wb-cal-open-'))
  const app = join(fakeDir, '工作台日历.app')
  mkdirSync(app)
  const log = join(fakeDir, 'args.log')
  const open = join(fakeDir, 'open')
  writeFileSync(open, `#!/bin/sh
echo "$@" >> "${log}"
out=""; prev=""
for a in "$@"; do [ "$prev" = "--out" ] && out="$a"; prev="$a"; done
case "$*" in *--never*) exit 0;; esac
(sleep 0.3; printf '{"version":1,"status":"fullAccess","events":[],"calendars":[]}' > "$out.tmp" && mv "$out.tmp" "$out") &
exit 0
`)
  chmodSync(open, 0o755)
  process.env.WORKBENCH_CAL_OPEN = open
  try {
    const bg = await runHelper({ app })
    assert.equal(bg.status, 'fullAccess')
    const fg = await runHelper({ app, request: true })
    assert.equal(fg.status, 'fullAccess')
    const lines = readFileSync(log, 'utf8').trim().split('\n')
    assert.match(lines[0], /^-g -j -n .*工作台日历\.app --args --days 14 --out /)
    assert.doesNotMatch(lines[1], /-g -j/)
    assert.match(lines[1], /--request$/)
    // 助手一直不写：按时放弃
    writeFileSync(open, `#!/bin/sh\nexit 0\n`)
    assert.equal((await runHelper({ app, timeoutMs: 300 })).status, 'timeout')
    assert.equal((await runHelper({ app: join(fakeDir, '没有.app') })).status, 'missing-helper')
  } finally { delete process.env.WORKBENCH_CAL_OPEN }
})
