// 日历来源的命令（server/cli.ts 把 calendar- 开头的转到这里）。只读同步：工作台从不往日历里写。
import { parseArgs } from 'node:util'
import { CALENDAR_SOURCES, type CalendarSource } from '../../shared/schema.ts'
import { calendarStatus, setSource, statusText, syncNow } from './service.ts'

export const CALENDAR_HELP = `日历（只读同步：从你自己的日历拉未来两周，每 10 分钟一次；同步来的日程在工作台里不能改，到日历里改）
  calendar-connect mac               接 Mac 日历（要在前台运行：第一次会弹系统窗口“「老板工作台 · 日历」想访问日历”，点“允许完全访问”，最多等 3 分钟）
  calendar-connect lark              接飞书日历（先装好 lark-cli 并登录：lark-cli auth login --domain calendar）
  calendar-connect ics <订阅链接>     接谷歌 / 苹果 iCloud / Outlook / 飞书的私密订阅地址（链接只存在本机，不显示）
  calendar-status                    现在接的是哪个、最后同步时间、几条、有没有出错
  calendar-sync                      马上同步一次
  calendar-off                       不接日历了（今天起同步来的日程拿掉，过去的留着；你在工作台建的日程不动）`

export const isCalendarCommand = (argv: string[]) => !!argv[0]?.startsWith('calendar-')

const NEXT_STEP: Partial<Record<string, string>> = {
  denied: '你没点允许也没关系：可以到 系统设置 → 隐私与安全性 → 日历 打开「老板工作台 · 日历」，再运行 calendar-sync；或者换飞书日历（calendar-connect lark）、订阅链接（calendar-connect ics <链接>）。',
  restricted: '换飞书日历（calendar-connect lark）或订阅链接（calendar-connect ics <链接>）。',
  unsupported: '换飞书日历（calendar-connect lark）或订阅链接（calendar-connect ics <链接>）。',
  timeout: 'Mac 上没看到弹窗的话：Codex 可能拦下了 open 命令，申请带权限运行（不进沙箱）再试一次。',
}

export async function runCalendarCli(argv: string[]): Promise<number> {
  const { values: o, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
  const [cmd, a1, a2] = positionals
  const print = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
  if (o.help) { console.log(CALENDAR_HELP); return 0 }
  const done = () => {
    const s = calendarStatus()
    const extra = !s.ok && s.code ? NEXT_STEP[s.code] : undefined
    print(s, [statusText(s), extra].filter(Boolean).join('\n'))
    return s.ok === false ? 1 : 0
  }
  switch (cmd) {
    case 'calendar-status':
      done()
      return 0 // 只是看状态：同步出错也算“看成功了”（AI 助手读它不当报错）
    case 'calendar-sync':
      if (calendarStatus().source === 'off') { print(calendarStatus(), '还没接日历：先 calendar-connect mac|lark|ics'); return 1 }
      await syncNow()
      return done()
    case 'calendar-off': {
      const r = setSource('off', 'Codex')
      print(r, `不接日历了${r.removed ? `：拿掉了今天起同步来的 ${r.removed} 条日程` : ''}。你在工作台里建的日程都还在。`)
      return 0
    }
    case 'calendar-connect': {
      const source = a1 as CalendarSource
      if (!(CALENDAR_SOURCES as readonly string[]).includes(source) || source === 'off') throw new Error('写成 calendar-connect mac、calendar-connect lark 或 calendar-connect ics <订阅链接>')
      if (source === 'ics' && !a2) throw new Error('订阅链接写在后面：calendar-connect ics <链接>（从日历设置里复制“私密地址”）')
      setSource(source, 'Codex', source === 'ics' ? a2 : undefined)
      if (source === 'mac' && !o.json) console.log('正在连 Mac 日历。第一次会弹出系统窗口：「老板工作台 · 日历」想访问你的日历，请点“允许完全访问”（最多等 3 分钟）……')
      await syncNow({ request: source === 'mac' })
      return done()
    }
    default:
      throw new Error(`没有「${cmd}」这个命令。日历的命令：\n${CALENDAR_HELP}`)
  }
}
