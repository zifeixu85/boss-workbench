// 小红书内容中心的命令行（module.json 的 server.cli；写 xhs 就认 xhs 和 xhs- 开头的）。和网页走同一套规则，操作人记 Codex。
//   node server/cli.ts xhs [--json]
//   node server/cli.ts xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
//   node server/cli.ts xhs-notes-import --yes
//   node server/cli.ts xhs-draft-save --draft <json> | --file <json 文件> [--id <内容编号>] [--by "内容助理 小红"]
// 归属：小红书内容模块。
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import type { ModuleCli } from '../../module-types.ts'
import * as content from './service.ts'
import { addTopics } from './topics.ts'
import { reimportNotes } from './notes-import.ts'
import { saveWork } from './works.ts'

const HELP = `  xhs                                小红书：今天发什么、今天的选题、近两周排期
  xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
                                     把小红书选题写进内容中心的灵感池（JSON 数组，或含 <topics>…</topics> 的回复原文；同名的跳过）
  xhs-notes-import --yes             笔记数据：字段对照确认完后，按对照把导入文件夹里最新那份笔记数据表导进来（能在导入记录里撤销）
  xhs-draft-save --draft <json> | --file <json 文件> [--id <内容编号>] [--by "内容助理 小红"]
                                     内容助理写完一篇：存成内容页里的草稿（写稿中），知识库里存一份作品（状态：草稿）。
                                     json 写 title、summary（一句说明）、cover_text、pages（每张图上的字，第一张是封面）、body、tags、
                                     sources（用到的知识库文件，如 11-产品/白茶饼.md）。
                                     改稿带 --id：同一篇存新版本。只回标题、一句说明、位置和打开方式（xhs-piece），正文不回`

type R = Record<string, unknown>
const line = (xs: R[], f: (x: R) => string) => (xs.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- （无）')

function run(argv: string[]): number {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { json: { type: 'boolean' }, yes: { type: 'boolean' }, file: { type: 'string' }, date: { type: 'string' }, by: { type: 'string' }, draft: { type: 'string' }, id: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
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
    case 'xhs-draft-save': {
      // 内容助理写完一篇用它存：内容页里一篇草稿 + 知识库一份作品。对话里只给标题、一句说明和位置
      const raw = o.draft ?? (o.file ? readFileSync(o.file, 'utf8') : '')
      if (!raw.trim()) throw new Error('要用 --draft 给稿件（JSON），或 --file 指定稿件文件')
      let input: unknown
      try { input = JSON.parse(raw) } catch { throw new Error('稿件不是合法的 JSON：title、summary、cover_text、pages、body、tags') }
      const r = saveWork(input, { id: o.id, by: o.by, actor: 'Codex' })
      print(r, `存好了：《${r.title}》（草稿，第 ${r.version} 版）\n${r.summary}\n在：${r.where}\n打开预览：workbench_open，kind 写 xhs-piece，id 写 ${r.id}`)
      return 0
    }
    default:
      throw new Error(`小红书内容中心没有「${positionals[0]}」这个命令。\n${HELP}`)
  }
}

export const xhsCli: ModuleCli = { help: HELP, run }
