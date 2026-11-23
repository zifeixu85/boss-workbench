// 装模块的整体测试：拷模板到临时文件夹当一个工作台，造一个最小的知识库和假的 Codex、Claude 对话记录（不碰本机真的），
// 装上 modules/pa，扫描、看命令行输出、类型检查，再拿掉。要先在 template/ 装好依赖（npm install）。
// 运行（仓库根目录）：node --test modules/pa/tests/install.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TEMPLATE = join(REPO, 'template')
const PACK = join(REPO, 'modules', 'pa')
const ready = existsSync(join(TEMPLATE, 'node_modules', 'hono'))
const put = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s) }
const J = (o) => JSON.stringify(o)

function setup() {
  const tmp = mkdtempSync(join(os.tmpdir(), 'wb-pa-'))
  const KB = join(tmp, '知识库')
  const APP = join(tmp, '程序')
  const CODEX = join(tmp, 'codex')
  const CLAUDE = join(tmp, 'claude')
  const WORK = join(tmp, '工作', '春节茶礼')
  const now = new Date()
  const ago = (min) => new Date(now.getTime() - min * 60000).toISOString()
  // 知识库：档案 + 两类对象 + 一份周报 + 总助角色
  put(join(KB, '知识库档案.md'), '## 我关注的\n\n| 类型 | 文件夹 | 确认 |\n|---|---|---|\n| 项目 | 02-项目 | 已确认 |\n| 客户 | 10-客户 | 待确认 |\n\n## 报告\n\n| 报告 | 开关 | 什么时候出 |\n|---|---|---|\n| 日报 | 关 | 每天 22:00 |\n| 周报 | 开 | 每周五 18:00 |\n| 月报 | 关 | 每月最后一天 |\n')
  put(join(KB, '02-项目', '春节茶礼.md'), `---\n类型: 项目\n名称: 春节茶礼\n状态: 进行中\n更新: 2026-11-24\n确认: 已确认\n隐私: 内部\n来源: "[[99-原始材料/a]]"\n截止: 2026-12-20\n负责人: 孙蕾\n关联:\n  - "[[10-客户/云杉物流]]"\n工作文件夹:\n  - ${WORK}\n---\n\n## 现在\n报价单做完待看。\n\n## 往来记录\n- 2026-11-24｜电话｜要 120 份（AI 记录，待确认）\n`)
  put(join(KB, '10-客户', '云杉物流.md'), '---\n类型: 客户\n名称: 云杉物流\n状态: 合作中\n更新: 2026-11-24\n确认: 待确认\n隐私: 内部\n来源: "[[99-原始材料/a]]"\naliases:\n  - 云杉\n---\n\n## 现在\n等报价。\n')
  const week = (() => { const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); const thu = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 864e5); const j4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4)); const w = 1 + Math.round(((thu - j4) / 864e5 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7); return `${thu.getUTCFullYear()}-W${String(w).padStart(2, '0')}` })()
  put(join(KB, '90-日志与报告', '周报', `${week}.md`), `---\n类型: 周报\n期间: ${week}\n更新: 2026-11-24\n确认: 待确认\n隐私: 内部\n---\n\n## 做了什么\n- 春节茶礼报价单\n\n## 这周的你\n还行。\n`)
  put(join(KB, '90-日志与报告', '日报', '2026-11-24.md'), '---\n类型: 日报\n期间: 2026-11-24\n写的人: 总助\n更新: 2026-11-24\n确认: 待确认\n隐私: 内部\n---\n\n## 摘要\n- 报价单做完了，还没看。\n')
  put(join(KB, '01-关于我', '助理', '总助', '角色.md'), `---\n类型: 角色\n角色: 总助\n名称: 小茶\n更新: 2026-11-24\n确认: 已确认\n隐私: 私密\n---\n\n${['我是谁', '我管什么，不管什么', '我怎么想', '我怎么说话', '什么时候我会反对你', '我不碰的'].map((t) => `## ${t}\n内容\n`).join('\n')}`)
  put(join(KB, '01-关于我', '助理', '总助', '记忆.md'), '---\n类型: 记忆\n角色: 总助\n更新: 2026-11-24\n---\n\n- 2026-11-20 定了两档价位\n')
  for (const f of ['身份', '性格']) put(join(KB, '01-关于我', '助理', '分身', `${f}.md`), '---\n类型: 角色文件\n---\n旧格式\n')
  // 假的 Codex：一个在春节茶礼文件夹里、做完了的对话（写了一个文件）；一个问了问题的
  const cx = (ts, type, payload) => J({ timestamp: ts, type, payload })
  put(join(CODEX, 'sessions', '2026', '11', '24', 'rollout-a.jsonl'), [
    cx(ago(30), 'session_meta', { id: 'thread-a', cwd: WORK, originator: 'Codex Desktop', source: 'vscode', thread_source: 'user', timestamp: ago(30) }),
    cx(ago(30), 'event_msg', { type: 'task_started' }),
    cx(ago(30), 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '做报价单 sk-abcdefghijklmnopqrstuvwxyz123456' }] }),
    cx(ago(20), 'response_item', { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Add File: 报价单.md\n+x\n*** End Patch' }),
    cx(ago(20), 'event_msg', { type: 'task_complete', last_agent_message: '做好了。' }),
  ].join('\n'))
  put(join(CODEX, 'sessions', '2026', '11', '24', 'rollout-b.jsonl'), [
    cx(ago(10), 'session_meta', { id: 'thread-b', cwd: '/tmp', originator: 'Codex Desktop', source: 'vscode', thread_source: 'user' }),
    cx(ago(10), 'event_msg', { type: 'task_started' }),
    cx(ago(10), 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: '云杉的折扣怎么定' }] }),
    cx(ago(9), 'event_msg', { type: 'task_complete', last_agent_message: '两处说法不一样，你想用哪一个？' }),
  ].join('\n'))
  put(join(CODEX, 'session_index.jsonl'), J({ id: 'thread-a', thread_name: '春节茶礼 · 报价单', updated_at: ago(20) }) + '\n')
  put(join(CODEX, 'generated_images', 'thread-x', 'a.png'), 'not really a png')
  // 假的 Claude Code：还在跑的
  put(join(CLAUDE, 'projects', '-tmp', 'c1.jsonl'), [
    J({ type: 'user', timestamp: ago(2), sessionId: 'c1', cwd: '/tmp/公众号', message: { role: 'user', content: '写本周长文' } }),
    J({ type: 'assistant', timestamp: ago(1), sessionId: 'c1', cwd: '/tmp/公众号', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/tmp/公众号/长文.md', content: '正文' } }] } }),
  ].join('\n'))
  mkdirSync(APP, { recursive: true })
  cpSync(TEMPLATE, APP, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(src.slice(TEMPLATE.length)) })
  symlinkSync(join(TEMPLATE, 'node_modules'), join(APP, 'node_modules'), 'junction')
  const DB = join(tmp, '数据', 'workbench.db')
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: DB, PA_CODEX_HOME: CODEX, PA_CLAUDE_HOME: CLAUDE, PA_CLAUDE_APP_DIR: join(tmp, 'claude-app'), DEMO_TODAY: 'off', NO_COLOR: '1' }
  const sh = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: APP, env, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
  const cli = (...a) => sh(process.execPath, ['server/cli.ts', ...a])
  const json = (...a) => { const r = cli(...a, '--json'); assert.equal(r.code, 0, r.out); return JSON.parse(r.out) }
  assert.equal(cli('modules').code, 0, '建数据库')
  return { tmp, APP, DB, sh, cli, json, week, tool: (...a) => sh(process.execPath, ['scripts/module.mjs', ...a]) }
}

test('装上个人助理：我关注的、进展、产出、报告、助理都能用；对话正文不进数据库；拿掉以后数据还在', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { DB, sh, cli, json, tool, week } = setup()
  const add = tool('add', 'pa', '--from', PACK, '--no-build')
  assert.equal(add.code, 0, add.out)

  assert.deepEqual(json('pa-focus').classes.map((c) => [c.name, c.confirmed, c.statuses.length]), [['项目', true, 3], ['客户', false, 3]])
  const list = json('pa-focus', '项目')
  assert.deepEqual(list.items[0].fields, [{ key: '截止', value: '2026-12-20' }, { key: '负责人', value: '孙蕾' }])

  assert.match(cli('pa-scan').out, /库里现在有 3 个对话/)
  const sessions = json('pa-progress')
  const by = Object.fromEntries(sessions.map((s) => [s.id, s]))
  assert.equal(by['codex:thread-a'].title, '春节茶礼 · 报价单', 'Codex 的标题从 session_index 来')
  assert.equal(by['codex:thread-a'].object.name, '春节茶礼', '按工作文件夹归类')
  assert.equal(by['codex:thread-a'].status, '做完未读')
  assert.equal(by['codex:thread-a'].link, 'codex://threads/thread-a')
  assert.equal(by['codex:thread-b'].status, '在等我')
  assert.equal(by['codex:thread-b'].object.name, '云杉物流', '按别名归类')
  assert.equal(by['claude:c1'].status, '进行中')
  assert.equal(by['claude:c1'].title, '写本周长文', 'Claude 没标题时用第一句')

  // 对话正文、密钥不进数据库
  const db = new DatabaseSync(DB, { readOnly: true })
  const dump = JSON.stringify(db.prepare('SELECT * FROM pa_sessions').all())
  assert.equal(dump.includes('sk-abcdefghijklmnopqrstuvwxyz'), false)
  assert.equal(dump.includes('两处说法不一样'), false)
  assert.equal(dump.includes('正文'), false)

  // 产出：写文件动作 + 图片目录
  const out = json('pa-outputs')
  assert.equal(out.counts['文档'], 2)
  assert.equal(out.counts['图片'], 1)

  // 对象详情：时间线里有往来记录和 AI 对话
  const obj = json('pa-object', '02-项目/春节茶礼.md')
  assert.deepEqual(obj.timeline.map((t) => t.kind).sort(), ['AI', '往来'])
  assert.deepEqual(obj.links.map((l) => [l.name, l.type]), [['云杉物流', '客户']], '双链关联认得出')
  assert.ok(obj.kb_files.includes('99-原始材料/a.md'), '双链来源补上 .md')

  // 手动改：标已看、改状态、归类
  assert.match(cli('pa-mark', 'codex:thread-a', '--read').out, /标已看/)
  assert.equal(json('pa-progress').find((s) => s.id === 'codex:thread-a').status, '已看')
  assert.match(cli('pa-mark', 'claude:c1', '--object', '10-客户/云杉物流.md').out, /归到 云杉物流/)
  assert.match(cli('pa-mark', 'claude:c1', '--status', '乱写').out, /状态只能是/)

  // 报告：登记、看这一期
  assert.match(cli('pa-report-add', `90-日志与报告/周报/${week}.md`).out, /登记好了/)
  assert.match(cli('pa-report-add', '../外面.md').out, /没办成/)
  const rep = json('pa-reports', '--kind', '周报')
  assert.equal(rep.period, week)
  assert.equal(rep.stats.sessions, 3)
  assert.equal(rep.report.registered_at !== null, true)

  // 助理
  const roles = json('pa-roles').roles
  assert.deepEqual(roles.map((r) => [r.role, r.display, r.complete, r.legacy]), [['总助', '小茶', true, false], ['分身', '', false, true]])
  assert.deepEqual(roles[0].files.map((f) => [f.name, f.problems.length, f.lines ?? null]), [['角色', 0, null], ['记忆', 0, 1]])

  // 报告开关：只开周报，日报那一份不显示，“总助的话”取周报
  assert.deepEqual(rep.on, ['周报'])
  assert.equal(json('pa-reports', '--kind', '日报').kind, '周报', '日报关着：给开着的那种')

  // 今日概况：三张卡的数、菜单、总助的话
  const ov = sh(process.execPath, ['-e', "import('./server/module-hooks.ts').then(async (h) => { await h.loadHooks(); const t = await import('./server/services/today.ts'); const o = t.overview(); console.log(JSON.stringify({ cards: o.cards, nav: o.nav_extra.map((n) => n.label), notes: o.module_notes.map((n) => n.title), badges: o.nav_badges })) })"])
  assert.equal(ov.code, 0, ov.out)
  const o = JSON.parse(ov.out.trim().split('\n').pop())
  assert.deepEqual(o.nav, ['项目', '客户'])
  assert.match(o.notes[0], /总助的话/)
  assert.equal(o.cards['pa-waiting'].count, 1)
  assert.ok(o.cards['pa-confirm'].count >= 2, '待确认的客户这一类、待确认的对象、待确认的往来记录')

  // 类型检查：网页和服务端
  assert.equal(sh('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit']).code, 0, '网页类型检查')
  const srv = sh('npm', ['run', '-s', 'check:server'])
  assert.equal(srv.code, 0, srv.out)

  // 拿掉：数据还在
  assert.equal(tool('remove', 'pa', '--no-build').code, 0)
  const db2 = new DatabaseSync(DB, { readOnly: true })
  assert.ok((db2.prepare('SELECT COUNT(*) AS n FROM pa_sessions').get()).n >= 3)
})
