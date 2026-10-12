// 经营模块的命令行（给 Codex 用）：读早报和异常、写回早报、给异常写建议和处理状态、看日报设置。归属：经营模块。
// 由 server/cli.ts 转过来：命令名以 biz- 开头的都在这里处理，参数也在这里解析。写入都记在“最近改动”里。
//
//   biz-report [--date 日期]                         看某天的经营早报（默认最新一份）
//   biz-report-set <正文> | --file 早报.md [--date 日期] [--title 标题] [--at 2026-10-27T07:55] [--method 定时任务|命令行]
//                                                    写回一份早报；同一天已有就替换。正文按“## 昨天怎么样 / ## 哪里不对劲 / ## 可能的原因 / ## 建议”写
//   biz-anomalies                                    现在的异常（带处理状态、证据摘要），写早报前先看
//   biz-anomaly-set <异常ID> [--status 待处理|处理中|已处理] [--owner 谁跟] [--note 处理记录] [--suggest 建议 …] [--append] [--method 定时任务]
//   biz-config                                       日报设置：看哪些指标、跟谁比、多少算异常、写多长
import { parseArgs } from 'node:util'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { latestReport, listReports, setReport } from './reports.ts'
import { anomalyDetail, listAnomalies, setAnomaly } from './anomaly.ts'
import { getConfig, METRIC_LABEL, rulesText } from './config.ts'

const HELP = `经营模块的命令（在知识库根目录运行 node 工作台/程序/server/cli.ts <命令>）：
  biz-report [--date 日期]                  看经营早报（默认最新一份）
  biz-report-set <正文> | --file 早报.md    写回一份早报（同一天已有就替换）
      [--date 2026-10-26] 写的是哪天的数，默认最近有数据的一天
      [--title 标题] [--at 2026-10-27T07:55] 几点写好的 [--method 定时任务|命令行]
      正文按四段写：## 昨天怎么样 / ## 哪里不对劲 / ## 可能的原因 / ## 建议；每段第一行写一句完整的话（网页卡片只放这一句）
  biz-anomalies                             现在的异常和处理状态（写早报前先看）
  biz-anomaly-set <异常ID> [--status 待处理|处理中|已处理] [--owner 谁跟] [--note 处理记录]
      [--suggest "建议一" --suggest "建议二"]  写建议（默认替换这条异常原来的建议）
      [--append]                              新建议加在原来的后面，不替换
      [--method 定时任务]                     定时任务写的，网页上标“Codex 定时任务”
  biz-config                                日报设置
规则：数字只用工作台里的；原因要写数据依据；涉及价格、出价、发货方式的只写建议，不替老板定。
演示写回过以后想恢复预置的早报和建议：在 工作台/程序/ 下运行 node server/seed/index.ts --only biz（会把异常的处理状态一起恢复）。`

type R = Record<string, unknown>

/** 返回退出码；出错时打印“没办成：…”（和 server/cli.ts 的写法一致），不抛堆栈 */
export function runBizCli(argv: string[]): number {
  try {
    return run(argv)
  } catch (err) {
    const e = err as { issues?: { path: (string | number)[]; message: string }[]; message: string; code?: string }
    // 命令行参数写错时 node 给的是英文，换成中文说
    const arg = (e.message.match(/'(-{1,2}[^' ]+)/)?.[1] ?? '')
    const parse: Record<string, string> = {
      ERR_PARSE_ARGS_UNKNOWN_OPTION: `不认识的参数 ${arg}，运行 biz-report --help 看能写哪些`,
      ERR_PARSE_ARGS_INVALID_OPTION_VALUE: `参数 ${arg} 后面要写值`,
      ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL: '多写了一段文字：有空格的内容要用引号包起来',
    }
    const msg = e.code && parse[e.code] ? parse[e.code] : e.issues ? e.issues.map((i) => i.message).join('；') : e.message
    console.error(`没办成：${msg}`)
    return 1
  }
}

function run(argv: string[]): number {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, date: { type: 'string' }, file: { type: 'string' }, title: { type: 'string' },
      at: { type: 'string' }, method: { type: 'string' }, status: { type: 'string' }, owner: { type: 'string' }, note: { type: 'string' },
      suggest: { type: 'string', multiple: true }, append: { type: 'boolean' },
    },
  })
  const [cmd, a1] = positionals
  const print = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
  const by = o.method === '定时任务' ? 'Codex 定时任务' : 'Codex'
  if (o.help) { console.log(HELP); return 0 }

  switch (cmd) {
    case 'biz-report': {
      const r = o.date ? listReports(60).find((x) => x.date === o.date) : latestReport()
      if (!r) { print(null, o.date ? `${o.date} 还没有早报` : '还没有早报'); return 0 }
      print(r, `# ${r.title}\n（${r.author} ${r.written_at.replace('T', ' ')} 写，方式：${r.method}）\n\n${r.body}`)
      return 0
    }
    case 'biz-report-set': {
      const body = o.file ? readBody(o.file) : a1
      if (!body) throw new Error('没有正文：直接写在命令后面，或者用 --file 指定一个 Markdown 文件')
      const method = o.method === '定时任务' ? '定时任务' : '命令行'
      const r = setReport({ body, date: o.date, title: o.title, written_at: o.at, method, author: by }, by)
      print(r, `已写回：${r.title}（${r.author} ${r.written_at.slice(11)} 写，${r.sections.length} 段）`)
      return 0
    }
    case 'biz-anomalies': {
      const { date, active, history } = listAnomalies()
      const line = (a: R) => `- [${a.status}] ${a.id}：${a.title}。${a.detail}${a.cause ? `；线索：${a.cause}` : ''}${a.owner ? `（${a.owner}在跟）` : ''}`
      const quiet = history.filter((a) => a.quiet)
      const done = history.filter((a) => !a.quiet)
      print({ date, active, history }, [`# 经营异常（数据截至 ${date ?? '—'}；规则：${rulesText(getConfig())}）`, active.length ? active.map((a) => line(a as unknown as R)).join('\n') : '- 现在没有异常',
        ...(quiet.length ? ['\n还没处理完、但按现在的阈值不报了：', ...quiet.map((a) => line(a as unknown as R))] : []),
        `\n处理过的旧异常 ${done.length} 条（--json 看全部）`].join('\n'))
      return 0
    }
    case 'biz-anomaly-set': {
      if (!a1) throw new Error('要写异常 ID，例如 refund_xhs；先运行 biz-anomalies 看有哪些')
      const patch: R = {}
      if (o.status) patch.status = o.status
      if (o.owner !== undefined) patch.owner = o.owner
      if (o.note !== undefined) patch.note = o.note
      if (o.suggest?.length) { patch.suggestions = o.suggest; if (o.append) patch.append = true }
      if (!Object.keys(patch).length) throw new Error('没有要改的：加 --status、--owner、--note 或 --suggest')
      setAnomaly(a1, patch, by)
      const d = anomalyDetail(a1)
      print(d, `已更新：${d.title}（${d.status}${d.owner ? `，${d.owner}跟` : ''}${d.suggestions.length ? `，建议 ${d.suggestions.length} 条` : ''}）`)
      return 0
    }
    case 'biz-config': {
      const c = getConfig()
      print(c, [`看这些指标：${c.metrics.map((m) => METRIC_LABEL[m]).join('、')}`, `跟谁比：${c.compare.map((x) => (x === 'prev' ? '前一天' : '上周同一天')).join('、')}`,
        `算异常：${rulesText(c)}`,
        `写多长：${c.length}；几点写：${c.write_at}（这里只是记下来，真正几点跑要在 Codex 的定时任务里改）`, `最近一次改：${c.updated_by ?? '—'} ${c.updated_at ? stamp(c.updated_at) : ''}`].join('\n'))
      return 0
    }
    default:
      console.log(HELP)
      return cmd ? 1 : 0
  }
}

/** ISO 时间换成本地的“2026-10-20 21:40” */
function stamp(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 读早报文件：只认 .md / .txt，最多 64KB */
function readBody(file: string) {
  const p = resolve(process.cwd(), file)
  if (!/\.(md|txt)$/i.test(p)) throw new Error('早报文件要是 .md 或 .txt')
  if (statSync(p).size > 64 * 1024) throw new Error('早报文件太大了（超过 64KB）')
  return readFileSync(p, 'utf8')
}

