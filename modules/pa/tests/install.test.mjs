// 装模块的整体测试：拷模板到临时文件夹当一个工作台，造一个最小的知识库和假的 Codex、Claude 对话记录（不碰本机真的），
// 装上 modules/pa，扫描、看命令行输出、类型检查，再拿掉。要先在 template/ 装好依赖（npm install）。
// 运行（仓库根目录）：node --test modules/pa/tests/install.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  // 角色（约定 v0.5 第 5 节）：一个助理一个文件夹“类型-名字”，IDENTITY、SOUL、MEMORY 三份；USER.md 在 01-关于我/ 下共用；深版分身多一份 底稿.md
  const A = (...p) => join(KB, '01-关于我', '助理', ...p)
  const IDENT = ['我是谁', '我怎么称呼你', '我管什么，不管什么']
  const SOUL = ['我怎么想', '我怎么说话', '我会说的，和我绝不说的', '什么时候我会反对你', '每次开始先读什么', '我能自己做的', '要先问你的', '我不做的', '定期要做的']
  const sec = (ts) => ts.map((t) => `## ${t}\n内容\n`).join('\n')
  const identity = (dir, r, name) => put(A(dir, 'IDENTITY.md'), `---\n类型: 角色\n角色: ${r}\n名称: ${name}\n更新: 2026-11-24\n确认: 已确认\n隐私: 私密\n---\n\n${sec(IDENT)}`)
  const soul = (dir, extra = []) => put(A(dir, 'SOUL.md'), `---\n类型: 角色\n更新: 2026-11-23\n---\n\n${sec([...SOUL, ...extra])}`)
  const memory = (dir, n, undated = 0, file = 'MEMORY.md') => put(A(dir, file), `---\n类型: 记忆\n更新: 2026-11-22\n---\n\n${Array.from({ length: n }, (_, i) => `- 2026-11-${String(10 + (i % 15)).padStart(2, '0')}｜第 ${i + 1} 条；原因\n`).join('')}${Array.from({ length: undated }, (_, i) => `- 没带日期的第 ${i + 1} 条\n`).join('')}`)
  put(join(KB, '01-关于我', 'USER.md'), `---\n类型: 我的档案\n更新: 2026-11-24\n确认: 已确认\n隐私: 私密\n---\n\n${sec(['我是谁，做什么生意', '现在最看重的两三件事', '我的边界：不做什么、哪些不要碰', '我的说话习惯'])}`)
  identity('总助-小茶', '总助', '小茶'); soul('总助-小茶'); memory('总助-小茶', 2)
  identity('内容-小红', '内容助理', '小红'); soul('内容-小红'); memory('内容-小红', 1)
  identity('分身-另一个林总', '分身', '另一个林总'); memory('分身-另一个林总', 61); put(A('分身-另一个林总', '底稿.md'), '---\n类型: 底稿\n更新: 2026-11-24\n---\n\n很长的底稿\n')
  identity('分身-年轻时的林总', '分身', '年轻时的林总'); soul('分身-年轻时的林总', Array.from({ length: 30 }, (_, i) => `第${i}节`)); memory('分身-年轻时的林总', 1, 2)
  identity('合伙人-财务', '合伙人', '老王'); soul('合伙人-财务'); memory('合伙人-财务', 1)
  // 旧格式：v0.4 的中文三份（角色、规矩、记忆），和 v0.1 的“身份 + 性格”、文件夹不带名字
  put(A('合伙人-法务', '角色.md'), '---\n类型: 角色\n角色: 合伙人\n名称: 老陈\n更新: 2026-11-20\n---\n\n## 我是谁\n内容\n')
  put(A('合伙人-法务', '规矩.md'), '---\n类型: 规矩\n---\n\n## 每次开始先读什么\n内容\n')
  memory('合伙人-法务', 1, 0, '记忆.md')
  for (const f of ['身份', '性格', '记忆']) put(A('总助', `${f}.md`), '---\n类型: 角色文件\n---\n旧格式\n')
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
  put(join(WORK, '报价单.md'), 'x')
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
  return { tmp, KB, APP, DB, sh, cli, json, week, tool: (...a) => sh(process.execPath, ['scripts/module.mjs', ...a]) }
}

test('装上个人助理：我关注的、进展、产出、报告、助理都能用；对话正文不进数据库；拿掉以后数据还在', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { KB, DB, sh, cli, json, tool, week } = setup()
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
  // 报价单.md 真写出来了；长文.md 不在原处：默认不列，只数在 gone 里
  const out = json('pa-outputs')
  assert.equal(out.counts['文档'], 1)
  assert.equal(out.gone, 1)
  assert.equal(out.counts['图片'], 1)

  // 对象详情：时间线里有往来记录和 AI 对话
  const obj = json('pa-object', '02-项目/春节茶礼.md')
  assert.deepEqual(obj.timeline.map((t) => t.kind).sort(), ['AI', '往来'])
  assert.deepEqual(obj.links.map((l) => [l.name, l.type]), [['云杉物流', '客户']], '双链关联认得出')
  assert.ok(obj.kb_files.includes('99-原始材料/a.md'), '双链来源补上 .md')

  // 在对话里认对象、打开详情、更新（先预演、确认后写）
  const found = json('pa-find', '云杉')
  assert.deepEqual(found.map((f) => [f.type, f.name, f.path, f.by]), [['客户', '云杉物流', '10-客户/云杉物流.md', '别名']])
  assert.deepEqual(found[0].open, { kind: 'pa-object', id: '10-客户/云杉物流.md' })
  const opened = sh(process.execPath, ['server/cli.ts', 'open', '--kind', 'pa-object', '--id', '10-客户/云杉物流.md', '--json', '--no-start'])
  assert.equal(opened.code, 0, opened.out)
  assert.equal(JSON.parse(opened.out).path, `/focus/-?embed=1&o=${encodeURIComponent('10-客户/云杉物流.md').replace(/%20/g, '+')}`)
  const FILE = join(KB, '10-客户', '云杉物流.md')
  const before = readFileSync(FILE, 'utf8')
  const upd = ['pa-update', '10-客户/云杉物流.md', '--status', '合作中', '--now', '报价发过去了，等回话', '--next', '周五前问报价意见 · 11-28 · 孙蕾', '--log', '发了报价单', '--channel', '微信']
  assert.match(cli(...upd, '--confirm', '写吧').out, /没预演过/, '没预演过的不写')
  const pre = json(...upd)
  assert.equal(pre.written, false)
  assert.deepEqual(pre.changes.map((c) => c.what).filter((w) => w !== '更新'), ['现在', '下一步', '往来记录'], '状态没变就不算一处')
  assert.equal(readFileSync(FILE, 'utf8'), before, '预演什么都不写')
  assert.match(cli(...upd, '--confirm', '  ').out, /原话/, '原话是空的不写')
  const done = json(...upd, '--confirm', '可以，写吧')
  assert.equal(done.written, true)
  const after = readFileSync(FILE, 'utf8')
  assert.match(after, /## 现在\n报价发过去了，等回话\n/)
  assert.match(after, /- \[ \] 周五前问报价意见 · 11-28 · 孙蕾/)
  assert.match(after, /｜微信｜发了报价单；来源：和 AI 的对话（AI 记录，待确认）/)
  assert.equal(readFileSync(done.backup, 'utf8'), before, '原文件有备份（备份在数据库旁边，不在知识库里）')
  assert.match(cli(...upd, '--confirm', '再写一次').out, /没预演过/, '一次预演只能写一次')
  assert.match(cli('pa-update', '10-客户/云杉物流.md', '--status', '飞了').out, /状态只能是/)

  // 手动改：标已看、改状态、归类
  assert.match(cli('pa-mark', 'codex:thread-a', '--read').out, /标已看/)
  assert.equal(json('pa-progress').find((s) => s.id === 'codex:thread-a').status, '做完了')
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
  // 按文件夹列出全部角色：总助、内容助理、分身、合伙人，同类里旧格式排后面
  assert.deepEqual(roles.map((r) => [r.kind, r.name, r.display, r.complete, r.legacy]), [
    ['总助', '小茶', '小茶', true, false], ['总助', '总助', '', false, true],
    ['内容', '小红', '小红', true, false],
    ['分身', '另一个林总', '另一个林总', false, false], ['分身', '年轻时的林总', '年轻时的林总', true, false],
    ['合伙人', '财务', '老王', true, false], ['合伙人', '法务', '老陈', true, true],
  ])
  assert.deepEqual(roles[0].files.map((f) => [f.name, f.exists, f.lines ?? null, f.entries ?? null]), [['IDENTITY', true, null, null], ['SOUL', true, 18, null], ['MEMORY', true, 2, 2]])
  assert.deepEqual([roles[0].files[2].first, roles[0].files[2].last, roles[0].files[2].undated], ['2026-11-10', '2026-11-11', 0])
  assert.ok(roles[0].files.every((f) => f.problems.length === 0), JSON.stringify(roles[0].files.map((f) => f.problems)))
  // 深版分身多一份底稿：列出来，不算在“三份”里；SOUL 缺了照样数出来
  assert.deepEqual(roles[3].files.map((f) => [f.name, f.exists, !!f.optional]), [['IDENTITY', true, false], ['SOUL', false, false], ['MEMORY', true, false], ['底稿', true, true]])
  // SOUL 超过 60 行、记忆没带日期、记忆超过 60 行，都提示
  assert.ok(roles[4].files[1].problems.some((p) => /太长.*60 行/.test(p)), 'SOUL 超过 60 行提示')
  assert.ok(roles[4].files[2].problems.some((p) => /2 条没带日期/.test(p)), '没带日期的条目数出来')
  assert.ok(roles[3].files[2].problems.some((p) => /61 行，超过 60 行/.test(p)), '记忆超过 60 行提示归并')
  assert.ok(roles[5].files[1].problems.some((p) => /专业或思路来源/.test(p)), '合伙人的 SOUL 多两节')
  // 旧格式：中文名的三份照样认，标“旧格式”，说清怎么改
  assert.deepEqual(roles[6].files.map((f) => [f.name, f.exists]), [['角色', true], ['规矩', true], ['记忆', true]])
  assert.ok(roles[6].problems.some((p) => /IDENTITY\.md、SOUL\.md、MEMORY\.md/.test(p)))
  assert.ok(roles[1].problems.some((p) => /身份\.md/.test(p)))
  assert.ok(json('pa-roles').problems.some((p) => /总助只能有一个/.test(p)))
  // USER.md：共用一份，缺的小节说出来
  const user = json('pa-roles').user
  assert.deepEqual([user.path, user.exists, user.updated], ['01-关于我/USER.md', true, '2026-11-24'])
  assert.ok(user.problems.some((p) => /详细资料在哪/.test(p)))

  // 报告开关：只开周报，日报那一份不显示，“总助的话”取周报
  assert.deepEqual(rep.on, ['周报'])
  assert.equal(json('pa-reports', '--kind', '日报').kind, '周报', '日报关着：给开着的那种')

  // 今日概况：三张卡的数、菜单、总助的话
  const ov = sh(process.execPath, ['-e', "import('./server/module-hooks.ts').then(async (h) => { await h.loadHooks(); const t = await import('./server/services/today.ts'); const o = t.overview(); console.log(JSON.stringify({ cards: o.cards, nav: o.nav_extra.map((n) => n.label), takes: o.nav_extra.map((n) => n.replaces ?? null), notes: o.module_notes.map((n) => n.title), badges: o.nav_badges, stats: o.home_stats })) })"])
  assert.equal(ov.code, 0, ov.out)
  const o = JSON.parse(ov.out.trim().split('\n').pop())
  assert.deepEqual(o.nav, ['项目', '客户'])
  assert.deepEqual(o.takes, ['projects', 'clients'], '知识库里有项目、客户：接管基础版的同名入口')
  // 给 Codex 的页面清单也不列老的项目、客户页，对象也不列 project / client（改用 pa-find + pa-object）
  const cap = json('capabilities')
  assert.equal(cap.pages.some((p) => p.to === '/projects' || p.to === '/clients'), false)
  assert.equal(cap.objects.some((x) => x.kind === 'project' || x.kind === 'client'), false)
  assert.ok(cap.objects.some((x) => x.kind === 'pa-object'))
  assert.match(o.notes[0], /总助的话/)
  // 驾驶舱顶上的一排数：核心给今天的待办、日程，个人助理给本周做完、本周产出、连续在用；每个带近 14 天的走势
  assert.deepEqual(o.stats.map((x) => x.label), ['今天的待办', '今天的日程', '本周做完', '本周产出', '连续在用'])
  const weekDone = o.stats.find((x) => x.label === '本周做完')
  assert.equal(weekDone.module, 'pa')
  assert.equal(weekDone.spark.length, 14)
  assert.equal(weekDone.to, '/progress')
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

test('Codex 换了位置（设了 CODEX_HOME）：照样找得到它的对话记录', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { tmp, KB, APP, DB, tool } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  const env = { ...process.env, WORKBENCH_ROOT: KB, WORKBENCH_DB: DB, CODEX_HOME: join(tmp, 'codex'), PA_CLAUDE_HOME: join(tmp, 'claude'), PA_CLAUDE_APP_DIR: join(tmp, 'claude-app'), DEMO_TODAY: 'off', NO_COLOR: '1' }
  delete env.PA_CODEX_HOME
  const r = spawnSync(process.execPath, ['server/cli.ts', 'pa-scan'], { cwd: APP, env, encoding: 'utf8' })
  assert.match(`${r.stdout}${r.stderr}`, /库里现在有 3 个对话/)
})

test('个人助理关掉以后：它的命令不跑，也不再去读对话记录', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { cli, tool, DB } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  assert.equal(cli('modules', '--off', 'pa').code, 0)
  const r = cli('pa-scan')
  assert.notEqual(r.code, 0)
  assert.match(r.out, /个人助理.*关着/)
  const db = new DatabaseSync(DB)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pa_sessions').get().n, 0, '一个对话都没读')
  db.close()
})

test('知识库检测：pa-check 说清现在能用的、要升级检查的和下一句；只差收件箱时驾驶舱不提', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { cli, json, tool } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  const r = json('pa-check')
  assert.equal(r.profile.path, '知识库档案.md')
  const st = Object.fromEntries(r.pages.map((p) => [p.id, p.status]))
  assert.deepEqual(st, { progress: '能用', outputs: '能用', focus: '能用', roles: '能用', reports: '能用', confirm: '要升级检查' }, '示例库没有 00-收件箱')
  assert.match(cli('pa-check').out, /检查一下我的知识库/)
  assert.ok(json('capabilities').read.some((x) => x.command === 'pa-check'))
  assert.doesNotMatch(JSON.stringify(json('today')), /你的知识库还差几步/, '只差收件箱：驾驶舱不提，“总助的话”照常')
})

test('知识库检测：没有档案的已有知识库，驾驶舱先说“你的知识库还差几步”，点进去是检测页', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { KB, json, tool } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  rmSync(join(KB, '知识库档案.md'))
  const note = JSON.stringify(json('today'))
  assert.match(note, /你的知识库还差几步/)
  assert.match(note, /检查一下我的知识库/)
  assert.equal(json('pa-check').pages.find((p) => p.id === 'focus').status, '要升级检查')
})

test('老板知识库工具建的旧结构（没有知识库档案.md，只有 01-AI协作/建库档案.md）：按目录对应推出客户、项目，“我关注的”照样有，标待确认', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { KB, json, tool } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  rmSync(join(KB, '知识库档案.md'))
  put(join(KB, '01-AI协作', '建库档案.md'), '---\n格式: 老板知识库/2\n结构: 就地建图\n---\n\n## 目录对应\n\n| 层 | 实际位置 | 说明 |\n|---|---|---|\n| 04-客户 | 10-客户 | 接入时登记 |\n| 06-项目 | 02-项目 | 接入时登记 |\n')
  const f = json('pa-focus')
  assert.deepEqual(f.classes.map((c) => [c.name, c.folder, c.confirmed]), [['客户', '10-客户', false], ['项目', '02-项目', false]])
  assert.ok(f.problems.some((p) => /目录对应.*待确认/.test(p)))
  assert.equal(json('pa-focus', '客户').items[0].name, '云杉物流')
  assert.ok(json('pa-find', '春节茶礼').length >= 1, '推出来的对象照样能在对话里认出来')
})

test('知识库工具新建的库（档案在 01-AI协作/建库档案.md，写好了“我关注的”和“位置”）：照登记读；客户在分组文件夹里也认得；开头写了别的类型的不算', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { KB, json, tool } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  rmSync(join(KB, '知识库档案.md'))
  put(join(KB, '01-AI协作', '建库档案.md'), '---\n格式: 老板知识库/2\n---\n\n## 位置\n\n| 是什么 | 在哪 |\n|---|---|\n| 报告 | 90-日志与报告 |\n| 助理 | 02-关于我/助理 |\n\n## 我关注的\n\n| 类型 | 文件夹 | 确认 | 文件怎么认 | 名称取自 | 状态字段 | 状态对照 |\n|---|---|---|---|---|---|---|\n| 项目 | 06-项目 | 已确认 | *.md；*/README.md | | 状态 | |\n| 客户 | 04-客户 | 已确认 | *.md; */*.md | | 阶段 | |\n')
  put(join(KB, '04-客户', 'README.md'), '# 客户\n')
  put(join(KB, '04-客户', '企业客户', '云杉物流.md'), '---\n类型: 客户\n名称: 云杉物流\n---\n')
  put(join(KB, '04-客户', '张总.md'), '---\n名称: 张总\n---\n')
  put(join(KB, '06-项目', '近期要事.md'), '---\n类型: 待办\n---\n')
  put(join(KB, '06-项目', '春茶预售.md'), '---\n类型: 项目\n名称: 春茶预售\n---\n')
  put(join(KB, '02-关于我', '助理', '总助-小茶', 'IDENTITY.md'), '---\n类型: 角色\n角色: 总助\n名称: 小茶\n---\n')
  const f = json('pa-focus')
  assert.deepEqual(f.classes.map((c) => [c.name, c.confirmed]), [['项目', true], ['客户', true]])
  assert.deepEqual(json('pa-focus', '客户').items.map((x) => x.name).sort(), ['云杉物流', '张总'])
  assert.deepEqual(json('pa-focus', '项目').items.map((x) => x.name), ['春茶预售'], '近期要事（类型: 待办）不算项目')
  const r = json('pa-roles')
  assert.equal(r.base, '02-关于我/助理', '助理按“位置”登记的找')
  assert.deepEqual(r.roles.map((x) => x.name), ['小茶'])
  const c = json('pa-check')
  assert.equal(c.profile.path, '01-AI协作/建库档案.md')
  assert.equal(c.pages.find((p) => p.id === 'roles').status, '能用')
})

test('状态分三个阶段（约定 10.2）：列表显示自己的叫法、带阶段，按阶段数；pa-update 只收这一类登记过的叫法，写自己的叫法', { skip: !ready && '先在 template/ 里 npm install' }, () => {
  const { KB, json, cli, tool } = setup()
  assert.equal(tool('add', 'pa', '--from', PACK, '--no-build').code, 0)
  put(join(KB, '知识库档案.md'), '## 我关注的\n\n| 类型 | 文件夹 | 确认 | 文件怎么认 | 名称取自 | 状态字段 | 状态对照 |\n|---|---|---|---|---|---|---|\n| 项目 | 02-项目 | 已确认 | | | | |\n| 客户 | 10-客户 | 已确认 | | | | 意向=未开始；已流失=已结束 |\n')
  put(join(KB, '10-客户', '老周.md'), '---\n类型: 客户\n名称: 老周\n状态: 意向\n更新: 2026-11-26\n确认: 已确认\n隐私: 内部\n来源: "[[99-原始材料/a]]"\n---\n\n## 现在\n刚认识。\n')
  put(join(KB, '10-客户', '阿德.md'), '---\n类型: 客户\n名称: 阿德\n状态: 失联了\n更新: 2026-11-26\n确认: 已确认\n隐私: 内部\n来源: "[[99-原始材料/a]]"\n---\n\n## 现在\n很久没联系。\n')
  const list = json('pa-focus', '客户')
  const by = Object.fromEntries(list.items.map((i) => [i.name, [i.status, i.stage]]))
  assert.deepEqual(by['老周'], ['意向', '未开始'])
  assert.deepEqual(by['云杉物流'], ['合作中', '进行中'])
  assert.deepEqual(by['阿德'], ['失联了', '未归类'])
  assert.deepEqual(list.stages, { 未开始: 1, 进行中: 1, 已结束: 0, 未归类: 1, 没标: 0 })
  // 改状态：登记过的叫法（默认的和状态对照左边的）才收，写进文件的是这个叫法
  assert.notEqual(cli('pa-update', '10-客户/老周.md', '--status', '成交').code, 0)
  const pre = cli('pa-update', '10-客户/老周.md', '--status', '已流失')
  assert.equal(pre.code, 0, pre.out)
  assert.equal(cli('pa-update', '10-客户/老周.md', '--status', '已流失', '--confirm', '对，老周不做了').code, 0)
  assert.match(readFileSync(join(KB, '10-客户', '老周.md'), 'utf8'), /^状态: 已流失$/m)
  assert.equal(json('pa-focus', '客户').items.find((i) => i.name === '老周').stage, '已结束')
})
