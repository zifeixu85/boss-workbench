// 对话记录这一半：从 Codex、Claude Code 的本机记录里只取元信息；状态推断；归到对象上；遮掉像密钥的东西。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codexParser } from '../files/server/modules/pa/codex.ts'
import { claudeParser } from '../files/server/modules/pa/claude.ts'
import { inferStatus } from '../files/server/modules/pa/status.ts'
import { matchObject } from '../files/server/modules/pa/match.ts'
import { brief, redact, fileKind, looksLikeAsking } from '../files/server/modules/pa/text.ts'

const J = (o: unknown) => JSON.stringify(o)
const cx = (ts: string, type: string, payload: unknown) => J({ timestamp: ts, type, payload })
const userMsg = (ts: string, text: string) => cx(ts, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text }] })

function codex(lines: string[]) { const p = codexParser(); for (const l of lines) p.line(l); return p.done() }
function claude(lines: string[]) { const p = claudeParser(); for (const l of lines) p.line(l); return p.done() }

const META = cx('2026-11-23T01:00:00.000Z', 'session_meta', { id: 'tid-1', cwd: '/Users/lin/工作/春节茶礼', originator: 'Codex Desktop', source: 'vscode', thread_source: 'user', timestamp: '2026-11-23T01:00:00.000Z', base_instructions: { text: '很长的系统提示' } })

test('Codex：第一行拿文件夹和来源；跳过系统塞进来的话，第一句用户消息做摘要；补丁里的写文件路径', () => {
  const m = codex([
    META,
    userMsg('2026-11-23T01:00:01.000Z', '<environment_context>\n<cwd>/x</cwd>'),
    userMsg('2026-11-23T01:00:01.000Z', '# AGENTS.md instructions for /Users/lin\n\n规矩'),
    cx('2026-11-23T01:00:02.000Z', 'event_msg', { type: 'task_started', turn_id: 't1' }),
    userMsg('2026-11-23T01:00:02.000Z', '帮我把春节茶礼的报价单做出来，按两档价位。\n第二行不要'),
    cx('2026-11-23T01:05:00.000Z', 'response_item', { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Add File: 报价单-v2.md\n+内容\n*** Update File: /Users/lin/工作/春节茶礼/方案.md\n@@\n*** End Patch' }),
    cx('2026-11-23T01:06:00.000Z', 'event_msg', { type: 'task_complete', turn_id: 't1', last_agent_message: '报价单做好了，放在报价单-v2.md。' }),
  ])!
  assert.deepEqual([m.tool, m.sid, m.cwd, m.origin, m.kind], ['codex', 'tid-1', '/Users/lin/工作/春节茶礼', 'Codex Desktop', '对话'])
  assert.equal(m.first, '帮我把春节茶礼的报价单做出来，按两档价位。')
  assert.deepEqual([m.startedAt, m.lastAt], ['2026-11-23T01:00:00.000Z', '2026-11-23T01:06:00.000Z'])
  assert.deepEqual([m.turnOpen, m.lastRole, m.asks, m.aborted, m.turns], [false, 'assistant', false, false, 1])
  assert.deepEqual(m.writes.map((w) => [w.action, w.path]), [['新建', '/Users/lin/工作/春节茶礼/报价单-v2.md'], ['修改', '/Users/lin/工作/春节茶礼/方案.md']])
})

test('Codex：一轮开了没结束 = 还在跑；最后问了问题 = 在等回话；被打断记下来；子任务和脚本调用分开标', () => {
  const open = codex([META, cx('2026-11-23T02:00:00.000Z', 'event_msg', { type: 'task_started' }), userMsg('2026-11-23T02:00:00.000Z', '继续')])!
  assert.deepEqual([open.turnOpen, open.lastRole], [true, 'user'])
  const ask = codex([META, cx('2026-11-23T02:00:00.000Z', 'event_msg', { type: 'task_started' }), cx('2026-11-23T02:01:00.000Z', 'event_msg', { type: 'task_complete', last_agent_message: '两处折扣说法不一样。\n\n你想按哪一个？' })])!
  assert.equal(ask.asks, true)
  const stop = codex([META, cx('2026-11-23T02:00:00.000Z', 'event_msg', { type: 'task_started' }), cx('2026-11-23T02:00:30.000Z', 'event_msg', { type: 'turn_aborted', reason: 'interrupted' })])!
  assert.deepEqual([stop.turnOpen, stop.aborted], [false, true])
  const sub = codex([cx('2026-11-23T01:00:00.000Z', 'session_meta', { id: 's', cwd: '/x', originator: 'Codex Desktop', source: { subagent: {} }, thread_source: 'subagent' })])!
  assert.equal(sub.kind, '子任务')
  const exec = codex([cx('2026-11-23T01:00:00.000Z', 'session_meta', { id: 'e', cwd: '/x', originator: 'codex_exec', source: 'exec', thread_source: 'user' })])!
  assert.equal(exec.kind, '脚本')
  assert.equal(codex(['不是 JSON', '']), null, '没有第一行的元信息：不算一个对话')
})

const cu = (ts: string, content: unknown, extra: object = {}) => J({ type: 'user', timestamp: ts, sessionId: 'sid-9', cwd: '/Users/lin/工作/公众号', isSidechain: false, message: { role: 'user', content }, ...extra })
const ca = (ts: string, content: unknown[], stop: string | null) => J({ type: 'assistant', timestamp: ts, sessionId: 'sid-9', cwd: '/Users/lin/工作/公众号', isSidechain: false, message: { role: 'assistant', stop_reason: stop, content } })

test('Claude Code：标题用文件里最后一条 custom-title；Write 算新建、Edit 算修改；工具结果不算用户说话', () => {
  const m = claude([
    cu('2026-11-23T03:00:00.000Z', '<system-reminder>别管</system-reminder>\n写本周公众号长文，主题是春茶。'),
    J({ type: 'custom-title', customTitle: '旧标题', sessionId: 'sid-9' }),
    ca('2026-11-23T03:01:00.000Z', [{ type: 'text', text: '好的' }, { type: 'tool_use', name: 'Write', input: { file_path: '/Users/lin/工作/公众号/长文.md', content: '正文不该被存' } }], 'tool_use'),
    cu('2026-11-23T03:01:01.000Z', [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }]),
    ca('2026-11-23T03:02:00.000Z', [{ type: 'tool_use', name: 'Edit', input: { file_path: '/Users/lin/工作/公众号/长文.md' } }], 'tool_use'),
    cu('2026-11-23T03:02:01.000Z', [{ type: 'tool_result', tool_use_id: 'y', content: 'ok' }]),
    ca('2026-11-23T03:03:00.000Z', [{ type: 'text', text: '写到一半，缺一张门店照片。要我先用占位图吗？' }], 'end_turn'),
    J({ type: 'custom-title', customTitle: '公众号 · 本周长文', sessionId: 'sid-9' }),
  ])!
  assert.deepEqual([m.tool, m.sid, m.cwd, m.title, m.titleFrom], ['claude', 'sid-9', '/Users/lin/工作/公众号', '公众号 · 本周长文', '文件'])
  assert.equal(m.first, '写本周公众号长文，主题是春茶。')
  assert.deepEqual([m.turnOpen, m.lastRole, m.asks, m.turns], [false, 'assistant', true, 1])
  assert.deepEqual(m.writes.map((w) => [w.action, w.path]), [['新建', '/Users/lin/工作/公众号/长文.md'], ['修改', '/Users/lin/工作/公众号/长文.md']])
  assert.equal(JSON.stringify(m).includes('正文不该被存'), false)
})

test('Claude Code：用 SDK、claude -p 跑的（entrypoint 是 sdk-…）算脚本', () => {
  const m = claude([J({ type: 'user', timestamp: '2026-11-23T03:00:00.000Z', sessionId: 's2', cwd: '/x', entrypoint: 'sdk-cli', message: { role: 'user', content: '只读任务' } })])!
  assert.equal(m.kind, '脚本')
})

test('Claude Code：最后停在调工具 = 还在跑；最后是用户说话 = 还没回', () => {
  const mid = claude([cu('2026-11-23T03:00:00.000Z', '查一下'), ca('2026-11-23T03:00:05.000Z', [{ type: 'tool_use', name: 'Bash', input: {} }], 'tool_use')])!
  assert.deepEqual([mid.turnOpen, mid.lastRole], [true, 'assistant'])
  const user = claude([cu('2026-11-23T03:00:00.000Z', '查一下'), ca('2026-11-23T03:00:05.000Z', [{ type: 'text', text: '查完了。' }], 'end_turn'), cu('2026-11-23T03:10:00.000Z', '再查一个')])!
  assert.deepEqual([user.turnOpen, user.lastRole, user.turns], [true, 'user', 2])
  assert.equal(claude([J({ type: 'mode', mode: 'x' })]), null)
})

const NOW = Date.parse('2026-11-24T04:00:00.000Z')
const st = (o: Partial<Parameters<typeof inferStatus>[0]>, mark = {}) => inferStatus({ lastAt: '2026-11-24T03:55:00.000Z', turnOpen: false, lastRole: 'assistant', asks: false, aborted: false, ...o }, NOW, mark)

test('状态推断：进行中 / 在等我 / 做完未读 / 已看 / 停了，每个都带一句为什么', () => {
  assert.equal(st({ turnOpen: true }).status, '进行中')
  assert.equal(st({ turnOpen: true, lastAt: '2026-11-24T02:00:00.000Z' }).status, '停了')
  assert.match(st({ turnOpen: true, lastAt: '2026-11-24T02:00:00.000Z' }).why, /没做完/)
  assert.equal(st({ asks: true }).status, '在等我')
  assert.equal(st({}).status, '做完未读')
  assert.equal(st({ aborted: true }).status, '停了')
  assert.equal(st({ lastAt: '2026-11-10T03:55:00.000Z' }).status, '停了')
  assert.equal(st({ asks: true, lastAt: '2026-11-10T03:55:00.000Z' }).status, '停了')
  assert.equal(st({}).inferred, true)
})

test('状态推断：做完两天多没动、又不知道看没看：算停了；Codex 自己记着看没看的，用它的', () => {
  assert.equal(st({ lastAt: '2026-11-21T03:55:00.000Z' }).status, '停了')
  assert.match(st({ lastAt: '2026-11-21T03:55:00.000Z' }).why, /两天/)
  assert.equal(st({ lastAt: '2026-11-21T03:55:00.000Z', seen: false }).status, '做完未读', 'Codex 标着没看：几天前的也算未读')
  assert.equal(st({ seen: true }).status, '已看')
  assert.match(st({ seen: true }).why, /Codex/)
  assert.equal(st({ seen: true, asks: true }).status, '在等我', '看过了但没回：还在等你')
  assert.equal(st({ archived: true }).status, '停了')
  assert.equal(st({ seen: false, lastAt: '2026-11-01T03:55:00.000Z' }).status, '停了', '太久没动的照样算停了')
})

test('状态推断：Claude 桌面版自己标着“在等你处理”的，算在等我；它记着你看过的，算已看', () => {
  assert.equal(st({ appWaiting: true }).status, '在等我')
  assert.match(st({ appWaiting: true }).why, /Claude/)
  assert.equal(st({ appWaiting: true, turnOpen: true }).status, '进行中', '还在跑的不算在等')
  assert.equal(st({ seen: true, appWaiting: false }).status, '已看')
})

test('像不像在问人：回一句、等你一句话、带括号的问句算；“有问题告诉我”这种客气话不算', () => {
  assert.equal(looksLikeAsking('第 1 条可以开始了。\n\n你回一句“装”，我就开始。'), true)
  assert.equal(looksLikeAsking('8. 老作品怎么办？（需要时一篇篇点。）\n另外两件事等你一句话。'), true)
  assert.equal(looksLikeAsking('拆不拆两篇？（底部框里在问）'), true)
  assert.equal(looksLikeAsking('方便时看一眼告诉我。'), true)
  assert.equal(looksLikeAsking('改好了。你看的时候哪里挤了或乱了直接告诉我。'), false)
  assert.equal(looksLikeAsking('做完了，有问题告诉我。'), false)
  assert.equal(looksLikeAsking('报价单做好了，放在报价单-v2.md。'), false)
  assert.equal(looksLikeAsking('标题叫《你想要什么？》，已经发了。'), false)
})

test('状态推断：标过已看的不再算未读，之后又有新动静就重新算；手动改的状态同理', () => {
  assert.equal(st({}, { readAt: '2026-11-24T03:56:00.000Z' }).status, '已看')
  assert.equal(st({}, { readAt: '2026-11-24T03:00:00.000Z' }).status, '做完未读')
  const manual = st({}, { status: '停了', statusAt: '2026-11-24T03:55:00.000Z' })
  assert.deepEqual([manual.status, manual.inferred], ['停了', false])
  assert.equal(st({}, { status: '停了', statusAt: '2026-11-24T01:00:00.000Z' }).status, '做完未读', '改完以后对话又动了：手动的不算了')
})

const OBJS = [
  { path: '02-项目/春节茶礼.md', name: '春节茶礼', aliases: ['茶礼'], workdirs: ['/Users/lin/工作/春节茶礼'] },
  { path: '10-客户/云杉物流.md', name: '云杉物流', aliases: ['云杉'], workdirs: ['/Users/lin/工作'] },
  { path: '10-客户/孙蕾.md', name: '孙蕾', aliases: [], workdirs: [] },
]
const HOME = '/Users/lin'

test('归到对象：先看文件夹（最具体的那个），再看标题和第一句里的名字（只认一个），都没有就未归类', () => {
  assert.deepEqual(matchObject({ cwd: '/Users/lin/工作/春节茶礼/图', title: '', first: '' }, OBJS, HOME), { path: '02-项目/春节茶礼.md', by: '文件夹' })
  assert.deepEqual(matchObject({ cwd: '/Users/lin/工作/别的', title: '', first: '' }, OBJS, HOME), { path: '10-客户/云杉物流.md', by: '文件夹' })
  assert.deepEqual(matchObject({ cwd: '/tmp', title: '给孙蕾回消息', first: '' }, OBJS, HOME), { path: '10-客户/孙蕾.md', by: '名字' })
  assert.deepEqual(matchObject({ cwd: '/tmp', title: '', first: '茶礼的主图再出两张' }, OBJS, HOME), { path: '02-项目/春节茶礼.md', by: '名字' })
  assert.equal(matchObject({ cwd: '/tmp', title: '孙蕾问云杉的折扣', first: '' }, OBJS, HOME), null, '出现两个对象：不猜')
  assert.equal(matchObject({ cwd: '/tmp', title: '随便聊聊', first: '' }, OBJS, HOME), null)
  assert.equal(matchObject({ cwd: '/Users/lin/工作/春节茶礼2', title: '', first: '' }, [OBJS[0]], HOME), null, '文件夹名只是开头一样，不算在里面')
  assert.deepEqual(matchObject({ cwd: '/tmp', title: '航海家AI经典课 2026-10-27', first: '' }, [{ path: 'h.md', name: '航海家 AI 经典课', aliases: [], workdirs: [] }], HOME), { path: 'h.md', by: '名字' }, '名字里的空格、标点、大小写不算')
  assert.deepEqual(matchObject({ cwd: '/tmp', title: 'openfde 的需求', first: '' }, [{ path: 'o.md', name: 'OpenFDE', aliases: [], workdirs: [] }], HOME), { path: 'o.md', by: '名字' })
  assert.deepEqual(matchObject({ cwd: '/Users/lin/a', title: '', first: '' }, [{ path: 'x.md', name: '甲', aliases: [], workdirs: ['~/a'] }], HOME), { path: 'x.md', by: '文件夹' })
})

test('摘要只留第一句、限长，像密钥的串遮掉；文件按后缀分类', () => {
  assert.equal(brief('第一句。第二句'), '第一句。')
  assert.equal([...brief('字'.repeat(200))].length, 81)
  assert.equal(redact('密钥是 sk-abcdefghijklmnopqrstuvwxyz123456 别外传'), '密钥是 ［已遮住］ 别外传')
  assert.equal(redact('token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 'token=［已遮住］')
  assert.equal(redact('password: hunter2x'), 'password: ［已遮住］')
  assert.equal(redact('普通的话 2026-11-24 /Users/lin/工作'), '普通的话 2026-11-24 /Users/lin/工作')
  assert.deepEqual(['a.PNG', 'b.md', 'c.xlsx', 'd.html', 'e.ts', 'f.zip'].map(fileKind), ['图片', '文档', '表格', '网页', '代码', '其他'])
})
