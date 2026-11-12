// 定时任务（公共，2026-10-18）：模块登记“每天几点跑一次”的事（server/module-types.ts 的 Job），工作台开着就按时跑；
// 到点时电脑没开、睡着了、工作台没开，下次打开工作台补跑当天这一次。每跑一次记一行 job_runs。
// 失败了隔 15 分钟再试，一天最多 3 次；“在跑”超过 10 分钟当作没跑完（进程被关了），也算一次失败。
// 今天再自动跑一次（2026-11-12，job-set --once 12:07）：只管当天，到点自己跑一次，不看当天的每日任务跑没跑过；用来在当场看一次真的自动触发。
// 时间以 clock.ts 的 now() 为准（演示模式按演示日）。老板改时间、停掉：设置里的 job_at:<编号>、job_off:<编号>（命令 job-set）。
// 提醒不走这里，还是 reminders/ 每 30 秒算一遍。
import { all, get, run, localDate } from '../db.ts'
import { now } from '../clock.ts'
import { isOn } from '../services/modules.ts'
import { liveModules } from '../modules-live.ts'
import type { Job, JobTrigger } from '../module-types.ts'

const TICK_MS = 60_000
const RETRY_MS = 15 * 60_000
const MAX_TRIES = 3
const STALE_MS = 10 * 60_000
/** 到点 5 分钟以后才第一次跑的，记成“补跑” */
const LATE_MS = 5 * 60_000
const HM = /^([01]\d|2[0-3]):[0-5]\d$/

/** 核心自己的定时任务：现在没有，都是模块登记的 */
const CORE_JOBS: Job[] = []

export type JobRun = { id: number; job_id: string; day: string; trigger: string; status: string; started_at: string; finished_at: string | null; note: string | null }

/** 现在所有的定时任务（核心 + 装进来的模块）。某个模块的任务读不出来，只跳过它，写日志 */
export async function allJobs(): Promise<Job[]> {
  const out = [...CORE_JOBS]
  for (const m of await liveModules()) {
    if (!m.jobs) continue
    try { out.push(...(await m.jobs()).map((j) => ({ ...j, module: j.module ?? m.id }))) } catch (err) { console.error(`[定时任务] 读不出“${m.name}”的任务：${(err as Error).message}`) }
  }
  return out
}

const setting = (key: string) => get<{ value: string }>('SELECT value FROM settings WHERE key = :key', { key })?.value
/** 实际几点跑：老板改过的优先 */
export const atOf = (j: Job) => { const v = setting(`job_at:${j.id}`); return v && HM.test(v) ? v : j.at }
export const isOff = (j: Job) => setting(`job_off:${j.id}`) === '1'
const ONCE: JobTrigger = '单次'
/** 今天再自动跑一次的那几条记录：只算当天、这个时刻以后、记成“单次”的（每天那一次、手动跑的都不算） */
export const runsSince = (id: string, since: Date) => all<JobRun>("SELECT * FROM job_runs WHERE job_id = :id AND day = :day AND trigger = '单次' AND started_at >= :since ORDER BY id", { id, day: localDate(since), since: since.toISOString() })

const onceMoment = (hm: string, at: Date) => { const [h, m] = hm.split(':').map(Number); const d = new Date(at); d.setHours(h, m, 0, 0); return d }

/**
 * 今天再自动跑一次的那个时间（设置 job_once:<编号> = "YYYY-MM-DD HH:MM"）；不是今天的不算。
 * done = 到点以后已经成功跑过；pending = 还会跑（没成功、也没试满 3 次）
 */
export function onceOf(j: Pick<Job, 'id'>, at: Date = now()): { day: string; at: string; done: boolean; pending: boolean } | null {
  const v = setting(`job_once:${j.id}`)
  const m = v?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/)
  if (!m || m[1] !== localDate(at)) return null
  const runs = runsSince(j.id, onceMoment(m[2], at))
  const done = runs.some((r) => r.status === '成功')
  return { day: m[1], at: m[2], done, pending: !done && runs.filter((r) => r.status === '失败').length < MAX_TRIES }
}

/** 时间写得对不对：格式、要晚于现在（不然就成了马上跑，看不到“到点自己跑”）。不写库 */
function checkOnce(hm: string, at: Date) {
  if (hm === 'none') return
  if (!HM.test(hm)) throw new Error(`时间写成 24 小时制的 HH:MM，比如 12:07；收到的是“${hm}”`)
  if (onceMoment(hm, at).getTime() <= at.getTime()) throw new Error(`${hm} 已经过了。写一个比现在晚几分钟的时间`)
}

/** 定下（或取消）今天再自动跑一次的时间 */
export function setOnce(id: string, hm: string, at: Date = now()) {
  checkOnce(hm, at)
  if (hm === 'none') { run('DELETE FROM settings WHERE key = :k', { k: `job_once:${id}` }); return null }
  const v = `${localDate(at)} ${hm}`
  run('INSERT INTO settings (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v', { k: `job_once:${id}`, v })
  return { day: localDate(at), at: hm, done: false, pending: true }
}

/** 这一轮（从 since 起）该不该再试：成功过、正在跑、试满了、离上次失败太近，都不跑 */
function canTry(runs: JobRun[], at: Date) {
  if (runs.some((r) => r.status === '成功')) return false
  if (runs.some((r) => r.status === '在跑' && at.getTime() - Date.parse(r.started_at) < STALE_MS)) return false
  const tried = runs.filter((r) => r.status !== '成功')
  if (tried.length >= MAX_TRIES) return false
  const last = tried[tried.length - 1]
  return !(last && at.getTime() - Date.parse(last.finished_at ?? last.started_at) < RETRY_MS)
}

const runsOf = (id: string, day: string) => all<JobRun>('SELECT * FROM job_runs WHERE job_id = :id AND day = :day ORDER BY id', { id, day })

/** 现在该不该跑：不该跑返回 null，该跑返回记成什么（定时 / 补跑） */
export function dueTrigger(j: Job, at: Date = now()): JobTrigger | null {
  if (isOff(j) || (j.module && !isOn(j.module))) return null
  // 今天再自动跑一次：到点了、这一次还没成功，就跑（不看当天的每日任务）
  const once = onceOf(j, at)
  if (once?.pending) {
    const moment = onceMoment(once.at, at)
    if (at.getTime() >= moment.getTime() && canTry(runsSince(j.id, moment), at)) return ONCE
  }
  const [h, m] = atOf(j).split(':').map(Number)
  const planned = new Date(at)
  planned.setHours(h, m, 0, 0)
  if (at.getTime() < planned.getTime()) return null
  // 每天那一次只看自己的记录：“单次”跑成功、跑失败都不占它的名额
  const runs = runsOf(j.id, localDate(at)).filter((r) => r.trigger !== ONCE)
  if (!canTry(runs, at)) return null
  const tried = runs.filter((r) => r.status !== '成功')
  return tried.length || at.getTime() - planned.getTime() > LATE_MS ? '补跑' : '定时'
}

/** 跑一次，记进 job_runs；返回结果，不抛错 */
export async function runJob(j: Job, trigger: JobTrigger, at: Date = now()) {
  const day = localDate(at)
  const t0 = Date.now()
  // 开始、结束时间按 at 算（平时 at 就是现在；测试时可以给一个假的“现在”）
  const end = () => new Date(at.getTime() + (Date.now() - t0)).toISOString()
  const r = run("INSERT INTO job_runs (job_id, day, trigger, status, started_at) VALUES (:id, :day, :trigger, '在跑', :at)", { id: j.id, day, trigger, at: at.toISOString() })
  const rid = Number(r.lastInsertRowid)
  try {
    const note = (await j.run({ day, trigger })) ?? null
    run("UPDATE job_runs SET status = '成功', finished_at = :at, note = :note WHERE id = :rid", { at: end(), note: note && String(note).slice(0, 500), rid })
    return { id: j.id, name: j.name, ok: true, trigger, note }
  } catch (err) {
    const note = String((err as Error).message ?? err).slice(0, 500)
    run("UPDATE job_runs SET status = '失败', finished_at = :at, note = :note WHERE id = :rid", { at: end(), note, rid })
    return { id: j.id, name: j.name, ok: false, trigger, note }
  }
}

let busy = false
/** 看一遍：到点了、今天还没成功跑过的都跑一次 */
export async function tickJobs(at: Date = now()) {
  if (busy) return []
  busy = true
  try {
    const done = []
    for (const j of await allJobs()) {
      const t = dueTrigger(j, at)
      if (t) done.push(await runJob(j, t, at))
    }
    return done
  } finally { busy = false }
}

let timer: NodeJS.Timeout | null = null
/** 工作台启动时调用：20 秒后先看一遍（补跑在这里发生），以后每分钟看一遍 */
export function startJobs(onRun?: (r: Awaited<ReturnType<typeof runJob>>) => void) {
  const go = () => {
    tickJobs().then((rs) => {
      for (const r of rs) {
        console.log(`[定时任务] ${r.name}（${r.trigger}）：${r.ok ? '成功' : '失败'}${r.note ? `，${r.note}` : ''}`)
        onRun?.(r)
      }
    }).catch((err) => console.error(`[定时任务] 出错：${(err as Error).message}`))
  }
  if (timer) clearInterval(timer)
  setTimeout(go, 20_000).unref()
  timer = setInterval(go, TICK_MS)
  timer.unref()
}

/** 每个任务：几点跑、开没开、今天跑了没、最近一次 */
export async function jobList(at: Date = now()) {
  const day = localDate(at)
  return (await allJobs()).map((j) => {
    const today = runsOf(j.id, day)
    const last = get<JobRun>('SELECT * FROM job_runs WHERE job_id = :id ORDER BY id DESC LIMIT 1', { id: j.id }) ?? null
    return { id: j.id, name: j.name, module: j.module ?? null, at: atOf(j), off: isOff(j), module_on: !j.module || isOn(j.module), once: onceOf(j, at), today: today[today.length - 1] ?? null, last }
  })
}

/** 改时间、停掉 / 打开（写设置）；at 写 none = 回到模块默认的时间 */
export async function setJob(id: string, o: { at?: string; off?: boolean; once?: string }) {
  const j = (await allJobs()).find((x) => x.id === id)
  if (!j) throw new Error(`没有“${id}”这个定时任务。运行 jobs 看有哪些`)
  // 先把要改的都检查一遍再写：不留“改了一半”
  if (o.at !== undefined && o.at !== 'none' && !HM.test(o.at)) throw new Error(`时间写成 24 小时制的 HH:MM，比如 08:30；收到的是“${o.at}”`)
  if (o.once !== undefined) checkOnce(o.once, now())
  if (o.at !== undefined) {
    if (o.at === 'none') run('DELETE FROM settings WHERE key = :k', { k: `job_at:${id}` })
    else run('INSERT INTO settings (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v', { k: `job_at:${id}`, v: o.at })
  }
  if (o.once !== undefined) setOnce(id, o.once)
  if (o.off !== undefined) {
    if (o.off) run("INSERT INTO settings (key, value) VALUES (:k, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", { k: `job_off:${id}` })
    else run('DELETE FROM settings WHERE key = :k', { k: `job_off:${id}` })
  }
  return (await jobList()).find((x) => x.id === id)!
}
