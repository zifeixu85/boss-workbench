// 小红书内容中心的命令行（module.json 的 server.cli；写 xhs 就认 xhs 和 xhs- 开头的）。和网页走同一套规则，操作人记 Codex。
//   node server/cli.ts xhs [--json]
//   node server/cli.ts xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
//   node server/cli.ts xhs-notes-import --yes
// 归属：小红书内容模块。
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import type { ModuleCli } from '../../module-types.ts'
import * as content from './service.ts'
import { addTopics } from './topics.ts'
import { reimportNotes } from './notes-import.ts'

const HELP = `  xhs                                小红书：今天发什么、今天的选题、近两周排期
  xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
                                     把小红书选题写进内容中心的灵感池（JSON 数组，或含 <topics>…</topics> 的回复原文；同名的跳过）
  xhs-notes-import --yes             笔记数据：字段对照确认完后，按对照把导入文件夹里最新那份笔记数据表导进来（能在导入记录里撤销）`

type R = Record<string, unknown>
const line = (xs: R[], f: (x: R) => string) => (xs.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- （无）')

function run(argv: string[]): number {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { json: { type: 'boolean' }, yes: { type: 'boolean' }, file: { type: 'string' }, date: { type: 'string' }, by: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  })
  const print = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
  if (o.help) { console.log(HELP); return 0 }
  switch (positionals[0]) {
    case 'xhs': {
      const plan = content.todayPlan()
      const sc = content.schedule() as R[]
      print({ plan, schedule: sc }, [`# 小红书 ${plan.date}`, `粉丝 ${plan.account.followers}（近 7 天 ${plan.account.followers_7d == null ? '—' : `+${plan.account.followers_7d}`}，数据截至 ${plan.account.stats_through ?? '—'}）`,
        '\n## 今天发', line(plan.posts as R[], (p) => `${p.time ?? ''} ${p.title}（${p.status}）`),
        '\n## 今天的选题', line(content.topics() as R[], (x) => `${x.title}（${x.source}）`),
        '\n## 近两周排期', line(sc, (x) => `${x.date} ${x.time ?? ''} ${x.title}（${x.status}）`)].join('\n'))
      return 0
    }
    case 'xhs-topics-add': {
      // 每天早上的选题定时任务用它写回灵感池
      if (!o.file) throw new Error('要用 --file 指定选题文件（JSON 数组，或含 <topics>…</topics> 的回复）')
      const raw = readFileSync(o.file, 'utf8')
      const m = raw.match(/<topics>([\s\S]*?)<\/topics>/)
      const list = JSON.parse((m ? m[1] : raw).trim()) as unknown
      const r = addTopics(Array.isArray(list) ? list : (list as { topics?: unknown[] }).topics ?? [], { date: o.date, by: o.by ?? 'Codex 定时任务', actor: 'Codex' })
      print(r, `已写进灵感池 ${r.added.length} 个选题（${r.date}，${r.by}）${r.skipped.length ? `；跳过同名的 ${r.skipped.length} 个：${r.skipped.join('；')}` : ''}${r.added.length ? `\n${r.added.map((x) => `- ${x.title}`).join('\n')}` : ''}`)
      return 0
    }
    case 'xhs-notes-import': {
      if (!o.yes) throw new Error('这是写入命令：先让老板在“数据源 → 小红书 · 笔记数据导出”里确认过字段对照，再加 --yes')
      const r = reimportNotes('Codex')
      print(r, r.message)
      return 0
    }
    default:
      throw new Error(`小红书内容中心没有「${positionals[0]}」这个命令。\n${HELP}`)
  }
}

export const xhsCli: ModuleCli = { help: HELP, run }
