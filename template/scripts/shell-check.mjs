// 外壳完整检查（2026-10-15）：工作台的基础版和外壳不能被拆。体检（npm run doctor）会跑，搭建和加模块后都要过。
// 起因：五轮模拟里有四轮另写了 3～5 页的小网页、把模板的导航、设置页、日程、收件箱整个拿掉。
// 只看源码里该有的东西在不在（字符串检查），不评价写得好不好；业务模块怎么加见 Skill 的 references/加减模块.md。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (app, f) => { try { return readFileSync(join(app, f), 'utf8') } catch { return null } }

/** 基础版的页面：路由里的地址、菜单里的 key、名字 */
export const BASE_PAGES = [
  { path: 'calendar', key: 'calendar', name: '日程' },
  { path: 'todos', key: 'todos', name: '待办' },
  { path: 'projects', key: 'projects', name: '项目' },
  { path: 'inbox', key: 'inbox', name: '收件箱' },
  { path: 'kb', key: 'kb', name: '知识库' },
  { path: 'settings', key: 'settings', name: '设置' },
]
const BASE_MODULES = ['today', 'tasks', 'projects', 'inbox', 'kb', 'settings']
const SETTINGS_PARTS = [['ProfilePanel', '我的资料'], ['ThemePicker', '配色'], ['NavStylePicker', '电脑导航'], ['ModuleSettings', '模块开关'], ['AssistantSettings', 'AI 助手']]

/** 返回问题清单（空 = 外壳完整）。每条是一句人话，带怎么办 */
export function checkShell(app) {
  const out = []
  const main = read(app, 'src/main.tsx')
  if (!main || !/RouterProvider/.test(main) || !/from ['"]@\/app\/router['"]/.test(main)) out.push('网页入口（src/main.tsx）没用模板的路由：外壳被换掉了。改回模板的 main.tsx，业务页面挂进 router.tsx')
  const router = read(app, 'src/app/router.tsx')
  if (!router || !/AppShell/.test(router)) out.push('路由（src/app/router.tsx）没用模板外壳 AppShell：导航、顶栏、AI 助手都会没有')
  else for (const p of BASE_PAGES) if (!new RegExp(`path:\\s*['"]${p.path}['"]`).test(router)) out.push(`路由里少了基础版页面“${p.name}”（/${p.path}）`)
  const nav = read(app, 'src/app/nav.ts')
  if (!nav) out.push('少了菜单文件 src/app/nav.ts')
  else for (const p of [{ key: 'today', name: '今日' }, ...BASE_PAGES]) if (!new RegExp(`key:\\s*['"]${p.key}['"]`).test(nav)) out.push(`菜单（src/app/nav.ts）里少了“${p.name}”`)
  const settings = read(app, 'src/features/settings/SettingsPage.tsx')
  if (!settings) out.push('少了设置页 src/features/settings/SettingsPage.tsx')
  else for (const [c, name] of SETTINGS_PARTS) if (!settings.includes(c)) out.push(`设置页里少了“${name}”（${c}）`)
  const modules = read(app, 'shared/modules.ts')
  if (!modules) out.push('少了模块开关 shared/modules.ts')
  else for (const id of BASE_MODULES) if (!new RegExp(`id:\\s*['"]${id}['"][^}]*required:\\s*true`).test(modules)) out.push(`模块开关里“${id}”不是基础版（required: true）：基础版不能被关掉`)
  const shell = read(app, 'src/app/AppShell.tsx')
  if (shell && !shell.includes('AssistantDock')) out.push('外壳（src/app/AppShell.tsx）里少了每页右边的 AI 助手（AssistantDock）')
  const server = read(app, 'server/index.ts')
  if (!server || !/app\.route\(['"]\/api['"],\s*routes\)/.test(server)) out.push('服务入口（server/index.ts）没挂模板的接口：网页和 Codex 会读写不到同一份数据')
  const routes = read(app, 'server/routes.ts')
  if (routes) for (const r of ['/settings', '/todos', '/projects', '/inbox', '/kb/tree']) if (!routes.includes(`'${r}'`)) out.push(`接口里少了 ${r}`)
  if (!existsSync(join(app, 'server', 'cli.ts'))) out.push('少了给 Codex 用的命令行 server/cli.ts')
  return out
}

// 直接运行：node scripts/shell-check.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkShell(join(import.meta.dirname, '..'))
  if (!problems.length) console.log('外壳完整：基础版页面、导航、设置页、AI 助手都在')
  else { console.log(`外壳不完整（${problems.length} 处）：`); problems.forEach((p) => console.log(`  - ${p}`)); process.exitCode = 1 }
}
