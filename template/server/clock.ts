// 统一的“现在”：服务端所有“今天”“现在”都从这里取（db.ts 的 nowIso / localDate、services/common.ts 的 today）。
//
// 演示开关（只在示例数据 --demo 里用；老板自己的数据库没有 demo_today，按真实日期）：
//   1. 环境变量 DEMO_TODAY=2026-10-27      优先级最高；DEMO_TODAY=off 表示强制用真实日期
//   2. 数据库 settings 表里的 demo_today   示例种子会写入 2026-10-27，所以 Codex 命令行不加环境变量也一致
// 打开后日期固定在那一天，时分秒仍走真实时钟（“最近改动”的“几分钟前”照常有效）。
const RE = /^\d{4}-\d{2}-\d{2}$/

const env = process.env.DEMO_TODAY?.trim()
const envOff = env === 'off' || env === '0' || env === 'false'
const envDate = env && RE.test(env) ? env : null
if (env && !envOff && !envDate) console.warn(`DEMO_TODAY 应写成 YYYY-MM-DD（例如 2026-10-27），现在是「${env}」，已忽略`)

let demoToday: string | null = envOff ? null : envDate

/** db.ts 打开数据库后调用：环境变量没指定时，用数据库里的 demo_today */
export function applyStoredDemoToday(stored: string | null | undefined) {
  if (env) return // 环境变量说了算（包括 off）
  demoToday = stored && RE.test(stored) ? stored : null
}

export const demoDate = () => demoToday

/** 现在：演示模式下日期换成演示日，时分秒用真实时间 */
export function now(): Date {
  const real = new Date()
  if (!demoToday) return real
  const [y, m, d] = demoToday.split('-').map(Number)
  return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds())
}
