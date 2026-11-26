// AI 对话栏（⌘J）放在哪、多宽（2026-11-26 照 A梦 自用工作台的对话框搬过来）：
// - 默认钉在右侧当侧栏：宽屏（≥ DOCK_PIN_FROM）把页面往左挤，两边能同时看、同时点；可以改成浮在页面上（不挤页面）；
// - 中等宽度放不下侧栏：从右边浮出来，盖在页面上；手机（< DOCK_FULL_BELOW）全屏；
// - 宽度能拖（左边那条竖线，键盘左右键也行，双击回到默认），宽度、钉不钉、开没开记在这台电脑的浏览器里。
// 纯函数，不依赖 React（单测在 dock-layout.test.ts）。

export type DockLayout = 'pinned' | 'float' | 'full'
type StorageLike = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }

/** 比这窄是手机：全屏 */
export const DOCK_FULL_BELOW = 768
/** 这么宽起才把页面往左挤 */
export const DOCK_PIN_FROM = 1200
/** 钉住时给页面留的最少宽度 */
export const DOCK_CONTENT_MIN = 560
export const DOCK_WIDTH = { default: 420, min: 340, max: 720 } as const
export const DOCK_WIDTH_STEP = 24

export const DOCK_WIDTH_KEY = 'wb.assistant.width'
export const DOCK_PINNED_KEY = 'wb.assistant.pinned'
export const DOCK_OPEN_KEY = 'wb.assistant.open'

/** 按屏幕宽度和“钉不钉”定放法 */
export function dockLayout(viewport: number, pinned: boolean): DockLayout {
  if (viewport < DOCK_FULL_BELOW) return 'full'
  return pinned && viewport >= DOCK_PIN_FROM ? 'pinned' : 'float'
}
export const canPin = (viewport: number): boolean => viewport >= DOCK_PIN_FROM

/** 宽度收在能用的范围里：钉住时给页面留 DOCK_CONTENT_MIN，浮着时左边至少留 48；全屏就是屏幕宽；存坏了用默认 */
export function clampDockWidth(width: number, viewport: number, layout: DockLayout): number {
  if (layout === 'full') return Math.max(0, Math.round(viewport))
  const value = Number.isFinite(width) ? width : DOCK_WIDTH.default
  const room = layout === 'pinned' ? viewport - DOCK_CONTENT_MIN : viewport - 48
  const max = Math.max(DOCK_WIDTH.min, Math.min(DOCK_WIDTH.max, room))
  return Math.round(Math.max(DOCK_WIDTH.min, Math.min(max, value)))
}

/** 键盘调宽度：← 拉宽，→ 收窄；Home / End 到最窄 / 最宽 */
export function nudgeDockWidth(width: number, key: string, viewport: number, layout: DockLayout): number | null {
  const next = key === 'ArrowLeft' ? width + DOCK_WIDTH_STEP : key === 'ArrowRight' ? width - DOCK_WIDTH_STEP : key === 'Home' ? DOCK_WIDTH.min : key === 'End' ? DOCK_WIDTH.max : null
  return next === null ? null : clampDockWidth(next, viewport, layout)
}
export const dragDockWidth = (startWidth: number, startX: number, currentX: number, viewport: number, layout: DockLayout): number => clampDockWidth(startWidth + (startX - currentX), viewport, layout)

export interface DockPrefs { width: number; pinned: boolean; open: boolean }
/** 本机记着的宽度、钉不钉、开没开；没有或存坏了用默认（默认钉住、宽 420、收着） */
export function readDockPrefs(storage: StorageLike | null | undefined): DockPrefs {
  const get = (key: string) => { try { return storage?.getItem(key) ?? null } catch { return null } }
  const raw = Number(get(DOCK_WIDTH_KEY))
  const width = Number.isFinite(raw) && raw >= DOCK_WIDTH.min && raw <= DOCK_WIDTH.max ? Math.round(raw) : DOCK_WIDTH.default
  return { width, pinned: get(DOCK_PINNED_KEY) !== '0', open: get(DOCK_OPEN_KEY) === '1' }
}
export function saveDockPref(storage: StorageLike | null | undefined, key: string, value: number | boolean): void {
  try { storage?.setItem(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(Math.round(value))) } catch { /* 隐私模式：只在这次打开里记住 */ }
}

/** ⌘J：收着 → 打开；开着但光标在页面上 → 回到输入框（钉着时最常用）；光标就在对话栏里 → 收起 */
export function hotkeyAction(open: boolean, focusInside: boolean): 'open' | 'focus' | 'close' {
  if (!open) return 'open'
  return focusInside ? 'close' : 'focus'
}

/** 钉住并打开时外壳在 <html> 上写的标记 */
export const DOCK_PINNED_ATTR = 'data-assistant-dock'
/** 点在这些地方不关详情抽屉：对话栏本身、弹出层、右下角提示、盖在上面的另一个弹窗 */
export const KEEP_SHEET_OPEN = '[data-assistant-panel], [data-radix-popper-content-wrapper], [data-sonner-toaster], [role="dialog"], [role="alertdialog"]'
/** 右侧抽屉是不是模态：对话栏开着时不是（两边都能点、能打字），收着时照旧是 */
export const sheetModal = (dockAttr: string | null | undefined): boolean => !dockAttr
/** 这次点击 / 聚焦落在对话栏（或弹出层、提示）里：抽屉不因为它关掉。own 是抽屉自己（焦点在抽屉里按 Esc 要能关） */
export function keepsSheetOpen(target: unknown, own?: { contains?: (node: never) => boolean } | null): boolean {
  const el = target as { closest?: (selector: string) => unknown; isConnected?: boolean } | null
  if (!el || typeof el.closest !== 'function') return false
  if (own && typeof own.contains === 'function' && own.contains(el as never)) return false
  if (el.isConnected === false) return true
  return !!el.closest(KEEP_SHEET_OPEN)
}

/** 历史按 今天 / 昨天 / 这 7 天 / 更早 分组（时间是 ISO，按本地日期） */
export function groupByDay<T extends { updated_at: string }>(rows: T[], now = new Date()): { label: string; items: T[] }[] {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = day(now)
  const label = (iso: string) => { const d = (today - day(new Date(iso))) / 864e5; return d <= 0 ? '今天' : d === 1 ? '昨天' : d < 7 ? '这 7 天' : '更早' }
  const out: { label: string; items: T[] }[] = []
  for (const r of rows) { const l = label(r.updated_at); const g = out.find((x) => x.label === l); if (g) g.items.push(r); else out.push({ label: l, items: [r] }) }
  return out
}
