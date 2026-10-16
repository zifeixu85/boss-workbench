// 外壳完整检查（scripts/shell-check.mjs）：npm test 会跑
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkShell } from './shell-check.mjs'

const APP = join(import.meta.dirname, '..')
const copy = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-check-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const f of ['src/main.tsx', 'src/app/router.tsx', 'src/app/nav.ts', 'src/app/AppShell.tsx', 'src/app/SimpleShell.tsx', 'src/app/ComplexShell.tsx', 'src/app/DualShell.tsx', 'src/app/TopShell.tsx', 'src/features/settings/SettingsPage.tsx', 'shared/modules.ts', 'server/index.ts', 'server/routes.ts', 'server/cli.ts']) cpSync(join(APP, f), join(dir, f), { recursive: true })
  return dir
}

test('模板本身外壳完整', () => {
  assert.deepEqual(checkShell(APP), [])
})

test('另写一个只有首页的入口：报出来', (t) => {
  const dir = copy(t)
  writeFileSync(join(dir, 'src/app/router.tsx'), "export const router = createBrowserRouter([{ path: '/', element: <LocalWorkbenchPage /> }])\n")
  const p = checkShell(dir)
  assert.ok(p.some((x) => x.includes('AppShell')), p.join('\n'))
})

test('拿掉收件箱、把待办改成可以关：报出来', (t) => {
  const dir = copy(t)
  const r = join(dir, 'src/app/router.tsx')
  writeFileSync(r, readFile(r).replace(/\{ path: 'inbox'[^\n]*\n/, ''))
  const m = join(dir, 'shared/modules.ts')
  writeFileSync(m, readFile(m).replace("{ id: 'tasks', name: '待办与日程', required: true }", "{ id: 'tasks', name: '待办与日程' }"))
  const p = checkShell(dir)
  assert.ok(p.some((x) => x.includes('收件箱')), p.join('\n'))
  assert.ok(p.some((x) => x.includes('“tasks”')), p.join('\n'))
})

function readFile(f) { return readFileSync(f, 'utf8') }

for (const file of ['src/app/AppShell.tsx', 'server/routes.ts']) test(`缺少 ${file} 不能通过`, t => {
  const dir = copy(t)
  rmSync(join(dir, file))
  assert.ok(checkShell(dir).length)
})
test('只保留导入但不显示提醒设置、新建按钮也不能通过', t => {
  const dir = copy(t)
  for (const [file, tag] of [['src/features/settings/SettingsPage.tsx', 'ReminderSettings'], ['src/app/TopShell.tsx', 'QuickCreate']]) {
    const f = join(dir, file)
    writeFileSync(f, readFile(f).replaceAll(`<${tag}`, '<Removed'))
  }
  const problems = checkShell(dir).join('\n')
  assert.match(problems, /ReminderSettings/)
  assert.match(problems, /QuickCreate/)
})
