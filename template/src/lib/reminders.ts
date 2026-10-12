// 浏览器通知：页面开着时，服务端经实时通道推来的提醒用它弹（页面关着时由服务端发电脑系统通知，见 server/reminders/）。
// 权限只在老板点“开启提醒”时申请：Safari 必须在点击里直接调 Notification.requestPermission，前面不能有 await。
// 127.0.0.1 算安全来源，可以申请通知权限。
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied' | 'off'
// 这个浏览器里点没点过“开启提醒”：'1' 点过（开着）、'0' 自己关了、没有 = 还没选。
// 光有通知权限不算（以前给过权限、或者浏览器默认就给的），一定要点过才弹，免得打开页面就乱弹
const ON_KEY = 'wb.notify.on'
const DISMISS_KEY = 'wb.notify.later' // 今日页的“以后再说”
export const NOTIFY_EVENT = 'wb-notify-change'

const supported = () => typeof window !== 'undefined' && 'Notification' in window
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* 隐私模式 */ } }

export function notifyState(): NotifyState {
  if (!supported()) return 'unsupported'
  const p = Notification.permission
  if (p === 'denied') return 'denied'
  const on = read(ON_KEY)
  if (on === '0') return 'off'
  return p === 'granted' && on === '1' ? 'granted' : 'default'
}

/** 这个页面会不会弹浏览器通知（实时通道连上时告诉服务端） */
export const notifyEnabled = () => notifyState() === 'granted'

const changed = () => window.dispatchEvent(new Event(NOTIFY_EVENT))

/** 点“开启提醒”：申请权限（第一次会弹浏览器的询问框）。必须在点击事件里直接调用 */
export function enableNotify(): Promise<NotifyState> {
  if (!supported()) return Promise.resolve('unsupported')
  write(ON_KEY, '1')
  if (Notification.permission === 'granted') { changed(); welcome(); return Promise.resolve('granted') }
  return new Promise((done) => {
    let settled = false
    const finish = (p: NotificationPermission) => {
      if (settled) return // 新浏览器回调和 Promise 都会到，只处理一次
      settled = true
      changed()
      if (p === 'granted') welcome()
      done(notifyState())
    }
    // 老的 Safari 只认回调写法，新的返回 Promise；两种都接住
    const r = Notification.requestPermission(finish) as Promise<NotificationPermission> | undefined
    if (r && typeof r.then === 'function') r.then(finish, () => done(notifyState()))
  })
}

/** 这个浏览器里先不弹（权限留着，页面关着时照样有系统通知） */
export function disableNotify() { write(ON_KEY, '0'); changed() }

export const laterDismissed = () => read(DISMISS_KEY) === '1'
export function dismissLater() { write(DISMISS_KEY, '1'); changed() }

function welcome() {
  try { new Notification('提醒已开启', { body: '以后到点会这样提醒你。页面关着时，由电脑系统通知提醒。', tag: 'wb-welcome' }) } catch { /* 有的浏览器只能在后台线程里弹 */ }
}

export type PushedPopup = { title: string; body: string; link: string | null; ids: number[] }

/** 服务端推来要弹的几条：用浏览器通知（同一条在几个标签页里只显示一次，靠 tag）；弹不出来时用页面里的小提示 */
export function showPopups(popups: PushedPopup[], open: (link: string, ids: number[]) => void) {
  for (const p of popups) {
    const go = () => open(p.link ?? '/reminders', p.ids)
    if (notifyEnabled()) {
      try {
        const n = new Notification(p.title, { body: p.body, tag: `wb-${p.ids.join('-')}` })
        n.onclick = () => { window.focus(); n.close(); go() }
        continue
      } catch { /* 弹不出来就用页面里的小提示 */ }
    }
    toast(p.title, { description: p.body, duration: 12_000, action: { label: '去看', onClick: go } })
  }
}

/** 页面里显示的通知状态，点了“开启”或别的标签页改了会跟着变 */
export function useNotifyState(): NotifyState {
  const [s, setS] = useState<NotifyState>(() => notifyState())
  useEffect(() => {
    const on = () => setS(notifyState())
    window.addEventListener(NOTIFY_EVENT, on)
    window.addEventListener('focus', on)
    return () => { window.removeEventListener(NOTIFY_EVENT, on); window.removeEventListener('focus', on) }
  }, [])
  return s
}

/** 被拒绝以后怎么重新允许：按浏览器说 */
export function deniedHelp() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'Safari 菜单 → 设置 → 网站 → 通知，把 127.0.0.1 改成“允许”，再刷新页面。'
  return '点地址栏左边的图标（网站设置），把“通知”改成“允许”，再刷新页面。'
}

export const STATE_TEXT: Record<NotifyState, string> = {
  unsupported: '这个浏览器不支持网页通知；页面关着时由电脑系统通知提醒。',
  default: '还没开：点“开启提醒”，浏览器问你时点“允许”。',
  granted: '已开启：页面开着时用浏览器通知提醒你，点通知直接打开对应页面。',
  denied: '浏览器拒绝了通知。',
  off: '这个浏览器里先关着（页面关着时照样有电脑系统通知）。',
}

/** “开启提醒”按钮的点击：申请权限，告诉结果 */
export function useEnableNotify() {
  return () => {
    // 不能先 await 别的：Safari 要求在点击里直接申请
    enableNotify().then((s) => {
      if (s === 'granted') toast.success('提醒已开启', { description: '刚才弹的那条就是提醒的样子。' })
      else if (s === 'denied') toast.error('浏览器没允许通知', { description: deniedHelp() })
      else if (s === 'unsupported') toast('这个浏览器不支持网页通知', { description: '页面关着时由电脑系统通知提醒。' })
    })
  }
}
