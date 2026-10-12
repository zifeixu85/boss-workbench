// 提醒的命令（server/cli.ts 把 remind 开头的和 reminders 转到这里）：
//   reminders [--unread] [--limit 30]        最近的提醒：什么时候、提醒了什么、怎么弹的、读没读
//   remind-check                             现在会提醒什么、会怎么弹（只看，不记、不弹）
//   remind-set [--on|--off] [--at 08:30|none] [--quiet 22:00-08:00|none] [--demo-system on|off]
//   remind-test                              发一条测试提醒（电脑系统通知），看系统通知能不能弹
//   remind-read <提醒ID|all>                  标已读
//   remind-clear --yes                       清掉全部提醒记录（演示前用：现在还成立的提醒会重新弹一次）
import { parseArgs } from 'node:util'
import { demoDate } from '../clock.ts'
import { saveSettings } from '../services/today.ts'
import { readRemindSettings } from './settings.ts'
import { listReminders, markRead, clearReminders, seen } from './store.ts'
import { candidates, clockNow, deliveryNow, sendTest } from './service.ts'
import { dateOf, hmOf, morningOf } from './rules.ts'

export const REMIND_HELP = `提醒（工作台后台服务每 30 秒算一遍；页面开着用浏览器通知，关着用电脑系统通知）
  reminders [--unread] [--limit 30]   最近的提醒和读没读
  remind-check                        现在会提醒什么、会怎么弹（只看，不记、不弹）
  remind-set [--on|--off] [--at 08:30|none] [--quiet 22:00-08:00|none] [--demo-system on|off]
                                      总开关、每天看汇总的时间（none = 开机 5 分钟后）、免打扰时段、演示时弹不弹系统通知
  remind-test                         发一条测试提醒（电脑系统通知）；Mac 第一次要在 系统设置 → 通知 → 脚本编辑器 里允许
  remind-read <提醒ID|all>             标已读
  remind-clear --yes                  清掉全部提醒记录（演示前用：现在还成立的提醒会重新算、重新弹一次）`

export const isRemindCommand = (argv: string[]) => argv[0] === 'reminders' || !!argv[0]?.startsWith('remind-')

function summary() {
  const s = readRemindSettings()
  return `提醒${s.on ? '开着' : '关着（只记不弹）'}；每天${s.notify_at ? ` ${s.notify_at} ` : '开机 5 分钟后'}提醒看汇总；免打扰 ${s.quiet_start && s.quiet_end ? `${s.quiet_start}—${s.quiet_end}` : '不设'}；客户跟进从 ${morningOf(s)} 起提醒${demoDate() ? `；演示模式（按 ${demoDate()} 算），${s.demo_system ? '也弹' : '不弹'}系统通知` : ''}`
}

/** 记录时间（UTC）换成本地的“2026-10-27 15:30” */
const local = (iso: string) => { const d = new Date(iso); return `${dateOf(d)} ${hmOf(d)}` }

const onOff = (v: string | undefined, name: string) => {
  if (v === undefined) return undefined
  if (['on', '开', '1', 'true'].includes(v)) return '1' as const
  if (['off', '关', '0', 'false'].includes(v)) return '0' as const
  throw new Error(`${name} 只能写 on 或 off`)
}

export async function runRemindCli(argv: string[]): Promise<number> {
  const { values: o, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      json: { type: 'boolean' }, unread: { type: 'boolean' }, limit: { type: 'string' }, yes: { type: 'boolean' },
      on: { type: 'boolean' }, off: { type: 'boolean' }, at: { type: 'string' }, quiet: { type: 'string' }, 'demo-system': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [cmd, a1] = positionals
  const print = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
  if (o.help) { console.log(REMIND_HELP); return 0 }

  switch (cmd) {
    case 'reminders': {
      const xs = listReminders({ limit: Number(o.limit) || 30, unread: o.unread })
      print(xs, [summary(), '', ...(xs.length ? xs.map((r) => `- [${r.id}] ${local(r.at)}${r.read_at ? '' : ' ●未读'} ${r.kind}：${r.title}｜${r.body}｜${r.via}${r.note ? `（${r.note}）` : ''}`) : ['- （还没有提醒）'])].join('\n'))
      return 0
    }
    case 'remind-check': {
      const n = clockNow()
      const s = readRemindSettings()
      const list = candidates(n, s)
      const d = deliveryNow(n, s)
      const fresh = list.filter((c) => !seen(c.key))
      print({ now: n.toISOString(), delivery: d, fresh, already: list.length - fresh.length }, [
        `现在 ${dateOf(n)} ${hmOf(n)}。${summary()}`,
        `这一刻要是有新提醒：${d.via}${d.note ? `（${d.note}）` : ''}。（命令行看不到网页开没开，网页开着、允许了通知时实际是浏览器通知）`,
        fresh.length ? `还没提醒过的 ${fresh.length} 条（工作台开着的话，半分钟内会记下并按上面的方式弹）：` : '没有还没提醒过的事。',
        ...fresh.map((c) => `- ${c.kind}：${c.title}｜${c.body}`),
        list.length - fresh.length ? `另有 ${list.length - fresh.length} 条已经提醒过（每条只弹一次）。` : '',
      ].filter(Boolean).join('\n'))
      return 0
    }
    case 'remind-set': {
      const quiet = o.quiet === undefined ? undefined : o.quiet === 'none' ? ['', ''] : o.quiet.split(/[-—~～到]/).map((x) => x.trim())
      if (quiet && quiet.length !== 2) throw new Error('免打扰写成 --quiet 22:00-08:00，不设写 --quiet none')
      if (o.on && o.off) throw new Error('--on 和 --off 只能写一个')
      const patch = {
        remind_on: o.on ? '1' as const : o.off ? '0' as const : undefined,
        notify_at: o.at === undefined ? undefined : o.at === 'none' ? '' : o.at,
        quiet_start: quiet?.[0], quiet_end: quiet?.[1],
        remind_demo_system: onOff(o['demo-system'], '--demo-system'),
      }
      if (Object.values(patch).every((v) => v === undefined)) throw new Error('要写改什么：--on / --off、--at 08:30、--quiet 22:00-08:00、--demo-system on|off')
      saveSettings(patch, 'Codex')
      print(readRemindSettings(), `已改：${summary()}`)
      return 0
    }
    case 'remind-test': {
      const r = await sendTest()
      print(r, r.ok
        ? `已发出测试提醒（${r.how}，标题“老板工作台 · 测试”）。没看到的话：${process.platform === 'darwin' ? 'Mac 到 系统设置 → 通知 → 脚本编辑器，打开“允许通知”；专注模式开着也会挡住' : process.platform === 'win32' ? 'Windows 到 设置 → 系统 → 通知，打开 Windows PowerShell 的通知；专注助手开着也会挡住' : '看系统通知设置'}。`
        : `没弹出来（${r.how}）：${r.error ?? ''}。提醒照样记在网页“提醒”页里。`)
      return r.ok ? 0 : 1
    }
    case 'remind-read': {
      if (!a1) throw new Error('写提醒 ID（reminders 命令查），或者 all')
      const n = a1 === 'all' ? markRead({ all: true }) : markRead({ ids: [Number(a1)] })
      print({ changed: n }, n ? `已标已读 ${n} 条` : '没有要标的（ID 不对，或者已经读过）')
      return 0
    }
    case 'remind-clear': {
      if (!o.yes) throw new Error('会清掉全部提醒记录（不动别的数据）。确定要清，加 --yes')
      const n = clearReminders()
      print({ cleared: n }, `已清掉 ${n} 条提醒记录。工作台开着的话，半分钟内会按现在的情况重新算一遍。`)
      return 0
    }
    default:
      throw new Error(`没有「${cmd}」这个命令。\n${REMIND_HELP}`)
  }
}
