// 个人助理模块的命令（server/cli.ts 把 pa 和 pa- 开头的转到这里）。读的：pa、pa-focus、pa-object、pa-progress、pa-outputs、pa-reports、pa-roles、pa-check、pa-usage、pa-week、pa-report-template；
// 写的：pa-report-template-init（把默认报告模板写进知识库，已有不覆盖）、pa-scan（只读扫描本机对话记录，把元信息存进工作台）、pa-report-add（登记一份写好的报告）、pa-mark（标已看 / 改状态 / 归类）、
// pa-update（在对话里更新一个对象：先预演，老板确认后带 --confirm 原话再写）。认对象用 pa-find。
import { parseArgs } from 'node:util'
import type { ModuleCli } from '../../module-types.ts'
import { focusClasses, roles } from './kb.ts'
import { focusList, focusObject, pendingItems } from './focus.ts'
import { listSessions, markRead, setObject, setStatus, statusCounts } from './store.ts'
import { listOutputs } from './outputs.ts'
import { initReportTemplate, registerReport, reportTemplate, reportView, templateHelp, weekData } from './reports.ts'
import { periodOf, REPORT_KINDS, type ReportKind as Kind } from './report-parse.ts'
import { scan, scannedAt, sources } from './scan.ts'
import { usage } from './usage.ts'
import { tokenText, USAGE_RANGES, type UsageRange } from './usage-calc.ts'
import type { ReportKind } from './report-parse.ts'
import { findObjects, updateObject } from './object-update.ts'
import { kbCheck, kbCheckText } from './check.ts'

const HELP = `  pa [--json]                           个人助理一览：我关注的有哪几类、AI 对话各状态几个、要确认的资料几条
  pa-focus [类名] [--json]              “我关注的”有哪几类；写了类名就列这一类的对象（状态、列表上显示的字段）
  pa-find <名称或别名> [--json]        老板说到的是哪个对象（项目、客户……）：按名称、别名认，给出路径和打开详情用的 open
  pa-object <知识库里的路径> [--json]   一个对象的详情：现在、下一步、时间线（往来记录和 AI 对话）、相关文件
  pa-progress [--status 在等我] [--days 30] [--all] [--json]
                                        本机 AI 对话做到哪了（只有标题、文件夹、时间、状态；状态是推断的）。--all 连子任务、脚本调用也列
  pa-outputs [--kind 图片] [--days 30] [--json]   AI 生成的图片和写出来的文件（只有路径）
  pa-reports [--kind 周报] [--period 2026-W48] [--json]   某一期的报告和这一期的几个数
  pa-roles [--json]                     总助、内容助理、分身、合伙人的角色文件齐不齐、哪天更新的
  pa-check [--json]                     知识库检测：现在能用的页面、要先做升级检查才能用的页面（各缺什么）、下一步说哪一句
  pa-usage [--range today|7d|30d] [--json]   AI 用量：这台电脑上 Codex 对话用了多少 token（新算的、缓存、输出分开），Codex 自己记的额度；Claude Code 的单独一行
  pa-week [--kind 周报] [--period 2026-W48] [--json]   这一期的数（报告里“来源：工作台”的节就用这些）：对话、做完、在等你、产出、token、连续天数、占比，按天、按小时、按对象
  pa-report-template [--kind 周报] [--json]   报告模板：每种报告有哪几节、每节用哪种块和数据、写错的地方（还会列出能用的块和数据名）
  pa-report-template-init               把默认报告模板写进知识库的报告文件夹，让老板在对话里改（已经有了不覆盖）
  pa-scan [--force]                     现在扫一遍本机的 Codex、Claude Code 对话记录（只读；只存元信息，不存正文）
  pa-report-add <路径>                  登记一份写好的报告：文件要先写进知识库 90-日志与报告/日报|周报|月报/，这里检查格式、记下登记时间，报告页就能看到
  pa-update <路径> [--status 收尾] [--now "一两句现在的情况"] [--next "事项 · 截止 · 谁做"]... [--done "要勾掉的下一步"]... [--log "说了什么、定了什么" --channel 微信]
            [--confirm "老板确认的原话"]   在对话里更新一个对象：只改状态、现在、下一步、往来记录。不带 --confirm 是预演（什么都不写），
                                        把会改哪几处列给老板核对；他确认后，同样的参数加 --confirm "他的原话" 再发一次才写。写之前备份原文件
  pa-mark <对话编号> (--read | --status 做完了|auto | --object 路径|auto|none)   标已看、手动改状态、手动归到某个对象（只记在工作台里）`

const local = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}` }

async function runCli(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv
  const { values: o, positionals: a } = parseArgs({ args: rest, allowPositionals: true, options: {
    json: { type: 'boolean' }, status: { type: 'string' }, days: { type: 'string' }, all: { type: 'boolean' }, kind: { type: 'string' }, period: { type: 'string' },
    force: { type: 'boolean' }, read: { type: 'boolean' }, object: { type: 'string' },
    now: { type: 'string' }, next: { type: 'string', multiple: true }, done: { type: 'string', multiple: true }, log: { type: 'string' }, channel: { type: 'string' },
    confirm: { type: 'string' }, range: { type: 'string' }, init: { type: 'boolean' },
  } })
  const print = (data: unknown, text: string) => { console.log(o.json ? JSON.stringify(data, null, 2) : text); return 0 }
  const days = Number(o.days) || 30
  switch (cmd) {
    case 'pa': {
      const f = focusClasses()
      const counts = statusCounts(listSessions({ days }))
      const pending = pendingItems()
      return print({ focus: f, progress: counts, pending: pending.length, scanned_at: scannedAt() }, [
        `我关注的：${f.classes.map((c) => `${c.name}${c.confirmed ? '' : '（待确认）'}`).join('、') || '（还没有）'}${f.problems.length ? `\n  注意：${f.problems.join('；')}` : ''}`,
        `AI 对话（近 ${days} 天，状态是推断的）：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('，')}`,
        `要你确认的资料：${pending.length} 条`, `上次扫描：${scannedAt() ? local(scannedAt()!) : '还没扫过（运行 pa-scan）'}`,
      ].join('\n'))
    }
    case 'pa-focus': {
      if (!a[0]) { const f = focusClasses(); return print(f, f.classes.map((c) => `${c.name}｜${c.folder}｜状态：${c.statuses.map((x) => (c.stageOf?.[x] && c.stageOf[x] !== x ? `${x}（${c.stageOf[x]}）` : x)).join('、')}｜列表上显示：${c.fields.join('、')}｜${c.confirmed ? '已确认' : '待确认'}`).join('\n') || f.problems.join('\n')) }
      const v = focusList(a[0])
      return print(v, v.items.map((i) => `${i.name}（${i.status || '没写状态'}${i.stage && i.stage !== i.status ? ` · ${i.stage}` : ''}）${i.fields.map((x) => `${x.key}：${x.value || '—'}`).join('，')}${i.sessions ? `｜AI 对话 ${i.sessions} 个` : ''}｜${i.path}`).join('\n') || '这一类还没有对象')
    }
    case 'pa-find': {
      if (!a.length) throw new Error('写上老板说的名字，比如 春节茶礼、云杉')
      const v = findObjects(a.join(' '))
      return print(v, v.map((x) => `${x.type}｜${x.name}（${x.status || '没写状态'}）｜${x.path}${x.by === '包含' ? '｜名字只对上一部分，问一句是不是它' : ''}`).join('\n') || '“我关注的”里没有对上的对象')
    }
    case 'pa-update': {
      if (!a[0]) throw new Error('写上对象的路径（pa-find 给的），比如 02-项目/春节茶礼.md')
      const r = updateObject(a[0], { ...(o.status !== undefined ? { status: o.status } : {}), ...(o.now !== undefined ? { now: o.now } : {}), ...(o.next ? { nextAdd: o.next } : {}), ...(o.done ? { nextDone: o.done } : {}), ...(o.log !== undefined ? { log: { channel: o.channel, text: o.log } } : {}) },
        { yes: o.confirm !== undefined, confirmation: o.confirm, actor: 'Codex' })
      const lines = r.changes.map((c) => `- ${c.what}：${c.old ? `${c.old} → ` : ''}${c.new}`)
      return print(r, r.written ? [`写好了：${r.type}「${r.name}」（${r.path}）`, ...lines, r.backup ? `原文件备份在：${r.backup}` : ''].filter(Boolean).join('\n')
        : [`预演（还没写）：${r.type}「${r.name}」会改这几处：`, ...lines, '给老板核对；他确认后，同样的参数加 --confirm "他的原话" 再发一次才写。'].join('\n'))
    }
    case 'pa-object': {
      if (!a[0]) throw new Error('写上对象在知识库里的路径，比如 02-项目/春节茶礼.md')
      const v = focusObject(a[0])
      return print(v, [`# ${v.object.name}（${v.class.name} · ${v.object.status}）`, `现在：${v.object.now || '—'}`, `下一步：${v.object.next.filter((n) => !n.done).map((n) => n.text).join('；') || '—'}`,
        '时间线：', ...v.timeline.slice(0, 12).map((t) => `- ${t.date || '没写日期'}｜${t.kind === 'AI' ? 'AI' : t.sub || '往来'}｜${t.title}`), `相关文件：${v.files_total} 个；相关对话：${v.sessions.length} 个`].join('\n'))
    }
    case 'pa-progress': {
      let list = listSessions({ days, all: o.all })
      if (o.status) list = list.filter((s) => s.status === o.status)
      return print(list, list.map((s) => `[${s.status}] ${s.title}｜${s.object?.name ?? '未归类'}｜${s.tool_name}｜${local(s.last_at)}｜${s.id}`).join('\n') || '没有对话（先运行 pa-scan）')
    }
    case 'pa-outputs': {
      const v = listOutputs({ days, kind: o.kind, limit: 100 })
      return print(v, [`近 ${days} 天：${Object.entries(v.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join('，') || '没有'}`, ...v.items.map((i) => `${i.kind}｜${i.name}｜${i.object?.name ?? '未归类'}｜${i.tool_name}｜${local(i.at)}｜${i.path}`)].join('\n'))
    }
    case 'pa-week': {
      const kind = (o.kind ?? '周报') as Kind
      if (!REPORT_KINDS.includes(kind)) throw new Error(`--kind 只能是 ${REPORT_KINDS.join('、')}`)
      const v = reportView(kind, o.period)
      if (!v.kind) throw new Error('日报、周报、月报都关着。在知识库档案.md 的“报告”表里把要的那种改成“开”')
      const range = periodOf(v.kind, v.period)!
      const d = weekData(range.from, range.to)
      const card = Object.entries(d.cards).map(([k, c]) => `${k} ${c.value === null ? '—' : k === 'token' ? `${tokenText(c.value).value}${tokenText(c.value).unit} token` : `${c.value}${c.unit}`}`).join('，')
      return print({ kind: v.kind, period: v.period, ...d }, [`${v.kind} ${v.period}（${range.from} — ${range.to}）`, card,
        `按对象：${d.series.按对象.map((x) => `${x.label} ${x.value}`).join('、') || '—'}`, d.lists.重复开对话.length ? `一天里开了三个以上对话的：${d.lists.重复开对话.map((x) => `${x.对象} ${x.日期} ${x.对话} 个`).join('、')}` : ''].filter(Boolean).join('\n'))
    }
    case 'pa-report-template':
    case 'pa-report-template-init': {
      // 写进知识库的是单独一条命令（Codex 的读写权限按命令分）；--init 只在命令行里用
      if (cmd === 'pa-report-template' && o.init) throw new Error('写模板用 pa-report-template-init')
      const init = cmd === 'pa-report-template-init'
      const t = init ? initReportTemplate('Codex') : reportTemplate()
      const kinds = (o.kind ? [o.kind] : REPORT_KINDS) as Kind[]
      const head = init ? (('created' in t && t.created) ? `写好了：${t.path}（默认的一套），以后改这份` : `已经有了：${t.path}，没有覆盖`) : t.exists ? `模板：${t.path}` : `还没有模板文件（${t.path}），用的是默认的一套；pa-report-template --init 写进知识库就能改`
      return print({ ...t, help: templateHelp() }, [head, ...kinds.map((k) => `${k}：${t.kinds[k].map((x) => `${x.title}（${x.blocks.join('、')} · ${x.source}${x.data.length ? ` · ${x.data.join('、')}` : ''}${x.who === '分身' ? ' · 分身写' : ''}）`).join('；')}`),
        ...t.problems.map((p) => `要改：${p}`)].join('\n'))
    }
    case 'pa-reports': {
      const v = reportView(o.kind as ReportKind | undefined, o.period)
      if (!v.kind) return print(v, '日报、周报、月报都关着。在知识库档案.md 的“报告”表里把要的那种改成“开”。')
      return print(v, [`${v.kind} ${v.period}（${v.range.from} — ${v.range.to}）`, `AI 对话 ${v.stats.sessions} 个，做完 ${v.stats.done} 件（${v.stats.unread} 件没看），产出 ${v.stats.outputs.total} 个（图 ${v.stats.outputs.images}），用得最多：${v.stats.top?.name ?? '—'}`,
        v.report ? v.report.sections.map((s) => `## ${s.title}\n${s.text}`).join('\n\n') : `这一期还没有${v.kind}`].join('\n'))
    }
    case 'pa-check': {
      const r = kbCheck()
      return print(r, kbCheckText(r))
    }
    case 'pa-usage': {
      const range = (USAGE_RANGES.some((r) => r.key === o.range) ? o.range : '7d') as UsageRange
      if (o.range && range !== o.range) throw new Error(`--range 只能是 ${USAGE_RANGES.map((r) => r.key).join("、")}`)
      const u = usage(range)
      const w = (n: number) => { const t = tokenText(n); return `${t.value}${t.unit}` }
      return print(u, [`${u.label}（${u.from === u.to ? u.to : `${u.from} — ${u.to}`}）Codex 一共 ${w(u.total.all)} token：新算的输入 ${w(u.total.fresh)}，缓存命中 ${w(u.total.cached)}${u.cachedShare !== null ? `（占输入 ${u.cachedShare}%）` : ''}，输出 ${w(u.total.output)}`,
        u.limits ? u.limits.text : 'Codex 的额度：记录里还没有', u.top.length ? `用得最多：${u.top.map((t) => `${t.name} ${w(t.all)}`).join('、')}` : '',
        u.claude ? `Claude Code（单独算，不在上面的总数里）：${w(u.claude.all)}` : '', u.note].filter(Boolean).join('\n'))
    }
    case 'pa-roles': {
      const v = roles()
      return print(v, [...v.roles.map((r) => `${r.kind} · ${r.name}${r.display && r.display !== r.name ? `（${r.display}）` : ''}：${r.files.map((f) => `${f.name}${f.exists ? `（${f.updated}${f.name === '角色' && f.lines !== undefined ? `，正文 ${f.lines} 行` : ''}${f.entries !== undefined ? `，${f.entries} 条${f.undated ? `（${f.undated} 条没带日期）` : ''}` : ''}）` : '（没有）'}`).join('，')}${r.legacy ? '；旧格式' : ''}`), ...v.problems.map((p) => `注意：${p}`)].join('\n') || '还没有角色文件')
    }
    case 'pa-scan': {
      const found = sources()
      let r = await scan({ force: o.force })
      while (r.left > 0) r = await scan({})
      return print(r, [`扫完了：看了 ${r.files} 个记录文件，这次读了 ${r.read} 个，库里现在有 ${r.sessions} 个对话，用了 ${(r.ms / 1000).toFixed(1)} 秒`,
        ...found.filter((s) => !s.found).map((s) => `这台电脑上没找到 ${s.name} 的对话记录（${s.dir}）`), ...r.errors.map((e) => `有文件没读成：${e}`)].join('\n'))
    }
    case 'pa-report-add': {
      if (!a[0]) throw new Error('写上报告在知识库里的路径，比如 90-日志与报告/周报/2026-W48.md')
      const r = registerReport(a[0], 'Codex')
      return print(r, `登记好了：${r.kind} ${r.period}（${r.by}），小节：${r.sections.join('、')}。在报告页能看到：${r.to}`)
    }
    case 'pa-mark': {
      if (!a[0]) throw new Error('写上对话编号（pa-progress 每行最后那一段）')
      if (o.read) { const s = markRead(a[0], 'Codex'); return print(s, `标已看：${s.title}`) }
      if (o.status) { const s = setStatus(a[0], o.status === 'auto' ? null : o.status, 'Codex'); return print(s, `${s.title}：现在是 ${s.status}`) }
      if (o.object) { const s = setObject(a[0], o.object === 'auto' ? null : o.object === 'none' ? '-' : o.object, 'Codex'); return print(s, `${s.title}：归到 ${s.object?.name ?? '未归类'}`) }
      throw new Error('要写 --read、--status 或 --object 其中一个')
    }
    default: throw new Error(`没有 ${cmd} 这个命令。个人助理模块的命令：\n${HELP}`)
  }
}

export const paCli: ModuleCli = { help: HELP, run: async (argv) => { try { return await runCli(argv) } catch (err) { console.error(`没办成：${(err as Error).message}`); return 1 } } }
