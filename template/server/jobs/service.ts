// 定时任务（公共，2026-10-18）：模块登记“每天几点跑一次”的事（server/module-types.ts 的 Job），工作台开着就按时跑；
// 到点时电脑没开、睡着了、工作台没开，下次打开工作台补跑当天这一次。每跑一次记一行 job_runs。
// 失败了隔 15 分钟再试，一天最多 3 次；“在跑”超过 10 分钟当作没跑完（进程被关了），也算一次失败。
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
const runsOf = (id: string, day: string) => all<JobRun>('SELECT * FROM job_runs WHERE job_id = :id AND day = :day ORDER BY id', { id, day })

/** 现在该不该跑：不该跑返回 null，该跑返回记成什么（定时 / 补跑） */
export function dueTrigger(j: Job, at: Date = now()): JobTrigger | null {
  if (isOff(j) || (j.module && !isOn(j.module))) return null
  const [h, m] = atOf(j).split(':').map(Number)
  const planned = new Date(at)
  planned.setHours(h, m, 0, 0)
  if (at.getTime() < planned.getTime()) return null
  const runs = runsOf(j.id, localDate(at))
  if (runs.some((r) => r.status === '成功')) return null
  if (runs.some((r) => r.status === '在跑' && at.getTime() - Date.parse(r.started_at) < STALE_MS)) return null
  const tried = runs.filter((r) => r.status !== '成功')
  if (tried.length >= MAX_TRIES) return null
  const last = tried[tried.length - 1]
  if (last && at.getTime() - Date.parse(last.finished_at ?? last.started_at) < RETRY_MS) return null
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
    return { id: j.id, name: j.name, module: j.module ?? null, at: atOf(j), off: isOff(j), module_on: !j.module || isOn(j.module), today: today[today.length - 1] ?? null, last }
  })
}

/** 改时间、停掉 / 打开（写设置）；at 写 none = 回到模块默认的时间 */
export async function setJob(id: string, o: { at?: string; off?: boolean }) {
  const j = (await allJobs()).find((x) => x.id === id)
  if (!j) throw new Error(`没有“${id}”这个定时任务。运行 jobs 看有哪些`)
  if (o.at !== undefined) {
    if (o.at === 'none') run('DELETE FROM settings WHERE key = :k', { k: `job_at:${id}` })
    else if (!HM.test(o.at)) throw new Error(`时间写成 24 小时制的 HH:MM，比如 08:30；收到的是“${o.at}”`)
    else run('INSERT INTO settings (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v', { k: `job_at:${id}`, v: o.at })
  }
  if (o.off !== undefined) {
    if (o.off) run("INSERT INTO settings (key, value) VALUES (:k, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", { k: `job_off:${id}` })
    else run('DELETE FROM settings WHERE key = :k', { k: `job_off:${id}` })
  }
  return (await jobList()).find((x) => x.id === id)!
}
