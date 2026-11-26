// 小红书内容中心的命令行（module.json 的 server.cli；写 xhs 就认 xhs 和 xhs- 开头的）。和网页走同一套规则，操作人记 Codex。
//   node server/cli.ts xhs [--json]
//   node server/cli.ts xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
//   node server/cli.ts xhs-notes-import --yes
//   node server/cli.ts xhs-draft-save --draft <json> | --file <json 文件> [--id <内容编号>] [--by "内容助理 小红"]
//   node server/cli.ts xhs-topic-add --title 标题 [--angle 角度] [--reason 一句说明] [--by 助理名字]
//   node server/cli.ts xhs-image-add --id <内容编号> --file <图片> [--page 0] [--by 助理名字]
//   node server/cli.ts xhs-pieces [--q 关键词] [--status 选题|草稿|定稿|已发布] [--by 助理名字] [--json]
// 小红书助理怎么用这几条：Skill 的 references/助理用内容工作台.md（约定 11.13）
// 归属：小红书内容模块。
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import type { ModuleCli } from '../../module-types.ts'
import * as content from './service.ts'
import { addTopics } from './topics.ts'
import { reimportNotes } from './notes-import.ts'
import { saveWork } from './works.ts'
import { addImage } from './chat-image.ts'
import { findPieces } from './finder.ts'

const HELP = `  xhs                                小红书：今天发什么、今天的选题、近两周排期
  xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
                                     把小红书选题写进内容中心的灵感池（JSON 数组，或含 <topics>…</topics> 的回复原文；同名的跳过）
  xhs-notes-import --yes             笔记数据：字段对照确认完后，按对照把导入文件夹里最新那份笔记数据表导进来（能在导入记录里撤销）
  xhs-draft-save --draft <json> | --file <json 文件> [--id <内容编号>] [--by "内容助理 小红"]
                                     内容助理写完一篇：存成内容页里的草稿（写稿中），知识库里存一份作品（状态：草稿）。
                                     json 写 title、summary（一句说明）、cover_text、pages（每张图上的字，第一张是封面）、body、tags、
                                     sources（用到的知识库文件，如 11-产品/白茶饼.md）。
                                     改稿带 --id：同一篇存新版本（也能写到 xhs-topic-add 存的选题下面）。只回标题、一句说明、位置和打开方式（xhs-piece），正文不回
  xhs-topic-add --title 标题 [--angle 角度] [--reason 一句说明] [--by 助理名字]
                                     存一个选题（进内容页的灵感池；同名的不重复存，回已有那篇的编号）。回编号和打开方式
  xhs-image-add --id <内容编号> --file <图片路径> [--page 0] [--by 助理名字]
                                     把一张图放进某一篇：--page 0 是封面（默认），1、2…… 是第几张内页。图复制进工作台素材，原图不动；存成新的一版
  xhs-pieces [--q 关键词] [--status 选题|草稿|定稿|已发布] [--by 助理名字] [--json]
                                     列出、找到某一篇（最近动过的在前，最多 30 条）：编号、标题、阶段、第几版、谁做的、网页地址`

type R = Record<string, unknown>
const line = (xs: R[], f: (x: R) => string) => (xs.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- （无）')

function run(argv: string[]): number {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { json: { type: 'boolean' }, yes: { type: 'boolean' }, file: { type: 'string' }, date: { type: 'string' }, by: { type: 'string' }, draft: { type: 'string' }, id: { type: 'string' }, title: { type: 'string' }, angle: { type: 'string' }, reason: { type: 'string' }, page: { type: 'string' }, q: { type: 'string' }, status: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
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
      print({ ...r, path: `/content/studio/${r.id}` }, `存好了：《${r.title}》（草稿，第 ${r.version} 版）\n${r.summary}\n在：${r.where}\n打开预览：workbench_open，kind 写 xhs-piece，id 写 ${r.id}（网页地址 /content/studio/${r.id}）`)
      return 0
    }
    case 'xhs-topic-add': {
      // 助理存一个选题（约定 11.13）：同名的不重复存，回已有那篇
      const title = (o.title ?? '').trim()
      if (!title) throw new Error('要用 --title 写选题')
      const by = (o.by ?? '').trim() || 'Codex'
      const r = addTopics([{ title, angle: o.angle, reason: o.reason, source: '自己想的' }], { by, actor: 'Codex' })
      const hit = r.added[0] ?? findPieces({ q: title, limit: 5 }).find((p) => p.title === title)
      if (!hit) throw new Error(`没存上：${r.skipped.join('；')}`)
      const data = { id: hit.id, title: hit.title, existed: !r.added.length, by, open: { kind: 'xhs-piece', id: hit.id }, path: `/content/studio/${hit.id}` }
      print(data, `${data.existed ? '这个选题已经有了' : '存好了选题'}：《${hit.title}》（编号 ${hit.id}）\n写稿：xhs-draft-save --id ${hit.id} --draft …\n打开：workbench_open，kind 写 xhs-piece，id 写 ${hit.id}（网页地址 /content/studio/${hit.id}）`)
      return 0
    }
    case 'xhs-image-add': {
      if (!o.id || !o.file) throw new Error('要用 --id 指定哪一篇、--file 指定图片')
      const r = addImage(o.id, o.file, { page: o.page === undefined ? 0 : Number(o.page), by: (o.by ?? '').trim() || 'Codex', what: '助理放进来的图' })
      print(r, `放好了：《${r.title}》的${r.where}换成了这张图（存成第 ${r.version} 版，旧版留着）\n打开：workbench_open，kind 写 xhs-piece，id 写 ${r.id}（网页地址 ${r.path}）`)
      return 0
    }
    case 'xhs-pieces': {
      const list = findPieces({ q: o.q, status: o.status, by: o.by })
      print(list, list.length ? list.map((p) => `- ${p.id}｜${p.title}｜${p.stage}${p.version ? `（第 ${p.version} 版）` : ''}｜${[...new Set([p.by, ...p.authors])].join('、')}｜${p.day}｜${p.path}`).join('\n') : '没找到（换个关键词，或去掉 --status / --by 再找）')
      return 0
    }
    default:
      throw new Error(`小红书内容中心没有「${positionals[0]}」这个命令。\n${HELP}`)
  }
}

export const xhsCli: ModuleCli = { help: HELP, run }
