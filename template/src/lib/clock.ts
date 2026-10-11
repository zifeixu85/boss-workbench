// 网页里的“现在”：和服务端用同一个演示日期（server/clock.ts）。
// 服务端把演示日期写进页面（window.__WB_TODAY__）；开发时 vite.config.ts 也会写。没有就是真实日期。
// 日期固定在演示日，时分秒用真实时间。
declare global {
  interface Window { __WB_TODAY__?: string }
}

const RE = /^\d{4}-\d{2}-\d{2}$/
let demoToday: string | null = typeof window !== 'undefined' && RE.test(window.__WB_TODAY__ ?? '') ? window.__WB_TODAY__! : null

export const isDemo = () => demoToday !== null
export const demoDate = () => demoToday

/** 设置里读到服务端的演示日期时调用（开发模式下页面里可能没写） */
export function setDemoToday(d: string | null | undefined) {
  if (d && RE.test(d)) demoToday = d
}

export function now(): Date {
  const real = new Date()
  if (!demoToday) return real
  const [y, m, d] = demoToday.split('-').map(Number)
  return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds())
}
