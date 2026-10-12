// 系统通知的参数：标题、正文里的引号、反斜杠、换行、尖括号都不会搅乱脚本。运行：npm test
// Mac 那条用假的 osascript（只把收到的参数写进文件），不真的弹通知。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { clean, macArgs, sendSystem, WIN_SCRIPT, winArgs, winEnv } from './notify.ts'

const nasty = '他说"明天\\再说"\n<b>&amp;</b>\'; do shell script "rm -rf ~" --'

test('Mac：标题、正文作为参数传给 on run argv，脚本本身是固定的三行', () => {
  const a = macArgs({ title: '老板工作台 · 测试', subtitle: nasty, body: '正文' })
  assert.deepEqual(a.slice(0, 6), ['-e', 'on run argv', '-e', 'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)', '-e', 'end run'])
  assert.equal(a[6], '老板工作台 · 测试')
  assert.equal(a[7], clean(nasty, 90), '原样当参数（只把换行换成空格），不拼进脚本')
  assert.ok(!a[7].includes('\n'))
  assert.equal(a.length, 9)
})

test('clean：去掉控制字符、合并空白、截断', () => {
  assert.equal(clean('a\u0007b\t\tc\n', 99), 'a b c')
  assert.equal(clean('一二三四五六', 4), '一二三…')
  assert.equal(clean(null, 5), '')
})

test('Windows：脚本走 -EncodedCommand，内容走环境变量，XML 用 SecurityElement 转义', () => {
  const args = winArgs()
  assert.equal(args[args.length - 2], '-EncodedCommand')
  assert.equal(Buffer.from(args.at(-1)!, 'base64').toString('utf16le'), WIN_SCRIPT)
  assert.ok(WIN_SCRIPT.includes('[System.Security.SecurityElement]::Escape'))
  assert.ok(WIN_SCRIPT.includes('ContentType = WindowsRuntime'), '用系统自带的 Windows.UI.Notifications')
  assert.ok(!/BurntToast/i.test(WIN_SCRIPT))
  assert.ok(WIN_SCRIPT.includes('System.Windows.Forms.NotifyIcon'), 'Toast 不行退回气泡')
  const env = winEnv({ title: 'T', subtitle: nasty, body: 'B', url: 'http://127.0.0.1:4517/todos?todo=t_1&x=1' })
  assert.equal(env.WB_SUB, clean(nasty, 90))
  assert.equal(env.WB_URL, 'http://127.0.0.1:4517/todos?todo=t_1&x=1')
  assert.equal(winEnv({ title: 'T', body: 'B', url: 'javascript:alert(1)' }).WB_URL, '', '只认 http 网址')
})

test('Mac：sendSystem 调 osascript（假的，记录参数），失败时返回原因', { skip: process.platform === 'win32' && 'Windows 上没有 /bin/sh' }, async () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'wb-osa-'))
  const fake = join(dir, 'osascript')
  const out = join(dir, 'args.txt')
  writeFileSync(fake, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a" >> "${out}"; done\n`)
  chmodSync(fake, 0o755)
  const old = process.env.WB_OSASCRIPT
  process.env.WB_OSASCRIPT = fake
  try {
    const r = await sendSystem({ title: '老板工作台 · 测试', subtitle: '待办「x」15:30 到期', body: '还有 5 分钟' }, 'darwin')
    assert.equal(r.ok, true)
    const got = readFileSync(out, 'utf8').trim().split('\n')
    assert.deepEqual(got.slice(-3), ['老板工作台 · 测试', '待办「x」15:30 到期', '还有 5 分钟'])
    writeFileSync(fake, '#!/bin/sh\necho "execution error: 不允许" >&2\nexit 1\n')
    const bad = await sendSystem({ title: 'a', body: 'b' }, 'darwin')
    assert.equal(bad.ok, false)
    assert.match(bad.error ?? '', /execution error/)
  } finally {
    if (old === undefined) delete process.env.WB_OSASCRIPT
    else process.env.WB_OSASCRIPT = old
  }
})

test('别的系统：只记日志', async () => {
  const r = await sendSystem({ title: 'a', body: 'b' }, 'linux')
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /不支持/)
})
