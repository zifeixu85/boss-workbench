// 常驻对话引擎（host.ts）：拿一个假的 codex app-server（一行一条 JSON-RPC）测：握手、开对话（工作目录是知识库根目录、用他自己的设置）、
// 逐字收回答、Codex 问“是否允许”时挂起来等网页答、答了接着跑、一轮结束；没测过的版本不用（service 降级）。运行（仓库根目录）：node --test modules/codex-chat/tests/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { CodexHost, HostError, approvalOf, decisionFor, stepOf, type TurnProgress } from '../files/server/modules/codex-chat/host.ts'

const dir = mkdtempSync(join(os.tmpdir(), 'wb-host-'))
function fake(version: string) {
  const bin = join(dir, `codex-${version}`)
  writeFileSync(bin, `#!/usr/bin/env node
const out = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
let buf = ''
process.stdin.on('data', (c) => { buf += c; let at; while ((at = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, at); buf = buf.slice(at + 1); if (line.trim()) on(JSON.parse(line)) } })
function on(m) {
  if (m.method === 'initialize') return out({ id: m.id, result: { userAgent: 'boss-workbench/${version} (test)' } })
  if (m.method === 'thread/start') return out({ id: m.id, result: { thread: { id: 'th1', cwd: m.params.cwd, sandbox: m.params.sandbox ?? null } } })
  if (m.method === 'turn/start') {
    out({ id: m.id, result: { turn: { id: 'tu1' } } })
    out({ method: 'turn/started', params: { threadId: 'th1', turn: { id: 'tu1' } } })
    out({ method: 'item/agentMessage/delta', params: { threadId: 'th1', itemId: 'a0', delta: '我先看看。' } })
    out({ method: 'item/started', params: { threadId: 'th1', item: { id: 'c1', type: 'commandExecution', command: 'ls 02-项目', status: 'inProgress' } } })
    return out({ id: 900, method: 'item/commandExecution/requestApproval', params: { threadId: 'th1', turnId: 'tu1', itemId: 'c1', command: 'ls 02-项目', reason: '看看有哪些项目', startedAtMs: 1 } })
  }
  if (m.id === 900) {
    out({ method: 'item/completed', params: { threadId: 'th1', item: { id: 'c1', type: 'commandExecution', command: 'ls 02-项目', status: 'completed' } } })
    out({ method: 'item/agentMessage/delta', params: { threadId: 'th1', itemId: 'a1', delta: '你选了：' + m.result.decision + '；开头带着：' + (globalThis.lastText ?? '') } })
    return out({ method: 'turn/completed', params: { threadId: 'th1', turn: { id: 'tu1', status: 'completed' } } })
  }
}
`)
  chmodSync(bin, 0o755)
  return bin
}

test('常驻对话：开对话、逐字收回答；Codex 问“是否允许”挂起来，网页点了允许再接着跑；一轮结束', async (t) => {
  const host = new CodexHost({ bin: fake('0.166.0'), cwd: dir, instructions: '测试' })
  t.after(() => host.close())
  const seen: TurnProgress[] = []
  let approvals: { key: string }[] = []
  const turn = await host.startTurn(null, '【工作台】他正在看：待办\n\n今天先做哪件', (p) => { seen.push(p); if (p.approvals) approvals = p.approvals })
  assert.equal(turn.threadId, 'th1')
  for (let i = 0; i < 50 && !approvals.length; i++) await new Promise((r) => setTimeout(r, 20))
  assert.equal(approvals.length, 1, '挂起来等他点')
  assert.deepEqual(host.approvals('th1').map((a) => [a.kind, a.text, a.reason]), [['跑命令', 'ls 02-项目', '看看有哪些项目']])
  const key = approvals[0].key
  assert.equal(host.answer(key, 'allow'), true)
  assert.equal(host.answer(key, 'allow'), false, '答过的不能再答')
  const end = await turn.done
  assert.equal(end.status, 'done')
  const text = seen.filter((p) => p.text !== undefined).pop()!.text!
  assert.match(text, /我先看看。\n\n你选了：accept/)
  assert.ok(seen.some((p) => p.steps?.some((s) => s.label === '跑命令：ls 02-项目' && s.state === 'ok')))
})

test('没测过的 Codex 版本：不用常驻对话（抛 HostError，service 降级成一问一答）', async () => {
  const host = new CodexHost({ bin: fake('0.120.0'), cwd: dir, instructions: '测试' })
  await assert.rejects(host.startTurn(null, '你好', () => {}), (e) => e instanceof HostError && /0\.120\.0.*还没测过/.test(e.message))
})

test('审批的几种写法：新旧两种审批、改文件、要权限；条目变成网页上的小步骤', () => {
  assert.deepEqual(decisionFor('item/commandExecution/requestApproval', 'allow-session', {}), { decision: 'acceptForSession' })
  assert.deepEqual(decisionFor('item/fileChange/requestApproval', 'deny', {}), { decision: 'decline' })
  assert.deepEqual(decisionFor('execCommandApproval', 'allow', {}), { decision: 'approved' })
  assert.deepEqual(decisionFor('item/permissions/requestApproval', 'deny', { permissions: { network: true } }), { permissions: {} })
  assert.equal(approvalOf('k', 'applyPatchApproval', { fileChanges: { '/x/报价单.md': {} } }).text, '报价单.md')
  assert.equal(stepOf({ type: 'mcpToolCall', server: 'boss-workbench', tool: 'workbench_apply', status: 'completed' })!.label, '工作台 · workbench_apply')
  assert.equal(stepOf({ type: 'agentMessage' }), null)
})
