// Mac 日历：经“工作台日历.app”只读 macOS 日历（EventKit）。
//
// 为什么要一个单独的 .app、还要用 /usr/bin/open 启动：Mac 的“允许读日历”记在“负责进程”名下。
// 工作台的 node（尤其是开机自启的后台服务）直接启动的程序都算 node 的，既弹不出授权窗、也拿不到权限；
// 用 open 启动的 .app 自己当负责进程，权限记在它名下（bundle id com.boss-workbench.calendar），和谁启动它无关。
//   - 模板里带编好的成品（tools/mac-calendar/工作台日历.app，arm64 + x86_64，ad-hoc 签名），不在老板电脑上重编：
//     ad-hoc 签名的指纹就是权限的身份，重编一次就要重新点“允许”
//   - 装到 ~/Library/Application Support/老板工作台/工作台日历.app（install.mjs 装；这里发现没装或版本不对也补装），去掉“来自网络”的隔离标记
//   - 只有 request（搭建时在前台、老板看着）才可能弹授权窗；后台同步只读状态，不弹
//   - open 拿不到助手的退出码，`open -W` 在助手秒退时还会报错，所以每次给一个新的输出文件，轮询等它出现
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installCalendarHelper } from '../../scripts/mac-calendar.mjs'
import type { CalItem } from './rows.ts'

/** 助手写出的 JSON（tools/mac-calendar/src/CalendarHelper.swift 的 version 1） */
export type MacJson = {
  version: number; status: string; generatedAt?: string; timeZone?: string
  range?: { from: string; to: string }
  calendars?: { id: string; title: string; account?: string; type?: string; color?: string }[]
  events?: { uid: string; occurrence: string; title: string; allDay: boolean; start: string; end?: string; location?: string; calendarId: string; myResponse?: string }[]
}

/** 能用的助手位置：没装或模板换了新版就补装（scripts/mac-calendar.mjs）。WORKBENCH_CAL_HELPER 给测试指定 */
export function ensureHelper(): string | null {
  if (process.env.WORKBENCH_CAL_HELPER) return process.env.WORKBENCH_CAL_HELPER
  return installCalendarHelper().path
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 启动助手、等它写出 JSON。助手没回应时 status = 'timeout'；不是 Mac 时 'unsupported'；没有助手时 'missing-helper' */
export async function runHelper(opts: { days?: number; request?: boolean; demo?: boolean; timeoutMs?: number; app?: string | null } = {}): Promise<MacJson> {
  if (process.platform !== 'darwin' && !process.env.WORKBENCH_CAL_OPEN) return { version: 1, status: 'unsupported' }
  const app = opts.app === undefined ? ensureHelper() : opts.app
  if (!app || !existsSync(app)) return { version: 1, status: 'missing-helper' }
  const dir = mkdtempSync(join(tmpdir(), 'wb-cal-'))
  const out = join(dir, 'calendar.json')
  // request：不加 -g（后台打开）、-j（隐藏），授权窗才会在最前面；-n 每次开一个新的，不复用上次没退出的
  const args = [...(opts.request ? [] : ['-g', '-j']), '-n', app, '--args', '--days', String(opts.days ?? 14), '--out', out]
  if (opts.request) args.push('--request')
  if (opts.demo) args.push('--demo')
  const openBin = process.env.WORKBENCH_CAL_OPEN || '/usr/bin/open'
  try {
    const started = await new Promise<boolean>((resolve) => {
      const p = spawn(openBin, args, { stdio: 'ignore' })
      p.on('error', () => resolve(false))
      p.on('exit', (code) => resolve(code === 0))
    })
    if (!started) return { version: 1, status: 'open-failed' }
    const deadline = Date.now() + (opts.timeoutMs ?? (opts.request ? 180_000 : 20_000)) // 等人点“允许”要多给时间
    while (Date.now() < deadline) {
      if (existsSync(out)) {
        try {
          const data = JSON.parse(readFileSync(out, 'utf8')) as MacJson // 助手先写临时文件再改名，看到就是完整的
          return data.version === 1 ? data : { version: 1, status: 'bad-version' }
        } catch { return { version: 1, status: 'bad-file' } }
      }
      await sleep(250)
    }
    return { version: 1, status: 'timeout' }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const RESPONSES = new Set(['accepted', 'declined', 'tentative', 'pending'])

/** 助手的 JSON → CalItem。生日日历标出来（rows.ts 会跳过） */
export function macItems(data: MacJson): CalItem[] {
  const cals = new Map((data.calendars ?? []).map((c) => [c.id, c]))
  return (data.events ?? []).map((e) => {
    const cal = cals.get(e.calendarId)
    return {
      uid: e.uid, occurrence: e.occurrence, title: e.title ?? '', start: e.start, end: e.end ?? null, allDay: !!e.allDay,
      location: e.location ?? null, calendar: cal?.title ?? null,
      response: (RESPONSES.has(e.myResponse ?? '') ? e.myResponse : null) as CalItem['response'],
      birthday: cal?.type === 'birthdays',
    }
  })
}

/** 助手的状态 → 给老板看的一句话。ok 的返回 null */
export function macProblem(status: string): string | null {
  switch (status) {
    case 'fullAccess': case 'demo': return null
    case 'denied': return '没有读日历的权限：打开 系统设置 → 隐私与安全性 → 日历，把「老板工作台 · 日历」打开（选“完全访问”）'
    case 'restricted': return '这台 Mac 不让读日历（多半是公司统一管理的电脑）：换成飞书日历或订阅链接'
    case 'writeOnly': return '只给了“添加日程”的权限，读不到日程：到 系统设置 → 隐私与安全性 → 日历，把「老板工作台 · 日历」改成“完全访问”'
    case 'notDetermined': return '还没允许读日历：在 Codex 里说“接日历”，或到 设置 → 日历来源 点“连上 Mac 日历”，系统弹窗里点“允许完全访问”'
    case 'unsupported': return '这台电脑不是 Mac，用不了 Mac 日历：换成飞书日历或订阅链接'
    case 'missing-helper': return '找不到日历助手（工作台日历.app）：程序文件夹里少了 tools/mac-calendar，重新复制一次模板'
    case 'open-failed': return '日历助手打不开：系统可能拦下了它，在 Codex 里说“日历助手打不开”请它看看'
    case 'timeout': return '日历助手没有回应：稍后会自动再试；一直这样的话，在 Codex 里说“日历同步不了”'
    default: return `日历助手返回了看不懂的结果（${status}）`
  }
}
