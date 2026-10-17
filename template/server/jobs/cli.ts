// 定时任务的命令（server/cli.ts 把 jobs 和 job- 开头的转到这里，公共，2026-10-18）
import { parseArgs } from 'node:util'
import { jobList, runJob, allJobs, setJob } from './service.ts'

export const JOBS_HELP = `定时任务（模块登记的“每天几点跑一次”；工作台开着按时跑，没赶上的下次打开工作台补跑）
  jobs                               每个任务几点跑、今天跑了没、最近一次的结果
  job-run <编号>                      现在跑一次（手动，不管今天跑没跑过）
  job-set <编号> [--at 09:00|none] [--off|--on]
                                     改时间（none = 回到模块默认的时间）、停掉、重新打开`

export const isJobCommand = (argv: string[]) => argv[0] === 'jobs' || !!argv[0]?.startsWith('job-')

const local = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function runJobsCli(argv: string[]): Promise<number> {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { json: { type: 'boolean' }, at: { type: 'string' }, off: { type: 'boolean' }, on: { type: 'boolean' } },
  })
  const [cmd, id] = positionals
  const out = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
  if (cmd === 'jobs') {
    const xs = await jobList()
    out(xs, xs.length ? xs.map((j) => {
      const state = j.off ? '停着' : !j.module_on ? '模块收起来了，不跑' : j.today ? `今天${j.today.status}（${j.today.trigger}，${local(j.today.finished_at ?? j.today.started_at)}）${j.today.note ? `：${j.today.note}` : ''}` : '今天还没跑'
      return `- ${j.name}（${j.id}）每天 ${j.at}：${state}`
    }).join('\n') : '还没有定时任务（装了带定时任务的模块才有，比如行业资讯）')
    return 0
  }
  if (!id) throw new Error(`${cmd} 后面要写任务编号。运行 jobs 看有哪些`)
  if (cmd === 'job-run') {
    const j = (await allJobs()).find((x) => x.id === id)
    if (!j) throw new Error(`没有“${id}”这个定时任务。运行 jobs 看有哪些`)
    const r = await runJob(j, '手动')
    out(r, `${r.ok ? '跑完了' : '没办成'}：${r.name}${r.note ? `，${r.note}` : ''}`)
    return r.ok ? 0 : 1
  }
  if (cmd === 'job-set') {
    if (o.off && o.on) throw new Error('--off 和 --on 只能写一个')
    if (o.at === undefined && !o.off && !o.on) throw new Error('要写 --at 时间、--off 或 --on')
    const j = await setJob(id, { at: o.at, off: o.off ? true : o.on ? false : undefined })
    out(j, `已改：${j.name} 每天 ${j.at}${j.off ? '，现在停着' : ''}`)
    return 0
  }
  throw new Error(`没有「${cmd}」这个命令。定时任务的命令：jobs、job-run、job-set`)
}
