// 电脑系统通知：工作台页面关着时，由后台服务直接发。只用系统自带的程序，不装第三方。
//
//   Mac      /usr/bin/osascript 的 display notification。标题、正文当作参数传进脚本（on run argv），不拼进脚本文字，
//            所以引号、反斜杠、换行都不用转义。通知显示为“脚本编辑器”发的；第一次可能要在
//            系统设置 → 通知 → 脚本编辑器 里允许。点通知只会打开“脚本编辑器”，打不开工作台的页面（osascript 做不到）。
//   Windows  系统自带的 Windows PowerShell 5.1 调 Windows.UI.Notifications 弹 Toast（不用 BurntToast 之类的模块）；
//            内容走环境变量、XML 里转义；Toast 带 launch 网址，点了用浏览器打开对应页面。
//            Toast 弹不出来时退回任务栏气泡提示（System.Windows.Forms.NotifyIcon），再不行只记日志。
//   其他系统 只记日志。
// 测试时可以用环境变量 WB_OSASCRIPT 换成假的 osascript（只记录参数，不真的弹）。
import { execFile } from 'node:child_process'

export type Note = { title: string; subtitle?: string; body: string; url?: string | null }
export type SendResult = { ok: boolean; how: string; error?: string }

/** 去掉控制字符、合并空白、截断：通知里放不下长段，也不让奇怪字符搅乱脚本 */
export function clean(s: string | null | undefined, max: number): string {
  // eslint-disable-next-line no-control-regex
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const MAC_SCRIPT = [
  'on run argv',
  'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)',
  'end run',
]
/** osascript 的参数：三行脚本 + 标题、副标题、正文三个参数 */
export function macArgs(n: Note): string[] {
  return [...MAC_SCRIPT.flatMap((l) => ['-e', l]), clean(n.title, 60), clean(n.subtitle, 90), clean(n.body, 220) || ' ']
}

// Windows PowerShell 5.1（Windows 10/11 自带）。ContentType = WindowsRuntime 的写法只有 5.1 认，所以固定用 powershell.exe，不用 pwsh。
// AppId 借用 PowerShell 自己的，系统里一定登记过，不用另外注册；通知上会显示“Windows PowerShell”。
export const WIN_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
function Esc([string]$s) { [System.Security.SecurityElement]::Escape($s) }
try {
  $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $launch = ''
  if ($env:WB_URL) { $launch = ' activationType="protocol" launch="' + (Esc $env:WB_URL) + '"' }
  $texts = '<text>' + (Esc $env:WB_TITLE) + '</text>'
  if ($env:WB_SUB) { $texts += '<text>' + (Esc $env:WB_SUB) + '</text>' }
  if ($env:WB_BODY) { $texts += '<text>' + (Esc $env:WB_BODY) + '</text>' }
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml('<toast' + $launch + '><visual><binding template="ToastGeneric">' + $texts + '</binding></visual></toast>')
  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
  $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)
  'toast'
} catch {
  $why = $_.Exception.Message
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.BalloonTipTitle = $env:WB_TITLE
    $text = (($env:WB_SUB + ' ' + $env:WB_BODY).Trim())
    if (-not $text) { $text = $env:WB_TITLE }
    $n.BalloonTipText = $text
    $n.Visible = $true
    $n.ShowBalloonTip(10000)
    Start-Sleep -Seconds 8
    $n.Dispose()
    'balloon: ' + $why
  } catch {
    [Console]::Error.WriteLine('toast: ' + $why + ' / balloon: ' + $_.Exception.Message)
    exit 1
  }
}`

export function winPowerShell(env: NodeJS.ProcessEnv = process.env) {
  return `${env.SystemRoot || env.windir || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}
/** PowerShell 的参数：脚本用 -EncodedCommand（UTF-16 再 base64），不经过命令行引号 */
export function winArgs(): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(WIN_SCRIPT, 'utf16le').toString('base64')]
}
/** 标题、正文、网址放环境变量传给脚本 */
export function winEnv(n: Note): Record<string, string> {
  return { WB_TITLE: clean(n.title, 60), WB_SUB: clean(n.subtitle, 90), WB_BODY: clean(n.body, 220), WB_URL: n.url && /^https?:\/\//.test(n.url) ? n.url : '' }
}

function exec(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((done) => {
    execFile(file, args, { env, timeout: 20_000, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      done({ ok: !error, out: String(stdout ?? '').trim(), err: (String(stderr ?? '').trim() || error?.message || '').slice(0, 300) })
    })
  })
}

/** 发一条电脑系统通知。不抛错：返回发没发成、怎么发的 */
export async function sendSystem(n: Note, platform: string = process.platform): Promise<SendResult> {
  if (platform === 'darwin') {
    const bin = process.env.WB_OSASCRIPT || '/usr/bin/osascript'
    const r = await exec(bin, macArgs(n), process.env)
    return r.ok ? { ok: true, how: 'Mac 系统通知（osascript）' } : { ok: false, how: 'Mac 系统通知（osascript）', error: r.err || '没弹出来' }
  }
  if (platform === 'win32') {
    const r = await exec(winPowerShell(), winArgs(), { ...process.env, ...winEnv(n) })
    if (!r.ok) return { ok: false, how: 'Windows 系统通知', error: r.err || '没弹出来' }
    const how = r.out.startsWith('balloon') ? 'Windows 气泡提示（Toast 没弹出来，退回气泡）' : 'Windows 系统通知（Toast）'
    return { ok: true, how, error: r.out.startsWith('balloon') ? r.out.slice(9) : undefined }
  }
  return { ok: false, how: '只记日志', error: '这台电脑不支持系统通知' }
}
