// mac-calendar.mjs 的类型（服务端 TypeScript 用）
export const HELPER_NAME: string
export function bundledHelper(app?: string): string
export function installedHelper(home?: string): string
export function bundleVersion(appPath: string): string | null
export type InstallResult = { ok: boolean; path: string | null; changed: boolean; note: string }
export function installCalendarHelper(opts?: {
  home?: string; app?: string; bundled?: string; platform?: string
  run?: (cmd: string, args: string[]) => { status: number | null }
}): InstallResult
