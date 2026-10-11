// 大客户模块自己的命令（参数在这里自己解析，由 server/cli.ts 转过来）。归属：大客户模块。
//   care-add <客户> --occasion 立冬问候 --message "…" [--date 2026-11-07] [--gift "一罐肉桂 + 手写卡"] [--why 为什么这么写] [--by 定时任务] [--at 07:12]
//            存一条关怀草稿。--by 定时任务：标“Codex 定时任务 · 10/27 07:12 写”（每天 07:10 的关怀草稿任务用）；不写：标“Codex 现场写 · 时间（在 Codex 对话里写的）”
//   extract-undo <提取ID> --yes      撤销一次提取写入（往来、答应、待办、喜好、日子、下次跟进、商机金额、知识库里加的几处）
//   crm-reset --save / --yes          存演示起点 / 退回演示起点
// 第三轮（数据评审 #10 #22）：stage、follow、promise-done、care-set 也搬到这里，报错只说人话（不带字段名）；
//   client-set 带 --stage 时也转到这里：改阶段要写 --reason，留新旧值（原来能绕过）。
import { parseArgs } from 'node:util'
import { now } from '../../clock.ts'
import { open } from '../../db.ts'
import { today } from '../../services/common.ts'
import { findClient, updateClient } from '../../services/clients.ts'
import { addCare, changeStage, setFollow, updateCare, updatePromise } from './actions.ts'
import { undoExtraction } from './extract-write.ts'
import { crmReset, saveBaseline } from './reset.ts'

const ACTOR = 'Codex' as const
export const CRM_COMMANDS = ['care-add', 'extract-undo', 'crm-reset', 'stage', 'follow', 'promise-done', 'care-set']
/** client-set 只有改阶段时才转过来 */
export const isCrmCommand = (argv: string[]) => CRM_COMMANDS.includes(argv[0] ?? '') || (argv[0] === 'client-set' && argv.includes('--stage'))

const HELP = `大客户模块的命令（在知识库根目录运行 node 工作台/程序/server/cli.ts <命令>）：
  stage <客户> <新阶段> --reason "为什么改"      改阶段，留新旧值和原因。“考虑一下”不算往前走
      例：stage 衡言律师事务所 待签约 --reason "11/2 合伙人开会定了，陈静说下周签"
  client-set <客户> --stage <新阶段> --reason "…"  同上（client-set 改阶段也要写原因）
  follow <客户> <日期|none> [--step "那天做什么"] [--reason "…"]   改下次跟进（今天或以后），自动建 / 改 / 取消跟进待办
  promise-done <答应的事ID> --reason "怎么做到的"
  care-set <关怀ID> [--message "新草稿"] [--status 已送出|不做]
  care-add <客户> --occasion 立冬问候 --message "草稿正文" [--date 2026-11-07] [--gift "一罐肉桂 + 手写卡"] [--why "为什么这么写"]
      [--by 定时任务] [--at 07:12]   定时任务写的标“Codex 定时任务 · 10/27 07:12 写”；不写 --by 标“Codex 现场写”
  extract-undo <提取ID> --yes        撤销一次提取写入（知识库客户文件、收件箱备注也退回）
  crm-reset --save                   事先存一次“演示起点”（工作台/数据/大客户演示起点.json）
  crm-reset --yes                    排练完退回演示起点：撤销所有提取写入，客户、待办、答应的事、关怀草稿都恢复
规则：关怀草稿只出草稿，不替林总发；送礼的话里不提单子、不报价。写入前先给林总看。`

/** 报错只说人话：zod 的提示本身就是中文，不加字段名 */
function say(err: unknown) {
  const e = err as { issues?: { message: string }[]; message: string; code?: string }
  if (e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') return `参数写错了（${e.message.replace(/^.*'(--?[\w-]+)'.*$/s, '$1')}）。\n${HELP}`
  return e.issues ? [...new Set(e.issues.map((i) => i.message))].join('；') : e.message
}

export function runCrmCli(argv: string[]): number {
  // 先打开数据库：演示日期（settings.demo_today）是打开时读进来的，不先打开，“今天”会是真实日期（care-add 会写成“10/12 07:12 写”）
  open()
  try {
    const { values: o, positionals } = parseArgs({
      args: argv, allowPositionals: true,
      options: {
        occasion: { type: 'string' }, message: { type: 'string' }, date: { type: 'string' }, gift: { type: 'string' }, why: { type: 'string' },
        by: { type: 'string' }, at: { type: 'string' }, yes: { type: 'boolean' }, save: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
        reason: { type: 'string' }, step: { type: 'string' }, status: { type: 'string' }, stage: { type: 'string' }, next: { type: 'string' }, note: { type: 'string' },
      },
    })
    const [cmd, a1, a2] = positionals
    if (o.help) { console.log(HELP); return 0 }
    const out = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
    const needReason = (what: string) => { if (!o.reason?.trim()) throw new Error(`${what}要写一句原因：加 --reason "……"`) }
    if (cmd === 'stage' || cmd === 'client-set') {
      const stage = cmd === 'stage' ? a2 : o.stage
      if (!a1 || !stage) throw new Error(cmd === 'stage' ? '写法：stage <客户> <新阶段> --reason "为什么改"' : '写法：client-set <客户> --stage <新阶段> --reason "为什么改"')
      needReason('改阶段')
      const c = findClient(a1)
      const r = changeStage(c.id, { stage, reason: o.reason }, ACTOR)
      // client-set 同时改了别的（下次跟进、备注），照旧改
      if (cmd === 'client-set' && (o.next || o.note)) updateClient(c.id, { ...(o.next ? { next_follow: o.next } : {}), ...(o.note ? { note: o.note } : {}) }, ACTOR)
      out(r, `已改阶段：${c.name} ${r.from} → ${r.to}（${o.reason}）`)
      return 0
    }
    if (cmd === 'follow') {
      if (!a1) throw new Error('写法：follow <客户> <日期|none> [--step "那天做什么"]')
      const c = findClient(a1)
      const r = setFollow(c.id, { next_follow: !a2 || a2 === 'none' ? null : a2, next_step: o.step, reason: o.reason }, ACTOR)
      out(r, r.next_follow ? `已改 ${c.name} 下次跟进 ${r.next_follow}，跟进待办 [${r.todo_id}]` : `已清空 ${c.name} 的下次跟进，自动待办取消了`)
      return 0
    }
    if (cmd === 'promise-done') {
      if (!a1) throw new Error('写上答应的事的 ID（client <客户> 里能看到）')
      needReason('标已兑现')
      const r = updatePromise(a1, { status: '已兑现', reason: o.reason }, ACTOR) as Record<string, unknown>
      out(r, `已标为兑现：${r.text}`)
      return 0
    }
    if (cmd === 'care-set') {
      if (!a1) throw new Error('写上关怀 ID（care 里能看到）')
      const r = updateCare(a1, { message: o.message, status: o.status }, ACTOR) as Record<string, unknown>
      out(r, `已更新关怀：${r.occasion}（${r.status}）`)
      return 0
    }
    if (cmd === 'care-add') {
      if (!a1) throw new Error('写上是哪位客户，例如 care-add 陈默 --occasion 立冬问候 --message "…"')
      const c = findClient(a1)
      const d = now()
      const hm = o.at && /^\d{1,2}:\d{2}$/.test(o.at) ? o.at.padStart(5, '0') : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      const md = `${Number(today().slice(5, 7))}/${Number(today().slice(8, 10))}`
      const author = o.by && /定时/.test(o.by) ? `Codex 定时任务 · ${md} ${hm} 写` : `Codex 现场写 · ${md} ${hm}（在 Codex 对话里写的）`
      const r = addCare({ client_id: c.id, occasion: o.occasion, date: o.date ?? null, gift: o.gift ?? null, message: o.message ?? null, status: '建议', author, note: o.why ?? null }, ACTOR) as Record<string, unknown>
      out(r, `已存关怀草稿 [${r.id}]：${c.name} · ${o.occasion}${o.date ? `（${o.date}）` : ''}，标“${author}”。网页“关怀与回访”里能看到，林总自己改、自己发。`)
      return 0
    }
    if (cmd === 'extract-undo') {
      if (!a1) throw new Error('写上提取 ID（网页地址里的 run=…，或 materials 里看）')
      if (!o.yes) { console.log(`会撤销提取 ${a1} 写进的所有东西（知识库客户文件、收件箱备注也退回）。确认后加 --yes 再运行。`); return 0 }
      const r = undoExtraction(a1, ACTOR)
      out(r, `已撤销：${r.source_path ?? '粘贴的文字'} 回到“待确认”，可以在网页上重新确认写入`)
      return 0
    }
    if (cmd === 'crm-reset') {
      if (o.save) { const r = saveBaseline(); out(r, `已存演示起点：${r.counts}\n文件：${r.file}\n以后排练完运行 crm-reset --yes 退回这个样子。`); return 0 }
      if (!o.yes) { console.log('演示复原会：撤销所有提取写入（含知识库里加的几处、收件箱备注），客户的阶段 / 下次跟进 / 待办 / 答应的事 / 关怀草稿退回演示起点，起点之后新加的删掉。确认后加 --yes 再运行；事先先 --save 存一次起点。'); return 0 }
      const r = crmReset(ACTOR)
      out(r, `演示复原完成：\n${r.map((x) => `- ${x}`).join('\n') || '- 没有要退回的'}`)
      return 0
    }
    console.log(HELP)
    return 0
  } catch (err) {
    console.error(`没办成：${say(err)}`)
    return 1
  }
}
