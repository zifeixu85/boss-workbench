// 给 Codex 用的命令行：和网页走同一套业务规则，不直接写 SQL。
// 在知识库根目录运行：node 工作台/程序/server/cli.ts <命令> [参数]
// 加 --json 输出机器可读结果。所有写入都记在“最近改动”里，操作人记为 Codex。
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import * as clients from './services/clients.ts'
import * as schedule from './services/schedule.ts'
import * as projects from './services/projects.ts'
import * as money from './services/money.ts'
import * as home from './services/today.ts'
import * as modules from './services/modules.ts'
import { applyPlan } from './services/apply.ts'
import { checkHome } from '../shared/home.ts'
import * as crm from './modules/crm/service.ts'
import * as crmAct from './modules/crm/actions.ts' // 大客户模块（E5）：改阶段、下次跟进、答应的事、关怀
import * as crmEx from './modules/crm/extract.ts'
import { careList } from './modules/crm/care.ts'
import { listInbox } from './modules/crm/materials.ts'
import * as biz from './modules/biz/service.ts'
import * as content from './modules/content/service.ts'
import * as dataSources from './modules/data/service.ts'
import { addTopics } from './modules/content/topics.ts'
import { writeSnapshots } from './snapshot.ts'
import { backupDatabase, open } from './db.ts'
import { today, addDays, dayOf } from './services/common.ts'
import { now as clockNow } from './clock.ts'
import { REMIND_HELP, isRemindCommand, runRemindCli } from './reminders/cli.ts'

const ACTOR = 'Codex' as const
const HELP = `用法：node 工作台/程序/server/cli.ts <命令> [参数] [--json]

查看
  today                              今日概况：各平台昨天卖得怎样和异常、今天该跟进的大客户、小红书今天发什么、日程、待办
  biz [--date 日期]                  某天各渠道的成绩单和异常（默认昨天）
  xhs                                小红书：今天发什么、今天的选题、近两周排期
  sources                            数据源状态（哪个没导进来、哪个超时）
  clients                            客户列表
  client <客户>                      某个客户的全部信息（客户可写名字，如 澜拓科技、许国平）
  todos                              未完成的待办
  events [--from 日期] [--to 日期]    日程（默认今天起 7 天）
  projects                           项目和风险
  receivables                        应收款
写入（进内容先拆再问：材料里的待办问清谁做、哪天前，答应的事、进展、里程碑都拆开写；一张清单确认后可以用 apply 一次写入）
  log <客户> <内容> [--date 日期] [--channel 微信] [--step 下一步] [--next 下次跟进日期]
    例：log 澜拓科技 "电话聊了春节茶礼，人数下周给（待确认）" --next 2026-11-03 --step "出两版春节方案"
  client-add <称呼> [--label 补充说明] [--stage 阶段] [--source 来源] [--next 下次跟进] [--kb 知识库里的客户文件] [--note 备注]
  project-add <名称> [--stage 筹备|进行中|收尾|已完成|暂停] [--due 截止] [--owner 负责人] [--goal 想达到什么] [--step 下一步]
              [--client 客户] [--kb 06-项目/某项目.md] [--milestone "2026-11-05 四平台上线" …（可写多个）]
  client-set <客户> [--next 日期] [--note 备注]    （改阶段用下面的 stage，要写原因）
  todo-add <标题> [--owner 谁做] [--due 日期] [--time 15:30] [--client 客户] [--project 项目] [--priority 紧急|重要|普通] [--status 进行中|等别人] [--source 从哪来] [--note 备注]
                                     --owner 不写 = 你自己做；写团队里的人名；在等对方写 --owner 对方 --status 等别人
                                     --time 到期时间：到期前 1 小时提醒；--in 5 = 今天、5 分钟后到期（试提醒用）
  todo-set <待办ID> [--status 待办|进行中|等别人|完成|取消] [--due 日期] [--time 15:30|none] [--owner 谁做|none]
  event-add <标题> --start 2026-10-08T15:00 [--end ...] [--kind 会面] [--client 客户] [--location 地点]
  collect <应收ID> <金额(万)> [--date 日期]
  inbox <内容> [--kind 随手记|材料|后台] [--why AI 的判断] [--suggest 建议去向] [--client 客户] [--project 项目] [--from 原件路径]
                                     AI 放进来的一律写 --why 和 --suggest：这是什么、建议怎么办，不只放原文
  inbox-done <收件箱ID> --result "处理成什么了"
  promise-add <客户> <答应了什么> [--to 给谁] [--due 哪天前]      记一件答应的事（谁答应的默认是你）
  project-set <项目> [--stage 进行中|收尾|暂停…] [--step 下一步] [--waiting 在等谁|none] [--due 截止]
  milestone-add <项目> "2026-12-20 年会"                    加一个里程碑（关键日期）
  apply <清单.json> [--yes]          一张清单一次写入：不加 --yes 是预演（照样检查，什么都不留）；加 --yes 才写。中间哪步不行，整张都不写
                                     清单格式见 server/services/apply.ts 开头
  settings-set [--owner 称呼] [--business 店名或工作台名称] [--xhs 小红书账号名] [--theme jade|wood|navy|mono|night] [--nav simple|complex|top]
               [--modules clients,biz|all] [--home projects,inbox,clients]
                                     改设置（搭建时按知识库写老板的称呼、店名、小红书账号名、配色、导航）
                                     --modules 只打开这几个模块（基础版：今日、待办与日程、项目、收件箱、知识库、设置一定开着；打开经营或内容会自动带上数据源与导入）；all = 全部打开
                                     --home 今日页顶上的重点卡，按老板“最想先看到”排，最多 3 张：projects 项目、inbox 收件箱、clients 客户、sales 经营、xhs 小红书
  modules [--on 模块id,…] [--off 模块id,…]
                                     看每个模块开没开；--on 打开、--off 收起（只从导航、今日页、提醒里拿掉，代码和数据都留着）
  snapshot                           导出只读快照到 工作台/快照/
  backup                             改功能、换数据前先备份数据库：存到数据库旁边的 备份/workbench-日期时间.db
${REMIND_HELP}
大客户（客户详情加深，E5）
  materials                          知识库收件箱里的新材料：是谁的、提取过没有
  extract <收件箱文件> [--client 客户]  让 Codex 提取一份新材料（最多等 150 秒），结果“待确认”，到网页 /clients/extract 确认后才写入
  stage <客户> <阶段> --reason 原因     改阶段（留新旧值和原因）。“考虑一下”不算往前走
  follow <客户> <日期|none> [--step 下一步] [--reason 原因]   改下次跟进，自动建 / 改 / 取消跟进待办
  promise-done <答应的事ID> --reason 怎么做到的            答应的事标已兑现
  care [--days 30]                   接下来该关心谁：生日、立冬、太久没联系，每人一条草稿（写明谁写的）
  care-set <关怀ID> [--message 新草稿] [--status 已送出|不做]   改关怀草稿、标已发
  care-add <客户> --occasion 立冬问候 --message "草稿" [--date 日期] [--gift 送什么] [--by 定时任务]   存一条关怀草稿（写明谁写的）
  extract-undo <提取ID> --yes        撤销一次提取写入；crm-reset --save 演示前存演示起点，--yes 排练完退回（详细用法：crm-reset --help）
  xhs-topics-add --file <json> [--date 日期] [--by "Codex 定时任务"]
                                     把小红书选题写进内容中心的灵感池（JSON 数组，或含 <topics>…</topics> 的回复原文；同名的跳过）
经营（经营模块，详细用法：biz-report --help）
  biz-report [--date 日期]            看经营早报（默认最新一份）
  biz-report-set <正文> | --file 早报.md [--date 日期] [--at 2026-10-27T07:55] [--method 定时任务]   写回经营早报
  biz-anomalies                      现在的经营异常和处理状态
  biz-anomaly-set <异常ID> [--status 处理中] [--owner 晓雯] [--note 处理记录] [--suggest 建议 …]
  biz-config                         日报设置（看哪些指标、多少算异常）
数据源与导入（数据源模块，详细用法：import-help）
  import-check <文件.csv>             认出是哪家的表、对字段、预览（只读）
  import <文件.csv> --yes             导入（先 import-check 给老板看，确认后再加 --yes）；import-undo <批次ID> --yes 撤销
  import-rules / import-runs / import-samples   导入规则 / 导入记录 / 示例数据（clear、restore 清掉或恢复）
规则：听不准的人名、金额先问老板，或在内容里标“（待确认）”；不要替老板编造金额和结论。`

// 数据源与导入模块的命令（import 开头）交给模块文件夹处理，参数也由它解析（数据源模块 10-10 追加）
if (process.argv[2] === 'import' || process.argv[2]?.startsWith('import-')) {
  await import('./modules/data/cli.ts')
  process.exit(process.exitCode ?? 0)
}

// 大客户模块的命令（care-add、extract-undo、crm-reset；第三轮起 stage、follow、promise-done、care-set 和带 --stage 的 client-set 也转过去：
// 改阶段一律要写原因，报错不带字段名）交给模块文件夹处理，参数也由它解析（大客户模块 10-10 追加）
{
  const { isCrmCommand, runCrmCli } = await import('./modules/crm/cli.ts')
  if (isCrmCommand(process.argv.slice(2))) process.exit(runCrmCli(process.argv.slice(2)))
}

// 提醒的命令（reminders、remind- 开头）交给 reminders/cli.ts（公共，2026-10-12 加）
if (isRemindCommand(process.argv.slice(2))) {
  try { process.exit(await runRemindCli(process.argv.slice(2))) } catch (err) { console.error(`没办成：${(err as Error).message}`); process.exit(1) }
}

// 经营模块自己的命令（biz- 开头）交给模块文件夹处理，参数也由它解析（经营模块 10-10 追加）
if (process.argv[2]?.startsWith('biz-')) {
  const { runBizCli } = await import('./modules/biz/cli.ts')
  process.exit(runBizCli(process.argv.slice(2)))
}

// 底座审查 #14：参数写错（不认识的 --phone、--due 后面没写值）不要甩 Node 的报错堆栈，说人话并给出帮助
function parseCli() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        json: { type: 'boolean' }, date: { type: 'string' }, channel: { type: 'string' }, step: { type: 'string' }, next: { type: 'string' },
        stage: { type: 'string' }, note: { type: 'string' }, due: { type: 'string' }, client: { type: 'string' }, priority: { type: 'string' },
        status: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, kind: { type: 'string' }, location: { type: 'string' },
        from: { type: 'string' }, to: { type: 'string' }, reason: { type: 'string' }, days: { type: 'string' }, message: { type: 'string' },
        label: { type: 'string' }, source: { type: 'string' }, help: { type: 'boolean', short: 'h' },
        file: { type: 'string' }, by: { type: 'string' }, home: { type: 'string' },
        kb: { type: 'string' }, owner: { type: 'string' }, goal: { type: 'string' }, milestone: { type: 'string', multiple: true },
        project: { type: 'string' }, business: { type: 'string' }, theme: { type: 'string' }, nav: { type: 'string' }, xhs: { type: 'string' },
        time: { type: 'string' }, in: { type: 'string' }, modules: { type: 'string' }, on: { type: 'string' }, off: { type: 'string' },
        why: { type: 'string' }, suggest: { type: 'string' }, result: { type: 'string' }, waiting: { type: 'string' }, yes: { type: 'boolean' },
      },
    })
  } catch (err) {
    const e = err as { code?: string; message: string }
    const name = e.message.match(/'(-[^' ]+)/)?.[1] ?? ''
    const why = e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? `不认识的参数 ${name}`
      : e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' ? `参数 ${name} 后面要写值`
      : e.message
    console.error(`没办成：${why}。下面是全部命令和参数：\n`)
    console.error(HELP)
    process.exit(1)
  }
}
const { values: o, positionals } = parseCli()
const [cmd, a1, a2] = positionals
const clientId = (q?: string) => (q ? clients.findClient(q).id : undefined)

/** 模块开关的一张表：开 / 收起、名字、id */
function moduleText(r: ReturnType<typeof modules.list>) {
  const rows = r.modules.map((m) => `- ${m.on ? '开着' : '收起'}  ${m.name}（${m.id}）${m.required ? '：一定开着' : m.needs.length ? `：会带上 ${m.needs.join('、')}` : ''}`)
  return [`模块${r.all_on ? '（没单独设过，全部开着）' : ''}：`, ...rows].join('\n')
}
function print(data: unknown, text: string) {
  console.log(o.json ? JSON.stringify(data, null, 2) : text)
}

type R = Record<string, unknown>

/** --in 5：今天（演示模式下是演示日）、现在起 5 分钟后到期。跨过午夜的写明天 */
function inMinutes(v?: string) {
  if (v === undefined) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 24 * 60) throw new Error('--in 写分钟数，1 到 1440 之间，例：--in 5')
  open() // 演示日期存在数据库里，先打开再取“现在”
  const d = new Date(clockNow().getTime() + n * 60000)
  const p = (x: number) => String(x).padStart(2, '0')
  return { due: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}
const line = (xs: R[], f: (x: R) => string) => (xs.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- （无）')

function main() {
  switch (cmd) {
    case 'today': {
      const v = home.overview()
      const sales = v.sales
      const yuan = (n: number | null) => (n == null ? '—' : `${Math.round(n).toLocaleString('zh-CN')} 元`)
      const delta = (n: number | null) => (n == null ? '' : `（比前天 ${n > 0 ? '+' : ''}${n}%）`)
      // 没打开的模块不列（模块开关，见 shared/modules.ts）
      const has = (id: string) => v.modules.includes(id)
      const part = (id: string | string[], lines: string[]) => ([id].flat().some(has) ? lines : [])
      return print(v, [`# ${v.date} 今日`, `最该做的一件事：${v.headline?.title ?? '（无）'}`,
        ...part('biz', [sales ? `\n## 各平台昨天（${sales.date}）：合计 ${yuan(sales.total.gmv)}${delta(sales.total.vs_prev)}` : '\n## 各平台昨天：没有数据',
          sales ? line(sales.channels as R[], (c) => `${c.name} ${yuan(c.gmv as number | null)}${delta(c.vs_prev as number | null)}，退款率 ${c.refund_rate ?? '—'}%，ROI ${c.roi == null ? '—' : Number(c.roi).toFixed(1)}`) : '']),
        ...part(['biz', 'data'], ['\n## 数据异常', line(v.alerts as R[], (a) => `[${a.level}] ${a.title}：${a.detail}${a.cause ? `；${a.cause}` : ''}`)]),
        ...part('clients', ['\n## 今天该跟进的大客户', line(v.key_clients as R[], (c) => `${c.name}（${c.contact ?? ''}）：${(c.reasons as string[]).slice(0, 2).join('；')}${c.next_step ? `。下一步：${c.next_step}` : ''}`)]),
        ...part('content', ['\n## 小红书今天发什么', v.xhs ? line(v.xhs.posts as R[], (p) => `${p.time ?? ''} ${p.title}（${p.status}${p.draft_status ? `，草稿${p.draft_status}` : ''}）`) : '- （内容模块没数据）',
          v.xhs ? `今天的选题 ${v.xhs.topics_total} 个，前三：${(v.xhs.topics as R[]).map((x) => x.title).join('；')}` : '']),
        ...part('tasks', ['\n## 今天的日程', line(v.events as R[], (e) => `${String(e.start).slice(11) || '全天'} ${e.title}`),
          '\n## 今天要做（含已逾期）', line(v.todos.today as R[], (t) => `[${t.id}] ${t.title}（${t.status}，截止 ${t.due}）`)]),
        ...part('clients', ['\n## 该联系了', line(v.follow.due as R[], (c) => `${c.name}（${c.label}）计划 ${c.next_follow}，${Number(c.overdue) > 0 ? `已过 ${c.overdue} 天` : '快到了'}`)]),
        ...part('projects', ['\n## 有风险的项目', line(v.risks as R[], (p) => `${p.name}：${(p.risks as { text: string }[]).map((r) => r.text).join('；')}`)]),
        ...part('clients', [`\n## 钱：应收 ${v.cash.outstanding} 万，其中逾期 ${v.cash.overdue.amount} 万（${v.cash.overdue.count} 笔）`])].filter((x) => x !== '').join('\n'))
    }
    case 'biz': {
      const sm = biz.summary(o.date)
      const al = biz.anomalies(o.date)
      if (!sm) return print(null, '没有经营数据')
      return print({ summary: sm, anomalies: al }, [`# ${sm.date} 各渠道`, line(sm.channels as R[], (c) => `${c.name}：成交 ${c.gmv ?? '—'} 元，订单 ${c.orders ?? '—'}，转化 ${c.conv_rate ?? '—'}%，客单 ${c.aov ?? '—'}，退款率 ${c.refund_rate ?? '—'}%，ROI ${c.roi == null ? '—' : Number(c.roi).toFixed(1)}，比前天 ${c.vs_prev ?? '—'}%`),
        '\n## 异常', line(al as R[], (a) => `[${a.level}] ${a.title}：${a.detail}${a.cause ? `；${a.cause}` : ''}`)].join('\n'))
    }
    case 'xhs': {
      const plan = content.todayPlan()
      const sc = content.schedule() as R[]
      return print({ plan, schedule: sc }, [`# 小红书 ${plan.date}`, `粉丝 ${plan.account.followers}（近 7 天 ${plan.account.followers_7d == null ? '—' : `+${plan.account.followers_7d}`}，数据截至 ${plan.account.stats_through ?? '—'}）`,
        '\n## 今天发', line(plan.posts as R[], (p) => `${p.time ?? ''} ${p.title}（${p.status}）`),
        '\n## 今天的选题', line(content.topics() as R[], (x) => `${x.title}（${x.source}）`),
        '\n## 近两周排期', line(sc, (x) => `${x.date} ${x.time ?? ''} ${x.title}（${x.status}）`)].join('\n'))
    }
    case 'sources': {
      const xs = dataSources.sources() as R[]
      return print(xs, line(xs, (x) => `${x.name}：${x.status}，最近 ${x.last_run_at ?? '—'}，数据截至 ${x.data_through ?? '—'}${x.note ? `。${x.note}` : ''}`))
    }
    case 'clients': {
      const xs = clients.listClients()
      return print(xs, line(xs, (c) => `${c.name}（${c.label ?? ''}）${c.stage}，下次跟进 ${c.next_follow ?? '未定'}，id=${c.id}`))
    }
    case 'client': {
      const d = crm.profile(a1)
      const c = d.client as R & { name: string; label: string | null }
      const yuan = (n: number) => `${Math.round(n).toLocaleString('zh-CN')} 元`
      return print(d, [`# ${c.name}（${c.label ?? ''}）`, `阶段：${c.stage}｜联系人：${c.contact_name ?? '—'} ${c.contact_title ?? ''}｜来源：${c.source ?? '—'}${c.source_detail ? `（${c.source_detail}）` : ''}`,
        `上次联系：${c.last_contact ?? '—'}｜下次跟进：${c.next_follow ?? '—'}｜下一步：${c.next_step ?? '—'}`,
        `累计消费 ${yuan(d.stats.total_spent)}（${d.stats.order_count} 单）`,
        d.kb_note.path ? `背景笔记：${d.kb_note.path}` : d.kb_note.expected ? `背景笔记：知识库里还没有（预期 ${d.kb_note.expected}）` : '',
        '\n## 答应了还没做的', line(d.promises.filter((p) => p.status === '待兑现') as unknown as R[], (p) => `${p.text}${p.due ? `（${p.due} 前）` : ''}`),
        '\n## 沟通记录', line(d.interactions.slice(0, 8) as unknown as R[], (i) => `${i.date} ${i.channel}${i.with_whom ? `·${i.with_whom}` : ''}：${i.summary}${i.concerns ? `【顾虑】${i.concerns}` : ''}`),
        '\n## 偏好与顾虑', line(d.traits as R[], (t) => `${t.kind}：${t.text}`),
        '\n## 重要日子', line(d.dates as unknown as R[], (x) => `${x.next} ${x.label}`),
        '\n## 订单', line(d.orders.slice(0, 6) as unknown as R[], (x) => `${x.date} ${x.item} × ${x.qty} = ${yuan(Number(x.amount))}`),
        '\n## 商机', line(d.deals, (x) => `${x.title} ${x.stage} ${x.amount ?? '?'} 万`),
        '\n## 待办', line(d.todos, (t) => `[${t.id}] ${t.title}（${t.status}）`)].filter((x) => x !== '').join('\n'))
    }
    case 'todos': {
      const xs = schedule.listTodos({ open: true }) as R[]
      return print(xs, line(xs, (t) => `[${t.id}] ${t.title}（${t.status}·${t.priority}${t.due ? `·截止 ${t.due}${t.due_time ? ` ${t.due_time}` : ''}` : ''}${t.client_name ? `·${t.client_name}` : ''}${t.owner ? `·${t.owner}做` : ''}）`))
    }
    case 'events': {
      const from = o.from ?? today()
      const okDay = (v: string) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) && addDays(v.slice(0, 10), 0) === v.slice(0, 10)
      if (!okDay(from) || (o.to && !okDay(o.to))) throw new Error('日期写成 2026-10-27 或 2026-10-27T09:00（要是真有的日子）')
      // 按本地日期往后数 7 天（原来用 toISOString 取日期，凌晨会差一天，底座审查 #6）
      const xs = schedule.listEvents(from, o.to ?? `${addDays(dayOf(from), 7)}T23:59`) as R[]
      return print(xs, line(xs, (e) => `${String(e.start).replace('T', ' ')} ${e.title}（${e.kind}${e.client_name ? `·${e.client_name}` : ''}）`))
    }
    case 'projects': {
      const xs = projects.listProjects() as R[]
      return print(xs, line(xs, (p) => `${p.name}（${p.stage}）下一步：${p.next_step ?? '—'}${(p.risks as unknown[]).length ? `｜风险：${(p.risks as { text: string }[]).map((r) => r.text).join('；')}` : ''}`))
    }
    case 'receivables': {
      const xs = money.listReceivables().filter((r) => r.status !== '已收清')
      return print(xs, line(xs, (r) => `[${r.id}] ${r.client_name ?? ''} ${r.milestone} 未收 ${r.outstanding} 万，${r.due} 到期（${r.status}）`))
    }
    case 'log': {
      const r = clients.logInteraction({ client_id: clientId(a1), date: o.date ?? today(), channel: o.channel ?? '微信', summary: a2, next_step: o.step, next_follow: o.next }, ACTOR)
      return print(r, `已记录：${r.client.name} ${o.date ?? today()}「${a2}」${o.next ? `，下次跟进 ${o.next}` : ''}`)
    }
    case 'client-add': {
      const c = clients.createClient({ name: a1, label: o.label, stage: o.stage, source: o.source, next_follow: o.next, note: o.note, kb_path: o.kb }, ACTOR)
      return print(c, `已新建客户：${c.name}（id=${c.id}）`)
    }
    case 'project-add': {
      // 集成 10-12 加：搭建时从知识库 06-项目/ 导入项目（老板工作台 Skill 的搭建步骤第 3 步）
      const miles = (o.milestone ?? []).map((x) => {
        const m = x.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)
        if (!m) throw new Error(`里程碑写成 "2026-11-05 四平台上线"（日期 + 空格 + 做什么）：${x}`)
        return { date: m[1], title: m[2] }
      })
      const created = projects.createProject({ name: a1, stage: o.stage, due: o.due, owner: o.owner, goal: o.goal, next_step: o.step, client_id: clientId(o.client), kb_path: o.kb }, ACTOR)
      const r = miles.length ? projects.addMilestones(created.project.id, miles, ACTOR) : created
      return print(r, `已新建项目：${r.project.name}（id=${r.project.id}）${miles.length ? `，${miles.length} 个里程碑` : ''}`)
    }
    case 'client-set': {
      const c = clients.updateClient(a1, { stage: o.stage, next_follow: o.next, note: o.note }, ACTOR)
      return print(c, `已更新：${c.name}，阶段 ${c.stage}，下次跟进 ${c.next_follow ?? '未定'}`)
    }
    case 'todo-add': {
      const soon = inMinutes(o.in)
      const t = schedule.createTodo({ title: a1, due: soon?.due ?? o.due, due_time: soon?.time ?? o.time, client_id: clientId(o.client), project_id: o.project ? projects.getProject(o.project).project.id : undefined, priority: o.priority, status: o.status, note: o.note, owner: o.owner, source: o.source }, ACTOR) as R
      return print(t, `已新增待办 [${t.id}] ${t.title}${t.owner ? `（${t.owner}做）` : ''}${t.due ? `，截止 ${t.due}${t.due_time ? ` ${t.due_time}（到期前 1 小时提醒）` : ''}` : ''}`)
    }
    case 'todo-set': {
      const t = schedule.updateTodo(a1, { status: o.status, due: o.due, due_time: o.time === 'none' ? null : o.time, owner: o.owner === 'none' ? null : o.owner }, ACTOR) as R
      return print(t, `已更新待办 [${t.id}] ${t.title}：${t.status}${t.due ? `，截止 ${t.due}${t.due_time ? ` ${t.due_time}` : ''}` : ''}`)
    }
    case 'event-add': {
      const e = schedule.createEvent({ title: a1, start: o.start, end: o.end, kind: o.kind, location: o.location, client_id: clientId(o.client), all_day: !String(o.start ?? '').includes('T') }, ACTOR) as R
      return print(e, `已新增日程 ${String(e.start).replace('T', ' ')} ${e.title}`)
    }
    case 'collect': {
      const r = money.collect({ receivable_id: a1, amount: Number(a2), date: o.date ?? today() }, ACTOR)
      return print(r, `已登记回款 ${a2} 万`)
    }
    case 'inbox': {
      const r = home.addInbox({ text: a1, source: 'Codex', kind: o.kind, judgement: o.why, suggest: o.suggest, client_id: clientId(o.client),
        project_id: o.project ? projects.getProject(o.project).project.id : undefined, origin: o.from }, ACTOR)
      return print(r, `已放进收件箱${o.why ? '（带上了判断）' : ''}`)
    }
    case 'inbox-done': {
      if (!o.result) throw new Error('要写 --result：这条处理成什么了（比如“已拆进云杉物流的往来和待办”）')
      return print(home.doneInbox(a1, o.result, ACTOR), `收件箱这条处理完了：${o.result}`)
    }
    case 'promise-add': {
      const r = crmAct.addPromise({ client_id: clientId(a1), text: a2, due: o.due, to_whom: o.to }, ACTOR) as R
      return print(r, `已记下答应的事：${String(r.text)}${r.due ? `，${String(r.due)} 前` : ''}`)
    }
    case 'project-set': {
      const patch = Object.fromEntries(Object.entries({ stage: o.stage, next_step: o.step, waiting_on: o.waiting === 'none' ? null : o.waiting, due: o.due }).filter(([, v]) => v !== undefined))
      const r = projects.updateProject(a1, patch, ACTOR)
      return print(r, `已更新项目「${r.project.name}」：阶段 ${r.project.stage}${r.project.next_step ? `，下一步 ${r.project.next_step}` : ''}${r.project.waiting_on ? `，在等 ${r.project.waiting_on}` : ''}`)
    }
    case 'milestone-add': {
      const items = [a2, ...(o.milestone ?? [])].filter(Boolean).map((x) => {
        const m = String(x).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)
        if (!m) throw new Error(`里程碑写成 "2026-12-20 年会"（日期 + 空格 + 做什么）：${x}`)
        return { date: m[1], title: m[2] }
      })
      const r = projects.addMilestones(a1, items, ACTOR)
      return print(r, `项目「${r.project.name}」加了 ${items.length} 个里程碑`)
    }
    case 'apply': {
      if (!a1) throw new Error('要写清单文件：apply <清单.json> [--yes]')
      let plan: unknown
      try { plan = JSON.parse(readFileSync(a1, 'utf8')) } catch (err) { throw new Error(`读不了清单 ${a1}：${(err as Error).message}`) }
      const r = applyPlan(plan, { yes: !!o.yes, actor: ACTOR })
      const lines = r.steps.map((x) => `${x.n}. ${x.text}`)
      return print(r, r.done ? [`已写入 ${r.steps.length} 步：`, ...lines].join('\n')
        : [`预演通过，会写这 ${r.steps.length} 步（这次什么都没写）：`, ...lines, '老板确认后，同一条命令加 --yes 再跑一次。'].join('\n'))
    }
    case 'settings-set': {
      // 搭建时把老板的称呼、店名（也是工作台名称）、小红书账号名、配色、导航写进设置（网页“设置”页同一套规则）。
      // 称呼、店名、账号名会用在网页文案、给 Codex 的提示词和小红书手机预览里；--xhs "" 清掉账号名，改用店名
      // --modules：只打开确认页里选中的模块（模块开关，见 shared/modules.ts）
      if (![o.owner, o.business, o.xhs, o.theme, o.nav, o.modules, o.home].some((v) => v !== undefined)) throw new Error('要写改什么：--owner、--business、--xhs、--theme、--nav、--modules 或 --home')
      if (o.home !== undefined) { const h = checkHome(o.home); if (h.unknown.length) throw new Error(`首页没有这几张卡：${h.unknown.join('、')}（能用的：projects、inbox、clients、sales、xhs）`) }
      const m = o.modules !== undefined ? modules.setModules(o.modules.trim() === 'all' ? 'all' : o.modules, ACTOR) : null
      const rest = [o.owner, o.business, o.xhs, o.theme, o.nav, o.home].some((v) => v !== undefined)
      const r = rest ? home.saveSettings({ owner: o.owner, business: o.business, xhs_name: o.xhs, theme: o.theme, nav_mode: o.nav, home: o.home }, ACTOR) : home.getSettings()
      const mText = m ? `\n${moduleText(m)}${m.added.length ? `\n（自动带上：${m.added.join('、')}）` : ''}` : ''
      return print({ ...r, modules_detail: m }, `已改设置：称呼 ${r.owner}，店名 / 工作台 ${r.business}，小红书账号 ${r.xhs}${r.xhs_name ? '' : '（跟店名）'}，配色 ${r.theme}，导航 ${r.nav_mode}${mText}`)
    }
    case 'modules': {
      const split = (v?: string) => (v ? v.split(/[\s,，、]+/).map((x) => x.trim()).filter(Boolean) : [])
      const on = split(o.on), off = split(o.off)
      const r = on.length || off.length ? modules.toggleModules(on, off, ACTOR) : modules.list()
      return print(r, moduleText(r))
    }
    case 'snapshot': {
      const files = writeSnapshots()
      return print(files, `已导出快照：\n${files.map((f) => `- ${f}`).join('\n')}`)
    }
    case 'backup': {
      // 数据库备份：用 VACUUM INTO 存一份完整的副本（工作台开着也能备份，不会漏掉还在 -wal 里的改动）
      const file = backupDatabase()
      return print({ file }, `已备份数据库：${file}`)
    }
    case 'xhs-topics-add': {
      // 小红书内容中心（E3）：每天早上的选题定时任务用它写回灵感池
      if (!o.file) throw new Error('要用 --file 指定选题文件（JSON 数组，或含 <topics>…</topics> 的回复）')
      const raw = readFileSync(o.file, 'utf8')
      const m = raw.match(/<topics>([\s\S]*?)<\/topics>/)
      const list = JSON.parse((m ? m[1] : raw).trim()) as unknown
      const r = addTopics(Array.isArray(list) ? list : (list as { topics?: unknown[] }).topics ?? [], { date: o.date, by: o.by ?? 'Codex 定时任务', actor: ACTOR })
      return print(r, `已写进灵感池 ${r.added.length} 个选题（${r.date}，${r.by}）${r.skipped.length ? `；跳过同名的 ${r.skipped.length} 个：${r.skipped.join('；')}` : ''}${r.added.length ? `\n${r.added.map((x) => `- ${x.title}`).join('\n')}` : ''}`)
    }
    // ───── 大客户（E5）─────
    case 'materials': {
      const xs = listInbox()
      return print(xs, line(xs as unknown as R[], (f) => `${f.path}：${f.client_name ?? '说话人不明'}${f.extraction ? `，提取过（${(f.extraction as R).status}）` : f.in_kb ? '，已整理进知识库' : '，还没提取'}`))
    }
    case 'extract': {
      const files = listInbox()
      const f = files.find((x) => x.path === a1 || x.path.endsWith(`/${a1}`) || x.path.includes(String(a1 ?? '')))
      if (!a1 || !f) throw new Error(`收件箱里找不到“${a1 ?? ''}”。先运行 materials 看有哪些`)
      const x = crmEx.startExtraction({ source_path: f.path, client_id: o.client ? clientId(o.client) : null }, ACTOR)
      console.error(`Codex 正在提取 ${f.path}（最多 ${crmEx.EXTRACT_TIMEOUT_MS / 1000} 秒）…`)
      void crmEx.extractionDone(x.id).then(() => {
        const r = crmEx.getExtraction(x.id)
        if (r.status !== '待确认') { console.error(`没办成：${r.status}，${r.error ?? ''}`); process.exitCode = 1; return }
        const res = r.result!
        print(r, [`# ${r.client?.name ?? '客户待定'} · ${res.date} ${res.channel}（Codex 用时 ${r.elapsed_s} 秒，提取 ID ${r.id}）`, res.summary,
          '\n## 你答应的', line(r.promises as unknown as R[], (p) => `${p.who}答应${p.to_whom}：${p.text}${p.due ? `（${p.due} 前）` : ''}${p.conflict ? `【和判断规则对不上】${p.conflict}` : ''}`),
          `\n## 对方的状态\n${res.their_status}${res.not_decided ? '（还没定，不算成交）' : ''}`,
          '\n## 顾虑', line(res.concerns.map((c) => ({ c })), (c) => String(c.c)),
          '\n## 怎么定（谁拍板、哪天定、在跟谁比）', line(res.signals.map((c) => ({ c })), (c) => String(c.c)),
          '\n## 下一步', line(res.next_steps as unknown as R[], (s2) => `${s2.text}${s2.due ? `（${s2.due}）` : ''}`),
          `\n还没写入。到网页确认：http://127.0.0.1:${process.env.PORT || 4517}/clients/extract?run=${r.id}`].join('\n'))
      })
      return
    }
    case 'stage': {
      const r = crmAct.changeStage(clientId(a1)!, { stage: a2, reason: o.reason }, ACTOR)
      return print(r, `已改阶段：${r.from} → ${r.to}（${o.reason}）`)
    }
    case 'follow': {
      const r = crmAct.setFollow(clientId(a1)!, { next_follow: !a2 || a2 === 'none' ? null : a2, next_step: o.step, reason: o.reason }, ACTOR)
      return print(r, r.next_follow ? `已改下次跟进 ${r.next_follow}，跟进待办 [${r.todo_id}]` : '已清空下次跟进，自动待办取消了')
    }
    case 'promise-done': {
      const r = crmAct.updatePromise(a1, { status: '已兑现', reason: o.reason }, ACTOR) as R
      return print(r, `已标为兑现：${r.text}`)
    }
    case 'care': {
      const xs = careList(Number(o.days) || 30)
      return print(xs, line(xs as unknown as R[], (x) => `${x.date ?? '没定日子'} ${x.client_name}｜${x.reason}｜${x.gift ? `送：${x.gift}｜` : ''}「${x.message ?? ''}」（${x.author}${x.care_id ? `，关怀ID ${x.care_id}` : ''}）`))
    }
    case 'care-set': {
      const r = crmAct.updateCare(a1, { message: o.message, status: o.status }, ACTOR) as R
      return print(r, `已更新关怀：${r.occasion}（${r.status}）`)
    }
    case undefined:
    case 'help':
      return console.log(HELP)
    default:
      // 底座审查 #14：命令写错也说人话（原来不吭声地打印帮助、返回成功）
      throw new Error(`没有「${cmd}」这个命令。全部命令见 node 工作台/程序/server/cli.ts --help`)
  }
}

try {
  if (o.help) console.log(HELP)
  else main()
} catch (err) {
  const e = err as { issues?: { path: (string | number)[]; message: string }[]; message: string }
  // 字段校验的英文提示换成中文（例：stage 只能是 "筹备"|"进行中"…）
  const zh = (m: string) => m.replace(/^Invalid option: expected one of /, '只能是 ').replace(/^Invalid input: expected (\w+), received (\w+)$/, '格式不对')
  console.error(`没办成：${e.issues ? e.issues.map((i) => `${i.path.join('.')} ${zh(i.message)}`).join('；') : e.message}`)
  process.exit(1)
}
