// 装 Mac 日历助手的测试：HOME 换成临时文件夹，ditto / xattr 换成只记参数的假命令，不碰这台电脑。运行：npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { bundleVersion, bundledHelper, installCalendarHelper, installedHelper } from './mac-calendar.mjs'

const plist = (v) => `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>com.boss-workbench.calendar</string><key>CFBundleVersion</key><string>${v}</string></dict></plist>`
function fakeApp(dir, v) {
  mkdirSync(join(dir, 'Contents', 'MacOS'), { recursive: true })
  writeFileSync(join(dir, 'Contents', 'Info.plist'), plist(v))
  writeFileSync(join(dir, 'Contents', 'MacOS', 'calendar-helper'), 'bin')
  return dir
}
function fakeRun() {
  const calls = []
  return { calls, run: (cmd, args) => { calls.push([cmd, ...args]); if (cmd === '/usr/bin/ditto') cpSync(args[0], args[1], { recursive: true }); return { status: 0 } } }
}

test('模板里带了编好的助手：bundle id 对、有可执行文件、版本号能读出来', () => {
  const app = bundledHelper()
  assert.ok(existsSync(join(app, 'Contents', 'MacOS', 'calendar-helper')), '少了编好的 工作台日历.app')
  assert.match(readFileSync(join(app, 'Contents', 'Info.plist'), 'utf8'), /com\.boss-workbench\.calendar/)
  assert.match(readFileSync(join(app, 'Contents', 'Info.plist'), 'utf8'), /NSCalendarsFullAccessUsageDescription/)
  assert.ok(bundleVersion(app))
  assert.ok(existsSync(join(app, 'Contents', '_CodeSignature', 'CodeResources')), '要带签名（ad-hoc）')
})

test('第一次装：复制到 ~/Library/Application Support/老板工作台/，去掉隔离标记；同一版再装不动；新版才换', () => {
  const base = mkdtempSync(join(os.tmpdir(), 'wb-calhelper-'))
  const home = join(base, 'home')
  const src = fakeApp(join(base, 'src', '工作台日历.app'), '1')
  const f = fakeRun()
  const r = installCalendarHelper({ home, bundled: src, platform: 'darwin', run: f.run })
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  assert.equal(r.path, installedHelper(home))
  assert.ok(r.path.endsWith(join('Library', 'Application Support', '老板工作台', '工作台日历.app')))
  assert.deepEqual(f.calls.map((c) => c[0]), ['/usr/bin/ditto', '/usr/bin/xattr'])
  assert.deepEqual(f.calls[1], ['/usr/bin/xattr', '-dr', 'com.apple.quarantine', r.path])
  const again = installCalendarHelper({ home, bundled: src, platform: 'darwin', run: f.run })
  assert.equal(again.changed, false)
  assert.equal(f.calls.length, 2, '同一版不再复制（复制不会改指纹，但也没必要）')
  writeFileSync(join(src, 'Contents', 'Info.plist'), plist('2'))
  assert.equal(installCalendarHelper({ home, bundled: src, platform: 'darwin', run: f.run }).changed, true)
  assert.equal(bundleVersion(r.path), '2')
})

test('不是 Mac 不装；复制失败退回程序文件夹里那份', () => {
  assert.equal(installCalendarHelper({ platform: 'win32' }).ok, false)
  const base = mkdtempSync(join(os.tmpdir(), 'wb-calhelper-'))
  const src = fakeApp(join(base, 'src', '工作台日历.app'), '1')
  const r = installCalendarHelper({ home: join(base, 'home'), bundled: src, platform: 'darwin', run: () => ({ status: 1 }) })
  assert.equal(r.path, src)
})
