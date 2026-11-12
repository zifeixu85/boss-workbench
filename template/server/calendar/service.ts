// 日历同步：从老板自己的日历只读地拉未来两周的日程，换进 events 表（source = '日历同步'），单向，绝不写回日历。
//   什么时候同步：工作台启动时、之后每 10 分钟、打开今日或日程页时距离上次超过 2 分钟（routes.ts 调 maybeSync）
//   同一时间只跑一次；失败了旧数据留着，状态里记下原因，设置页和日程页显示
//   三种来源：mac（Mac 日历，经工作台日历.app）、lark（飞书日历，经 lark-cli）、ics（订阅链接）
import { logChange, nowIso } from '../db.ts'
import type { CalendarSource } from '../../shared/schema.ts'
import { BadRequest, type Actor } from '../services/common.ts'
import { PROVIDER_NAMES, syncWindow, toRows, type CalItem, type Provider } from './rows.ts'
import * as store from './store.ts'
import { macItems, macProblem, runHelper, type MacJson } from './mac.ts'
import { readLark, type LarkExec } from './lark.ts'
import { fetchIcs, icsItems, maskUrl, normalizeIcsUrl } from './ics.ts'

export const SYNC_EVERY_MS = 10 * 60_000
export const STALE_MS = 2 * 60_000
export const WINDOW_DAYS = 14

/** 读一次日历的结果：ok 时带日程，不 ok 时带一句人话和机器读的原因 */
export type ReadResult = { ok: true; items: CalItem[] } | { ok: false; code: string; reason: string }

/** 换掉三种来源怎么读（测试用；也给以后加别的来源留口子） */
export type Readers = {
  mac: (o: { request: boolean; days: number }) => Promise<MacJson>
  lark: (w: { from: string; to: string }) => Promise<ReadResult>
  ics: (url: string, w: { from: string; to: string }) => Promise<ReadResult>
}

export const defaultReaders: Readers = {
  mac: (o) => runHelper({ request: o.request, days: o.days }),
  lark: (w) => readLark(w),
  ics: async (url, w) => {
    const r = await fetchIcs(url)
    if (!r.ok) return r
    try { return { ok: true, items: await icsItems(r.text, w) } } catch (err) {
      if ((err as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return { ok: false, code: 'missing-lib', reason: '读订阅链接要用的组件没装好：在程序文件夹里运行 node scripts/install.mjs 补装' }
      return { ok: false, code: 'bad-file', reason: '订阅文件读不懂（格式坏了）：重新复制一次私密地址' }
    }
  },
}

let readers: Readers = defaultReaders
export function setReaders(r: Partial<Readers> | null) { readers = r ? { ...defaultReaders, ...r } : defaultReaders }
/** 只给测试：飞书换成假的命令行 */
export const larkReaderFor = (exec: LarkExec) => (w: { from: string; to: string }) => readLark(w, exec)

async function readFrom(source: Provider, request: boolean, window: { from: string; to: string }): Promise<ReadResult> {
  if (source === 'mac') {
    const data = await readers.mac({ request, days: WINDOW_DAYS })
    const problem = macProblem(data.status)
    return problem ? { ok: false, code: data.status, reason: problem } : { ok: true, items: macItems(data) }
  }
  if (source === 'lark') return readers.lark(window)
  const url = store.readIcsUrl()
  if (!url) return { ok: false, code: 'no-url', reason: '还没填订阅链接：在 设置 → 日历来源 贴上私密地址' }
  return readers.ics(url, window)
}

let running: Promise<store.SyncRecord> | null = null
let onChange: (() => void) | null = null

/** 同步一次。request = true 只在老板看着的时候用（命令行 calendar-connect mac、设置页点“连上 Mac 日历”）：Mac 可能弹一次授权窗 */
export function syncNow(opts: { request?: boolean; now?: Date } = {}): Promise<store.SyncRecord> {
  if (running && !opts.request) return running
  const before = running
  const job: Promise<store.SyncRecord> = (async () => {
    if (before) await before.catch(() => null) // 老板点了“连上”：等后台那次跑完，再按前台的方式重读一次
    const source = store.readSource()
    const prev = store.readRecord()
    const at = nowIso()
    const window = syncWindow(opts.now ?? new Date(), WINDOW_DAYS)
    if (source === 'off') {
      const rec: store.SyncRecord = { source, ok: true, at, lastSyncAt: null, count: 0, error: null, code: 'off', from: null, to: null, skipped: 0 }
      store.writeRecord(rec)
      return rec
    }
    let r: ReadResult
    try { r = await readFrom(source, !!opts.request, window) } catch (err) {
      r = { ok: false, code: 'error', reason: `同步出错了：${(err as Error).message.slice(0, 120)}` }
    }
    const same = prev?.source === source
    if (!r.ok) {
      // 失败：旧数据一条不动，只记原因；上次成功的时间和条数留着给页面显示
      const rec: store.SyncRecord = { source, ok: false, at, lastSyncAt: same ? prev!.lastSyncAt : null, count: same ? prev!.count : 0, error: r.reason, code: r.code, from: window.from, to: window.to, skipped: 0 }
      store.writeRecord(rec)
      onChange?.()
      return rec
    }
    const { rows, skipped } = toRows(source, r.items, window)
    store.replaceWindow(rows, window, at)
    const rec: store.SyncRecord = { source, ok: true, at, lastSyncAt: at, count: rows.length, error: null, code: null, from: window.from, to: window.to, skipped }
    store.writeRecord(rec)
    onChange?.()
    return rec
  })().finally(() => { if (running === job) running = null })
  running = job
  return job
}

/** 距离上次同步超过 2 分钟才同步（打开今日、日程页时调；不等结果，同步完会推送刷新页面） */
export function maybeSync(now = Date.now()) {
  if (running || store.readSource() === 'off') return false
  const rec = store.readRecord()
  if (rec && now - new Date(rec.at).getTime() < STALE_MS) return false
  void syncNow().catch(() => {})
  return true
}

let timer: NodeJS.Timeout | null = null
/** 工作台启动时调：马上同步一次，之后每 10 分钟一次。changed：写进了新日程，推送页面刷新 */
export function startCalendarSync(changed: () => void) {
  onChange = changed
  if (timer) return
  const tick = () => { if (store.readSource() !== 'off') void syncNow().catch((err) => console.warn(`日历同步出错：${(err as Error).message}`)) }
  setTimeout(tick, 3_000).unref?.()
  timer = setInterval(tick, SYNC_EVERY_MS)
  timer.unref?.()
}

/** 换来源。ics 要带链接（只存在本机数据库里，不打印）。换成 off：今天起的同步日程拿掉，过去的留着 */
export function setSource(source: CalendarSource, actor: Actor, icsUrl?: string) {
  if (!(['off', 'mac', 'lark', 'ics'] as const).includes(source)) throw new BadRequest('日历来源只能是 off（不接）、mac、lark（飞书）、ics（订阅链接）')
  if (source === 'mac' && process.platform !== 'darwin' && !process.env.WORKBENCH_CAL_OPEN) throw new BadRequest(macProblem('unsupported')!)
  if (source === 'ics') {
    let url = store.readIcsUrl()
    if (icsUrl !== undefined && icsUrl.trim()) {
      try { url = normalizeIcsUrl(icsUrl) } catch (err) { throw new BadRequest((err as Error).message) }
    }
    if (!url) throw new BadRequest('订阅链接还没填：从日历的设置里复制“私密地址”贴过来')
    store.writeIcsUrl(url)
  }
  const before = store.readSource()
  store.writeSource(source)
  let removed = 0
  if (source === 'off') {
    removed = store.removeFuture(syncWindow(new Date()).from)
    store.clearRecord()
    onChange?.()
  } else if (before !== source) store.clearRecord()
  logChange(actor, 'settings', 'calendar', '修改', `日历来源：${PROVIDER_NAMES[source]}${removed ? `（拿掉了 ${removed} 条同步来的日程）` : ''}`)
  return { source, removed }
}

export type CalendarStatus = {
  source: CalendarSource
  sourceName: string
  /** 订阅链接只给网站名 */
  icsLabel: string | null
  platform: 'mac' | 'windows' | 'other'
  ok: boolean | null
  lastSyncAt: string | null
  lastTryAt: string | null
  count: number
  message: string | null
  code: string | null
  /** 被拒绝了，要到系统设置里打开 */
  needsPrivacy: boolean
  syncing: boolean
}

export function calendarStatus(): CalendarStatus {
  const source = store.readSource()
  const rec = store.readRecord()
  const r = rec && rec.source === source && source !== 'off' ? rec : null
  const url = store.readIcsUrl()
  return {
    source, sourceName: PROVIDER_NAMES[source], icsLabel: url ? maskUrl(url) : null,
    platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'other',
    ok: r ? r.ok : null, lastSyncAt: r?.lastSyncAt ?? null, lastTryAt: r?.at ?? null, count: r?.count ?? 0,
    message: r?.error ?? null, code: r?.code ?? null,
    needsPrivacy: source === 'mac' && !!r && ['denied', 'writeOnly'].includes(r.code ?? ''),
    syncing: running !== null,
  }
}

/** 给人看的一句状态（命令行用） */
export function statusText(s: CalendarStatus) {
  if (s.source === 'off') return '日历来源：没接（日程页只显示在工作台里建的）'
  const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '还没有')
  const head = `日历来源：${s.sourceName}${s.icsLabel && s.source === 'ics' ? `（${s.icsLabel}）` : ''}`
  if (s.ok === null) return `${head}；还没同步过`
  const last = `最后同步 ${hm(s.lastSyncAt)}，未来两周 ${s.count} 条`
  return s.ok ? `${head}；${last}` : `${head}；这次没同步成：${s.message}${s.lastSyncAt ? `（${last}，旧的照常显示）` : ''}`
}
