// 把 Mac 日历助手（tools/mac-calendar/工作台日历.app，编好的成品）装到固定位置：
//   ~/Library/Application Support/老板工作台/工作台日历.app
// install.mjs 安装时调一次；工作台服务发现没装、或模板换了新版本时也会调（server/calendar/mac.ts）。
//   - 已经是同一版（Info.plist 的 CFBundleVersion 一样）就不动
//   - 用 ditto 原样复制整个 .app（权限位、签名都在），再去掉“来自网络”的隔离标记，免得 Mac 拦下“未知开发者”的 App
//   - 不在这里重编：ad-hoc 签名的指纹就是 Mac 记“允许读日历”的身份，重编一次就要重新点“允许”
//   - 只复制文件，不启动它、不问权限；问权限只在搭建时 node server/cli.ts calendar-connect mac（老板看着的时候）
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HELPER_NAME = '工作台日历.app'
const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const bundledHelper = (app = APP_DIR) => join(app, 'tools', 'mac-calendar', HELPER_NAME)
export const installedHelper = (home = os.homedir()) => join(home, 'Library', 'Application Support', '老板工作台', HELPER_NAME)

export function bundleVersion(appPath) {
  try { return /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/.exec(readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf8'))?.[1] ?? null } catch { return null }
}

const defaultRun = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'ignore' }); return { status: r.error ? 1 : r.status } }

/**
 * 装助手。返回 { ok, path, changed, note }：path 是能用的助手位置（装不了时可能退回模板里那份，或 null）
 * opts：home、app（程序文件夹）、platform、run（测试换成假的 ditto / xattr）
 */
export function installCalendarHelper(opts = {}) {
  const platform = opts.platform ?? process.platform
  if (platform !== 'darwin') return { ok: false, path: null, changed: false, note: '不是 Mac，不装日历助手（可以用飞书日历或订阅链接）' }
  const src = opts.bundled ?? bundledHelper(opts.app)
  const dest = installedHelper(opts.home)
  const want = bundleVersion(src)
  if (existsSync(dest) && (!want || bundleVersion(dest) === want)) return { ok: true, path: dest, changed: false, note: '日历助手已经装好' }
  if (!existsSync(src)) return { ok: existsSync(dest), path: existsSync(dest) ? dest : null, changed: false, note: '模板里没有日历助手（tools/mac-calendar/工作台日历.app）' }
  const run = opts.run ?? defaultRun
  mkdirSync(dirname(dest), { recursive: true })
  rmSync(dest, { recursive: true, force: true })
  if (run('/usr/bin/ditto', [src, dest]).status !== 0) return { ok: true, path: src, changed: false, note: '日历助手没复制成，先用程序文件夹里那份' }
  run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', dest])
  return { ok: true, path: dest, changed: true, note: `日历助手装好了：${dest}` }
}
